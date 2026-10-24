/**
 * Fase 4 — bantuan penerimaan hasil, QC, dan pemetaan produk.
 * Tidak menulis apa pun; stok barang jadi tetap lewat `samaqu_stock_in_batch`.
 */

import { effectiveQty } from "@/lib/produksi-hpp";
import {
  lineMatchesTarget,
  type ComponentForSchedule,
  type RecipeForSchedule,
  type ScheduleTargetInput,
} from "@/lib/produksi-jadwal";

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const round4 = (value: number) => Math.round((Number(value) || 0) * 10000) / 10000;

export type FinishedProduct = {
  id: string;
  name: string;
  category: string;
  series: string;
  jenis_kain_id: string | null;
  colors: string[];
};

export type FinishedVariant = {
  product_id: string;
  color: string;
  size: string;
  base_product_id: string | null;
  base_size: string | null;
};

export type ReceiptItemInput = {
  target_id: string;
  size: string;
  qty_lolos: number;
  qty_rework: number;
  qty_reject: number;
  rework_to_lolos: number;
  rework_to_reject: number;
};

export type ResolvedStockRow = {
  product_id: string;
  product_name: string;
  variant_color: string;
  variant_size: string;
  qty: number;
};

export type ResolveResult = {
  rows: ResolvedStockRow[];
  errors: string[];
};

/**
 * Cari satu varian produk dari target jadwal.
 * Stok sharing TIDAK di-resolve di sini; `samaqu_stock_in_batch` yang
 * mengarahkan ke produk basis, jadi jalurnya sama persis dengan Barang Masuk.
 */
export function resolveTargetVariant(
  target: ScheduleTargetInput,
  size: string,
  products: FinishedProduct[],
  variants: FinishedVariant[],
): { ok: true; row: ResolvedStockRow } | { ok: false; error: string } {
  const color = norm(target.color);
  const baseCandidates = (products || []).filter((product) => {
    if (norm(product.category) !== norm(target.category)) return false;
    if (target.series && norm(product.series) !== norm(target.series)) return false;
    if (!color) return true;

    if ((product.colors || []).some((value) => norm(value) === color)) return true;
    if (norm(product.name).includes(color)) return true;
    return (variants || []).some(
      (variant) => variant.product_id === product.id && norm(variant.color) === color,
    );
  });

  // Sebagian produk lama (mis. Koko) tidak punya jenis_kain_id. Jika tidak ada
  // produk yang cocok dengan kain target, jangan blokir; pakai kategori/series/warna.
  const fabricCandidates = target.fabric_type_id
    ? baseCandidates.filter((product) => String(product.jenis_kain_id || "") === String(target.fabric_type_id))
    : baseCandidates;
  const candidates = fabricCandidates.length > 0 ? fabricCandidates : baseCandidates;

  if (candidates.length === 0) {
    return {
      ok: false,
      error: `Produk untuk target ${target.category}${target.series ? ` · ${target.series}` : ""}${target.color ? ` · ${target.color}` : ""} tidak ditemukan.`,
    };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      error: `Target ${target.category}${target.series ? ` · ${target.series}` : ""}${target.color ? ` · ${target.color}` : ""} cocok dengan ${candidates.length} produk. Pilih warna/series lebih spesifik.`,
    };
  }

  const product = candidates[0];
  const productVariants = (variants || []).filter(
    (variant) => variant.product_id === product.id && norm(variant.size) === norm(size),
  );
  if (productVariants.length === 0) {
    return { ok: false, error: `Varian ukuran ${size} untuk ${product.name} tidak ditemukan.` };
  }

  let variant: FinishedVariant | undefined;
  if (color) {
    variant = productVariants.find((item) => norm(item.color) === color);
  }
  if (!variant) {
    variant = productVariants.find((item) => norm(item.color) === "default");
  }
  if (!variant) {
    const uniqueColors = new Set(productVariants.map((item) => norm(item.color)));
    if (uniqueColors.size === 1) variant = productVariants[0];
  }
  if (!variant) {
    return {
      ok: false,
      error: `Warna untuk ${product.name} ukuran ${size} belum jelas. Pilih warna target.`,
    };
  }

  return {
    ok: true,
    row: {
      product_id: product.id,
      product_name: product.name,
      variant_color: variant.color || "default",
      variant_size: variant.size,
      qty: 0,
    },
  };
}

export type TargetCostLine = {
  id?: string;
  name: string;
  group_label: string;
  real_price: number;
  filter_size: string;
};

/** Baris biaya resep yang berlaku untuk target (filter ukuran tetap disimpan). */
export function costLinesForTarget(
  target: ScheduleTargetInput,
  recipe: RecipeForSchedule | undefined,
): TargetCostLine[] {
  if (!recipe) return [];
  return recipe.lines
    .filter((line) => {
      if (line.line_type !== "biaya") return false;
      if (line.filter_fabric_type_id && String(line.filter_fabric_type_id) !== String(target.fabric_type_id || "")) return false;
      if (line.filter_series && norm(line.filter_series) !== norm(target.series)) return false;
      if (line.filter_color && norm(line.filter_color) !== norm(target.color)) return false;
      return true;
    })
    .map((line) => ({
      id: line.id,
      name: line.name,
      group_label: line.group_label || "",
      real_price: Number(line.real_price) || 0,
      filter_size: line.filter_size || "",
    }));
}

export type ReceiptCostRow = {
  name: string;
  group_label: string;
  amount: number;
  source: "recipe" | "manual";
};

/** Biaya non-bahan otomatis dari resep untuk jumlah yang diproses pada penerimaan. */
export function suggestReceiptCosts(
  targets: ScheduleTargetInput[],
  items: ReceiptItemInput[],
  recipesByCategory: Map<string, RecipeForSchedule>,
): ReceiptCostRow[] {
  const targetById = new Map(targets.map((target) => [String(target.id || ""), target]));
  const grouped = new Map<string, ReceiptCostRow>();

  for (const item of items) {
    const target = targetById.get(String(item.target_id));
    if (!target) continue;
    const processed = (Number(item.qty_lolos) || 0) + (Number(item.qty_rework) || 0) + (Number(item.qty_reject) || 0);
    if (processed <= 0) continue;

    const recipe = recipesByCategory.get(String(target.category || ""));
    if (!recipe) continue;

    for (const line of recipe.lines) {
      if (line.line_type !== "biaya") continue;
      if (!lineMatchesTarget(line, target, item.size)) continue;
      const amount = (Number(line.real_price) || 0) * processed;
      if (amount <= 0) continue;
      const label = line.group_label || line.name;
      const key = `${line.name}|${label}`;
      const existing = grouped.get(key);
      if (existing) existing.amount = round2(existing.amount + amount);
      else grouped.set(key, { name: line.name, group_label: label, amount: round2(amount), source: "recipe" });
    }
  }

  return Array.from(grouped.values());
}

export function sumCosts(costs: ReceiptCostRow[]): number {
  return round2(costs.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
}

/** Biaya standar (bahan + non-bahan) untuk jumlah yang diproses. */
export function computeStandardCost(
  targets: ScheduleTargetInput[],
  processedByTargetSize: Map<string, number>,
  recipesByCategory: Map<string, RecipeForSchedule>,
  components: Map<string, ComponentForSchedule>,
): { material: number; non_material: number; total: number } {
  let material = 0;
  let nonMaterial = 0;

  for (const target of targets) {
    const recipe = recipesByCategory.get(String(target.category || ""));
    if (!recipe) continue;
    for (const [key, qty] of processedByTargetSize.entries()) {
      const [targetId, size] = key.split("|");
      if (targetId !== String(target.id || "") || qty <= 0) continue;

      for (const line of recipe.lines) {
        if (!lineMatchesTarget(line, target, size)) continue;
        if (line.line_type === "biaya") {
          nonMaterial += (Number(line.real_price) || 0) * qty;
          continue;
        }
        if (!["bahan_produksi", "kain"].includes(String(line.group_code))) continue;
        const component = line.component_id ? components.get(String(line.component_id)) : undefined;
        if (!component) continue;
        const perPcs = effectiveQty(line, size) * (1 + (Number(line.waste_percent) || 0) / 100);
        material += perPcs * qty * (Number(component.real_price) || 0);
      }
    }
  }

  return {
    material: round2(material),
    non_material: round2(nonMaterial),
    total: round2(material + nonMaterial),
  };
}

export function processedKey(targetId: string, size: string): string {
  return `${targetId}|${size}`;
}

export function receiptProcessedQty(item: ReceiptItemInput): number {
  return (Number(item.qty_lolos) || 0) + (Number(item.qty_rework) || 0) + (Number(item.qty_reject) || 0);
}

export function roundQty(value: number): number {
  return round4(value);
}
