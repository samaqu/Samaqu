/**
 * Aturan BERSAMA untuk pesanan — dipakai panel ops (office) dan panel admin.
 *
 * Tiga hal yang dulu tersebar/diduplikasi di beberapa layar, sekarang satu sumber:
 *  1. `orderSourceKey` / `orderSourceLabel` — klasifikasi sumber (termasuk Reseller).
 *  2. `countByStage` / `stageCounts` — hitungan per tahap untuk chip, tab, dan kartu.
 *  3. `describePayment` — label metode pembayaran, termasuk pesanan reseller.
 *
 * Semua fungsi murni (tanpa I/O) dan tidak menulis apa pun ke database.
 */

import {
  ORDER_STAGE_TABS_VISIBLE,
  ORDER_STAGE_TABS,
  orderStage,
  type OrderStage,
  type OrderStageFilter,
  type StageSource,
} from "@/lib/order-flow";

/* ── 1. Klasifikasi sumber ─────────────────────────────────────────────────── */

export {
  OPEN_ORDER_SOURCE_KEY,
  UNKNOWN_SOURCE_KEY,
  RESELLER_SOURCE_KEY,
  ORDER_SOURCE_LABEL,
  orderSourceKey,
  orderSourceLabel,
} from "@/lib/transaksi";

/* ── 2. Hitungan per tahap ─────────────────────────────────────────────────── */

export interface StageCounts {
  /** Semua pesanan pada periode (tanpa filter tahap). */
  semua: number;
  /** Pesanan yang belum dibayar. */
  belum_bayar: number;
  /** Lunas tapi resi belum dibuat — antrean packing. */
  belum_dipacking: number;
  /** Resi sudah dibuat, paket menunggu dijemput kurir. */
  sudah_dipacking: number;
  dikirim: number;
  selesai: number;
  dibatalkan: number;
  /** Pesanan yang perlu disentuh admin: packing + siap kirim. */
  perlu_diproses: number;
}

const EMPTY_STAGE_COUNTS: StageCounts = {
  semua: 0,
  belum_bayar: 0,
  belum_dipacking: 0,
  sudah_dipacking: 0,
  dikirim: 0,
  selesai: 0,
  dibatalkan: 0,
  perlu_diproses: 0,
};

/**
 * Hitung jumlah pesanan per tahap dalam SATU lintasan.
 *
 * Satu-satunya sumber angka untuk kartu "Belum bayar" / "Perlu diproses", chip
 * "Belum di packing", dan angka di dalam setiap tab. Karena semua memakai hasil
 * fungsi ini, angka kartu/chip/tab tidak mungkin berbeda dari isi tabel.
 */
export function stageCounts(orders: (StageSource | null | undefined)[] | null | undefined): StageCounts {
  const counts = { ...EMPTY_STAGE_COUNTS };
  for (const order of orders || []) {
    if (!order) continue;
    counts.semua += 1;
    const stage = orderStage(order);
    counts[stage] += 1;
    if (stage === "belum_dipacking" || stage === "sudah_dipacking") counts.perlu_diproses += 1;
  }
  return counts;
}

/** Jumlah satu tahap — pembungkus tipis supaya pemanggil tidak menulis ulang `filter`. */
export function countByStage(
  orders: (StageSource | null | undefined)[] | null | undefined,
  stage: OrderStageFilter
): number {
  return stageCounts(orders)[stage];
}

/** Tab tahap + angkanya, siap dirender (termasuk `belum_dipacking` bila diminta). */
export function stageTabsWithCounts(
  orders: (StageSource | null | undefined)[] | null | undefined,
  options: { includeBelumDipacking?: boolean } = {}
): { key: OrderStageFilter; label: string; count: number }[] {
  const counts = stageCounts(orders);
  const tabs = options.includeBelumDipacking ? ORDER_STAGE_TABS : ORDER_STAGE_TABS_VISIBLE;
  return tabs.map((tab) => ({ ...tab, count: counts[tab.key] ?? 0 }));
}

/**
 * Tahap yang benar-benar ada isinya pada periode — untuk ringkasan/legenda.
 */
export function stagesPresent(orders: (StageSource | null | undefined)[] | null | undefined): OrderStage[] {
  const counts = stageCounts(orders);
  const stages = ORDER_STAGE_TABS.map((tab) => tab.key).filter((key): key is OrderStage => key !== "semua");
  return stages.filter((stage) => counts[stage] > 0);
}

/* ── 3. Metode pembayaran ──────────────────────────────────────────────────── */

/** Satu baris pembayaran yang tercatat untuk sebuah pesanan reseller. */
export interface ResellerPaymentRow {
  amount: number;
  /**
   * `reseller_order_payments.status`:
   * `pending` = bukti belum ada / menunggu verifikasi admin, `approved` = lunas, `rejected` = ditolak.
   */
  status: string;
  /** `bsi` | `qris` — hanya diisi kalau reseller memilih saat mengunggah bukti. */
  payment_method?: string | null;
}

export interface PaymentSourceInput {
  payment_method?: unknown;
  payment_channel?: unknown;
  /** Pesanan dibuat lewat Reseller Center. */
  is_reseller?: boolean;
  /** Nominal yang dipotong dari saldo reseller (`orders.reseller_balance_deduction`). */
  reseller_balance_deduction?: number | null;
  /** Total kekurangan yang harus dibayar transfer (`orders.reseller_shortfall_amount`). */
  reseller_shortfall_amount?: number | null;
  /** Status kekurangan (`orders.reseller_shortfall_status`): `none` | `pending` | `approved` | `rejected`. */
  reseller_shortfall_status?: string | null;
  /** Baris pembayaran reseller terbaru, bila ada. */
  reseller_payment?: ResellerPaymentRow | null;
}

const TRANSFER_METHOD_LABEL: Record<string, string> = {
  bsi: "Transfer BSI",
  qris: "QRIS",
};

/** Status kekurangan → frasa pendek untuk label metode bayar. */
export function shortfallPhrase(shortfallStatus: string | null | undefined): string {
  switch (String(shortfallStatus || "")) {
    case "approved":
      return "lunas";
    case "rejected":
      return "ditolak";
    case "pending":
      return "menunggu verifikasi";
    default:
      return "menunggu bukti";
  }
}

/**
 * Label metode pembayaran yang dibaca admin.
 *
 * Pesanan reseller tidak pernah ditampilkan sebagai "reseller" — nilainya diturunkan
 * dari data pembayaran yang memang tercatat:
 *
 *  - seluruhnya dari saldo                → "Saldo Reseller"
 *  - saldo + transfer, kekurangan lunas   → "Saldo Reseller + Transfer (BSI) · lunas"
 *  - saldo + transfer, menunggu verifikasi→ "... · menunggu verifikasi"
 *  - saldo + transfer, belum ada bukti    → "... · menunggu bukti"
 *  - kekurangan ditolak                   → "... · kekurangan ditolak"
 *  - tidak ada potongan saldo             → "Transfer (BSI/QRIS/…)"
 *
 * Label ini HANYA untuk tampilan; tidak mengubah nilai `orders.payment_method`.
 */
export function describePayment(input: PaymentSourceInput | null | undefined): string {
  if (!input) return "-";

  const balance = Math.max(0, Math.round(Number(input.reseller_balance_deduction) || 0));
  const shortfallAmount = Math.max(0, Math.round(Number(input.reseller_shortfall_amount) || 0));
  const payment = input.reseller_payment || null;

  if (input.is_reseller) {
    const transferLabel =
      TRANSFER_METHOD_LABEL[String(payment?.payment_method || "").toLowerCase()] || "Transfer";

    // Tidak ada kekurangan → seluruhnya dari saldo (uang muka/zero balance).
    if (shortfallAmount <= 0 && balance > 0) return "Saldo Reseller";
    if (shortfallAmount <= 0) return "Saldo Reseller";

    const frase = shortfallPhrase(input.reseller_shortfall_status || payment?.status);
    const transferPart = `${transferLabel} · ${frase}`;

    // Shortfall ada tapi saldo tidak terpotong sama sekali → seluruhnya transfer.
    if (balance <= 0) return transferPart;

    return `Saldo Reseller + ${transferPart}`;
  }

  // Pesanan non-reseller: nilai lama tetap dipakai apa adanya (tidak diubah perilakunya).
  const raw = String(input.payment_method ?? "").trim();
  return raw || "-";
}

/** Benar bila pesanan reseller masih menunggu pembayaran kekurangan yang bisa ditindak. */
export function resellerAwaitingShortfall(input: PaymentSourceInput | null | undefined): boolean {
  if (!input?.is_reseller) return false;
  const amount = Math.max(0, Math.round(Number(input.reseller_shortfall_amount) || 0));
  return amount > 0 && String(input.reseller_shortfall_status || "") === "pending";
}
