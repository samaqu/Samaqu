/**
 * Mesin kalkulator HPP standar (Fase 2).
 *
 * Satu-satunya sumber perhitungan: baris resep yang cocok dengan filter,
 * lalu dikalikan harga komponen terkini (Harga Real/Harga Aman dari Fase 1)
 * atau nominal biaya manual.
 *
 * Tidak menyentuh stok dan tidak menulis apa pun.
 */

import { formatQty } from "@/lib/produksi";
import type { RecipeLine } from "@/lib/produksi-resep";

export type HppComponentInfo = {
  id: string;
  code: string;
  name: string;
  unit_use: string;
  real_price: number;
  safe_price: number;
};

export type HppSelection = {
  fabric_type_id?: string | null;
  series?: string | null;
  size?: string | null;
  color?: string | null;
};

export type HppLineResult = {
  id?: string;
  line_type: "bahan" | "biaya";
  group_code: string;
  name: string;
  detail: string;
  qty: number;
  unit: string;
  cost_real: number;
  cost_safe: number;
  warning: string;
};

export type HppGroupResult = {
  key: string;
  label: string;
  real: number;
  safe: number;
  lines: HppLineResult[];
};

export type HppWarning = {
  line_id?: string;
  name: string;
  component_id?: string | null;
  code?: string;
  reason: string;
};

export type HppResult = {
  selection: HppSelection;
  groups: HppGroupResult[];
  totals: {
    real: number;
    safe: number;
    real_without_optional: number;
    safe_without_optional: number;
    diff: number;
  };
  warnings: HppWarning[];
  has_warning: boolean;
  skipped_lines: number;
};

/** Urutan kelompok sesuai permintaan pemilik. */
export const HPP_GROUP_ORDER = [
  "bahan_produksi",
  "kain",
  "biaya",
  "packaging_pesanan",
  "tambahan_opsional",
] as const;

const GROUP_LABEL: Record<string, string> = {
  bahan_produksi: "Bahan Produksi",
  kain: "Kain",
  biaya: "Biaya Non-Bahan",
  packaging_pesanan: "Packaging Pesanan",
  tambahan_opsional: "Tambahan Opsional",
};

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/** Apakah baris berlaku untuk pilihan kalkulator. Filter kosong = semua. */
export function lineApplies(line: RecipeLine, selection: HppSelection): boolean {
  if (line.filter_fabric_type_id) {
    if (!selection.fabric_type_id) return false;
    if (String(line.filter_fabric_type_id) !== String(selection.fabric_type_id)) return false;
  }
  if (line.filter_series) {
    if (norm(line.filter_series) !== norm(selection.series)) return false;
  }
  if (line.filter_size) {
    if (norm(line.filter_size) !== norm(selection.size)) return false;
  }
  if (line.filter_color) {
    if (norm(line.filter_color) !== norm(selection.color)) return false;
  }
  return true;
}

/** Qty bahan per pcs: override per ukuran (kalau ada) menang atas qty default. */
export function effectiveQty(line: RecipeLine, size?: string | null): number {
  const fallback = Number(line.qty_per_pcs) || 0;
  const key = String(size || "").trim();
  if (!key) return fallback;
  const map = (line.size_qty || {}) as Record<string, unknown>;
  const direct = map[key];
  if (direct !== undefined && direct !== null && direct !== "") {
    const n = Number(direct);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const matchKey = Object.keys(map).find((k) => norm(k) === norm(key));
  if (matchKey) {
    const n = Number(map[matchKey]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

export function computeHpp(
  lines: RecipeLine[],
  components: Map<string, HppComponentInfo>,
  selection: HppSelection,
): HppResult {
  const groups = new Map<string, HppGroupResult>();
  const warnings: HppWarning[] = [];
  let skipped = 0;
  let totalReal = 0;
  let totalSafe = 0;
  let totalRealWithout = 0;
  let totalSafeWithout = 0;

  for (const line of lines) {
    if (!lineApplies(line, selection)) continue;

    let qty = 0;
    let unit = "";
    let costReal = 0;
    let costSafe = 0;
    let detail = "";
    let warning = "";

    if (line.line_type === "biaya") {
      qty = 1;
      costReal = Number(line.real_price) || 0;
      costSafe = Number(line.safe_price) || 0;
      detail = line.group_label ? `Biaya · ${line.group_label}` : "Biaya non-bahan";
    } else {
      qty = effectiveQty(line, selection.size);
      const waste = Number(line.waste_percent) || 0;
      const effective = qty * (1 + waste / 100);
      if (qty <= 0) {
        skipped += 1;
        continue;
      }
      const component = line.component_id ? components.get(String(line.component_id)) : undefined;
      unit = component?.unit_use || "";
      if (!component) {
        warning = "Komponen tidak ditemukan di master";
      } else {
        costReal = effective * (Number(component.real_price) || 0);
        costSafe = effective * (Number(component.safe_price) || 0);
        const missing: string[] = [];
        if (!(Number(component.real_price) > 0)) missing.push("Harga Real");
        if (!(Number(component.safe_price) > 0)) missing.push("Harga Aman");
        if (missing.length > 0) {
          warning = `${missing.join(" & ")} belum diisi`;
        }
      }
      qty = effective;
      detail = [
        `${formatQty(qty)}${unit ? ` ${unit}` : ""} / pcs`,
        waste > 0 ? `susut ${formatQty(waste)}%` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }

    if (warning) {
      warnings.push({
        line_id: line.id,
        name: line.name,
        component_id: line.component_id || null,
        code: line.component_code || "",
        reason: warning,
      });
    }

    const groupKey = line.line_type === "biaya" ? "biaya" : line.group_code;
    const group = groups.get(groupKey) || {
      key: groupKey,
      label: GROUP_LABEL[groupKey] || groupKey,
      real: 0,
      safe: 0,
      lines: [],
    };

    const resultLine: HppLineResult = {
      id: line.id,
      line_type: line.line_type,
      group_code: groupKey,
      name: line.name,
      detail,
      qty: round2(qty),
      unit,
      cost_real: round2(costReal),
      cost_safe: round2(costSafe),
      warning,
    };
    group.lines.push(resultLine);
    group.real += costReal;
    group.safe += costSafe;
    groups.set(groupKey, group);

    totalReal += costReal;
    totalSafe += costSafe;
    if (groupKey !== "tambahan_opsional") {
      totalRealWithout += costReal;
      totalSafeWithout += costSafe;
    }
  }

  const ordered = HPP_GROUP_ORDER.map((key) => groups.get(key))
    .filter(Boolean)
    .map((group) => ({
      ...(group as HppGroupResult),
      real: round2((group as HppGroupResult).real),
      safe: round2((group as HppGroupResult).safe),
    }));

  return {
    selection,
    groups: ordered,
    totals: {
      real: round2(totalReal),
      safe: round2(totalSafe),
      real_without_optional: round2(totalRealWithout),
      safe_without_optional: round2(totalSafeWithout),
      diff: round2(totalSafe - totalReal),
    },
    warnings,
    has_warning: warnings.length > 0,
    skipped_lines: skipped,
  };
}
