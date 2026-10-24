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
 *  - pesanan masuk   = KARTU "Pesanan Masuk" hanya menghitung pesanan yang SUDAH DIBAYAR
 *    (`SALE_STATUSES`): belum bayar & dibatalkan tidak dihitung. Donut "Per Status" dan jumlah
 *    pesanan di grafik tren tetap memakai himpunan "semua pesanan minus dibatalkan";
 *  - transaksi sah   = `saleCount()` (`SALE_STATUSES`: diproses/dikirim/selesai);
 *  - omset           = `orderRevenue()` (harga produk saja: `total − ongkir`);
 *  - tahap pesanan   = `orderStage()` (`src/lib/order-flow.ts`, sama dengan tab panel Order Management);
 *  - bulan periode   = modul `src/lib/month-period.ts` (semua batas bulan WIB).
 */

import { orderStage, ORDER_STAGE_LABEL } from "@/lib/order-flow";
import { monthKeyWIB, monthShift, monthShortID } from "@/lib/month-period";
import { SALE_STATUSES, orderRevenue, saleCount } from "@/lib/transaksi";
import MonthlyTrendChart, { type MonthlyTrendPoint } from "@/components/admin/MonthlyTrendChart";
import CountUp from "@/components/admin/CountUp";

const money = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");
/** Angka bulat tanpa pemisah ribuan — untuk jumlah pesanan/transaksi. */
const count = (n: number) => String(Math.round(n));

/** Aturan bersama "sudah dibayar" — lihat SALE_STATUSES (src/lib/transaksi.ts). */
const isPaidOrder = (status?: string | null) => SALE_STATUSES.includes(String(status || "").toLowerCase());

/** Pesanan DIBATALKAN bukan pesanan masuk — tidak dihitung di kartu "Pesanan Masuk", angka
 *  tengah donut "Per Status", chip tren "vs bulan lalu", dan jumlah pesanan di grafik tren. */
const isCancelledOrder = (status?: string | null) => String(status || "").toLowerCase() === "dibatalkan";

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
  /** Bukti pengiriman, dipakai `orderStage()` untuk tahap pesanan (Belum di Packing vs Menunggu Pickup). */
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
  /** Angka mentah kartu — dianimasikan naik (`CountUp`), bukan teks jadi. */
  num: number;
  /** Cara menampilkan `num` (dipakai juga untuk tiap frame animasi counter). */
  format: (n: number) => string;
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

/** Tren naik/turun vs bulan sebelumnya — panah kecil + persen sejajar (hijau naik `#16a34a`, merah
 *  turun `#dc2626`), lalu pembanding "dari <bulan>" kecil abu. Minimalis: tanpa latar/padding chip,
 *  permintaan pemilik 2026-10-24 ("badge trend-nya kurang clean & terlalu mencolok"). Tren tetap
 *  menempel di bawah nilai, bukan chip di baris nama kartu (itu yang dulu memotong nama kartu). */
function TrendDelta({ delta, label, title }: { delta: number; label: string; title?: string }) {
  const up = delta >= 0;
  const pct = Math.abs(delta).toFixed(1).replace(".", ",");
  const color = up ? "#16a34a" : "#dc2626";
  return (
    <span title={title} className="inline-flex items-center gap-0.5 min-w-0">
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0"
      >
        {up ? <path d="M6 14l6-6 6 6" /> : <path d="M6 10l6 6 6-6" />}
      </svg>
      <span className="text-[11px] font-semibold leading-none tabular-nums" style={{ color }}>
        {pct}%
      </span>
      <span className="text-[10px] font-medium truncate ml-1" style={{ color: "var(--fg3)" }}>
        dari {label}
      </span>
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
  /* Kartu "Pesanan Masuk" menghitung HANYA pesanan yang sudah dibayar (permintaan pemilik
     2026-10-24: "belum bayar juga jangan dihitung"). Pesanan `pending` (Belum Bayar) maupun
     `dibatalkan` bukan pesanan masuk, jadi angka kartunya = transaksi diakui (`saleOrders`). */
  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const cancelledOrders = orders.filter((o) => o.status === "dibatalkan").length;
  /* Himpunan "semua pesanan minus dibatalkan" — dipakai donut "Per Status" dan jumlah pesanan di
     tooltip grafik tren; kartu "Pesanan Masuk" tidak memakainya lagi (lihat di atas). */
  const incomingOrders = orders.filter((o) => !isCancelledOrder(o.status));
  /* Transaksi sah: SATU aturan bersama `saleCount()` (diproses/dikirim/selesai) — sama dengan
     menu Transaksi, Laporan Keuangan, dan panel Order Management. Inilah angka yang dipakai
     sebagai pembagi rata-rata, jadi rata-rata sejalan dengan `revenue`. */
  const saleOrders = saleCount(orders);
  const avgOrder = saleOrders ? revenue / saleOrders : 0;
  /* Pesanan BELUM DIBAYAR — tahap `belum_bayar` (order-flow), angka yang sama dengan tab
     "Belum Bayar" di panel Order Management dan irisan `pending` di donut "Per Status". */
  const unpaidOrders = orders.filter((o) => orderStage(o) === "belum_bayar").length;

  /* ── bulan sebelum periode terpilih, untuk tren naik/turun ── */
  const prevKey = monthShift(periodValue, -1);
  const prevLabel = monthShortID(prevKey);
  const prevOrders = chartSource.filter(
    (o) => monthKeyWIB(o.created_at) === prevKey && !isCancelledOrder(o.status)
  );
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
      if (!isCancelledOrder(o.status)) count[key] += 1;
      if (isPaidOrder(o.status)) rev[key] += orderRevenue(o);
    }
    return keys.map((k) => ({ label: monthShortID(k), revenue: rev[k], orders: count[k] }));
  })();
  const revenueDelta = delta(revenue, prevRevenue);

  /* ── irisan donut: pesanan per status (data asli) ── */
  const statusMap: Record<string, number> = {};
  incomingOrders.forEach((o) => { statusMap[o.status] = (statusMap[o.status] || 0) + 1; });
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
      num: revenue,
      format: money,
      // Keterangan kartu disamakan dengan menu Transaksi / kartu mockup ops (permintaan pemilik
      // 2026-10-24: "keterangan yg di panel admin samain kaya yg lain di menu transaksi sama
      // dashboard") — kartu omset berbunyi "Tidak termasuk dibatalkan" di SEMUA layar. Rincian
      // "tanpa ongkir" tetap di tooltip kartu + subjudul grafik, jadi caption tetap satu baris.
      caption: "Tidak termasuk dibatalkan",
      detail: `${money(revenue)} dari ${saleOrders} transaksi diakui · hanya harga produk (ongkir tidak dihitung)`,
      delta: revenueDelta,
      deltaLabel: prevLabel,
      deltaTitle: prevDetail(money(prevRevenue)),
    },
    {
      label: "Pesanan Masuk",
      num: saleOrders,
      format: count,
      // Keterangan SAMA PERSIS dengan kartu "Total transaksi" di menu Transaksi (angka besarnya
      // juga sama: `saleCount`), jadi kedua layar menyebut jumlah pesanan periode itu dengan
      // kalimat yang identik. Rincian lengkapnya ada di tooltip kartu + donut "Per Status".
      caption: `dari ${orders.length} pesanan masuk ${periodLabel}`,
      detail:
        `${saleOrders} pesanan masuk bulan ${periodLabel} (sudah dibayar: diproses/dikirim/selesai) ` +
        `· ${pendingOrders} belum bayar dan ${cancelledOrders} dibatalkan tidak dihitung`,
      delta: delta(saleOrders, prevSales),
      deltaLabel: prevLabel,
      deltaTitle: prevDetail(`${prevSales} pesanan masuk sudah dibayar`),
    },
    {
      label: "Rata-rata Pesanan",
      num: avgOrder,
      // Tanpa transaksi diakui → rata-ratanya memang tidak ada, jadi tampil "—" (bukan Rp 0).
      format: (n) => (avgOrder ? money(n) : "—"),
      caption: "Rata-rata nilai pesanan",
      detail: `${money(revenue)} ÷ ${saleOrders} transaksi diakui bulan ${periodLabel}`,
      delta: delta(avgOrder, prevAvg),
      deltaLabel: prevLabel,
      deltaTitle: prevDetail(money(prevAvg)),
    },
    {
      label: ORDER_STAGE_LABEL.belum_bayar,
      num: unpaidOrders,
      format: count,
      caption: "Perlu follow-up",
      detail: `${unpaidOrders} pesanan belum dibayar bulan ${periodLabel} (tahap sama dengan tab "${ORDER_STAGE_LABEL.belum_bayar}" di Order Management)`,
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
            {/* Nama kartu — sendirian di barisnya (contoh desain pemilik 2026-10-24): tren tidak lagi
                duduk sebaris dengan nama, jadi nama kartu tidak pernah terpotong di 4 kolom. */}
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--fg3)" }}>
              {m.label}
            </span>
            {/* Ukuran font fluid supaya nominal panjang (mis. "Rp 48.331.123") tidak pernah
                terpotong di layar sempit / zoom tinggi. */}
            <div
              className="font-extrabold leading-none whitespace-nowrap tabular-nums text-[clamp(1.25rem,1.8vw,1.75rem)]"
              style={{ color: "var(--fg)" }}
            >
              {/* Angka dihitung naik saat kartu muncul / nilainya berubah (permintaan pemilik
                  2026-10-24: "kasih animasi counter di masing2 card nya"). */}
              <CountUp value={m.num} format={m.format} />
            </div>
            {/* Tren naik/turun tepat DI BAWAH nilai (contoh desain pemilik). Barisnya selalu ada —
                tinggi dijaga sama walau kartunya tidak punya pembanding — supaya caption keempat
                kartu tetap sejajar. */}
            <div className="h-[18px] flex items-center">
              {m.delta != null ? (
                <TrendDelta delta={m.delta} label={m.deltaLabel || prevLabel} title={m.deltaTitle} />
              ) : null}
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
              <TrendDelta
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
            {periodLabel} · tanpa pesanan dibatalkan
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
