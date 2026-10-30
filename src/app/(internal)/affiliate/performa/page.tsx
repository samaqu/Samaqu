"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Empty, Seg, Select, Stat, Table } from "@/components/affiliate/ui";
import { affiliateFetch } from "@/lib/affiliate/client";
import { money, num, pct } from "@/lib/affiliate/format";
import {
  PERIOD_OPTIONS,
  dayKey,
  inRange,
  periodLabel,
  prevRange,
  rangeFor,
} from "@/lib/affiliate/period";

/**
 * Performa affiliate — grafik & tabel performa.
 * Struktur mengikuti mockup (4 grafik + tabel perolehan berdasarkan).
 */

interface SeriesPoint {
  key: string;
  label: string;
  clicks: number;
  orders: number;
  sales: number;
  commission: number;
}

interface GroupRow {
  key: string;
  clicks?: number;
  orders: number;
  sales: number;
  commission: number;
}

interface PerformaPayload {
  series: SeriesPoint[];
  byProduct: GroupRow[];
  byLink: GroupRow[];
  byCampaign: GroupRow[];
  bySource: GroupRow[];
  totals: { clicks: number; orders: number; sales: number; commission: number };
}

const GROUP_LABEL: Record<string, string> = {
  produk: "Produk",
  tautan: "Tautan",
  kampanye: "Kampanye",
  sumber: "Sumber",
};

export default function AffiliatePerformaPage() {
  const [period, setPeriod] = useState("30");
  const [by, setBy] = useState("produk");
  const [compare, setCompare] = useState(false);
  const [data, setData] = useState<PerformaPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await affiliateFetch<PerformaPayload>("/api/affiliate/performa?days=90");
        if (alive) setData(json);
      } catch (e) {
        console.error("[AFFILIATE] Gagal memuat performa:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const range = useMemo(() => rangeFor(period), [period]);
  const prev = useMemo(() => prevRange(range), [range]);

  const series = useMemo(() => {
    const all = data?.series || [];
    const current = all.filter((s) => inRange(s.key, range));
    const previous = all.filter((s) => inRange(s.key, prev));
    const sum = (rows: SeriesPoint[], key: "clicks" | "orders" | "sales" | "commission") =>
      rows.reduce((s, r) => s + r[key], 0);
    return {
      current,
      previous,
      totals: {
        clicks: sum(current, "clicks"),
        orders: sum(current, "orders"),
        sales: sum(current, "sales"),
        commission: sum(current, "commission"),
      },
      prevTotals: {
        clicks: sum(previous, "clicks"),
        orders: sum(previous, "orders"),
        sales: sum(previous, "sales"),
        commission: sum(previous, "commission"),
      },
    };
  }, [data, range, prev]);

  const groupRows = useMemo(() => {
    const rows =
      by === "produk"
        ? data?.byProduct
        : by === "tautan"
          ? data?.byLink
          : by === "kampanye"
            ? data?.byCampaign
            : data?.bySource;
    return (rows || [])
      .filter((r) => r.clicks || r.orders)
      .sort((a, b) => b.commission - a.commission || (b.clicks || 0) - (a.clicks || 0));
  }, [data, by]);

  const chartData = useMemo(() => {
    const prevMap = new Map(series.previous.map((s) => [s.key, s]));
    return series.current.map((s) => ({
      label: s.label,
      clicks: s.clicks,
      orders: s.orders,
      sales: s.sales,
      commission: s.commission,
      prevSales: prevMap.get(s.key)?.sales ?? 0,
      prevClicks: prevMap.get(s.key)?.clicks ?? 0,
    }));
  }, [series]);

  if (loading) {
    return <div className="card p-10 text-center muted">Memuat performa…</div>;
  }

  const delta = (a: number, b: number) => (compare ? pct(a, b) : undefined);

  const charts: [string, string, boolean, "line" | "bar"][] = [
    ["clicks", "Klik per Hari", false, "line"],
    ["orders", "Pesanan per Hari", false, "bar"],
    ["sales", "Penjualan per Hari", true, "line"],
    ["commission", "Komisi per Hari", true, "bar"],
  ];

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 16, gap: 12 }}>
        <div className="row wrap">
          <Select value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
          <label className="row small b" style={{ gap: 8, cursor: "pointer" }}>
            <button
              className={`sw ${compare ? "on" : ""}`}
              onClick={() => setCompare((v) => !v)}
              aria-label="Bandingkan"
              type="button"
            />
            Bandingkan dengan periode sebelumnya
          </label>
        </div>
      </div>

      <div className="grid g6 pg6">
        <Stat icon="click" label="Total Klik" value={num(series.totals.clicks)} delta={delta(series.totals.clicks, series.prevTotals.clicks)} />
        <Stat
          icon="users"
          label="Pengunjung Unik"
          value={num(Math.round(series.totals.clicks * 0.71))}
          sub="Estimasi"
          delta={delta(Math.round(series.totals.clicks * 0.71), Math.round(series.prevTotals.clicks * 0.71))}
        />
        <Stat icon="cart" label="Total Pesanan" value={num(series.totals.orders)} delta={delta(series.totals.orders, series.prevTotals.orders)} />
        <Stat
          icon="percent"
          label="Tingkat Konversi"
          value={
            series.totals.clicks
              ? `${((series.totals.orders / series.totals.clicks) * 100).toFixed(2).replace(".", ",")}%`
              : "0,00%"
          }
          sub="Pesanan / klik"
        />
        <Stat icon="bag" label="Total Penjualan" value={money(series.totals.sales)} delta={delta(series.totals.sales, series.prevTotals.sales)} />
        <Stat icon="coins" label="Total Komisi" value={money(series.totals.commission)} delta={delta(series.totals.commission, series.prevTotals.commission)} />
      </div>

      <div className="grid g2 mt">
        {charts.map(([key, title, isMoney, type]) => (
          <div className="card" key={key}>
            <div className="ch">
              <h3>{title}</h3>
              <span className="small muted">{periodLabel(period, range)}</span>
            </div>
            <div className="cp">
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {type === "bar" ? (
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#F1F2F4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} minTickGap={18} />
                      <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} width={52} />
                      <Tooltip
                        contentStyle={{ background: "#111827", border: 0, borderRadius: 10, color: "#fff", fontSize: 12 }}
                        formatter={(value) => [
                          isMoney ? money(Number(value)) : num(Number(value)),
                          title.replace(" per Hari", ""),
                        ]}
                      />
                      <Bar dataKey={key} fill="#111827" radius={[6, 6, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#F1F2F4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} minTickGap={18} />
                      <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} width={52} />
                      <Tooltip
                        contentStyle={{ background: "#111827", border: 0, borderRadius: 10, color: "#fff", fontSize: 12 }}
                        formatter={(value) => [
                          isMoney ? money(Number(value)) : num(Number(value)),
                          title.replace(" per Hari", ""),
                        ]}
                      />
                      <Line type="monotone" dataKey={key} stroke="#111827" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt">
        <div className="ch">
          <h3>Performa Berdasarkan</h3>
          <Seg
            items={[
              ["produk", "Produk"],
              ["tautan", "Tautan"],
              ["kampanye", "Kampanye"],
              ["sumber", "Sumber Promosi"],
            ]}
            value={by}
            onChange={setBy}
          />
        </div>

        {groupRows.length === 0 ? (
          <Empty icon="chart" title="Belum ada data pada periode ini" text="Buat tautan referral untuk mulai mengumpulkan data." />
        ) : (
          <Table
            columns={[
              {
                label: GROUP_LABEL[by],
                render: (r) => (
                  <span className="b dark" style={{ whiteSpace: "normal" }}>
                    {r.key}
                  </span>
                ),
              },
              { label: "Klik", num: true, render: (r) => num(r.clicks) },
              { label: "Pesanan", num: true, render: (r) => num(r.orders) },
              {
                label: "Konversi",
                num: true,
                render: (r) =>
                  r.clicks ? `${((r.orders / r.clicks) * 100).toFixed(2).replace(".", ",")}%` : "—",
              },
              { label: "Penjualan", num: true, render: (r) => money(r.sales) },
              { label: "Komisi", num: true, render: (r) => <b className="dark">{money(r.commission)}</b> },
            ]}
            rows={groupRows}
          />
        )}
      </div>
    </div>
  );
}
