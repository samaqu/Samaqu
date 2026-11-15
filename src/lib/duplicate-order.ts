/**
 * Pengaman order dobel (transaksi manual + approve draft Perlu Review).
 *
 * Aturan (disepakati): peringatkan kalau pesanan BARU punya
 *   - nomor HP yang sama (9 digit terakhir; format 08…/628…/+62 dianggap sama), ATAU
 *   - nama pelanggan yang sama persis (huruf besar/kecil dan spasi ganda diabaikan; minimal 2 kata,
 *     supaya nama pendek seperti "Budi" tidak memicu peringatan palsu)
 * dengan pesanan yang MASIH TERBUKA (pending / diproses) dan dibuat dalam 14 hari terakhir.
 *
 * Ini PERINGATAN, bukan blokir: admin boleh lanjut ("Tetap simpan") karena pembeli yang sama memang
 * bisa memesan lagi. Modul ini murni (tanpa database/jaringan) supaya mudah diuji.
 */

export const DUPLICATE_WINDOW_DAYS = 14;
/** Status "terbuka": belum dikirim/selesai/batal. */
export const DUPLICATE_OPEN_STATUSES = ["pending", "diproses"] as const;
const MAX_MATCHES = 5;
const MIN_PHONE_DIGITS = 9;

export type DuplicateReason = "nomor" | "nama";

export interface DuplicateCandidate {
  order_number?: string | null;
  customer_name?: string | null;
  customer_whatsapp?: string | null;
  status?: string | null;
  total?: number | null;
  created_at?: string | null;
  is_preorder?: boolean | null;
}

export interface DuplicateMatch {
  order_number: string;
  customer_name: string;
  customer_whatsapp: string;
  status: string;
  total: number;
  created_at: string;
  is_preorder: boolean;
  reasons: DuplicateReason[];
}

/** 9 digit terakhir nomor HP; null kalau terlalu pendek untuk dibandingkan dengan aman. */
export function phoneKey(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS) return null;
  return digits.slice(-MIN_PHONE_DIGITS);
}

/** Nama dinormalkan (huruf kecil, tanpa tanda baca, spasi tunggal); null kalau kurang dari 2 kata. */
export function nameKey(raw: unknown): string | null {
  const words = String(raw ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length >= 2 ? words.join(" ") : null;
}

export function duplicateSinceIso(now: Date = new Date()): string {
  return new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * 24 * 3600_000).toISOString();
}

/**
 * Cari pesanan terbuka yang mirip. `rows` boleh berisi apa saja (sudah/ belum difilter di query);
 * status dan jendela waktu tetap diperiksa lagi di sini supaya aturannya satu tempat.
 */
export function findPossibleDuplicates(
  rows: DuplicateCandidate[],
  input: { phone: unknown; name: unknown; now?: Date },
): DuplicateMatch[] {
  const wantPhone = phoneKey(input.phone);
  const wantName = nameKey(input.name);
  if (!wantPhone && !wantName) return [];

  const since = duplicateSinceIso(input.now);
  const open = new Set<string>(DUPLICATE_OPEN_STATUSES);
  const out: DuplicateMatch[] = [];

  for (const row of rows || []) {
    if (!row || !open.has(String(row.status || "").toLowerCase())) continue;
    const createdAt = String(row.created_at || "");
    if (!createdAt || createdAt < since) continue;

    const reasons: DuplicateReason[] = [];
    if (wantPhone && phoneKey(row.customer_whatsapp) === wantPhone) reasons.push("nomor");
    if (wantName && nameKey(row.customer_name) === wantName) reasons.push("nama");
    if (!reasons.length) continue;

    out.push({
      order_number: String(row.order_number || ""),
      customer_name: String(row.customer_name || ""),
      customer_whatsapp: String(row.customer_whatsapp || ""),
      status: String(row.status || ""),
      total: Number(row.total) || 0,
      created_at: createdAt,
      is_preorder: row.is_preorder === true,
      reasons,
    });
  }

  // Terbaru dulu; yang cocok di nomor DAN nama dianggap paling mirip.
  out.sort((a, b) => b.reasons.length - a.reasons.length || (a.created_at < b.created_at ? 1 : -1));
  return out.slice(0, MAX_MATCHES);
}

export const POSSIBLE_DUPLICATE_CODE = "possible_duplicate";

export function duplicateMessage(matches: DuplicateMatch[]): string {
  const first = matches[0];
  if (!first) return "";
  const alasan = first.reasons.includes("nomor") ? "nomor HP" : "nama";
  const lainnya = matches.length > 1 ? ` (+${matches.length - 1} pesanan lain)` : "";
  return `Pesanan ${first.order_number} dengan ${alasan} yang sama masih terbuka${lainnya}. Periksa dulu supaya tidak tercatat dobel.`;
}
