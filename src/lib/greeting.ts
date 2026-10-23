/**
 * Sapaan nama pelanggan untuk pesan WhatsApp — satu sumber untuk notifikasi otomatis
 * (`fonnte.ts`) dan pesan manual admin (`whatsapp.ts`).
 *
 * Aturan:
 *  - Nama biasa → "<awalan> <nama depan>", mis. "Ka Lea" / "Kak Lea".
 *  - Nama yang diawali gelar ("Ust.", "Bpk.", "Ibu", "H.", …) → gelar TIDAK dianggap nama:
 *    hasilnya "<gelar> <nama depan>" tanpa awalan, mis. "Ust. Irsan" — bukan "Ka Ust.".
 *    Beberapa gelar berurutan tetap dipertahankan ("Bpk. H. Irsan").
 *  - Nama yang sudah diawali "Ka"/"Kak"/"Kakak" dipakai apa adanya (tidak jadi "Ka Kak Lea").
 *  - Nama kosong → awalan saja ("Ka").
 *  - Penanda template (`{nama}`) dikembalikan apa adanya; nilainya nanti sudah berupa sapaan
 *    lengkap, jadi template tidak boleh menambah awalan lagi.
 */

/** Gelar/sapaan formal yang lazim di awal nama pelanggan. */
const GELAR = /^(bpk|bapak|ibu|ust|ustad|ustadz|ustadzah|ustzh|h|hj|haji|hajjah|sdr|saudara|saudari|akh|ukhti|dr|drs|dra)\.?$/i;

/** Nama yang sudah berupa sapaan ("Ka", "Kak", "Kakak"). */
const SUDAH_DISAPA = /^ka(k|kak)?\.?$/i;

/** Sapaan untuk sebuah nama; `prefix` default "Ka" (notifikasi), "Kak" untuk pesan manual. */
export function greetingName(name?: string | null, prefix = "Ka"): string {
  const full = String(name ?? "").trim();
  if (!full) return prefix;
  if (/^\{[a-zA-Z0-9_]+\}$/.test(full)) return full;

  const words = full.split(/\s+/);
  const first = words[0];

  if (SUDAH_DISAPA.test(first)) return full;

  if (GELAR.test(first)) {
    // Lewati rangkaian gelar, lalu ambil satu kata nama setelahnya.
    let i = 0;
    while (i < words.length - 1 && GELAR.test(words[i])) i += 1;
    return words.slice(0, i + 1).join(" ");
  }

  return `${prefix} ${first}`;
}
