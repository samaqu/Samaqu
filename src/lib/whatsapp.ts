/**
 * Tautan WhatsApp — satu sumber untuk tombol "Hubungi via WhatsApp".
 *
 * `wa.me` menuntut nomor internasional tanpa "+" dan **tanpa angka 0 di depan**: nomor
 * lokal seperti "0812…" (yang paling sering diketik pelanggan) dijawab WhatsApp dengan
 * halaman "nomor telepon tidak valid", jadi chat tidak pernah terbuka. Itulah sebabnya
 * tombol dengan nomor mentah terasa "kurang smooth" saat diklik.
 *
 * Modul ini murni (tanpa React/browser) supaya bisa diuji langsung dengan Node.
 */

import { greetingName } from "./greeting";

/** Nomor apa pun → format `wa.me` (62…, tanpa "+"). Nomor tak dikenal dibiarkan apa adanya. */
export function waNumber(raw?: string | null): string {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

/** Tautan yang langsung membuka percakapan dengan pesan siap kirim. */
export function waLink(raw: string | null | undefined, message: string): string {
  return `https://wa.me/${waNumber(raw)}?text=${encodeURIComponent(message)}`;
}

/**
 * Nomor apa pun → format lokal Indonesia berawalan "0" (mis. "85603324143" → "085603324143",
 * "+62 812-3456-7890" → "081234567890").
 *
 * Dipakai supaya nomor yang ditampilkan layar sama bentuknya dengan yang ada di profil — apa pun
 * asal simpannya (profil, alamat tersimpan yang dulu diisi tanpa 0, atau ketikan pelanggan).
 */
export function localPhone(raw?: string | null): string {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  if (digits.startsWith("0")) return digits;
  if (digits.startsWith("8")) return `0${digits}`;
  return digits;
}

/**
 * Emoji ditulis sebagai escape Unicode, bukan karakter mentah: byte-nya jadi tidak
 * bergantung pada encoding file, sehingga tidak bisa berubah jadi "�" di pesan yang
 * diterima pelanggan.
 */
const SENYUM = "\u{1F60A}";

/**
 * Teks pesan standar SAMAQU untuk menagih pembayaran — dipakai tombol
 * "Hubungi via WhatsApp" di detail pesanan untuk **semua** pesanan; hanya sapaan
 * pelanggan (lihat `greetingName`) dan nomor pesanan yang berubah.
 */
export function pesanPembayaran(nama?: string | null, noPesanan?: string | null): string {
  const panggilan = greetingName(nama, "Kak");
  const no = (noPesanan || "").trim();
  const nomor = no ? ` (No. Pesanan: ${no})` : "";
  return `Halo ${panggilan} ${SENYUM}

Pesanan Kakak di SAMAQU${nomor} sudah masuk, nih! Tinggal selangkah lagi supaya pesanan bisa segera kami proses.

Yuk, selesaikan pembayarannya sekarang ya, Kak. Setelah transfer, kirim bukti pembayarannya ke sini agar pesanan bisa langsung kami lanjutkan.

Terima kasih!`;
}
