/**
 * Konstanta & helper Sistem Produksi fase 1 (dipakai UI dan route API).
 *
 * Fase 1 hanya master komponen, pembelian bahan, buku stok, stok awal, dan opname.
 * Resep / jadwal produksi / HPP belum ada di sini.
 */

export type ComponentCategory =
  | "kain"
  | "komponen_produk"
  | "kemasan_produk"
  | "packaging_pesanan"
  | "penunjang";

export const COMPONENT_CATEGORIES: {
  value: ComponentCategory;
  label: string;
  prefix: string;
}[] = [
  { value: "kain", label: "Kain", prefix: "KAIN" },
  { value: "komponen_produk", label: "Komponen Produk", prefix: "KOMP" },
  { value: "kemasan_produk", label: "Kemasan Produk", prefix: "KMS" },
  { value: "packaging_pesanan", label: "Packaging Pesanan", prefix: "PKG" },
  { value: "penunjang", label: "Penunjang", prefix: "PNJ" },
];

/** Satuan pakai / satuan beli. `yard` wajib ada karena kain memakainya. */
export const COMPONENT_UNITS = [
  "yard",
  "meter",
  "pcs",
  "lembar",
  "pack",
  "roll",
  "lusin",
  "set",
  "kg",
  "gram",
  "liter",
  "ml",
];

export const MOVEMENT_TYPES: Record<string, { label: string; tone: "in" | "out" | "adjust" }> = {
  stok_awal: { label: "Stok Awal", tone: "in" },
  pembelian: { label: "Pembelian", tone: "in" },
  opname: { label: "Penyesuaian Opname", tone: "adjust" },
  rusak_hilang: { label: "Rusak/Hilang", tone: "out" },
  penyesuaian: { label: "Penyesuaian", tone: "adjust" },
  // Fase berikutnya (sudah disiapkan di struktur, belum dipakai):
  keluar_produksi: { label: "Keluar ke Produksi", tone: "out" },
  retur_sisa_bahan: { label: "Retur Sisa Bahan", tone: "in" },
  packaging_pesanan: { label: "Packaging Pesanan", tone: "out" },
  keluar_packaging: { label: "Keluar ke Packaging", tone: "out" },
  retur_packaging: { label: "Retur Packaging", tone: "in" },
};

export const OPNAME_REASONS = [
  "Salah hitung",
  "Rusak/cacat",
  "Hilang",
  "Retur belum tercatat",
  "Salah input",
  "Lainnya",
];

export type StockStatusKey = "aman" | "menipis" | "habis";

/**
 * Status stok: 0 = Habis, <= stok minimum = Menipis, sisanya Aman.
 * Kalau stok minimum 0, hanya "Habis" yang bisa muncul (bukan menipis).
 */
export function stockStatus(stock: number, minStock = 0): StockStatusKey {
  const qty = Number(stock) || 0;
  const min = Number(minStock) || 0;
  if (qty <= 0) return "habis";
  if (min > 0 && qty <= min) return "menipis";
  return "aman";
}

export const STOCK_STATUS_LABEL: Record<StockStatusKey, string> = {
  aman: "Aman",
  menipis: "Menipis",
  habis: "Habis",
};

export function categoryLabel(value?: string | null): string {
  return COMPONENT_CATEGORIES.find((c) => c.value === value)?.label || "—";
}

export function categoryPrefix(value?: string | null): string {
  return COMPONENT_CATEGORIES.find((c) => c.value === value)?.prefix || "KOMP";
}

export function movementLabel(type?: string | null): string {
  return MOVEMENT_TYPES[String(type || "")]?.label || String(type || "—");
}

export function formatRupiah(value: number | string | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString("id-ID");
}

/** Angka qty: maksimal 4 desimal, tanpa nol di belakang. */
export function formatQty(value: number | string | null | undefined): string {
  const n = Number(value) || 0;
  return n.toLocaleString("id-ID", { maximumFractionDigits: 4 });
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function todayInput(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

/** Selisih Harga Aman − Harga Real. Negatif = Harga Real lebih mahal. */
export function priceGap(real: number, safe: number): number {
  return (Number(safe) || 0) - (Number(real) || 0);
}

// ── Import Paste ─────────────────────────────────────────────────────────────

export type ImportComponentRow = {
  line: number;
  name: string;
  category: string;
  unit_use: string;
  price: number;
  safe_price: number;
  initial_stock: number;
  min_stock: number;
  fabric_type: string;
  fabric_type_id: string | null;
  errors: string[];
};

export type FabricType = { id: string; name: string };

const normalizeKey = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** "Rp 1.500,50" / "1500.5" / "1,5" → angka. */
export function parseNumber(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  let cleaned = raw.replace(/[^\d.,-]/g, "");
  if (cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeCategoryInput(value: string): ComponentCategory | null {
  const key = normalizeKey(value);
  if (key === "kain") return "kain";
  if (key === "komponenproduk" || key === "komponen") return "komponen_produk";
  if (key === "kemasanproduk" || key === "kemasan") return "kemasan_produk";
  if (key === "packagingpesanan" || key === "packaging") return "packaging_pesanan";
  if (key === "penunjang") return "penunjang";
  return null;
}

function matchFabric(value: string, fabricTypes: FabricType[]): FabricType | null {
  const key = normalizeKey(value);
  if (!key) return null;
  return fabricTypes.find((f) => normalizeKey(f.name) === key) || null;
}

function splitCells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  return line.split(",");
}

/**
 * Parse tempelan dari Excel/Google Sheet.
 * Urutan kolom: nama, kategori, satuan, harga beli (harga stok awal),
 * Harga Aman (opsional), stok awal, stok minimum, jenis kain (opsional).
 */
export function parseComponentPaste(
  text: string,
  fabricTypes: FabricType[] = [],
): { rows: ImportComponentRow[]; error: string } {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

  if (lines.length === 0) return { rows: [], error: "Belum ada data yang ditempel." };

  // Baris header (kalau ada) dilewati.
  const first = lines[0].toLowerCase();
  const start = first.includes("nama") && (first.includes("kategori") || first.includes("satuan")) ? 1 : 0;

  const rows: ImportComponentRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCells(lines[i]).map((c) => c.trim());
    if (cells.every((c) => c === "")) continue;

    const name = cells[0] || "";
    const categoryRaw = cells[1] || "";
    const unitRaw = cells[2] || "";
    const priceRaw = cells[3] || "";
    const safeRaw = cells[4] || "";
    const initialRaw = cells[5] || "";
    const minRaw = cells[6] || "";
    const fabricRaw = cells[7] || "";

    const errors: string[] = [];
    const category = normalizeCategoryInput(categoryRaw);
    const unit = unitRaw.trim().toLowerCase();
    const price = parseNumber(priceRaw);
    const safe = safeRaw === "" ? 0 : parseNumber(safeRaw);
    const initial = initialRaw === "" ? 0 : parseNumber(initialRaw);
    const min = minRaw === "" ? 0 : parseNumber(minRaw);
    const fabric = fabricRaw ? matchFabric(fabricRaw, fabricTypes) : null;

    if (!name) errors.push("Nama wajib diisi");
    if (!category) errors.push(`Kategori tidak dikenal: "${categoryRaw}"`);
    if (!unit) errors.push("Satuan wajib diisi");
    if (Number.isNaN(price) || price < 0) errors.push("Harga beli tidak valid");
    if (Number.isNaN(safe) || safe < 0) errors.push("Harga Aman tidak valid");
    if (Number.isNaN(initial) || initial < 0) errors.push("Stok awal tidak valid");
    if (Number.isNaN(min) || min < 0) errors.push("Stok minimum tidak valid");
    if (fabricRaw && !fabric) errors.push(`Jenis kain tidak dikenal: "${fabricRaw}"`);

    rows.push({
      line: i + 1,
      name,
      category: category || "",
      unit_use: unit,
      price: Number.isNaN(price) ? 0 : price,
      safe_price: Number.isNaN(safe) ? 0 : safe,
      initial_stock: Number.isNaN(initial) ? 0 : initial,
      min_stock: Number.isNaN(min) ? 0 : min,
      fabric_type: fabricRaw,
      fabric_type_id: fabric?.id || null,
      errors,
    });
  }

  return { rows, error: "" };
}

/** Tampilkan angka + satuan: "12,5 yard". */
export function qtyUnit(qty: number | string, unit?: string | null): string {
  return `${formatQty(qty)}${unit ? ` ${unit}` : ""}`;
}
