/**
 * Kurir GoSend untuk transaksi ops — SATU sumber supaya server, label, dan tampilan memakai
 * nilai yang sama.
 *
 * Dua mode (disimpan di kolom `orders.shipping_method`, teks bebas):
 *  - "GoSend SAMAQU"   : admin yang booking driver di aplikasi Gojek.
 *  - "GoSend Customer" : customer booking driver sendiri, driver mengambil ke tempat SAMAQU.
 *
 * ATURAN PENTING (jangan dilanggar):
 *  - Pesanan GoSend TIDAK PERNAH punya `awb_no`. Pembatalan (`cancelOrderCompletely`) memakai
 *    `jnt_order_id || awb_no` untuk void ke J&T, jadi isi apa pun di `awb_no` membuat pembatalan
 *    ditolak J&T. Kode booking / nama driver, kalau perlu, simpan di tempat lain.
 *  - Tidak ada resi J&T, tidak ada cron tracking. Status Dikirim/Selesai ditandai admin lewat
 *    aksi `gosendShip` / `gosendDone` di `/api/admin/orders`.
 *  - Ongkir GoSend tidak dicatat: `shipping_cost` dipaksa 0 oleh server.
 */

export const GOSEND_SAMAQU = "GoSend SAMAQU";
export const GOSEND_CUSTOMER = "GoSend Customer";

export const GOSEND_METHODS = [GOSEND_SAMAQU, GOSEND_CUSTOMER] as const;

export type GosendMode = "samaqu" | "customer";

/** Nilai khusus J&T HBO yang sudah ada sebelumnya (resi diinput manual dari J&T VIP). */
const JNT_HBO = "J&T HBO";

/** True kalau teks `shipping_method` menyebut GoSend (toleran huruf besar/kecil & spasi/strip). */
export function isGosend(value?: string | null): boolean {
  return /^go[\s-]?send/i.test(String(value ?? "").trim());
}

/** Mode GoSend dari teks tersimpan; null kalau bukan GoSend. Tidak dikenal → dianggap SAMAQU. */
export function gosendMode(value?: string | null): GosendMode | null {
  if (!isGosend(value)) return null;
  return /customer|pelanggan/i.test(String(value)) ? "customer" : "samaqu";
}

/** Nilai `shipping_method` kanonik untuk sebuah mode. */
export function gosendMethodFor(mode: GosendMode): string {
  return mode === "customer" ? GOSEND_CUSTOMER : GOSEND_SAMAQU;
}

/** Keterangan pendek untuk label & tampilan. */
export function gosendCaption(value?: string | null): string {
  const mode = gosendMode(value);
  if (!mode) return "";
  return mode === "customer" ? "Dipesan Customer" : "Dipesan SAMAQU";
}

/**
 * Nilai `shipping_method` yang BOLEH disimpan dari input form ops. Selain HBO dan dua nilai
 * GoSend, hasilnya "" (artinya: jangan ubah / pakai bawaan) — perilaku lama dipertahankan.
 */
export function normalizeOpsShippingMethod(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (text === JNT_HBO) return JNT_HBO;
  const mode = gosendMode(text);
  return mode ? gosendMethodFor(mode) : "";
}

/**
 * Nilai yang dikirim ke fungsi edit saat admin mengubah transaksi. Fungsi database hanya
 * menimpa `shipping_method` kalau nilainya TIDAK kosong, jadi pindah dari GoSend ke J&T harus
 * mengirim nilai eksplisit (`reguler` = bawaan kolom) — kalau tidak, GoSend tetap menempel.
 * Perilaku lama (HBO / kosong) dipertahankan apa adanya.
 */
export function shippingMethodForEdit(incoming: unknown, current?: string | null): string {
  const next = normalizeOpsShippingMethod(incoming);
  if (next) return next;
  return isGosend(current) ? "reguler" : "";
}

/** Info untuk penanda `{info_driver}` pada WA "pesanan dikirim" GoSend. */
export function gosendDriverInfo(value?: string | null, customerCall = "Ka"): string {
  if (gosendMode(value) === "customer") {
    return `Paket sudah kami serahkan kepada driver GoSend yang ${customerCall} pesan. Silakan pantau perjalanan paket lewat aplikasi Gojek.`;
  }
  return `Driver GoSend sudah mengambil paket dan sedang menuju alamat ${customerCall}. Mohon pastikan nomor HP ${customerCall} aktif agar driver bisa menghubungi.`;
}
