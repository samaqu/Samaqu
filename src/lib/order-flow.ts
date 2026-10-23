/**
 * Tahap (stage) alur pesanan admin — istilah ala Shopee Seller Centre.
 *
 * Status PESANAN (`orders.status`) dan status PENGIRIMAN (`orders.shipping_status`) sengaja
 * dipisah:
 * - `orders.status`: `pending` → `diproses` → `dikirim` → `selesai` (+ `dibatalkan`).
 *   `dikirim` HANYA ditulis saat J&T melaporkan pemindaian (lihat `src/lib/jnt/tracking-sync.ts`),
 *   bukan sekadar karena resi sudah terbit.
 * - `orders.shipping_status`: `menunggu_pickup` → `dikirim` → `selesai` (NULL = resi belum dibuat).
 *
 * Tahap daftar diturunkan dari `orders.status` + `orders.awb_no`:
 * `pending` = Belum Bayar; `diproses` = **Belum di Packing** (resi belum dibuat) atau
 * **Menunggu Pickup** (resi sudah dibuat, paket belum dipindai/dijemput J&T); `dikirim` =
 * Dikirim (J&T sudah memindai/menjemput); `selesai`; `dibatalkan`.
 *
 * Modul ini murni lapisan tampilan: tidak menulis status apa pun ke database.
 */

export type OrderStage = "belum_bayar" | "belum_dipacking" | "sudah_dipacking" | "dikirim" | "selesai" | "dibatalkan";

/** Field minimum untuk menentukan tahap: status pesanan + bukti pengiriman. */
export interface StageSource {
  status: string;
  /** Nomor resi J&T — pembeda "Belum di Packing" (belum dibuat) vs "Menunggu Pickup". */
  awb_no?: string | null;
  /** `menunggu_pickup` | `dikirim` | `selesai` — bukti paket benar-benar berjalan. */
  shipping_status?: string | null;
  /** Kode pemindaian J&T terakhir; 200 = benar-benar diterima penerima. */
  tracking_status_code?: number | null;
}

/**
 * Kode J&T yang BUKAN bukti paket bergerak (sama dengan `JNT_NON_SHIPPING_CODES` di
 * `src/lib/jnt/track-status.ts`). Disalin agar modul ini tetap murni tanpa impor server.
 */
const NON_MOVING_CODES = new Set([101, 151, 162, 163]);

function hasMovingScan(order: StageSource): boolean {
  const code = order.tracking_status_code;
  return typeof code === "number" && !NON_MOVING_CODES.has(code);
}

/**
 * Tahap efektif. `orders.status` tidak dipercaya mentah-mentah: pesanan bisa tertulis
 * `selesai` padahal tracking J&T baru sampai gateway (data lama/bug). Bila ada bukti
 * pengiriman yang belum tuntas, tahap diturunkan ke posisi paket yang sebenarnya.
 */
export function orderStage(order: StageSource): OrderStage {
  switch (order.status) {
    case "pending":
      return "belum_bayar";
    case "dibatalkan":
      return "dibatalkan";
    case "selesai":
      return settledStage(order);
    case "dikirim": {
      // Resi terbit tapi belum ada pemindaian kurir → masih menunggu pickup.
      if (order.shipping_status === "menunggu_pickup" && !hasMovingScan(order)) {
        return order.awb_no ? "sudah_dipacking" : "belum_dipacking";
      }
      return "dikirim";
    }
    default:
      // `diproses` (sudah dibayar, belum diserahkan ke kurir) dan status tak dikenal. Resi yang
      // sudah terbit berarti paket selesai dipacking dan menunggu dijemput kurir — itulah
      // "Menunggu Pickup"; tanpa resi berarti masih "Belum di Packing".
      return order.awb_no ? "sudah_dipacking" : "belum_dipacking";
  }
}

/** Apakah status `selesai` didukung bukti pengiriman? Kalau tidak, turunkan ke tahap nyata. */
function settledStage(order: StageSource): OrderStage {
  switch (order.shipping_status) {
    case "selesai":
      return "selesai";
    case "dikirim":
      return "dikirim";
    case "menunggu_pickup":
      return order.awb_no ? "sudah_dipacking" : "belum_dipacking";
    default:
      break;
  }

  const code = order.tracking_status_code;
  if (typeof code === "number") {
    if (code === 200) return "selesai";
    if (NON_MOVING_CODES.has(code)) return order.awb_no ? "sudah_dipacking" : "belum_dipacking";
    return "dikirim";
  }

  // Tidak ada bukti pengiriman sama sekali (pesanan manual/impor lama) → percayai status simpanan.
  return "selesai";
}

/** Status pesanan kanonik untuk pill/label — dipakai SEMUA dashboard. */
export type OrderStatusKey = "pending" | "diproses" | "dikirim" | "selesai" | "dibatalkan";

export function orderStatusKey(order: StageSource): OrderStatusKey {
  switch (orderStage(order)) {
    case "belum_bayar":
      return "pending";
    case "belum_dipacking":
    case "sudah_dipacking":
      return "diproses";
    case "dikirim":
      return "dikirim";
    case "selesai":
      return "selesai";
    case "dibatalkan":
      return "dibatalkan";
  }
}

export const ORDER_STAGE_LABEL: Record<OrderStage, string> = {
  belum_bayar: "Belum Bayar",
  belum_dipacking: "Belum di Packing",
  sudah_dipacking: "Menunggu Pickup",
  dikirim: "Dikirim",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

/** Filter daftar pesanan: `"semua"` atau salah satu tahap. */
export type OrderStageFilter = OrderStage | "semua";

/** Tab daftar pesanan, urut sesuai alur kerja penjual (yang perlu dikerjakan lebih dulu). */
export const ORDER_STAGE_TABS: { key: OrderStageFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "belum_bayar", label: ORDER_STAGE_LABEL.belum_bayar },
  { key: "belum_dipacking", label: ORDER_STAGE_LABEL.belum_dipacking },
  { key: "sudah_dipacking", label: ORDER_STAGE_LABEL.sudah_dipacking },
  { key: "dikirim", label: ORDER_STAGE_LABEL.dikirim },
  { key: "selesai", label: ORDER_STAGE_LABEL.selesai },
  { key: "dibatalkan", label: ORDER_STAGE_LABEL.dibatalkan },
];

export function matchesStage(order: StageSource, filter: OrderStageFilter): boolean {
  return filter === "semua" || orderStage(order) === filter;
}

/**
 * Satu-satunya tahap yang menunggu admin menekan tombol ("Atur Pesanan") — dipakai untuk
 * menyorot tab dan tombol aksi di daftar, ala badge "Perlu Dikirim" Shopee.
 */
export function stageNeedsAdminAction(stage: OrderStageFilter): boolean {
  return stage === "belum_dipacking";
}

/** Warna pill tahap — daftar pesanan memakainya supaya tab dan baris memakai istilah yang sama. */
export const ORDER_STAGE_STYLE: Record<OrderStage, { bg: string; color: string; border: string }> = {
  belum_bayar: { bg: "#fffbeb", color: "#b45309", border: "#fef3c7" },
  belum_dipacking: { bg: "#fff7ed", color: "#c2410c", border: "#ffedd5" },
  sudah_dipacking: { bg: "#eff6ff", color: "#1d4ed8", border: "#dbeafe" },
  dikirim: { bg: "#f5f3ff", color: "#6d28d9", border: "#ede9fe" },
  selesai: { bg: "#ecfdf5", color: "#047857", border: "#d1fae5" },
  dibatalkan: { bg: "#f4f4f5", color: "#52525b", border: "#e4e4e7" },
};

/* ── Status pengiriman (terpisah dari tahap pesanan) ── */

export type ShippingStatus = "menunggu_pickup" | "dikirim" | "selesai";

export const SHIPPING_STATUS_LABEL: Record<ShippingStatus, string> = {
  menunggu_pickup: "Menunggu Pickup",
  dikirim: "Dikirim",
  selesai: "Terkirim",
};

export const SHIPPING_STATUS_STYLE: Record<ShippingStatus, { bg: string; color: string; border: string }> = {
  menunggu_pickup: { bg: "#fff7ed", color: "#c2410c", border: "#ffedd5" },
  dikirim: { bg: "#eff6ff", color: "#1d4ed8", border: "#dbeafe" },
  selesai: { bg: "#ecfdf5", color: "#047857", border: "#d1fae5" },
};

/** Sumber untuk status pengiriman: kolom + fallback resi (data lama sebelum kolom ada). */
export interface ShippingSource {
  /** Status pesanan; pesanan `dibatalkan` tidak punya progres pengiriman. */
  status?: string;
  shipping_status?: string | null;
  awb_no?: string | null;
  /** `voided` = resi sudah dibatalkan di J&T (kolom `orders.jnt_void_status`). */
  jnt_void_status?: string | null;
}

export function shippingStatusOf(order: ShippingSource): ShippingStatus | null {
  // Pesanan dibatalkan → jangan tampilkan progres pengiriman. Kalau tidak, pesanan batal masih
  // memperlihatkan "Menunggu Pickup" (resi yang sudah di-void) — tidak konsisten dengan status batal.
  if (order.status === "dibatalkan") return null;
  // Resi sudah di-void tapi pesanan belum dibatalkan (void dilakukan di dashboard J&T): tidak ada
  // paket yang berjalan, jadi status pengirimannya juga tidak boleh ditampilkan.
  if (order.jnt_void_status === "voided") return null;
  if (order.shipping_status === "menunggu_pickup" || order.shipping_status === "dikirim" || order.shipping_status === "selesai") {
    return order.shipping_status;
  }
  // Data lama: resi sudah ada tapi kolom belum pernah diisi → anggap menunggu pickup.
  if (order.awb_no) return "menunggu_pickup";
  return null;
}

/** Ringkasan pengiriman satu baris daftar: kurir + nomor resi + status pengiriman. */
export function shippingLine(
  order: StageSource & ShippingSource & { shipping_method?: string | null }
): { courier: string; resi: string; status: string | null; awaiting: boolean; cancelled: boolean } {
  const stage = orderStage(order);
  const cancelled = stage === "dibatalkan";
  const awaiting = stage === "belum_dipacking";
  const ss = shippingStatusOf(order);
  return {
    courier: order.shipping_method || "Pengiriman",
    // Pesanan batal: resi ditampilkan apa adanya (kalau ada), atau "-" — bukan "Tanpa resi".
    resi: order.awb_no || (cancelled ? "-" : awaiting ? "Resi belum dibuat" : "Tanpa resi"),
    status: ss ? SHIPPING_STATUS_LABEL[ss] : null,
    awaiting,
    cancelled,
  };
}
