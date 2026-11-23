/**
 * Penjagaan "resi sudah terbit": data PENERIMA dan ALAMAT tidak boleh diubah lewat Ubah Pesanan setelah resi J&T dibuat.
 *
 * Alasan: resi J&T dibuat dari data pesanan SAAT ITU, dan klien J&T kita tidak punya fungsi ubah (hanya buat, batalkan,
 * lacak, cek tarif). Kalau alamat di database diganti, label J&T resmi tetap membawa alamat LAMA sedangkan label internal
 * membawa alamat baru, dan paket bisa terkirim ke alamat lama. Jalur yang benar: batalkan pesanan (resi di-void) lalu buat
 * pesanan baru. MODUL MURNI: tidak membaca database.
 */

export interface RecipientFields {
  name: string | null | undefined;
  whatsapp: string | null | undefined;
  address: string | null | undefined;
  city: string | null | undefined;
  kecamatan: string | null | undefined;
  province: string | null | undefined;
  postal: string | null | undefined;
}

const LABELS: [keyof RecipientFields, string][] = [
  ["name", "nama penerima"],
  ["whatsapp", "nomor HP"],
  ["address", "alamat"],
  ["city", "kota"],
  ["kecamatan", "kecamatan"],
  ["province", "provinsi"],
  ["postal", "kode pos"],
];

/** Spasi dirapikan dan huruf kecil, supaya beda format saja tidak dianggap perubahan. */
const text = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Nomor HP: hanya angka, awalan 62 atau +62 disamakan dengan 0. */
export function normalizePhone(v: unknown): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  return digits;
}

/** Daftar bagian penerima/alamat yang BERBEDA antara data tersimpan dan data yang akan disimpan. Kosong = tidak berubah. */
export function changedRecipientFields(stored: RecipientFields, incoming: RecipientFields): string[] {
  const changed: string[] = [];
  for (const [key, label] of LABELS) {
    const same = key === "whatsapp" ? normalizePhone(stored[key]) === normalizePhone(incoming[key]) : text(stored[key]) === text(incoming[key]);
    if (!same) changed.push(label);
  }
  return changed;
}

export function resiLockedMessage(awb: string | null | undefined, changed: string[]): string {
  return (
    `Resi J&T${awb ? ` (${awb})` : ""} sudah terbit, jadi data penerima dan alamat tidak bisa diubah di sini (yang berubah: ${changed.join(", ")}). ` +
    "Resi di J&T tidak ikut berubah sehingga paket bisa terkirim ke alamat lama. " +
    "Batalkan pesanan ini (resi ikut dibatalkan) lalu buat pesanan baru. Kalau paket sudah diambil kurir, hubungi J&T dengan nomor resinya."
  );
}
