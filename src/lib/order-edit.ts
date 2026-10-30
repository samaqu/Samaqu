/**
 * Satu aturan edit item untuk SEMUA sumber transaksi.
 *
 * Dipakai server (route + validasi sebelum RPC) dan UI (tombol Ubah / alasan terkunci),
 * supaya layar dan server tidak pernah berbeda pendapat.
 *
 * Sumber ditentukan dari `orderSourceKey()` — BUKAN `sourceKey()` — karena Open Order
 * menyimpan `source = 'website'` di database. Awalan `CYO-` yang membedakannya.
 */

import { MANUAL_SOURCE_KEYS, RESELLER_SOURCE_KEY, orderSourceKey } from "@/lib/transaksi";

export type EditSourceGroup = "manual" | "website" | "open_order" | "reseller" | "unknown";

/** Teks aturan edit pesanan reseller — dipakai server & UI (satu sumber). */
export const RESELLER_EDIT_NOTICE =
  "Pesanan reseller: hanya ukuran dan warna yang bisa diubah. Untuk perubahan lain, batalkan lalu buat pesanan baru (saldo dan stok otomatis kembali).";

export type EditableOrder = {
  order_number?: string | null;
  source?: unknown;
  stock_reserved?: boolean | null;
  status?: string | null;
  shipping_status?: string | null;
  awb_no?: string | null;
  weight?: number | null;
  total?: number | null;
  paid_at?: string | null;
};

export type EditGuard = {
  canEdit: boolean;
  sourceGroup: EditSourceGroup;
  /** Alasan singkat untuk UI; kosong kalau boleh diedit. */
  reason: string;
  /** Peringatan yang tetap boleh disimpan (mis. transaksi manual sudah lunas). */
  warning: string;
};

export function editSourceGroup(order?: EditableOrder | null): EditSourceGroup {
  const key = orderSourceKey(order);
  if (key === "open_order") return "open_order";
  if (key === "website") return "website";
  if (key === RESELLER_SOURCE_KEY) return "reseller";
  if (MANUAL_SOURCE_KEYS.includes(key)) return "manual";
  return "unknown";
}

/** Guard dasar yang tidak bergantung pada isi item baru. */
export function orderEditGuard(order?: EditableOrder | null): EditGuard {
  const sourceGroup = editSourceGroup(order);
  const deny = (reason: string): EditGuard => ({ canEdit: false, sourceGroup, reason, warning: "" });

  if (sourceGroup === "unknown") {
    return deny("Sumber pesanan tidak dikenali. Untuk koreksi gunakan batal atau retur.");
  }
  if (order?.stock_reserved !== true) {
    return deny("Item terkunci karena stok pesanan ini tidak dipotong sistem. Untuk koreksi gunakan batal atau retur.");
  }
  if (order?.status !== "pending" && order?.status !== "diproses") {
    return deny("Item hanya bisa diubah saat status Belum Bayar atau Lunas. Untuk koreksi gunakan batal atau retur.");
  }

  const shipping = String(order?.shipping_status || "").trim().toLowerCase();
  if (shipping && shipping !== "menunggu_pickup") {
    return deny("Item terkunci karena pengiriman sudah berjalan. Untuk koreksi gunakan batal atau retur.");
  }

  return {
    canEdit: true,
    sourceGroup,
    reason: "",
    warning:
      sourceGroup === "manual" && order?.paid_at
        ? "Transaksi sudah lunas. Kalau total berubah, selisih harus diselesaikan manual (tagih atau kembalikan); sistem tidak menyesuaikan uang masuk."
        : "",
  };
}

/**
 * Berat baru tidak boleh MELEBIHI berat lama. Pesanan lama tanpa berat (0/null) tidak
 * membatasi, supaya data lama tetap bisa dikoreksi.
 */
export function weightEditError(oldWeight: number | null | undefined, newWeight: number): string {
  const before = Number(oldWeight) || 0;
  const after = Number(newWeight) || 0;
  if (before > 0 && after > before) {
    return "Berat item baru melebihi berat pesanan lama. Kurangi qty/berat atau gunakan batal lalu buat order baru.";
  }
  return "";
}
