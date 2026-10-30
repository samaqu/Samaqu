import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pengembalian saldo reseller saat pesanan dibatalkan.
 *
 * Yang harus kembali bukan hanya potongan saldo, tapi juga uang yang sudah ditransfer
 * reseller lewat "bayar kekurangan". Sebelumnya hanya `orders.reseller_balance_deduction`
 * yang dikembalikan, sehingga pembayaran transfer yang sudah lunas hilang saat pesanan batal.
 *
 * Aturan:
 *  - Total refund = potongan saldo + semua pembayaran kekurangan berstatus `approved`.
 *  - Dicatat SATU baris ledger `order_refund` per pesanan (reference = `orders.id`).
 *    Constraint `unique (type, reference)` di `reseller_ledger` yang menjamin
 *    idempotensi: pemanggilan kedua gagal dengan `unique_violation` dan diabaikan.
 *  - Pembayaran kekurangan yang masih `pending` TIDAK direfund; barisnya ditutup
 *    (`status = 'rejected'`) supaya tidak bisa dibayar/verifikasi lagi setelah batal.
 *  - Refund dipanggil SETELAH status pesanan tersimpan.
 */

export interface ResellerRefundResult {
  /** Nominal yang dikembalikan pada pemanggilan ini (0 = tidak ada yang perlu dikembalikan). */
  refunded: number;
  /** Sudah pernah direfund pada pembatalan sebelumnya. */
  alreadyRefunded: boolean;
  /** Rincian supaya mudah dibaca di log/report. */
  balancePart: number;
  transferPart: number;
  /** Jumlah baris pembayaran pending yang ditutup. */
  pendingClosed: number;
}

/**
 * Kumpulkan nominal yang layak dikembalikan untuk satu pesanan reseller.
 * Fungsi murni terhadap data yang diberikan, supaya bisa dipakai juga oleh migrasi koreksi.
 */
export function sumRefundable(input: {
  balanceDeduction?: number | null;
  payments?: { amount: number | null; status: string | null }[] | null;
}): { balancePart: number; transferPart: number; total: number } {
  const balancePart = Math.max(0, Math.round(Number(input.balanceDeduction) || 0));
  const transferPart = (input.payments ?? [])
    .filter((p) => String(p.status || "") === "approved")
    .reduce((sum, p) => sum + Math.max(0, Math.round(Number(p.amount) || 0)), 0);
  return { balancePart, transferPart, total: balancePart + transferPart };
}

/**
 * Catat pengembalian ke ledger reseller dan tutup pembayaran kekurangan yang masih pending.
 * Tidak melempar error: kegagalan refund hanya dicatat di log supaya pembatalan yang sudah
 * tersimpan tidak dianggap gagal.
 */
export async function refundResellerOnCancel(
  supabase: SupabaseClient,
  args: {
    resellerId: string;
    orderId: string;
    orderNumber: string;
    /** Bisa dikirim pemanggil (sudah dibaca) atau dibiarkan kosong → dibaca di sini. */
    balanceDeduction?: number | null;
    actor?: string;
  }
): Promise<ResellerRefundResult> {
  const kosong: ResellerRefundResult = {
    refunded: 0,
    alreadyRefunded: false,
    balancePart: 0,
    transferPart: 0,
    pendingClosed: 0,
  };

  // 1. Baca potongan saldo (kalau pemanggil belum mengirimnya) dan semua pembayaran kekurangan.
  let balanceDeduction = args.balanceDeduction;
  if (balanceDeduction === undefined || balanceDeduction === null) {
    const { data } = await supabase
      .from("orders")
      .select("reseller_balance_deduction")
      .eq("id", args.orderId)
      .maybeSingle();
    balanceDeduction = Number((data as { reseller_balance_deduction?: number } | null)?.reseller_balance_deduction) || 0;
  }

  const { data: paymentRows } = await supabase
    .from("reseller_order_payments")
    .select("id, amount, status")
    .eq("order_id", args.orderId);

  const payments = (paymentRows ?? []) as { id: string; amount: number | null; status: string | null }[];
  const { balancePart, transferPart, total } = sumRefundable({ balanceDeduction, payments });

  // 2. Tutup pembayaran yang belum lunas: setelah pesanan batal, bukti tidak boleh
  //    diverifikasi lagi. Yang sudah `approved`/`rejected` tidak disentuh.
  const pendingIds = payments.filter((p) => String(p.status || "") === "pending").map((p) => p.id);
  let pendingClosed = 0;
  if (pendingIds.length > 0) {
    const { error: closeError, count } = await supabase
      .from("reseller_order_payments")
      .update({ status: "rejected", reject_reason: "Pesanan dibatalkan" }, { count: "exact" })
      .in("id", pendingIds)
      .eq("status", "pending");
    if (closeError) {
      console.error("[REFUND] Gagal menutup pembayaran pending:", args.orderNumber, closeError.message);
    } else {
      pendingClosed = count ?? pendingIds.length;
    }
  }

  if (total <= 0) return { ...kosong, pendingClosed };

  // 3. Catat refund. Constraint UNIQUE(type, reference) membuat pemanggilan kedua gagal,
  //    dan itu memang yang diinginkan — pesanan hanya boleh direfund sekali.
  //    Keterangannya mengikuti komposisi sebenarnya supaya riwayat saldo menjelaskan
  //    asal uangnya: potongan saldo, pembayaran transfer, atau keduanya.
  const catatan =
    balancePart > 0 && transferPart > 0
      ? "Pengembalian saldo dan pembayaran transfer — pesanan dibatalkan"
      : transferPart > 0
        ? "Pengembalian pembayaran transfer — pesanan dibatalkan"
        : "Pengembalian saldo — pesanan dibatalkan";

  const { error: refundError } = await supabase.rpc("samaqu_reseller_refund_order", {
    p_reseller_id: args.resellerId,
    p_order_id: args.orderId,
    p_jumlah: total,
    p_dibuat_oleh: args.actor || "cancel-order",
    p_catatan: catatan,
  });

  if (refundError) {
    const pesan = refundError.message || "";
    if (/sudah pernah dicatat|unique/i.test(pesan)) {
      console.log("[REFUND] Sudah pernah direfund sebelumnya:", args.orderNumber);
      return { ...kosong, pendingClosed, alreadyRefunded: true };
    }
    console.error("[REFUND] Gagal mengembalikan saldo reseller:", args.orderNumber, pesan);
    return { ...kosong, balancePart, transferPart, pendingClosed };
  }

  console.log("[REFUND] Saldo reseller dikembalikan:", args.orderNumber, {
    saldo: balancePart,
    transfer: transferPart,
    total,
  });

  return {
    refunded: total,
    alreadyRefunded: false,
    balancePart,
    transferPart,
    pendingClosed,
  };
}
