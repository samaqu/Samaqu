/**
 * Logika Jadwal Produksi (Fase 3) — dipakai server & klien.
 *
 * Hanya membaca: resep aktif, komponen, dan target. Tidak menulis stok.
 * Kebutuhan bahan = baris bahan produksi (termasuk kain) × qty target × (1+susut).
 */

import { effectiveQty } from "@/lib/produksi-hpp";
import type { RecipeLine } from "@/lib/produksi-resep";

export type ScheduleStatus = "draft" | "disetujui" | "berjalan" | "selesai" | "batal";

export const SCHEDULE_STATUS_OPTIONS: {
  value: ScheduleStatus;
  label: string;
  tone: "slate" | "blue" | "green" | "amber" | "red";
}[] = [
  { value: "draft", label: "Draft", tone: "slate" },
  { value: "disetujui", label: "Disetujui", tone: "blue" },
  { value: "berjalan", label: "Berjalan", tone: "amber" },
  { value: "selesai", label: "Selesai", tone: "green" },
  { value: "batal", label: "Batal", tone: "red" },
];

export function scheduleStatusMeta(status?: string | null) {
  return SCHEDULE_STATUS_OPTIONS.find((item) => item.value === status) || SCHEDULE_STATUS_OPTIONS[0];
}

export type ScheduleTargetInput = {
  id?: string;
  category: string;
  fabric_type_id?: string | null;
  color?: string | null;
  series?: string | null;
  size_qtys: Record<string, number>;
  total_pcs?: number;
};

export type RecipeForSchedule = {
  id: string;
  version: number;
  product_category: string;
  lines: RecipeLine[];
};

export type ComponentForSchedule = {
  id: string;
  code: string;
  name: string;
  unit_use: string;
  real_price: number;
  stock: number;
};

export type RequirementSnapshotRow = {
  target_id?: string | null;
  recipe_id?: string | null;
  recipe_version?: number | null;
  component_id: string;
  component_code: string;
  component_name: string;
  unit_use: string;
  required_qty: number;
};

export type RequirementComputation = {
  rows: RequirementSnapshotRow[];
  material_cost: number;
  non_material_cost: number;
  warnings: string[];
  total_pcs: number;
  recipes: { recipe_id: string; version: number; category: string }[];
};

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const round4 = (value: number) => Math.round((Number(value) || 0) * 10000) / 10000;

export function targetTotalPcs(target: ScheduleTargetInput): number {
  return Object.values(target.size_qtys || {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
}

/** Apakah baris resep berlaku untuk target + ukuran tertentu. */
export function lineMatchesTarget(
  line: RecipeLine,
  target: ScheduleTargetInput,
  size: string,
): boolean {
  if (line.filter_fabric_type_id) {
    if (!target.fabric_type_id) return false;
    if (String(line.filter_fabric_type_id) !== String(target.fabric_type_id)) return false;
  }
  if (line.filter_series && norm(line.filter_series) !== norm(target.series)) return false;
  if (line.filter_color && norm(line.filter_color) !== norm(target.color)) return false;
  if (line.filter_size && norm(line.filter_size) !== norm(size)) return false;
  return true;
}

export function computeScheduleRequirements(
  targets: ScheduleTargetInput[],
  recipesByCategory: Map<string, RecipeForSchedule>,
  components: Map<string, ComponentForSchedule>,
): RequirementComputation {
  const warnings = new Set<string>();
  const rows: RequirementSnapshotRow[] = [];
  const recipes: RequirementComputation["recipes"] = [];
  let totalPcs = 0;
  let materialCost = 0;
  let nonMaterialCost = 0;

  for (const target of targets) {
    const targetId = target.id || null;
    const sizes = Object.entries(target.size_qtys || {})
      .map(([size, qty]) => [size, Number(qty) || 0] as const)
      .filter(([, qty]) => qty > 0);
    const targetQty = sizes.reduce((sum, [, qty]) => sum + qty, 0);
    totalPcs += targetQty;

    const recipe = recipesByCategory.get(String(target.category || ""));
    if (!recipe) {
      warnings.add(`Resep aktif untuk kategori ${target.category} belum ada.`);
      continue;
    }
    if (!recipes.some((item) => item.recipe_id === recipe.id)) {
      recipes.push({ recipe_id: recipe.id, version: recipe.version, category: recipe.product_category });
    }

    const materialLines = recipe.lines.filter(
      (line) =>
        line.line_type === "bahan" &&
        ["bahan_produksi", "kain"].includes(String(line.group_code)),
    );
    if (materialLines.length === 0) {
      warnings.add(`Resep ${recipe.product_category} v${recipe.version} belum punya baris bahan produksi.`);
    }

    const byComponent = new Map<string, RequirementSnapshotRow>();

    for (const [size, qty] of sizes) {
      for (const line of recipe.lines) {
        if (!lineMatchesTarget(line, target, size)) continue;

        if (line.line_type === "biaya") {
          nonMaterialCost += (Number(line.real_price) || 0) * qty;
          continue;
        }
        if (!["bahan_produksi", "kain"].includes(String(line.group_code))) continue;

        const component = line.component_id ? components.get(String(line.component_id)) : undefined;
        if (!component) {
          warnings.add(`Komponen "${line.name}" pada resep ${recipe.product_category} tidak ditemukan.`);
          continue;
        }

        const perPcs = effectiveQty(line, size);
        const required = perPcs * qty * (1 + (Number(line.waste_percent) || 0) / 100);
        if (required <= 0) continue;

        materialCost += required * (Number(component.real_price) || 0);
        if (!(Number(component.real_price) > 0)) {
          warnings.add(`Harga Real ${component.code} · ${component.name} belum diisi.`);
        }

        const key = component.id;
        const existing = byComponent.get(key);
        if (existing) {
          existing.required_qty = round4(existing.required_qty + required);
        } else {
          byComponent.set(key, {
            target_id: targetId,
            recipe_id: recipe.id,
            recipe_version: recipe.version,
            component_id: component.id,
            component_code: component.code,
            component_name: component.name,
            unit_use: component.unit_use,
            required_qty: round4(required),
          });
        }
      }
    }

    rows.push(...Array.from(byComponent.values()));
  }

  return {
    rows,
    material_cost: Math.round(materialCost * 100) / 100,
    non_material_cost: Math.round(nonMaterialCost * 100) / 100,
    warnings: Array.from(warnings),
    total_pcs: totalPcs,
    recipes,
  };
}

export type GroupedRequirement = {
  component_id: string;
  component_code: string;
  component_name: string;
  unit_use: string;
  required_qty: number;
};

/** Jumlahkan kebutuhan per komponen untuk tabel & reservasi. */
export function groupRequirements(rows: RequirementSnapshotRow[]): GroupedRequirement[] {
  const map = new Map<string, GroupedRequirement>();
  for (const row of rows) {
    const existing = map.get(row.component_id);
    if (existing) {
      existing.required_qty = round4(existing.required_qty + (Number(row.required_qty) || 0));
    } else {
      map.set(row.component_id, {
        component_id: row.component_id,
        component_code: row.component_code,
        component_name: row.component_name,
        unit_use: row.unit_use,
        required_qty: round4(Number(row.required_qty) || 0),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    `${a.component_code}|${a.component_name}`.localeCompare(`${b.component_code}|${b.component_name}`, "id"),
  );
}

/** Ringkasan produk untuk daftar jadwal. */
export function targetSummary(targets: ScheduleTargetInput[]): string {
  if (targets.length === 0) return "Belum ada target";
  const first = targets[0];
  const parts = [String(first.category || "")];
  if (first.series) parts.push(String(first.series));
  if (first.color) parts.push(String(first.color));
  const label = parts.filter(Boolean).join(" · ");
  return targets.length > 1 ? `${label} +${targets.length - 1} lainnya` : label;
}

export function formatScheduleDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
