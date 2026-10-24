import type { SupabaseClient } from "@supabase/supabase-js";
import { computeHpp, effectiveQty, type HppComponentInfo } from "@/lib/produksi-hpp";
import { lineMatchesTarget } from "@/lib/produksi-jadwal";
import { loadRecipeMap, loadReservedMap } from "@/lib/produksi-jadwal-server";
import { SALE_STATUSES, orderSourceKey, orderSourceLabel } from "@/lib/transaksi";
import { todayInput } from "@/lib/produksi";
import { CATEGORY_ORDER } from "@/lib/ops-order";

/**
 * Laporan Produksi Fase 6 — BACA SAJA.
 * Semua fungsi di sini hanya membaca tabel/ view yang sudah ada. Tidak ada
 * insert/update/delete dan tidak menyentuh stok/HPP.
 */

const PAGE = 1000;
const CHUNK = 150;
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const round4 = (value: number) => Math.round((Number(value) || 0) * 10000) / 10000;
const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

async function allRows(build: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as any[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
    if (from > 50000) break;
  }
  return out;
}

async function allRowsIn(
  admin: SupabaseClient,
  table: string,
  select: string,
  column: string,
  ids: string[],
  orderBy = "id",
): Promise<any[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const out: any[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const rows = await allRows((from, to) =>
      admin.from(table).select(select).in(column, slice).order(orderBy).range(from, to),
    );
    out.push(...rows);
  }
  return out;
}

export function resolveReportRange(start?: string | null, end?: string | null) {
  const valid = (value?: string | null) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  const today = todayInput();
  let s = valid(start) ? String(start) : `${today.slice(0, 7)}-01`;
  let e = valid(end) ? String(end) : today;
  if (s > e) [s, e] = [e, s];
  return { start: s, end: e };
}

function rangeBounds(start: string, end: string) {
  return { from: `${start}T00:00:00+07:00`, to: `${end}T23:59:59.999+07:00` };
}

const WIB_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function wibDay(value: unknown): string {
  const d = new Date(String(value || ""));
  return Number.isNaN(d.getTime()) ? String(value || "").slice(0, 10) : WIB_DATE.format(d);
}

function dayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00+07:00`);
  return Number.isNaN(d.getTime())
    ? key
    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function weekStart(key: string): string {
  const d = new Date(`${key}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return key;
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function spanDays(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00+07:00`).getTime();
  const b = new Date(`${end}T00:00:00+07:00`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function orderRevenueGoods(order: any): number {
  const subtotal = num(order.subtotal);
  const discount = num(order.discount);
  // `subtotal` = nilai barang sebelum diskon. Kalau kolom lama kosong, pakai
  // total − ongkir (nilai itu sudah memperhitungkan diskon, jadi jangan dikurangi lagi).
  if (subtotal > 0) return Math.max(0, round2(subtotal - discount));
  return Math.max(0, round2(num(order.total) - num(order.shipping_cost)));
}

function componentStatus(stock: number, minStock: number): "habis" | "menipis" | "aman" {
  if (stock <= 0) return "habis";
  if (stock <= minStock) return "menipis";
  return "aman";
}

async function loadComponentRows(admin: SupabaseClient): Promise<any[]> {
  return allRows((from, to) =>
    admin
      .from("production_components_stock")
      .select("id, code, name, category, unit_use, min_stock, real_price, safe_price, stock, is_active")
      .eq("is_active", true)
      .order("id")
      .range(from, to),
  );
}

async function loadFinishedHpp(admin: SupabaseClient, productIds?: string[]): Promise<any[]> {
  if (productIds && productIds.length === 0) return [];
  if (productIds) {
    return allRowsIn(
      admin,
      "production_finished_hpp",
      "id, product_id, color, size, qty_received, hpp_avg",
      "product_id",
      productIds,
    );
  }
  return allRows((from, to) =>
    admin
      .from("production_finished_hpp")
      .select("id, product_id, color, size, qty_received, hpp_avg")
      .order("id")
      .range(from, to),
  );
}

function finishedHppKey(productId: unknown, color: unknown, size: unknown): string {
  return `${String(productId || "")}|${norm(color)}|${norm(size)}`;
}

export async function getReportOptions(admin: SupabaseClient) {
  const [fabrics, seriesRows] = await Promise.all([
    allRows((from, to) =>
      admin.from("jenis_kain").select("id, name").order("name").range(from, to),
    ),
    allRows((from, to) =>
      admin.from("product_series").select("name").order("name").range(from, to),
    ).catch(() => [] as any[]),
  ]);

  const series = seriesRows.map((row: any) => String(row.name || "")).filter(Boolean);
  return {
    categories: CATEGORY_ORDER,
    fabrics: (fabrics || []).map((row: any) => ({ id: String(row.id), name: String(row.name || "") })),
    series,
    sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "ALL SIZE"],
  };
}

export async function getSummaryReport(admin: SupabaseClient, start: string, end: string) {
  const { from, to } = rangeBounds(start, end);

  const [components, variants, finishedHpp, running, receipts, orders] = await Promise.all([
    loadComponentRows(admin),
    allRows((pageFrom, pageTo) =>
      admin
        .from("product_variants")
        .select("id, product_id, color, size, stock")
        .gt("stock", 0)
        .order("id")
        .range(pageFrom, pageTo),
    ),
    loadFinishedHpp(admin),
    admin
      .from("production_schedules")
      .select("id", { count: "exact", head: true })
      .eq("status", "berjalan"),
    allRows((pageFrom, pageTo) =>
      admin
        .from("production_receipts")
        .select("id, received_date, total_lolos, total_rework, total_reject, rework_to_lolos, rework_to_reject")
        .gte("received_date", start)
        .lte("received_date", end)
        .order("id")
        .range(pageFrom, pageTo),
    ),
    allRows((pageFrom, pageTo) =>
      admin
        .from("orders")
        .select("id, order_number, status, subtotal, discount, total, shipping_cost, created_at, source")
        .in("status", SALE_STATUSES)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at")
        .order("id")
        .range(pageFrom, pageTo),
    ),
  ]);

  const hppMap = new Map<string, number>();
  for (const row of finishedHpp || []) {
    hppMap.set(finishedHppKey(row.product_id, row.color, row.size), num(row.hpp_avg));
  }

  let componentValue = 0;
  let lowComponents = 0;
  for (const row of components) {
    const stock = num(row.stock);
    const minStock = num(row.min_stock);
    if (stock > 0) componentValue += stock * num(row.real_price);
    if (stock <= minStock) lowComponents += 1;
  }

  let finishedValue = 0;
  let finishedMissing = 0;
  for (const row of variants) {
    const stock = num(row.stock);
    const hpp = hppMap.get(finishedHppKey(row.product_id, row.color, row.size));
    if (hpp && hpp > 0) finishedValue += stock * hpp;
    else finishedMissing += 1;
  }

  const orderIds = orders.map((row: any) => String(row.id));
  const orderHpp = orderIds.length
    ? await allRowsIn(
        admin,
        "production_order_hpp",
        "order_id, hpp_goods, packaging_cost, total_hpp",
        "order_id",
        orderIds,
        "order_id",
      )
    : [];
  const hppByOrder = new Map<string, any>((orderHpp || []).map((row: any) => [String(row.order_id), row]));

  let revenue = 0;
  let hppGoods = 0;
  let packaging = 0;
  let grossProfit = 0;
  let missingSnapshot = 0;
  const trend = new Map<string, { date: string; label: string; revenue: number; profit: number }>();
  const weekly = spanDays(start, end) > 45;

  for (const order of orders) {
    const header = hppByOrder.get(String(order.id));
    if (!header) {
      missingSnapshot += 1;
      continue;
    }
    const orderRevenue = orderRevenueGoods(order);
    const orderHpp = num(header.total_hpp);
    const profit = orderRevenue - orderHpp;
    revenue += orderRevenue;
    hppGoods += num(header.hpp_goods);
    packaging += num(header.packaging_cost);
    grossProfit += profit;

    const day = wibDay(order.created_at);
    const key = weekly ? weekStart(day) : day;
    const point = trend.get(key) || {
      date: key,
      label: weekly ? `Mg ${dayLabel(key)}` : dayLabel(key),
      revenue: 0,
      profit: 0,
    };
    point.revenue += orderRevenue;
    point.profit += profit;
    trend.set(key, point);
  }

  let totalLolos = 0;
  let totalRework = 0;
  let totalReject = 0;
  for (const row of receipts) {
    totalLolos += num(row.total_lolos) + num(row.rework_to_lolos);
    totalReject += num(row.total_reject) + num(row.rework_to_reject);
    totalRework += Math.max(
      0,
      num(row.total_rework) - num(row.rework_to_lolos) - num(row.rework_to_reject),
    );
  }
  const produced = totalLolos + totalRework + totalReject;
  const rejectPct = produced > 0 ? (totalReject / produced) * 100 : 0;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  return {
    period: { start, end },
    kpi: {
      component_value: round2(componentValue),
      finished_value: round2(finishedValue),
      finished_missing_count: finishedMissing,
      running_schedules: running.count || 0,
      low_components: lowComponents,
      revenue: round2(revenue),
      hpp_total: round2(hppGoods + packaging),
      gross_profit: round2(grossProfit),
      margin: round2(margin),
      reject_pct: round2(rejectPct),
      orders_count: orders.length,
      snapshot_orders: orders.length - missingSnapshot,
      missing_snapshot_orders: missingSnapshot,
    },
    trend: Array.from(trend.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function simulateRequirement(admin: SupabaseClient, input: any, showPrices: boolean) {
  const category = String(input?.category || "").trim();
  const fabricTypeId = String(input?.fabric_type_id || "").trim();
  const color = String(input?.color || "").trim();
  const series = String(input?.series || "").trim();
  const sizeQtys = input?.size_qtys && typeof input.size_qtys === "object" ? input.size_qtys : {};
  const totalPcs = Object.values(sizeQtys).reduce((sum: number, qty: any) => sum + Math.max(0, num(qty)), 0);
  const warnings: string[] = [];

  if (!category) {
    return { target: input || {}, total_pcs: 0, rows: [], totals: { shortage_count: 0 }, warnings: ["Kategori wajib dipilih."], show_prices: showPrices };
  }

  const [recipeMap, components, reserved] = await Promise.all([
    loadRecipeMap(admin, [category]),
    loadComponentRows(admin),
    loadReservedMap(admin),
  ]);
  const recipe = recipeMap.get(category);
  if (!recipe) {
    warnings.push(`Resep aktif untuk kategori ${category} belum ada.`);
  }

  const componentById = new Map<string, any>((components || []).map((row: any) => [String(row.id), row]));
  const rows = new Map<string, any>();
  const target = { category, fabric_type_id: fabricTypeId || null, color, series, size_qtys: sizeQtys };

  for (const [size, rawQty] of Object.entries(sizeQtys)) {
    const qty = Math.max(0, num(rawQty));
    if (qty <= 0 || !recipe) continue;
    for (const line of recipe.lines) {
      if (line.line_type !== "bahan" || line.group_code !== "bahan_produksi") continue;
      if (!lineMatchesTarget(line, target as any, size)) continue;
      const component = line.component_id ? componentById.get(String(line.component_id)) : null;
      if (!component) {
        warnings.push(`Komponen "${line.name}" tidak ditemukan.`);
        continue;
      }
      const perPcs = effectiveQty(line, size) * (1 + num(line.waste_percent) / 100);
      const required = round4(perPcs * qty);
      if (required <= 0) continue;
      const existing = rows.get(String(component.id));
      if (existing) existing.required = round4(existing.required + required);
      else {
        rows.set(String(component.id), {
          component_id: String(component.id),
          component_code: String(component.code || ""),
          component_name: String(component.name || ""),
          unit_use: String(component.unit_use || ""),
          required,
        });
      }
    }
  }

  const resultRows = Array.from(rows.values()).map((row) => {
    const component = componentById.get(row.component_id);
    const stock = num(component?.stock);
    const reservedQty = num(reserved.get(row.component_id));
    const available = round4(stock - reservedQty);
    const shortage = round4(Math.max(0, row.required - available));
    const unitPrice = num(component?.real_price) || num(component?.safe_price);
    return {
      ...row,
      stock: round4(stock),
      reserved: round4(reservedQty),
      available,
      shortage,
      status: shortage > 0 ? "kurang" : "cukup",
      ...(showPrices ? { unit_price: unitPrice, estimated_cost: round2(row.required * unitPrice) } : {}),
    };
  }).sort((a, b) => b.shortage - a.shortage || a.component_name.localeCompare(b.component_name, "id"));

  const estimatedCost = resultRows.reduce((sum, row) => sum + num((row as any).estimated_cost), 0);
  if (showPrices) {
    for (const row of resultRows) {
      if (num((row as any).unit_price) <= 0) warnings.push(`Harga Real/Aman ${row.component_code} · ${row.component_name} belum diisi.`);
    }
  }

  return {
    target: { ...target, total_pcs: totalPcs },
    total_pcs: totalPcs,
    rows: resultRows,
    totals: {
      shortage_count: resultRows.filter((row) => row.shortage > 0).length,
      ...(showPrices ? { estimated_cost: round2(estimatedCost) } : {}),
    },
    warnings: Array.from(new Set(warnings)),
    show_prices: showPrices,
  };
}

export async function getInventoryReport(
  admin: SupabaseClient,
  options: { lowOnly?: boolean; showPrices?: boolean } = {},
) {
  const showPrices = options.showPrices !== false;
  const lowOnly = options.lowOnly === true || !showPrices;
  const [components, reserved] = await Promise.all([loadComponentRows(admin), loadReservedMap(admin)]);

  const componentRows = components.map((row) => {
    const stock = num(row.stock);
    const minStock = num(row.min_stock);
    const reservedQty = num(reserved.get(String(row.id)));
    const available = round4(stock - reservedQty);
    const status = componentStatus(stock, minStock);
    return {
      id: String(row.id),
      code: String(row.code || ""),
      name: String(row.name || ""),
      category: String(row.category || ""),
      unit_use: String(row.unit_use || ""),
      stock: round4(stock),
      reserved: round4(reservedQty),
      available,
      min_stock: round4(minStock),
      status,
      ...(showPrices
        ? {
            real_price: num(row.real_price),
            safe_price: num(row.safe_price),
            value: round2(Math.max(0, stock) * num(row.real_price)),
          }
        : {}),
    };
  });
  const filteredComponents = lowOnly
    ? componentRows.filter((row) => row.status !== "aman")
    : componentRows;

  const componentValue = componentRows.reduce((sum, row) => sum + num((row as any).value), 0);
  const lowCount = componentRows.filter((row) => row.status !== "aman").length;

  let finished: any[] = [];
  let finishedValue = 0;
  let finishedMissing = 0;
  if (showPrices) {
    const [variants, hppRows] = await Promise.all([
      allRows((from, to) =>
        admin
          .from("product_variants")
          .select("id, product_id, color, size, stock")
          .gt("stock", 0)
          .order("id")
          .range(from, to),
      ),
      loadFinishedHpp(admin),
    ]);
    const productIds = Array.from(new Set(variants.map((row: any) => String(row.product_id || ""))));
    const products = await allRowsIn(admin, "products", "id, name, series, category", "id", productIds);
    const productById = new Map<string, any>((products || []).map((row: any) => [String(row.id), row]));
    const hppMap = new Map<string, number>();
    for (const row of hppRows) hppMap.set(finishedHppKey(row.product_id, row.color, row.size), num(row.hpp_avg));

    finished = variants.map((row: any) => {
      const product = productById.get(String(row.product_id));
      const stock = num(row.stock);
      const hpp = hppMap.get(finishedHppKey(row.product_id, row.color, row.size));
      const missing = !(Number(hpp) > 0);
      if (missing) finishedMissing += 1;
      else finishedValue += stock * Number(hpp);
      return {
        product_id: String(row.product_id || ""),
        product_name: String(product?.name || row.product_id || ""),
        series: String(product?.series || "-"),
        category: String(product?.category || "-"),
        color: String(row.color || "default"),
        size: String(row.size || ""),
        stock: round4(stock),
        hpp_avg: missing ? null : Number(hpp),
        value: missing ? 0 : round2(stock * Number(hpp)),
        missing_hpp: missing,
      };
    }).sort((a, b) => b.value - a.value || a.product_name.localeCompare(b.product_name, "id"));
  }

  return {
    show_prices: showPrices,
    low_only: lowOnly,
    components: filteredComponents,
    finished,
    totals: {
      component_count: componentRows.length,
      low_count: lowCount,
      ...(showPrices
        ? {
            component_value: round2(componentValue),
            finished_value: round2(finishedValue),
            finished_missing_count: finishedMissing,
          }
        : {}),
    },
  };
}

function toHppComponentMap(components: any[]): Map<string, HppComponentInfo> {
  const map = new Map<string, HppComponentInfo>();
  for (const row of components) {
    map.set(String(row.id), {
      id: String(row.id),
      code: String(row.code || ""),
      name: String(row.name || ""),
      unit_use: String(row.unit_use || ""),
      real_price: num(row.real_price),
      safe_price: num(row.safe_price),
    });
  }
  return map;
}

export async function getHppReport(
  admin: SupabaseClient,
  start: string,
  end: string,
  scheduleId?: string | null,
) {
  const { from, to } = rangeBounds(start, end);
  const [finishedHpp, components, scheduleRows] = await Promise.all([
    loadFinishedHpp(admin),
    loadComponentRows(admin),
    allRows((pageFrom, pageTo) =>
      admin
        .from("production_schedules")
        .select("id, schedule_number, status, start_date, completed_at")
        .order("start_date", { ascending: false })
        .order("id")
        .range(pageFrom, pageTo),
    ),
  ]);

  const productIds = Array.from(new Set(finishedHpp.map((row: any) => String(row.product_id || ""))));
  const products = await allRowsIn(admin, "products", "id, name, category, series, jenis_kain_id", "id", productIds);
  const productById = new Map<string, any>((products || []).map((row: any) => [String(row.id), row]));
  const categories = Array.from(
    new Set((products || []).map((row: any) => String(row.category || "")).filter(Boolean)),
  );
  const recipeMap = await loadRecipeMap(admin, categories);
  const componentMap = toHppComponentMap(components);

  const variants = finishedHpp.map((row: any) => {
    const product = productById.get(String(row.product_id));
    const recipe = product ? recipeMap.get(String(product.category || "")) : undefined;
    const hpp = recipe
      ? computeHpp(recipe.lines, componentMap, {
          fabric_type_id: product?.jenis_kain_id || null,
          series: product?.series || null,
          size: row.size,
          color: row.color,
        })
      : null;
    const actual = num(row.hpp_avg);
    const standard = hpp ? round2(hpp.totals.safe) : null;
    const diff = standard != null ? round2(actual - standard) : null;
    const pct = standard && standard > 0 ? round2(((actual - standard) / standard) * 100) : null;
    return {
      product_id: String(row.product_id || ""),
      product_name: String(product?.name || row.product_id || ""),
      category: String(product?.category || "-"),
      series: String(product?.series || "-"),
      color: String(row.color || "default"),
      size: String(row.size || ""),
      qty_received: round4(num(row.qty_received)),
      actual,
      standard,
      diff,
      pct,
      warning: hpp?.warnings?.[0]?.message || (recipe ? null : "Resep aktif belum ada"),
    };
  }).sort((a, b) => a.product_name.localeCompare(b.product_name, "id") || a.size.localeCompare(b.size));

  const contributions = await allRows((pageFrom, pageTo) => {
    let query = admin
      .from("production_schedule_hpp_contributions")
      .select("id, product_id, color, size, qty, hpp_value, created_at, schedule_id");
    if (scheduleId) query = query.eq("schedule_id", scheduleId);
    else query = query.gte("created_at", from).lte("created_at", to);
    return query.order("created_at", { ascending: false }).order("id").range(pageFrom, pageTo);
  });
  const history = contributions.map((row: any) => ({
    date: wibDay(row.created_at),
    product_id: String(row.product_id || ""),
    product_name: String(productById.get(String(row.product_id))?.name || row.product_id || ""),
    series: String(productById.get(String(row.product_id))?.series || "-"),
    color: String(row.color || "default"),
    size: String(row.size || ""),
    qty: round4(num(row.qty)),
    hpp_value: round2(num(row.hpp_value)),
    schedule_id: row.schedule_id,
  }));

  const selectedSchedules = scheduleRows.filter((row: any) => {
    if (scheduleId) return String(row.id) === scheduleId;
    if (row.status !== "selesai") return false;
    const day = wibDay(row.completed_at || row.start_date);
    return day >= start && day <= end;
  });
  const scheduleIds = selectedSchedules.map((row: any) => String(row.id));
  const [requirements, movements] = await Promise.all([
    scheduleIds.length
      ? allRowsIn(
          admin,
          "production_schedule_requirements",
          "schedule_id, component_id, component_code, component_name, unit_use, required_qty",
          "schedule_id",
          scheduleIds,
        )
      : [],
    scheduleIds.length
      ? allRowsIn(
          admin,
          "production_stock_movements",
          "id, component_id, type, qty, ref_id, ref_type",
          "ref_id",
          scheduleIds,
        )
      : [],
  ]);
  const movementRows = movements.filter(
    (row: any) =>
      String(row.ref_type) === "production_schedule" &&
      ["keluar_produksi", "retur_sisa_bahan"].includes(String(row.type)),
  );
  const usageMap = new Map<string, any>();
  for (const row of requirements) {
    const key = String(row.component_id);
    const current = usageMap.get(key) || {
      component_id: key,
      component_code: String(row.component_code || ""),
      component_name: String(row.component_name || ""),
      unit_use: String(row.unit_use || ""),
      standard: 0,
      actual: 0,
    };
    current.standard = round4(current.standard + num(row.required_qty));
    usageMap.set(key, current);
  }
  for (const row of movementRows) {
    const key = String(row.component_id);
    const current = usageMap.get(key) || {
      component_id: key,
      component_code: "",
      component_name: "",
      unit_use: "",
      standard: 0,
      actual: 0,
    };
    current.actual = round4(
      current.actual + (String(row.type) === "keluar_produksi" ? -num(row.qty) : -num(row.qty)),
    );
    usageMap.set(key, current);
  }
  const componentById = new Map<string, any>((components || []).map((row: any) => [String(row.id), row]));
  const materialUsage = Array.from(usageMap.values()).map((row) => {
    const component = componentById.get(row.component_id);
    const diff = round4(row.actual - row.standard);
    return {
      ...row,
      component_code: row.component_code || String(component?.code || ""),
      component_name: row.component_name || String(component?.name || ""),
      unit_use: row.unit_use || String(component?.unit_use || ""),
      diff,
      pct: row.standard > 0 ? round2((diff / row.standard) * 100) : null,
      status: diff > 0.0001 ? "boros" : diff < -0.0001 ? "hemat" : "pas",
    };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const receipts = await allRows((pageFrom, pageTo) => {
    let query = admin
      .from("production_receipts")
      .select("id, schedule_id, received_date, total_lolos, total_rework, total_reject, rework_to_lolos, rework_to_reject");
    if (scheduleId) query = query.eq("schedule_id", scheduleId);
    else query = query.gte("received_date", start).lte("received_date", end);
    return query.order("received_date", { ascending: false }).order("id").range(pageFrom, pageTo);
  });
  const receiptIds = receipts.map((row: any) => String(row.id));
  const receiptItems = receiptIds.length
    ? await allRowsIn(
        admin,
        "production_receipt_items",
        "id, receipt_id, qty_reject, rework_to_reject, reject_reason",
        "receipt_id",
        receiptIds,
      )
    : [];
  const scheduleNumber = new Map<string, string>((scheduleRows || []).map((row: any) => [String(row.id), String(row.schedule_number || "")]));
  const perSchedule = new Map<string, any>();
  for (const row of receipts) {
    const key = String(row.schedule_id);
    const current = perSchedule.get(key) || {
      schedule_id: key,
      schedule_number: scheduleNumber.get(key) || "-",
      date: String(row.received_date || ""),
      lolos: 0,
      rework: 0,
      reject: 0,
      produced: 0,
    };
    current.lolos += num(row.total_lolos) + num(row.rework_to_lolos);
    current.reject += num(row.total_reject) + num(row.rework_to_reject);
    current.rework += Math.max(0, num(row.total_rework) - num(row.rework_to_lolos) - num(row.rework_to_reject));
    current.produced = current.lolos + current.rework + current.reject;
    perSchedule.set(key, current);
  }
  const yieldRows = Array.from(perSchedule.values()).map((row) => ({
    ...row,
    lolos: Math.round(row.lolos),
    rework: Math.round(row.rework),
    reject: Math.round(row.reject),
    produced: Math.round(row.produced),
    yield_pct: row.produced > 0 ? round2((row.lolos / row.produced) * 100) : 0,
    rework_pct: row.produced > 0 ? round2((row.rework / row.produced) * 100) : 0,
    reject_pct: row.produced > 0 ? round2((row.reject / row.produced) * 100) : 0,
  })).sort((a, b) => b.date.localeCompare(a.date));
  const totals = yieldRows.reduce(
    (sum, row) => ({
      lolos: sum.lolos + row.lolos,
      rework: sum.rework + row.rework,
      reject: sum.reject + row.reject,
      produced: sum.produced + row.produced,
    }),
    { lolos: 0, rework: 0, reject: 0, produced: 0 },
  );
  const rejectReasons = new Map<string, number>();
  for (const row of receiptItems) {
    const count = num(row.qty_reject) + num(row.rework_to_reject);
    if (count <= 0) continue;
    const reason = String(row.reject_reason || "Tanpa alasan");
    rejectReasons.set(reason, (rejectReasons.get(reason) || 0) + count);
  }

  return {
    period: { start, end },
    variants,
    history,
    material_usage: materialUsage,
    yield: {
      totals: {
        ...totals,
        yield_pct: totals.produced > 0 ? round2((totals.lolos / totals.produced) * 100) : 0,
        rework_pct: totals.produced > 0 ? round2((totals.rework / totals.produced) * 100) : 0,
        reject_pct: totals.produced > 0 ? round2((totals.reject / totals.produced) * 100) : 0,
      },
      per_schedule: yieldRows,
      reject_reasons: Array.from(rejectReasons.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    },
    schedules: scheduleRows
      .filter((row: any) => ["selesai", "berjalan"].includes(String(row.status)))
      .map((row: any) => ({
        id: String(row.id),
        schedule_number: String(row.schedule_number || ""),
        date: String(row.completed_at || row.start_date || "").slice(0, 10),
        status: String(row.status || ""),
      })),
  };
}

export async function getOrderProfitReport(admin: SupabaseClient, start: string, end: string) {
  const { from, to } = rangeBounds(start, end);
  const orders = await allRows((pageFrom, pageTo) =>
    admin
      .from("orders")
      .select("id, order_number, status, subtotal, discount, total, shipping_cost, created_at, source")
      .in("status", SALE_STATUSES)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at")
      .order("id")
      .range(pageFrom, pageTo),
  );
  const orderIds = orders.map((row: any) => String(row.id));
  const [headers, items] = await Promise.all([
    orderIds.length
      ? allRowsIn(
          admin,
          "production_order_hpp",
          "order_id, hpp_goods, packaging_cost, total_hpp",
          "order_id",
          orderIds,
          "order_id",
        )
      : [],
    orderIds.length
      ? allRowsIn(
          admin,
          "order_items",
          "id, order_id, product_id, product_name, series, color, size, quantity, price",
          "order_id",
          orderIds,
        )
      : [],
  ]);
  const hppItems = orderIds.length
    ? await allRowsIn(
        admin,
        "production_order_hpp_items",
        "id, order_item_id, order_id, product_id, product_name, color, size, quantity, hpp_unit, hpp_total, source",
        "order_id",
        orderIds,
      )
    : [];
  const productIds = Array.from(new Set(items.map((row: any) => String(row.product_id || ""))));
  const products = await allRowsIn(admin, "products", "id, name, series, category", "id", productIds);
  const productById = new Map<string, any>((products || []).map((row: any) => [String(row.id), row]));
  const headerByOrder = new Map<string, any>((headers || []).map((row: any) => [String(row.order_id), row]));
  const hppItemByLine = new Map<string, any>((hppItems || []).map((row: any) => [String(row.order_item_id), row]));
  const itemsByOrder = new Map<string, any[]>();
  for (const row of items) {
    const list = itemsByOrder.get(String(row.order_id)) || [];
    list.push(row);
    itemsByOrder.set(String(row.order_id), list);
  }

  let revenue = 0;
  let hppGoods = 0;
  let packaging = 0;
  let totalHpp = 0;
  let grossProfit = 0;
  let snapshotOrders = 0;
  const missingOrders: any[] = [];
  const byProduct = new Map<string, any>();
  const bySeries = new Map<string, any>();
  const byPlatform = new Map<string, any>();

  for (const order of orders) {
    const header = headerByOrder.get(String(order.id));
    if (!header) {
      missingOrders.push({
        order_number: String(order.order_number || ""),
        created_at: String(order.created_at || ""),
        status: String(order.status || ""),
        total: num(order.total),
      });
      continue;
    }
    snapshotOrders += 1;
    const orderRev = orderRevenueGoods(order);
    const orderHpp = num(header.total_hpp);
    revenue += orderRev;
    hppGoods += num(header.hpp_goods);
    packaging += num(header.packaging_cost);
    totalHpp += orderHpp;
    grossProfit += orderRev - orderHpp;

    const platformKey = orderSourceKey(order);
    const platformLabel = orderSourceLabel(order);
    const platform = byPlatform.get(platformKey) || {
      key: platformKey,
      label: platformLabel,
      orders: 0,
      revenue: 0,
      hpp: 0,
      profit: 0,
    };
    platform.orders += 1;
    platform.revenue += orderRev;
    platform.hpp += orderHpp;
    platform.profit += orderRev - orderHpp;
    byPlatform.set(platformKey, platform);

    const orderItems = itemsByOrder.get(String(order.id)) || [];
    const lineTotal = orderItems.reduce((sum: number, row: any) => sum + num(row.price) * num(row.quantity), 0);
    const discount = num(order.discount);
    for (const row of orderItems) {
      const rowTotal = num(row.price) * num(row.quantity);
      const allocatedDiscount = lineTotal > 0 ? (discount * rowTotal) / lineTotal : 0;
      const rowRevenue = Math.max(0, round2(rowTotal - allocatedDiscount));
      const snapshot = hppItemByLine.get(String(row.id));
      const rowHpp = num(snapshot?.hpp_total);
      const product = productById.get(String(row.product_id));
      const productKey = String(row.product_id || row.product_name || "unknown");
      const series = String(row.series || product?.series || "-");
      const productEntry = byProduct.get(productKey) || {
        key: productKey,
        name: String(row.product_name || product?.name || productKey),
        series,
        qty: 0,
        revenue: 0,
        hpp: 0,
        profit: 0,
      };
      productEntry.qty += num(row.quantity);
      productEntry.revenue += rowRevenue;
      productEntry.hpp += rowHpp;
      productEntry.profit += rowRevenue - rowHpp;
      byProduct.set(productKey, productEntry);

      const seriesEntry = bySeries.get(series) || { key: series, label: series, qty: 0, revenue: 0, hpp: 0, profit: 0 };
      seriesEntry.qty += num(row.quantity);
      seriesEntry.revenue += rowRevenue;
      seriesEntry.hpp += rowHpp;
      seriesEntry.profit += rowRevenue - rowHpp;
      bySeries.set(series, seriesEntry);
    }
  }

  const finalize = (row: any) => ({
    ...row,
    revenue: round2(row.revenue),
    hpp: round2(row.hpp),
    profit: round2(row.profit),
    margin: row.revenue > 0 ? round2((row.profit / row.revenue) * 100) : 0,
  });
  const productRows = Array.from(byProduct.values()).map(finalize).sort((a, b) => b.revenue - a.revenue);
  const seriesRows = Array.from(bySeries.values()).map(finalize).sort((a, b) => b.revenue - a.revenue);
  const platformRows = Array.from(byPlatform.values()).map(finalize).sort((a, b) => b.revenue - a.revenue);

  return {
    period: { start, end },
    summary: {
      orders: orders.length,
      snapshot_orders: snapshotOrders,
      missing_snapshot: missingOrders.length,
      revenue: round2(revenue),
      hpp_goods: round2(hppGoods),
      packaging: round2(packaging),
      total_hpp: round2(totalHpp),
      gross_profit: round2(grossProfit),
      margin: revenue > 0 ? round2((grossProfit / revenue) * 100) : 0,
    },
    by_product: productRows,
    by_series: seriesRows,
    by_platform: platformRows,
    thin_margin: productRows.filter((row) => row.revenue > 0).slice().sort((a, b) => a.margin - b.margin).slice(0, 8),
    missing_orders: missingOrders.slice(0, 50),
  };
}

export async function getDataCheckReport(admin: SupabaseClient) {
  const [components, recipes, products, finishedHpp, runningSchedules] = await Promise.all([
    loadComponentRows(admin),
    allRows((from, to) =>
      admin
        .from("production_recipes")
        .select("id, product_category, version, is_active")
        .eq("is_active", true)
        .order("id")
        .range(from, to),
    ),
    allRows((from, to) =>
      admin.from("products").select("id, name, category, series").order("id").range(from, to),
    ),
    loadFinishedHpp(admin),
    allRows((from, to) =>
      admin
        .from("production_schedules")
        .select("id, schedule_number, started_at, status, total_pcs")
        .eq("status", "berjalan")
        .order("started_at")
        .range(from, to),
    ),
  ]);
  const recipeIds = recipes.map((row: any) => String(row.id));
  const recipeLines = recipeIds.length
    ? await allRowsIn(
        admin,
        "production_recipe_lines",
        "id, recipe_id, line_type, group_label, filter_series",
        "recipe_id",
        recipeIds,
      )
    : [];

  const issues: any[] = [];
  for (const row of components) {
    const code = String(row.code || "");
    const name = String(row.name || "");
    const missing = [];
    if (!(num(row.real_price) > 0)) missing.push("Harga Real");
    if (!(num(row.safe_price) > 0)) missing.push("Harga Aman");
    if (missing.length > 0) {
      issues.push({
        type: "komponen_harga",
        title: `${code} · ${name}`,
        detail: `${missing.join(" & ")} belum diisi`,
        link: `/ops/produksi/komponen/${row.id}`,
      });
    }
    if (num(row.stock) < 0) {
      issues.push({
        type: "komponen_minus",
        title: `${code} · ${name}`,
        detail: `Stok minus ${row.stock} ${row.unit_use || ""}`,
        link: `/ops/produksi/komponen/${row.id}`,
      });
    }
  }

  const productsByCategory = new Map<string, Set<string>>();
  for (const row of products) {
    const category = String(row.category || "").trim();
    const series = String(row.series || "").trim();
    if (!category) continue;
    const set = productsByCategory.get(category) || new Set<string>();
    if (series) set.add(series);
    productsByCategory.set(category, set);
  }
  const linesByRecipe = new Map<string, any[]>();
  for (const row of recipeLines) {
    const list = linesByRecipe.get(String(row.recipe_id)) || [];
    list.push(row);
    linesByRecipe.set(String(row.recipe_id), list);
  }
  for (const recipe of recipes) {
    const category = String(recipe.product_category || "");
    const seriesList = Array.from(productsByCategory.get(category) || []);
    const checkSeries = seriesList.length > 0 ? seriesList : [""];
    const lines = linesByRecipe.get(String(recipe.id)) || [];
    const sewingLines = lines.filter(
      (line) => line.line_type === "biaya" && norm(line.group_label).includes("jahit"),
    );
    for (const series of checkSeries) {
      const matched = sewingLines.some(
        (line) => !String(line.filter_series || "").trim() || norm(line.filter_series) === norm(series),
      );
      if (!matched) {
        issues.push({
          type: "resep_jahit",
          title: `${category} v${recipe.version}${series ? ` · ${series}` : ""}`,
          detail: `Biaya Jahit${series ? ` series ${series}` : ""} belum diisi`,
          link: `/ops/produksi/resep/${recipe.id}`,
        });
      }
    }
  }

  const hppProductIds = new Set(finishedHpp.map((row: any) => String(row.product_id)));
  const missingHppProducts = products.filter((row: any) => !hppProductIds.has(String(row.id)));
  for (const row of missingHppProducts.slice(0, 50)) {
    issues.push({
      type: "produk_hpp",
      title: String(row.name || row.id),
      detail: "Belum punya HPP produksi",
      link: "/ops/produksi/resep",
    });
  }

  const saleOrders = await allRows((from, to) =>
    admin
      .from("orders")
      .select("id, order_number, status, total, created_at")
      .in("status", SALE_STATUSES)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  const saleIds = saleOrders.map((row: any) => String(row.id));
  const snapshotHeaders = saleIds.length
    ? await allRowsIn(admin, "production_order_hpp", "order_id", "order_id", saleIds, "order_id")
    : [];
  const snapshotSet = new Set(snapshotHeaders.map((row: any) => String(row.order_id)));
  const missingSnapshot = saleOrders.filter((row: any) => !snapshotSet.has(String(row.id)));
  for (const row of missingSnapshot.slice(0, 50)) {
    issues.push({
      type: "pesanan_hpp",
      title: String(row.order_number || row.id),
      detail: "Pesanan tanpa snapshot HPP",
      link: "/ops/transaksi",
    });
  }

  const now = Date.now();
  for (const row of runningSchedules) {
    const started = row.started_at ? new Date(row.started_at).getTime() : 0;
    const days = started ? Math.floor((now - started) / 86_400_000) : 0;
    if (days >= 14) {
      issues.push({
        type: "jadwal_lama",
        title: String(row.schedule_number || row.id),
        detail: `Berjalan ${days} hari · ${num(row.total_pcs)} pcs`,
        link: `/ops/produksi/jadwal/${row.id}`,
      });
    }
  }

  const groups = [
    { key: "komponen_harga", label: "Komponen tanpa Harga Real/Aman" },
    { key: "komponen_minus", label: "Komponen dengan stok minus" },
    { key: "resep_jahit", label: "Biaya Jahit belum lengkap" },
    { key: "produk_hpp", label: "Produk belum punya HPP" },
    { key: "pesanan_hpp", label: "Pesanan tanpa snapshot HPP" },
    { key: "jadwal_lama", label: "Jadwal Berjalan terlalu lama" },
  ].map((group) => ({
    ...group,
    count: issues.filter((row) => row.type === group.key).length,
    items: issues.filter((row) => row.type === group.key).slice(0, 50),
  }));

  return {
    groups,
    total: issues.length,
    missing_snapshot_orders: missingSnapshot.length,
    products_without_hpp: missingHppProducts.length,
  };
}
