/** Warna & gradient kain untuk filter katalog (tanpa komponen/modal). */

const KAIN_FLAT_COLOR: Record<string, string> = {
  "B.01": "#141414",
  "B.02": "#1E2436",
  "A.02": "#B4A79B",
  "C.01": "#CDBFB0",
};

const KAIN_GRADIENT: Record<string, string> = {
  "B.01": "linear-gradient(160deg, #2b2b2b 0%, #141414 100%)",
  "B.02": "linear-gradient(160deg, #2a3350 0%, #1e2436 100%)",
  "A.02": "linear-gradient(160deg, #c9baa9 0%, #b4a79b 100%)",
  "C.01": "linear-gradient(160deg, #e4d9c8 0%, #cdbfb0 100%)",
};

function normalizeKainCode(code: string): string {
  return code.trim().toUpperCase().replace(/-/g, ".");
}

export function getKainGradient(code?: string | null): string | undefined {
  if (!code) return undefined;
  return KAIN_GRADIENT[normalizeKainCode(code)];
}

export function getKainSwatchColor(code?: string | null): string {
  if (!code) return "#c9b79c";
  return KAIN_FLAT_COLOR[normalizeKainCode(code)] || "#c9b79c";
}
