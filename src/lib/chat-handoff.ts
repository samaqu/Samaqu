/**
 * Penanda & deteksi "sambung ke admin lewat WhatsApp" untuk live chat.
 *
 * MURNI (tanpa I/O) supaya dipakai server (`/api/chat`) dan widget (`ChatPanel`) sekaligus.
 *
 * Alurnya: AI menutup balasan dengan penanda `[[WA]]` saat layak menawarkan admin. Server
 * mengirim event `handoff` ke widget, widget menyembunyikan penanda itu dan memunculkan
 * tombol WhatsApp. Server juga mengirim event yang sama kalau pelanggan jelas minta admin
 * atau tool `hubungi_admin` dipanggil, jadi tombol tidak bergantung pada kepatuhan model.
 */

export const WA_MARKER = "[[WA]]";

/** Penanda lengkap, atau sisa sebagian di ujung teks yang masih di-streaming (mis. "[[W"). */
const MARKER_COMPLETE_RE = /\s*\[\[WA\]\]\s*/g;
const MARKER_PARTIAL_RE = /\s*\[{1,2}(?:W|WA|WA\])?$/;

/** Buang penanda dari teks balasan (termasuk sisa sebagian saat streaming). */
export function stripWaMarker(text: string): string {
  return text.replace(MARKER_COMPLETE_RE, " ").replace(MARKER_PARTIAL_RE, "").trim();
}

export function hasWaMarker(text: string): boolean {
  return text.includes(WA_MARKER);
}

/**
 * Pelanggan jelas ingin bicara dengan orang / admin / lewat WhatsApp.
 * Sengaja longgar: salah munculin tombol murah, salah menyembunyikannya bikin pelanggan buntu.
 */
const ADMIN_INTENT_RE = new RegExp(
  [
    "\\b(admin|cs|customer\\s*service|operator|manusia|petugas|staf|staff)\\b",
    "\\b(wa|whatsapp|wasap|telepon|telpon|nelpon|telfon)\\b",
    "\\b(hubungi|kontak|ngobrol|bicara|ngomong)\\b.{0,30}\\b(orang|tim|toko|penjual|samaqu)\\b",
  ].join("|"),
  "i"
);

export function wantsAdmin(text: string): boolean {
  return ADMIN_INTENT_RE.test(text);
}
