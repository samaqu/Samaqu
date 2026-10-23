import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { BIZ_OFFSET_MS, jakartaDayBounds, jakartaMonthBounds } from "@/lib/ops-followup";
import {
  aggregateBestSellers,
  isValidSaleOrder,
  type BestSellerBreakdown,
  type BestSellerCatalogRow,
  type BestSellerItem,
  type BestSellerModeTotals,
  type BestSellerProductRow,
  type BestSellerSeriesBreakdown,
  type BestSellerSeriesRow,
} from "@/lib/best-sellers";

/**
 * Produk Terlaris untuk halaman Laporan ops — dua mode dari satu sumber data:
 * `series` (produk + series, default) dan `product` (semua series digabung).
 *
 * Identitas diambil dari relasi master `order_items.product_id → products.id`
 * (satu baris katalog = satu produk+series), bukan dari parsing nama item.
 *
 * - Periode: satu BULAN (`?month=YYYY-MM`, default bulan WIB sekarang), batasnya WIB.
 * - Pembanding apple-to-apple:
 *     · bulan berjalan (belum selesai) → rentang tanggal yang sama di bulan sebelumnya
 *       (mis. 1–23 Okt vs 1–23 Sep),
 *     · bulan yang sudah selesai        → bulan penuh vs bulan penuh sebelumnya.
 * - Aturan agregasi & filter pesanan sah SAMA untuk kedua periode: satu fungsi
 *   `aggregateBestSellers()` + `isValidSaleOrder()` dari `src/lib/best-sellers.ts`.
 * - `totals.units` adalah jumlah SELURUH unit item pesanan sah di periode itu (bukan top-N),
 *   sehingga bisa dicocokkan langsung dengan data transaksi mentah.
 */

const DAY_MS = 86_400_000;
/**
 * Basis pembanding terlalu kecil → persen menyesatkan (+100% dari 1 unit).
 * Di bawah ambang ini UI hanya menampilkan selisih unit.
 */
const MIN_PCT_BASE = 5;
const changePct = (current: number, previous: number) =>
  previous >= MIN_PCT_BASE ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
const BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const CHUNK = 120;

const wibKey = (iso: string) => new Date(new Date(iso).getTime() + BIZ_OFFSET_MS).toISOString().slice(0, 10);

function prevMonthValue(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-10-01".."2026-10-23" → "1–23 Okt"; tahun ditambahkan kalau diminta. */
function rangeShort(fromKey: string, toKey: string, withYear = false) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const year = withYear ? ` ${ty}` : "";
  if (fy === ty && fm === tm) return `${fd}–${td} ${BULAN_SINGKAT[tm - 1]}${year}`;
  return `${fd} ${BULAN_SINGKAT[fm - 1]} – ${td} ${BULAN_SINGKAT[tm - 1]}${year}`;
}

/** "2026-10-01".."2026-10-23" → "1–23 Okt 2026". */
function rangeLong(fromKey: string, toKey: string) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  if (fy === ty && fm === tm) return `${fd}–${td} ${BULAN_SINGKAT[tm - 1]} ${ty}`;
  return `${fd} ${BULAN_SINGKAT[fm - 1]} ${fy} – ${td} ${BULAN_SINGKAT[tm - 1]} ${ty}`;
}

type Admin = ReturnType<typeof getSupabaseAdmin>;

interface PeriodSales {
  orders: number;
  validOrders: number;
  items: BestSellerItem[];
}

/** Pesanan sah + item-nya pada satu jendela waktu (batas ISO, `end` eksklusif). */
async function loadSales(admin: Admin, startIso: string, endIso: string): Promise<PeriodSales> {
  const { data: orders, error } = await admin
    .from("orders")
    .select("id, status")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .limit(5000);
  if (error) throw new Error(error.message);

  const rows = (orders || []) as { id?: string; status?: string | null }[];
  const validIds = rows.filter((order) => isValidSaleOrder(order.status)).map((order) => String(order.id));

  const items: BestSellerItem[] = [];
  for (let i = 0; i < validIds.length; i += CHUNK) {
    const chunk = validIds.slice(i, i + CHUNK);
    const { data, error: itemError } = await admin
      .from("order_items")
      .select("order_id, product_id, product_name, size, kain, series, quantity, price, customer_price")
      .in("order_id", chunk);
    if (itemError) throw new Error(itemError.message);
    items.push(...((data || []) as BestSellerItem[]));
  }

  return { orders: rows.length, validOrders: validIds.length, items };
}

/** Nama & kategori katalog untuk produk induk (satu query per potongan id). */
async function loadCatalog(admin: Admin, items: BestSellerItem[]): Promise<BestSellerCatalogRow[]> {
  const ids = [...new Set(items.map((item) => String(item.product_id || "")).filter(Boolean))];
  const catalog: BestSellerCatalogRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("products")
      .select("id, name, category, series, kain, jenis_kain(name)")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    catalog.push(...((data || []) as BestSellerCatalogRow[]));
  }
  return catalog;
}

type MergeableRow = {
  key: string;
  name: string;
  units: number;
  revenue: number;
  sizes: BestSellerBreakdown[];
  covers: BestSellerBreakdown[];
  seriesBreakdown?: BestSellerSeriesBreakdown[];
};

/**
 * Gabungkan periode sekarang & pembanding memakai kunci mode yang sama.
 * Baris yang hanya muncul di periode pembanding tetap ditampilkan (unit 0).
 */
function mergeMode<T extends MergeableRow>(
  current: T[],
  previous: T[],
  currentTotals: BestSellerModeTotals,
  previousTotals: BestSellerModeTotals,
  zeroRow: (row: T) => T,
) {
  const previousByKey = new Map(previous.map((row) => [row.key, row]));
  const currentKeys = new Set<string>();

  const rows = current.map((row) => {
    currentKeys.add(row.key);
    const prevUnits = previousByKey.get(row.key)?.units ?? 0;
    return {
      ...row,
      prevUnits,
      deltaUnits: row.units - prevUnits,
      deltaPct: changePct(row.units, prevUnits),
      isNew: prevUnits === 0 && row.units > 0,
      share: currentTotals.units > 0 ? Math.round((row.units / currentTotals.units) * 1000) / 10 : 0,
    };
  });

  for (const row of previous) {
    if (currentKeys.has(row.key)) continue;
    rows.push({
      ...zeroRow(row),
      prevUnits: row.units,
      deltaUnits: -row.units,
      deltaPct: changePct(0, row.units),
      isNew: false,
      share: 0,
    });
  }

  rows.sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name));
  const top = rows.find((row) => row.units > 0) || null;

  return {
    rows,
    totals: {
      ...currentTotals,
      products: rows.filter((row) => row.units > 0).length,
      unitsPrev: previousTotals.units,
      deltaUnits: currentTotals.units - previousTotals.units,
      deltaPct: changePct(currentTotals.units, previousTotals.units),
      top: top ? { name: top.name, units: top.units } : null,
    },
  };
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  try {
    const now = new Date();
    const current = jakartaMonthBounds(new URL(req.url).searchParams.get("month"), now);
    const thisMonth = jakartaMonthBounds(null, now);
    const isPartial = current.value === thisMonth.value;

    // Jendela periode terpilih: bulan berjalan dipotong sampai hari ini (WIB).
    const todayEndIso = jakartaDayBounds(now).endIso;
    const currentFrom = current.startIso;
    const currentEnd = isPartial ? todayEndIso : current.endIso;

    // Pembanding: rentang tanggal yang sama di bulan sebelumnya (dipotong akhir bulan bila lebih pendek).
    const previous = jakartaMonthBounds(prevMonthValue(current.value), now);
    const elapsedDays = Math.round((Date.parse(currentEnd) - Date.parse(currentFrom)) / DAY_MS);
    const previousEnd = isPartial
      ? new Date(Math.min(Date.parse(previous.startIso) + elapsedDays * DAY_MS, Date.parse(previous.endIso))).toISOString()
      : previous.endIso;

    const [currentSales, previousSales] = await Promise.all([
      loadSales(admin, currentFrom, currentEnd),
      loadSales(admin, previous.startIso, previousEnd),
    ]);

    // Katalog dimuat SEKALI untuk kedua periode → normalisasi produk induk identik.
    const catalog = await loadCatalog(admin, [...currentSales.items, ...previousSales.items]);
    const currentAgg = aggregateBestSellers(currentSales.items, catalog);
    const previousAgg = aggregateBestSellers(previousSales.items, catalog);

    const seriesMode = mergeMode<BestSellerSeriesRow>(
      currentAgg.series.rows,
      previousAgg.series.rows,
      currentAgg.series.totals,
      previousAgg.series.totals,
      (row) => ({ ...row, units: 0, revenue: 0, sizes: [], covers: [] }),
    );
    const productMode = mergeMode<BestSellerProductRow>(
      currentAgg.product.rows,
      previousAgg.product.rows,
      currentAgg.product.totals,
      previousAgg.product.totals,
      (row) => ({ ...row, units: 0, revenue: 0, sizes: [], covers: [], seriesBreakdown: [] }),
    );

    const orderCounts = { validOrders: currentSales.validOrders, orders: currentSales.orders };
    const currentLastKey = wibKey(new Date(Date.parse(currentEnd) - 1).toISOString());
    const previousLastKey = wibKey(new Date(Date.parse(previousEnd) - 1).toISOString());

    return NextResponse.json({
      period: {
        month: current.value,
        label: current.label,
        from: currentFrom,
        to: currentEnd,
        isPartial,
        rangeLabel: rangeLong(wibKey(currentFrom), currentLastKey),
        shortLabel: rangeShort(wibKey(currentFrom), currentLastKey),
      },
      comparison: {
        month: previous.value,
        label: previous.label,
        from: previous.startIso,
        to: previousEnd,
        rangeLabel: rangeLong(wibKey(previous.startIso), previousLastKey),
        shortLabel: rangeShort(wibKey(previous.startIso), previousLastKey),
        hasData: previousAgg.series.totals.units > 0,
      },
      modes: {
        series: { ...seriesMode, totals: { ...seriesMode.totals, ...orderCounts } },
        product: { ...productMode, totals: { ...productMode.totals, ...orderCounts } },
      },
    });
  } catch (error) {
    console.error("[OPS] best-sellers GET:", error);
    return NextResponse.json({ error: "Gagal memuat produk terlaris" }, { status: 500 });
  }
}
