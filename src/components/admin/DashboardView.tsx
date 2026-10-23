"use client";

/**
 * Panel dashboard admin — ringkasan penjualan bulan terpilih (wireframe "Sales Analytics View").
 *
 * Tata letaknya: judul periode → 4 kartu metrik → grafik pendapatan bulanan (garis naik-turun) +
 * donut status → Produk Terlaris.
 *
 * SEMUA angka dihitung dari data asli yang di-pass caller, tidak ada angka/contoh palsu:
 *  - `orders`      = pesanan BULAN terpilih (`/api/ops/orders?from&to`) → kartu metrik + donut;
 *  - `chartOrders` = pesanan JENDELA 6 BULAN (bulan terpilih + 5 sebelumnya) → garis grafik
 *    "Pendapatan Bulanan" + pembanding "vs bulan lalu" di kartu.
 *
 * Aturan angka dipakai bersama layar lain supaya tidak beda antar dashboard — jangan hitung ulang
 * di komponen ini:
 *  - transaksi sah   = `saleCount()` (`SALE_STATUSES`: diproses/dikirim/selesai);
 *  - omset           = `orderRevenue()` (harga produk saja: `total − ongkir`);
 *  - tahap pesanan   = `orderStage()` (`src/lib/order-flow.ts`, sama dengan tab panel Order Management);
 *  - bulan periode   = modul `src/lib/month-period.ts` (semua batas bulan WIB).
 */

import { orderStage, ORDER_STAGE_LABEL } from "@/lib/order-flow";
import { monthKeyWIB, monthShift, monthShortID } from "@/lib/month-period";
import { SALE_COUNT_NOTE, SALE_STATUSES, orderRevenue, saleCount } from "@/lib/transaksi";
import MonthlyTrendChart, { type MonthlyTrendPoint } from "@/components/admin/MonthlyTrendChart";

const money = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

/** Aturan bersama "sudah dibayar" — lihat SALE_STATUSES (src/lib/transaksi.ts). */
const isPaidOrder = (status?: string | null) => SALE_STATUSES.includes(String(status || "").toLowerCase());

/** Warna irisan donut — palet wireframe (#1c1c1c, #5f5f5d, #f59e0b, #22c55e). */
const SLICE_COLORS: Record<string, string> = {
  selesai: "#1c1c1c",
  diproses: "#5f5f5d",
  dikirim: "#9a9a98",
  pending: "#f59e0b",
  dibatalkan: "#ef4444",
};
const SLICE_FALLBACK = ["#1c1c1c", "#5f5f5d", "#f59e0b", "#22c55e", "#9a9a98"];

export interface DashboardOrder {
  status: string;
  total: number;
  /** Ongkir yang dibayar customer — dikurangkan dari `total` supaya angkanya harga PRODUK saja. */
  shipping_cost?: number;
  created_at: string;
  /** Bukti pengiriman, dipakai `orderStage()` untuk kartu "Belum di Packing". */
  awb_no?: string | null;
  shipping_status?: string | null;
  tracking_status_code?: number | null;
}
export interface TopProduct {
  /** Nama produk lengkap (baris atas pil). */
  name: string;
  /** Baris bawah pil: "jenis kain · series" (kosong kalau dua-duanya kosong). */
  sub: string;
  units: number;
  /** Omzet baris (Rp) dari harga tercatat di item pesanan. */
  revenue: number;
}

interface Metric {
  label: string;
  value: string;
  /** Keterangan SATU BARIS (dipotong kalau layar sempit) — bagian dipisah " · ". */
  caption: string;
  /** Penjelasan lengkap saat kursor diarahkan ke kartu. */
  detail: string;
  /** Perubahan vs bulan sebelumnya (%), `null` kalau bulan lalu tidak ada data pembanding. */
  delta?: number | null;
  /** Nama bulan pembanding di chip tren, mis. "Sep". */
  deltaLabel?: string;
  /** Nilai bulan lalu (tooltip chip tren). */
  deltaTitle?: string;
}

/** Chip tren naik/turun vs bulan sebelumnya — hijau naik, merah turun. */
function TrendChip({ delta, label, title }: { delta: number; label: string; title?: string }) {
  const up = delta >= 0;
  const pct = Math.abs(delta).toFixed(1).replace(".", ",");
  return (
    <span
      title={title}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black whitespace-nowrap shrink-0"
      style={{ background: up ? "#ecfdf5" : "#fef2f2", color: up ? "#047857" : "#dc2626" }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {up ? <path d="M6 14l6-6 6 6" /> : <path d="M6 10l6 6 6-6" />}
      </svg>
      {pct}%
      <span className="font-bold" style={{ opacity: 0.75 }}>vs {label}</span>
    </span>
  );
}

export default function DashboardView({
  revenue,
  orders,
  chartOrders,
  topProducts,
  loading = false,
  periodValue,
  periodLabel,
  onPrevMonth,
  onNextMonth,
  onThisMonth,
}: {
  /** Total pendapatan periode terpilih — dihitung caller dengan aturan bersama `SALE_STATUSES`
   *  (hanya pesanan yang sudah dibayar: diproses/dikirim/selesai) dan `orderRevenue()`. */
  revenue: number;
  /** Pesanan PERIODE TERPILIH — dipakai kartu metrik, donut status, dan Produk Terlaris. */
  orders: DashboardOrder[];
  /** Pesanan JENDELA 6 BULAN sampai bulan terpilih (bulan terpilih + 5 sebelumnya) — sumber
   *  garis grafik "Pendapatan Bulanan" dan pembanding tren. Default: `orders`. */
  chartOrders?: DashboardOrder[];
  topProducts: TopProduct[];
  loading?: boolean;
  /** Bulan terpilih "YYYY-MM" (WIB). */
  periodValue: string;
  /** Label periode terpilih, mis. "Oktober 2026". */
  periodLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onThisMonth: () => void;
}) {
  const chartSource = chartOrders ?? orders;

  /* ── metrik periode terpilih ── */
  const orderCount = orders.length;
  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const cancelledOrders = orders.filter((o) => o.status === "dibatalkan").length;
  /* Transaksi sah: SATU aturan bersama `saleCount()` (diproses/dikirim/selesai) — sama dengan
     menu Transaksi, Laporan Keuangan, dan panel Order Management. Inilah angka yang dipakai
     sebagai pembagi rata-rata, jadi rata-rata sejalan dengan `revenue`. */
  const saleOrders = saleCount(orders);
  const avgOrder = saleOrders ? revenue / saleOrders : 0;
  /* Pesanan lunas yang resinya belum dibuat — tahap `belum_dipacking` (order-flow), angka yang
     sama dengan tab "Belum di Packing" di panel Order Management. */
  const toPackOrders = orders.filter((o) => orderStage(o) === "belum_dipacking").length;

  /* ── bulan sebelum periode terpilih, untuk tren naik/turun ── */
  const prevKey = monthShift(periodValue, -1);
  const prevLabel = monthShortID(prevKey);
  const prevOrders = chartSource.filter((o) => monthKeyWIB(o.created_at) === prevKey);
  const prevRevenue = prevOrders.filter((o) => isPaidOrder(o.status)).reduce((sum, o) => sum + orderRevenue(o), 0);
  const prevSales = saleCount(prevOrders);
  const prevAvg = prevSales ? prevRevenue / prevSales : 0;
  /* Bulan lalu tanpa data → tidak ada persen: chip tren disembunyikan (bukan dibagi nol/dikarang). */
  const delta = (current: number, previous: number) => (previous > 0 ? ((current - previous) / previous) * 100 : null);
  const prevDetail = (text: string) => `Bulan sebelumnya (${prevLabel}): ${text}`;

  /* ── deret 6 bulan berakhir di bulan terpilih (garis grafik "naik-turun") ── */
  const monthly: MonthlyTrendPoint[] = (() => {
    const keys: string[] = [];
    for (let i = 5; i >= 0; i--) keys.push(monthShift(periodValue, -i));
    const rev: Record<string, number> = {};
    const count: Record<string, number> = {};
    keys.forEach((k) => { rev[k] = 0; count[k] = 0; });
    for (const o of chartSource) {
      const key = monthKeyWIB(o.created_at);
      if (!(key in rev)) continue;
      count[key] += 1;
      if (isPaidOrder(o.status)) rev[key] += orderRevenue(o);
    }
    return keys.map((k) => ({ label: monthShortID(k), revenue: rev[k], orders: count[k] }));
  })();
  const revenueDelta = delta(revenue, prevRevenue);

  /* ── irisan donut: pesanan per status (data asli) ── */
  const statusMap: Record<string, number> = {};
  orders.forEach((o) => { statusMap[o.status] = (statusMap[o.status] || 0) + 1; });
  const preferred = ["selesai", "diproses", "dikirim", "pending", "dibatalkan"];
  const slices = [
    ...preferred.filter((s) => statusMap[s]).map((s) => ({ label: s, value: statusMap[s] })),
    ...Object.keys(statusMap).filter((s) => !preferred.includes(s)).map((s) => ({ label: s, value: statusMap[s] })),
  ];
  const sliceTotal = slices.reduce((s, x) => s + x.value, 0);
  const sliceColor = (label: string, i: number) =>
    SLICE_COLORS[label] || SLICE_FALLBACK[i % SLICE_FALLBACK.length];

  /* ── donut svg ── */
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  let acc = 0;
  const arcs = slices.map((s, i) => {
    const len = sliceTotal ? (s.value / sliceTotal) * CIRC : 0;
    const arc = { key: s.label + i, len, offset: acc, color: sliceColor(s.label, i) };
    acc += len;
    return arc;
  });

  /* ── 4 kartu metrik — keterangannya SATU BARIS supaya kartu sejajar & rapi ── */
  const metrics: Metric[] = [
    {
      label: "Pendapatan",
      value: money(revenue),
      caption: `${saleOrders} transaksi · tanpa ongkir`,
      detail: `${money(revenue)} dari ${saleOrders} transaksi diakui · hanya harga produk (ongkir tidak dihitung)`,
      delta: revenueDelta,
      deltaLabel: prevLabel,
      deltaTitle: prevDetail(money(prevRevenue)),
    },
    {
      label: "Pesanan Masuk",
      value: String(orderCount),
      // Keterangan sengaja pendek ("126 transaksi diakui"): kartu ini juga sempit di layar 4 kolom,
      // jadi kalimat panjang akan terpotong. Rincian lengkapnya ada di tooltip kartu + donut "Per Status".
      caption: `${saleOrders} ${SALE_COUNT_NOTE}`,
      detail:
        `${orderCount} pesanan masuk bulan ${periodLabel}: ${saleOrders} diakui sebagai transaksi ` +
        `(diproses/dikirim/selesai), ${pendingOrders} belum bayar, ${cancelledOrders} dibatalkan`,
      delta: delta(orderCount, prevOrders.length),
      deltaLabel: prevLabel,
      deltaTitle: prevDetail(`${prevOrders.length} pesanan masuk`),
    },
    {
      label: "Rata-rata Pesanan",
      value: avgOrder ? money(avgOrder) : "—",
      caption: `per ${SALE_COUNT_NOTE}`,
      detail: `${money(revenue)} ÷ ${saleOrders} transaksi diakui bulan ${periodLabel}`,
      delta: delta(avgOrder, prevAvg),
      deltaLabel: prevLabel,
      deltaTitle: prevDetail(money(prevAvg)),
    },
    {
      label: ORDER_STAGE_LABEL.belum_dipacking,
      value: String(toPackOrders),
      caption: "lunas · resi belum dibuat",
      detail: `${toPackOrders} pesanan sudah lunas tapi belum dibuatkan resi J&T (tahap sama dengan tab "${ORDER_STAGE_LABEL.belum_dipacking}" di Order Management)`,
    },
  ];

  return (
    <div className="p-5 lg:p-8 space-y-6 lg:space-y-8">
      {/* ── Bar periode: pemilih bulan (sama seperti dashboard ops) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-extrabold text-sm" style={{ color: "var(--fg)" }}>Ringkasan Periode</h2>
          <p className="text-[11px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: "var(--fg3)" }}>
            {periodLabel} · dibanding {prevLabel}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: "var(--card)", border: "1px solid var(--bd)" }}>
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="Bulan sebelumnya"
            className="w-8 h-8 grid place-items-center rounded-lg transition-colors hover:bg-[var(--sub)]"
            style={{ color: "var(--fg2)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            type="button"
            onClick={onThisMonth}
            title="Kembali ke bulan ini"
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors hover:bg-[var(--sub)]"
            style={{ background: "var(--sub)", color: "var(--fg)" }}
          >
            {periodLabel}
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Bulan berikutnya"
            className="w-8 h-8 grid place-items-center rounded-lg transition-colors hover:bg-[var(--sub)]"
            style={{ color: "var(--fg2)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      {/* ── 4 kartu metrik ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
        {metrics.map((m) => (
          <div
            key={m.label}
            title={m.detail}
            className="p-5 flex flex-col gap-3 transition-shadow hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)]"
            style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad3)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide truncate" style={{ color: "var(--fg3)" }}>
                {m.label}
              </span>
              {m.delta != null ? (
                <TrendChip delta={m.delta} label={m.deltaLabel || prevLabel} title={m.deltaTitle} />
              ) : null}
            </div>
            {/* Ukuran font fluid supaya nominal panjang (mis. "Rp 48.331.123") tidak pernah
                terpotong di layar sempit / zoom tinggi. */}
            <div
              className="font-extrabold leading-none whitespace-nowrap text-[clamp(1.25rem,1.8vw,1.75rem)]"
              style={{ color: "var(--fg)" }}
            >
              {m.value}
            </div>
            {/* Keterangan satu baris (permintaan pemilik: "tulisan keterangan di card bikin sejajar 1 baris") */}
            <p className="text-[11px] font-semibold truncate" style={{ color: "var(--fg3)" }}>
              {m.caption}
            </p>
          </div>
        ))}
      </div>

      {/* ── grafik pendapatan bulanan (garis naik-turun) + donut status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2 p-6" style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad3)" }}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm" style={{ color: "var(--fg)" }}>Pendapatan Bulanan</h3>
              <p className="text-[11px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: "var(--fg3)" }}>
                6 bulan terakhir · hanya harga produk (tanpa ongkir)
              </p>
            </div>
            {!loading && revenueDelta != null ? (
              <TrendChip
                delta={revenueDelta}
                label={prevLabel}
                title={prevDetail(`${money(prevRevenue)} · ${money(revenue)} bulan ${periodLabel}`)}
              />
            ) : null}
          </div>
          {loading ? (
            <p className="text-xs font-bold mt-4" style={{ color: "var(--fg3)" }}>Memuat…</p>
          ) : (
            <MonthlyTrendChart data={monthly} />
          )}
        </div>

        <div className="p-6" style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad3)" }}>
          <h3 className="font-extrabold text-sm" style={{ color: "var(--fg)" }}>Per Status</h3>
          <p className="text-[11px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: "var(--fg3)" }}>
            {periodLabel} · semua pesanan masuk
          </p>
          {loading ? (
            <p className="text-xs font-bold mt-4" style={{ color: "var(--fg3)" }}>Memuat…</p>
          ) : sliceTotal === 0 ? (
            <p className="text-xs font-bold mt-4" style={{ color: "var(--fg3)" }}>Belum ada pesanan</p>
          ) : (
            <>
              <div className="relative h-44 lg:h-52 w-full flex items-center justify-center">
                <svg viewBox="0 0 140 140" className="h-full w-auto max-w-full">
                  {arcs.map((a) => (
                    <circle
                      key={a.key}
                      cx="70" cy="70" r={R}
                      fill="none"
                      stroke={a.color}
                      strokeWidth="22"
                      strokeDasharray={`${a.len} ${CIRC - a.len}`}
                      strokeDashoffset={-a.offset}
                      transform="rotate(-90 70 70)"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-extrabold leading-none" style={{ color: "var(--fg)" }}>{sliceTotal}</span>
                  <span className="text-[10px] font-bold mt-1" style={{ color: "var(--fg3)" }}>pesanan masuk</span>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5">
                {slices.map((s, i) => (
                  <li key={s.label} className="flex items-center gap-2 text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sliceColor(s.label, i) }} />
                    <span className="font-bold capitalize flex-1 truncate" style={{ color: "var(--fg2)" }}>{s.label}</span>
                    <span className="font-extrabold" style={{ color: "var(--fg)" }}>{s.value}</span>
                    <span className="font-semibold w-8 text-right" style={{ color: "var(--fg3)" }}>
                      {Math.round((s.value / sliceTotal) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ── produk terlaris (grid 4 kolom ala wireframe) ── */}
      <div className="p-6" style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad3)" }}>
        <h3 className="font-extrabold text-sm" style={{ color: "var(--fg)" }}>Produk Terlaris</h3>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-4 mt-0.5" style={{ color: "var(--fg3)" }}>{periodLabel}</p>
        {loading ? (
          <p className="text-xs font-bold" style={{ color: "var(--fg3)" }}>Memuat…</p>
        ) : topProducts.length === 0 ? (
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--fg3)" }}>Belum ada penjualan</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--fg3)" }}>Periode {periodLabel}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
            {topProducts.slice(0, 4).map((p, i) => {
              const tooltip = [p.sub, p.revenue > 0 ? `Rp ${p.revenue.toLocaleString("id-ID")}` : ""].filter(Boolean).join(" · ");
              return (
              <div
                key={`${p.name}||${p.sub}`}
                className="p-3.5 rounded-2xl flex items-center justify-between gap-2"
                style={{ background: "var(--sub)", border: "1px solid var(--bd)" }}
                title={tooltip ? `${p.name} — ${tooltip}` : p.name}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-extrabold shrink-0" style={{ color: "var(--fg3)" }}>#{i + 1}</span>
                  <div className="min-w-0">
                    {/* baris 1: nama produk lengkap — baris 2: jenis kain · series */}
                    <p className="font-extrabold truncate" style={{ color: "var(--fg)" }}>{p.name}</p>
                    <p className="text-[10px] font-bold truncate mt-0.5" style={{ color: "var(--fg3)" }}>{p.sub || "—"}</p>
                  </div>
                </div>
                <span
                  className="font-bold px-2.5 py-1 shrink-0"
                  style={{ color: "var(--fg)", background: "var(--card)", borderRadius: 8, border: "1px solid var(--bd)" }}
                >
                  {p.units}
                </span>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
