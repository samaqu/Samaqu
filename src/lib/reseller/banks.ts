/**
 * Daftar bank reseller + deteksi BSI — SATU sumber untuk portal, admin, dan server.
 *
 * Nilai yang disimpan di `resellers.bank_name` adalah KODE bank ("BSI", "BCA", …)
 * untuk bank yang ada di daftar; bank lain disimpan sebagai teks bebas pilihan
 * "Lainnya". Deteksi BSI memakai kode tersebut, BUKAN pencocokan teks — data lama
 * dinormalisasi lewat migration (BSI / Bank Syariah Indonesia / Mandiri Syariah /
 * BNI Syariah / BRI Syariah → "BSI").
 *
 * Biaya penarikan selalu dihitung SERVER (`samaqu_reseller_ajukan_penarikan`);
 * browser hanya menampilkan hasilnya.
 */

export interface ResellerBankOption {
  code: string;
  label: string;
  /** true hanya untuk Bank Syariah Indonesia (gratis biaya admin penarikan). */
  isBsi?: boolean;
}

export const BSI_BANK_CODE = "BSI";

/** Penanda di dropdown: pilih bank lain lalu isi nama bank sendiri. */
export const OTHER_BANK_VALUE = "__other__";

export const RESELLER_BANK_OPTIONS: ResellerBankOption[] = [
  { code: BSI_BANK_CODE, label: "Bank Syariah Indonesia (BSI)", isBsi: true },
  { code: "BCA", label: "BCA" },
  { code: "BRI", label: "BRI" },
  { code: "Mandiri", label: "Mandiri" },
  { code: "BNI", label: "BNI" },
  { code: "BTN", label: "BTN" },
  { code: "CIMB", label: "CIMB Niaga" },
  { code: "Permata", label: "Permata Bank" },
  { code: "Danamon", label: "Danamon" },
  { code: "Muamalat", label: "Bank Muamalat" },
  { code: "Jago", label: "Bank Jago" },
  { code: "SeaBank", label: "SeaBank" },
  { code: "BJB", label: "BJB" },
  { code: "Mega", label: "Bank Mega" },
  { code: "Sinarmas", label: "Bank Sinarmas" },
  { code: "Panin", label: "Panin Bank" },
  { code: "OCBC", label: "OCBC" },
  { code: "UOB", label: "UOB" },
  { code: "BTPN", label: "BTPN" },
];

/** Kode bank yang dikenal dari sebuah nilai tersimpan (kode atau label lama). */
export function detectKnownBankCode(value?: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  const byCode = RESELLER_BANK_OPTIONS.find((option) => option.code.toUpperCase() === upper);
  if (byCode) return byCode.code;

  const lower = raw.toLowerCase();
  const byLabel = RESELLER_BANK_OPTIONS.find((option) => option.label.toLowerCase() === lower);
  if (byLabel) return byLabel.code;

  // Teks lama yang jelas-jelas BSI (termasuk bank syariah yang sudah merger ke BSI).
  if (detectBsiFromText(raw)) return BSI_BANK_CODE;

  return null;
}

/** Pola teks lama untuk BSI (dipakai juga oleh migration normalisasi). */
export function detectBsiFromText(value?: string | null): boolean {
  const name = String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!name) return false;
  return (
    name.includes("bsi") ||
    name.includes("banksyariahindonesia") ||
    name.includes("syariahindonesia") ||
    name.includes("mandirisyariah") ||
    name.includes("bnisyariah") ||
    name.includes("brisyariah")
  );
}

/** Apakah bank ini BSI (penarikan gratis biaya admin)? */
export function isBsiBank(value?: string | null): boolean {
  return detectKnownBankCode(value) === BSI_BANK_CODE;
}

/** Nama bank untuk ditampilkan: kode → label; teks bebas tetap apa adanya. */
export function bankDisplayName(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const code = detectKnownBankCode(raw);
  const option = code ? RESELLER_BANK_OPTIONS.find((item) => item.code === code) : null;
  return option?.label || raw;
}

/** Nilai yang disimpan ke DB: kode untuk bank dikenal, teks bebas untuk "Lainnya". */
export function normalizeBankValue(raw?: string | null): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  return detectKnownBankCode(trimmed) ?? trimmed;
}
