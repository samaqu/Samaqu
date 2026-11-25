/**
 * Riwayat percakapan WhatsApp untuk bot: 8 pesan terakhir + sampai 3 "pesan penting" yang lebih lama
 * (alamat, rekap pesanan, bukti transfer).
 *
 * Dulu hanya 8 pesan terakhir, sehingga di chat yang banyak balasan pendek alamat dan rekap terdorong keluar
 * dan bot meminta data yang sudah ada. Pesan penting dipotong supaya prompt tidak membengkak (maksimal 11 baris).
 */

export const HISTORY_SCAN = 40;
export const HISTORY_RECENT = 8;
const ANCHOR_MESSAGE_MAX = 600;
const ANCHOR_REPLY_MAX = 900;

export interface HistoryRow {
  id: string;
  created_at: string;
  message: string | null;
  reply_text: string | null;
  media_key: string | null;
}

const ADDRESS_HINT = /\b(rt|rw|blok|jl|jalan|perum|perumahan|gang|gg|kec|kecamatan|kel|kelurahan|desa|kota|kab|kabupaten)\b|\bno\.?\s*\d/i;

export const isAddressMessage = (r: HistoryRow) => {
  const m = String(r.message || "");
  return m.length >= 30 && ADDRESS_HINT.test(m);
};
export const isRecapReply = (r: HistoryRow) => /ini rekap pesanannya/i.test(String(r.reply_text || ""));
export const hasProof = (r: HistoryRow) => Boolean(r.media_key);

/** `recent` berurutan baru → lama. Hasil berurutan lama → baru, tanpa duplikat. */
export function pickHistory(recent: HistoryRow[]): HistoryRow[] {
  const latest = recent.slice(0, HISTORY_RECENT);
  const older = recent.slice(HISTORY_RECENT);
  const anchors: HistoryRow[] = [];
  for (const test of [isAddressMessage, isRecapReply, hasProof]) {
    // Pesan penting yang sudah ada di 8 terakhir tidak perlu diambil lagi dari yang lebih lama.
    if (latest.some(test)) continue;
    const found = older.find(test);
    if (found && !anchors.some((a) => a.id === found.id)) {
      anchors.push({
        ...found,
        message: found.message && found.message.length > ANCHOR_MESSAGE_MAX ? found.message.slice(0, ANCHOR_MESSAGE_MAX) : found.message,
        reply_text: found.reply_text && found.reply_text.length > ANCHOR_REPLY_MAX ? found.reply_text.slice(0, ANCHOR_REPLY_MAX) : found.reply_text,
      });
    }
  }
  return [...anchors, ...latest].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}
