/**
 * Konstanta & parser untuk Resep Produk (Fase 2).
 * Hanya definisi resep + HPP; tidak menyentuh stok.
 */

import { formatQty, parseNumber, type FabricType } from "@/lib/produksi";

export type RecipeLineType = "bahan" | "biaya";

export type BahanGroupCode = "kain" | "bahan_produksi" | "packaging_pesanan" | "tambahan_opsional";

export const BAHAN_GROUPS: { value: BahanGroupCode; label: string }[] = [
  { value: "bahan_produksi", label: "Bahan Produksi" },
  { value: "kain", label: "Kain" },
  { value: "packaging_pesanan", label: "Packaging Pesanan" },
  { value: "tambahan_opsional", label: "Tambahan Opsional" },
];

export const BAHAN_GROUP_LABEL: Record<string, string> = {
  kain: "Kain",
  bahan_produksi: "Bahan Produksi",
  packaging_pesanan: "Packaging Pesanan",
  tambahan_opsional: "Tambahan Opsional",
  biaya: "Biaya Non-Bahan",
};

/** Contoh kelompok biaya yang sudah dipakai di sheet HPP. */
export const COST_GROUP_EXAMPLES = [
  "Biaya Jahit",
  "Kain Keras",
  "Trikot & Vislin",
  "Potong/Finishing/QC",
  "Pembuatan Tali Tarboosh dan pasang kancing jepret",
  "Biaya Lain-lain",
];

export type RecipeLine = {
  id?: string;
  line_type: RecipeLineType;
  group_code: string;
  group_label?: string | null;
  component_id?: string | null;
  name: string;
  qty_per_pcs: number;
  waste_percent: number;
  size_qty: Record<string, number>;
  real_price: number;
  safe_price: number;
  filter_fabric_type_id?: string | null;
  filter_series?: string | null;
  filter_size?: string | null;
  filter_color?: string | null;
  notes?: string | null;
  sort_order?: number;
  // Hasil join (opsional, dari server)
  component_code?: string | null;
  unit_use?: string | null;
};

export type Recipe = {
  id: string;
  product_category: string;
  version: number;
  effective_date: string;
  is_active: boolean;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  line_count?: number;
};

export function bahanGroupLabel(code?: string | null): string {
  return BAHAN_GROUP_LABEL[String(code || "")] || "—";
}

/** Ringkasan filter untuk tabel: kosong = "Semua". */
export function filterSummary(line: RecipeLine, fabricName: (id?: string | null) => string): string {
  const parts = [
    line.filter_fabric_type_id ? fabricName(line.filter_fabric_type_id) : "",
    line.filter_series ? `Series ${line.filter_series}` : "",
    line.filter_size ? `Ukuran ${line.filter_size}` : "",
    line.filter_color ? `Warna ${line.filter_color}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Semua";
}

// ── Import Paste: baris bahan ────────────────────────────────────────────────

export type ImportBahanRow = {
  line: number;
  component_id: string | null;
  component_label: string;
  qty_per_pcs: number;
  waste_percent: number;
  group_code: string;
  filter_fabric_type_id: string | null;
  filter_series: string;
  filter_size: string;
  errors: string[];
};

const norm = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function groupFromText(value: string): BahanGroupCode | null {
  const key = norm(value).replace(/[^a-z0-9]/g, "");
  if (key === "kain") return "kain";
  if (key === "bahanproduksi") return "bahan_produksi";
  if (key === "packagingpesanan" || key === "packaging") return "packaging_pesanan";
  if (key === "tambahanopsional" || key === "tambahan") return "tambahan_opsional";
  return null;
}

function splitCells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (line.includes(";")) return line.split(";");
  return line.split(",");
}

type ComponentOption = { id: string; code: string; name: string; unit_use: string };

/**
 * Kolom: nama komponen, jumlah per pcs, kelompok, filter jenis kain,
 * filter series, filter ukuran, susut % (opsional).
 */
export function parseBahanPaste(
  text: string,
  components: ComponentOption[],
  fabrics: FabricType[],
): { rows: ImportBahanRow[]; error: string } {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { rows: [], error: "Belum ada data yang ditempel." };

  const first = norm(lines[0]);
  const start = first.includes("komponen") || first.includes("nama") ? 1 : 0;
  const byCode = new Map(components.map((c) => [norm(c.code), c]));
  const byName = new Map(components.map((c) => [norm(c.name), c]));
  const fabricByName = new Map(fabrics.map((f) => [norm(f.name), f]));

  const rows: ImportBahanRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCells(lines[i]).map((c) => c.trim());
    if (cells.every((c) => c === "")) continue;

    const componentKey = cells[0] || "";
    const qtyRaw = cells[1] || "";
    const groupRaw = cells[2] || "";
    const fabricRaw = cells[3] || "";
    const seriesRaw = cells[4] || "";
    const sizeRaw = cells[5] || "";
    const wasteRaw = cells[6] || "";

    const component = byCode.get(norm(componentKey)) || byName.get(norm(componentKey)) || null;
    const qty = parseNumber(qtyRaw);
    const waste = wasteRaw === "" ? 0 : parseNumber(wasteRaw);
    const group = groupFromText(groupRaw);
    const fabric = fabricRaw ? fabricByName.get(norm(fabricRaw)) || null : null;

    const errors: string[] = [];
    if (!component) errors.push(`Komponen "${componentKey}" tidak ditemukan`);
    if (!Number.isFinite(qty) || qty < 0) errors.push("Jumlah per pcs tidak valid");
    if (!group) errors.push(`Kelompok tidak dikenal: "${groupRaw}"`);
    if (fabricRaw && !fabric) errors.push(`Jenis kain "${fabricRaw}" tidak ditemukan`);
    if (group === "kain" && !fabric) errors.push("Baris kain wajib punya filter jenis kain");
    if (wasteRaw !== "" && (!Number.isFinite(waste) || waste < 0)) errors.push("Susut tidak valid");

    rows.push({
      line: i + 1,
      component_id: component?.id || null,
      component_label: component ? `${component.code} · ${component.name}` : componentKey,
      qty_per_pcs: Number.isFinite(qty) ? qty : 0,
      waste_percent: Number.isFinite(waste) ? waste : 0,
      group_code: group || "",
      filter_fabric_type_id: fabric?.id || null,
      filter_series: seriesRaw,
      filter_size: sizeRaw,
      errors,
    });
  }

  return { rows, error: "" };
}

// ── Import Paste: baris biaya ────────────────────────────────────────────────

export type ImportBiayaRow = {
  line: number;
  name: string;
  real_price: number;
  safe_price: number;
  group_label: string;
  filter_fabric_type_id: string | null;
  filter_series: string;
  filter_size: string;
  errors: string[];
};

/**
 * Kolom: nama biaya, nominal Real, nominal Aman, kelompok,
 * filter jenis kain, filter series, filter ukuran.
 */
export function parseBiayaPaste(
  text: string,
  fabrics: FabricType[],
): { rows: ImportBiayaRow[]; error: string } {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { rows: [], error: "Belum ada data yang ditempel." };

  const first = norm(lines[0]);
  const start = first.includes("nama") || first.includes("biaya") ? 1 : 0;
  const fabricByName = new Map(fabrics.map((f) => [norm(f.name), f]));

  const rows: ImportBiayaRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCells(lines[i]).map((c) => c.trim());
    if (cells.every((c) => c === "")) continue;

    const name = cells[0] || "";
    const real = parseNumber(cells[1] || "");
    const safe = parseNumber(cells[2] || "");
    const group = cells[3] || "";
    const fabricRaw = cells[4] || "";
    const series = cells[5] || "";
    const size = cells[6] || "";
    const fabric = fabricRaw ? fabricByName.get(norm(fabricRaw)) || null : null;

    const errors: string[] = [];
    if (!name) errors.push("Nama biaya wajib diisi");
    if (!Number.isFinite(real) || real < 0) errors.push("Nominal Real tidak valid");
    if (!Number.isFinite(safe) || safe < 0) errors.push("Nominal Aman tidak valid");
    if (!group) errors.push("Kelompok biaya wajib diisi");
    if (fabricRaw && !fabric) errors.push(`Jenis kain "${fabricRaw}" tidak ditemukan`);

    rows.push({
      line: i + 1,
      name,
      real_price: Number.isFinite(real) ? real : 0,
      safe_price: Number.isFinite(safe) ? safe : 0,
      group_label: group,
      filter_fabric_type_id: fabric?.id || null,
      filter_series: series,
      filter_size: size,
      errors,
    });
  }

  return { rows, error: "" };
}

/** Ringkasan qty untuk tabel editor. */
export function qtyLabel(line: RecipeLine): string {
  if (line.line_type === "biaya") return "1 pcs";
  const overrides = Object.entries(line.size_qty || {}).filter(([, v]) => Number(v) > 0);
  if (overrides.length === 0) return `${formatQty(line.qty_per_pcs)}${line.unit_use ? ` ${line.unit_use}` : ""} / pcs`;
  return `${formatQty(line.qty_per_pcs)} / pcs + ${overrides.length} ukuran khusus`;
}
