"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Icon } from "@/components/affiliate/icons";
import { Badge, Empty, ProductCell, Seg, Select, Stat, Table } from "@/components/affiliate/ui";
import { useAffiliate } from "@/components/affiliate/AffiliateShell";
import { affiliateFetch } from "@/lib/affiliate/client";
import {
  COMMISSION_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  money,
  num,
  pct,
  tgl,
} from "@/lib/affiliate/format";
import {
  PERIOD_OPTIONS,
  dayKey,
  inRange,
  periodLabel,
  prevRange,
  rangeFor,
} from "@/lib/affiliate/period";

/**
 * Ringkasan dashboard affiliate — mengikuti mockup "SAMAQU Affiliate Center".
 * Semua angka berasal dari backend (klik, pesanan, komisi nyata).
 */

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  subtotal: number;
  shippingCost: number;
  createdAt: string;
  customer: string;
  city: string;
  items: {
    productId: string | null;
    productName: string | null;
    productImage: string | null;
    quantity: number;
    price: number;
  }[];
  commission: {
    amount: number;
    status: string;
    reason: string | null;
  } | null;
}

interface SeriesPoint {
  key: string;
  label: string;
  clicks: number;
  orders: number;
  sales: number;
  commission: number;
}

interface PerformaPayload {
  series: SeriesPoint[];
  byProduct: { key: string; clicks: number; orders: number; sales: number; commission: number }[];
}

const CHART_SERIES: [string, string, boolean][] = [
  ["sales", "Penjualan", true],
  ["comm", "Komisi", true],
  ["clicks", "Klik", false],
];

export default function AffiliateDashboardPage() {
  const { me } = useAffiliate();
  const [period, setPeriod] = useState("30");
  const [chart, setChart] = useState("sales");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [performa, setPerforma] = useState<PerformaPayload | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await affiliateFetch<{ orders: OrderRow[] }>("/api/affiliate/orders");
        if (alive) setOrders(json.orders || []);
      } catch (e) {
        console.error("[AFFILIATE] Gagal memuat pesanan:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Performa (grafik & produk teratas) mengikuti periode yang dipilih, supaya
  // angka di tabel "Produk dengan Performa Terbaik" sama dengan filter di atas.
  useEffect(() => {
    let alive = true;
    const r = rangeFor(period);
    (async () => {
      try {
        const json = await affiliateFetch<PerformaPayload>(
          `/api/affiliate/performa?days=90&from=${encodeURIComponent(r.from.toISOString())}&to=${encodeURIComponent(r.to.toISOString())}`,
        );
        if (alive) setPerforma(json);
      } catch (e) {
        console.error("[AFFILIATE] Gagal memuat performa:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [period]);

  const range = useMemo(() => rangeFor(period), [period]);
  const prev = useMemo(() => prevRange(range), [range]);

  const metrics = useMemo(() => {
    const inRangeOrders = orders.filter((o) => inRange(o.createdAt, range));
    const inPrevOrders = orders.filter((o) => inRange(o.createdAt, prev));
    const series = performa?.series || [];
    const clicks = series
      .filter((s) => inRange(s.key, range))
      .reduce((sum, s) => sum + s.clicks, 0);
    const prevClicks = series
      .filter((s) => inRange(s.key, prev))
      .reduce((sum, s) => sum + s.clicks, 0);

    const okSale = (o: OrderRow) => !["dibatalkan", "pending"].includes(o.status);
    const sales = inRangeOrders.filter(okSale).reduce((s, o) => s + o.subtotal, 0);
    const prevSales = inPrevOrders.filter(okSale).reduce((s, o) => s + o.subtotal, 0);
    const commission = inRangeOrders
      .filter((o) => o.commission && o.commission.status !== "ditolak")
      .reduce((s, o) => s + (o.commission?.amount || 0), 0);
    const prevCommission = inPrevOrders
      .filter((o) => o.commission && o.commission.status !== "ditolak")
      .reduce((s, o) => s + (o.commission?.amount || 0), 0);
    const success = inRangeOrders.filter((o) => o.status === "selesai").length;
    const prevSuccess = inPrevOrders.filter((o) => o.status === "selesai").length;

    return {
      clicks,
      prevClicks,
      orders: inRangeOrders.length,
      success,
      prevSuccess,
      sales,
      prevSales,
      commission,
      prevCommission,
    };
  }, [orders, performa, range, prev]);

  const chartData = useMemo(() => {
    const series = (performa?.series || []).filter((s) => inRange(s.key, range));
    return series.map((s) => ({
      label: s.label,
      sales: s.sales,
      comm: s.commission,
      clicks: s.clicks,
      orders: s.orders,
    }));
  }, [performa, range]);

  const commissionGroups = useMemo(() => {
    const all = orders.map((o) => o.commission).filter(Boolean) as NonNullable<OrderRow["commission"]>[];
    const group = (status: string) => {
      const rows = all.filter((c) => c.status === status);
      return {
        value: rows.reduce((s, c) => s + c.amount, 0),
        count: rows.length,
      };
    };
    return {
      menunggu: group("menunggu"),
      disetujui: group("disetujui"),
      dibayarkan: group("dibayarkan"),
    };
  }, [orders]);

  const topProducts = useMemo(() => {
    const list = (performa?.byProduct || [])
      .filter((p) => p.clicks || p.orders || p.commission)
      .sort((a, b) => b.commission - a.commission || b.clicks - a.clicks)
      .slice(0, 5);
    return list;
  }, [performa]);

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

  const activities = useMemo(() => {
    const list: { icon: string; title: string; text: string; date: string }[] = [];
    if (recentOrders[0]) {
      list.push({
        icon: "cart",
        title: "Pesanan baru teratribusi",
        text: `${recentOrders[0].orderNumber} · ${money(recentOrders[0].subtotal)}`,
        date: recentOrders[0].createdAt,
      });
    }
    const approved = orders.find((o) => o.commission?.status === "disetujui");
    if (approved) {
      list.push({
        icon: "cc",
        title: "Komisi disetujui",
        text: `${money(approved.commission?.amount || 0)} dari ${approved.orderNumber}`,
        date: approved.createdAt,
      });
    }
    const rejected = orders.find((o) => o.commission?.status === "ditolak");
    if (rejected) {
      list.push({
        icon: "xc",
        title: "Komisi tidak disetujui",
        text: rejected.commission?.reason || rejected.orderNumber,
        date: rejected.createdAt,
      });
    }
    list.push({
      icon: "link",
      title: "Bagikan tautan referral",
      text: "Tautan baru memberi klik & pesanan yang bisa dilacak",
      date: me?.affiliate.created_at || "",
    });
    return list;
  }, [orders, recentOrders, me]);

  if (!me) return null;

  const displayName = me.affiliate.display_name || me.affiliate.full_name;
  const firstName = displayName.split(" ")[0];

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 20, gap: 14 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", letterSpacing: "-.01em" }}>
            Selamat datang kembali, {firstName}
          </h2>
          <p className="muted" style={{ marginTop: 4 }}>
            Pantau penjualan, komisi, dan perkembangan affiliate kamu dalam satu tempat.
          </p>
        </div>
        <Select
          value={period}
          onChange={setPeriod}
          options={PERIOD_OPTIONS}
          style={{ width: "auto", minWidth: 190 }}
        />
      </div>

      <div className="grid g4">
        <Stat
          icon="click"
          label="Total Klik"
          value={num(metrics.clicks)}
          sub="vs periode sebelumnya"
          delta={pct(metrics.clicks, metrics.prevClicks)}
        />
        <Stat
          icon="cart"
          label="Pesanan Berhasil"
          value={`${num(metrics.success)} pesanan`}
          sub={`Status Selesai · ${metrics.orders} total`}
          delta={pct(metrics.success, metrics.prevSuccess)}
        />
        <Stat
          icon="bag"
          label="Total Penjualan"
          value={money(metrics.sales)}
          sub="Teratribusi ke affiliate"
          delta={pct(metrics.sales, metrics.prevSales)}
        />
        <Stat
          icon="coins"
          label="Total Komisi"
          value={money(metrics.commission)}
          sub={`Disetujui ${money(me.balance.approved)}`}
          delta={pct(metrics.commission, metrics.prevCommission)}
        />
      </div>

      <div className="split mt">
        <div className="card">
          <div className="ch">
            <div>
              <h3>Performa Affiliate</h3>
              <p>{periodLabel(period, range)}</p>
            </div>
            <Seg
              items={CHART_SERIES.map(([v, l]) => [v, l] as [string, string])}
              value={chart}
              onChange={setChart}
            />
          </div>
          <div className="cp">
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#F1F2F4" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111827",
                      border: 0,
                      borderRadius: 10,
                      color: "#fff",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#fff" }}
                    formatter={(value, name) => [
                      name === "clicks" ? num(Number(value)) : money(Number(value)),
                      name === "sales" ? "Penjualan" : name === "comm" ? "Komisi" : "Klik",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey={chart}
                    stroke="#111827"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <h3>Ringkasan Komisi</h3>
            <Link href="/affiliate/komisi" className="btn g sm">
              Semua
            </Link>
          </div>
          {(
            [
              ["menunggu", "clock", "Menunggu Validasi"],
              ["disetujui", "cc", "Komisi Disetujui"],
              ["dibayarkan", "cash", "Komisi Telah Dibayarkan"],
            ] as const
          ).map(([status, icon, label]) => {
            const g = commissionGroups[status];
            return (
              <div className="list-i" key={status}>
                <div className="aic">
                  <Icon name={icon} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="small muted b">{label}</div>
                  <div className="b dark" style={{ fontSize: 17 }}>
                    {money(g.value)}
                  </div>
                  <div className="small muted">{g.count} transaksi terkait</div>
                </div>
                <Link
                  href={`/affiliate/komisi?status=${encodeURIComponent(COMMISSION_STATUS_LABEL[status])}`}
                  className="btn s sm"
                >
                  Lihat Detail
                </Link>
              </div>
            );
          })}
          <div className="cp" style={{ paddingTop: 4 }}>
            <p className="small muted">Seluruh riwayat komisi (tidak dibatasi periode).</p>
          </div>
        </div>
      </div>

      <div className="mt">
        <div className="card cp">
          <div className="row between wrap">
            <h3 className="b dark">Aksi Cepat</h3>
          </div>
          <div className="grid g4 mt">
            <Link href="/affiliate/produk" className="qa">
              <div className="aic">
                <Icon name="bag" />
              </div>
              <div className="b dark">Cari Produk Affiliate</div>
              <div className="small muted">Temukan produk untuk dipromosikan</div>
            </Link>
            <Link href="/affiliate/tautan" className="qa">
              <div className="aic">
                <Icon name="link" />
              </div>
              <div className="b dark">Buat Tautan Affiliate</div>
              <div className="small muted">Buat tautan untuk kampanye baru</div>
            </Link>
            <Link href="/affiliate/komisi" className="qa">
              <div className="aic">
                <Icon name="coins" />
              </div>
              <div className="b dark">Lihat Komisi</div>
              <div className="small muted">Cek status dan rincian komisi</div>
            </Link>
            <Link href="/affiliate/penarikan" className="qa">
              <div className="aic">
                <Icon name="cash" />
              </div>
              <div className="b dark">Ajukan Penarikan</div>
              <div className="small muted">Tarik saldo komisi yang tersedia</div>
            </Link>
          </div>
        </div>
      </div>

      <div className="split mt">
        <div className="card">
          <div className="ch">
            <div>
              <h3>Produk dengan Performa Terbaik</h3>
              <p>{periodLabel(period, range)}</p>
            </div>
            <Link href="/affiliate/produk-saya" className="btn s sm">
              Lihat Semua Produk
            </Link>
          </div>
          {topProducts.length === 0 ? (
            <Empty
              icon="bag"
              title="Belum ada performa"
              text="Buat tautan referral untuk mulai mencatat klik & pesanan."
            />
          ) : (
            <Table
              columns={[
                { label: "Produk", render: (p) => <ProductCell name={p.key} /> },
                { label: "Klik", num: true, render: (p) => num(p.clicks) },
                { label: "Pesanan", num: true, render: (p) => num(p.orders) },
                {
                  label: "Komisi",
                  num: true,
                  render: (p) => <b className="dark">{money(p.commission)}</b>,
                },
              ]}
              rows={topProducts}
            />
          )}
        </div>

        <div className="card">
          <div className="ch">
            <h3>Aktivitas Terbaru</h3>
            <Link href="/affiliate/notifikasi" className="btn g sm">
              Lihat Semua Aktivitas
            </Link>
          </div>
          {activities.map((a, i) => (
            <div className="list-i" key={i}>
              <div className="aic">
                <Icon name={a.icon} className="sm" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="b dark small">{a.title}</div>
                <div
                  className="small muted"
                  style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {a.text}
                </div>
                <div className="small" style={{ color: "#9CA3AF", marginTop: 2 }}>
                  {a.date ? tgl(a.date) : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt">
        <div className="ch">
          <h3>Pesanan Terbaru</h3>
          <Link href="/affiliate/pesanan" className="btn s sm">
            Lihat Semua Pesanan
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <Empty
            icon="receipt"
            title="Belum ada pesanan"
            text="Pesanan dari tautan referral kamu akan muncul di sini."
          />
        ) : (
          <Table
            columns={[
              {
                label: "No. Pesanan",
                render: (o) => (
                  <Link
                    href="/affiliate/pesanan"
                    className="b"
                    style={{ color: "var(--af-pri)", background: "none", border: 0, padding: 0 }}
                  >
                    {o.orderNumber}
                  </Link>
                ),
              },
              { label: "Tanggal", render: (o) => tgl(o.createdAt) },
              {
                label: "Produk",
                render: (o) => (
                  <ProductCell
                    name={o.items[0]?.productName || "-"}
                    image={o.items[0]?.productImage}
                    size={34}
                  />
                ),
              },
              { label: "Nilai Pesanan", num: true, render: (o) => money(o.subtotal) },
              {
                label: "Estimasi Komisi",
                num: true,
                render: (o) => (
                  <b
                    className="dark"
                    style={
                      o.commission?.status === "ditolak"
                        ? { textDecoration: "line-through", color: "#9CA3AF" }
                        : undefined
                    }
                  >
                    {money(o.commission?.amount || 0)}
                  </b>
                ),
              },
              { label: "Status Pesanan", render: (o) => <Badge label={ORDER_STATUS_LABEL[o.status] || o.status} /> },
            ]}
            rows={recentOrders}
          />
        )}
      </div>
    </div>
  );
}
