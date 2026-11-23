/**
 * Template chat Inbox WA: tipe data + pengisian placeholder (murni, diuji).
 * Placeholder: {nama} = nama pelanggan, {admin} = nama admin yang membalas. Placeholder lain dibiarkan apa adanya
 * (supaya terlihat jelas bila ada yang belum diisi sebelum dikirim).
 */

export interface WaTemplate {
  id: number;
  title: string;
  category: string;
  content: string;
  sort_order: number;
  active: boolean;
}

export const TEMPLATE_LIMITS = { title: [2, 80], category: [1, 40], content: [1, 4000] } as const;

/** Nama pelanggan untuk sapaan: nama jika ada dan masuk akal, selain itu "Ka". */
export function customerNameFor(raw: string | null | undefined): string {
  const name = String(raw || "").trim();
  if (!name || /^\+?\d[\d\s-]{5,}$/.test(name)) return "Ka";
  // Nama profil WhatsApp sering berisi hiasan. Pakai kata pertama HANYA bila murni huruf (setelah membuang tanda baca
  // di ujungnya); kalau berhias atau campur simbol, lebih aman menyapa "Ka" daripada nama yang janggal.
  const first = (name.split(/\s+/)[0] || "").replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  return /^\p{L}[\p{L}'’-]*$/u.test(first) && first.length >= 2 ? first : "Ka";
}

/** Isi {nama} dan {admin} (tanpa membedakan huruf besar/kecil). */
export function fillTemplate(content: string, vars: { nama?: string; admin?: string }): string {
  return String(content || "")
    .replace(/\{nama\}/gi, vars.nama || "Ka")
    .replace(/\{admin\}/gi, vars.admin || "");
}
