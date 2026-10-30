"use client";

/**
 * Teks yang "diucapkan" asisten admin (Ara) di UI.
 *
 * Dipisah dari komponen supaya bisa diuji tanpa React/browser. Berkas ini HANYA untuk
 * asisten admin — prompt dan teks AI pelanggan (homepage) tidak memakainya sama sekali.
 */

/**
 * Sapaan pembuka percakapan baru. Disimpan sebagai pesan pertama di riwayat supaya muncul
 * SEKALI saja (tidak diulang saat refresh / pindah menu / memulihkan percakapan lama).
 * Jangan diubah tanpa permintaan eksplisit.
 */
export const GREETING =
  "Hai Lea! Aku Ara, partner kerja digital kamu di SAMAQU. Kalau ada pesanan yang bikin bingung atau stok yang perlu dicek, kita cari tahu bareng-bareng, ya.";

/**
 * Indikator saat Ara bekerja. Dipilih dari kata kunci pertanyaan terakhir supaya benar-benar
 * sesuai aktivitas yang sedang berjalan (bukan progres palsu).
 * Urutan penting: pola yang lebih spesifik diperiksa lebih dulu.
 */
const BUSY_LABELS: { re: RegExp; text: string }[] = [
  {
    re: /mengapa|kenapa|penyebab|masalah|kendala|error|gagal|komplain|keluhan|batal|terlambat|telat/i,
    text: "Ara sedang menelusuri informasinya dulu...",
  },
  {
    re: /pesanan|pesan|order|resi|pengiriman|dikirim|kirim|ekspedisi|paket|awb/i,
    text: "Ara sedang menelusuri informasi pesanan...",
  },
  {
    re: /stok|habis|menipis|varian|gudang|restock|barang/i,
    text: "Sebentar ya, Lea. Ara cek stoknya dulu...",
  },
  {
    re: /omset|omzet|penjualan|pendapatan|revenue|keuntungan|laba|margin/i,
    text: "Ara sedang menghitung omzetnya dulu...",
  },
  {
    re: /rangkum|ringkas|kondisi|operasional|situasi|aktivitas|kabar|hari ini/i,
    text: "Ara sedang merangkum kondisi toko...",
  },
];

export const BUSY_FALLBACK = "Sebentar ya, Lea. Ara bantu cek dulu...";

/** Label indikator untuk pertanyaan yang sedang diproses. */
export function busyLabel(question: string): string {
  for (const { re, text } of BUSY_LABELS) if (re.test(question)) return text;
  return BUSY_FALLBACK;
}
