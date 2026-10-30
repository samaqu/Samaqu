"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/affiliate/icons";
import {
  Badge,
  Empty,
  Pager,
  ProductCell,
  Search,
  Select,
  Table,
  Tabs,
  paginate,
  useModal,
} from "@/components/affiliate/ui";
import { affiliateFetch } from "@/lib/affiliate/client";
import {
  COMMISSION_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  jam,
  money,
  num,
  tgl,
} from "@/lib/affiliate/format";

/**
 * Pesanan teratribusi — mengikuti mockup (tab status + filter + tabel + modal detail).
 * Data pelanggan disamarkan (nama & kota) sesuai ketentuan portal.
 */

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  subtotal: number;
  shippingCost: number;
  createdAt: string;
  referralCode: string | null;
  attributedAt: string | null;
  customer: string;
  city: string;
  items: {
    productId: string | null;
    productName: string | null;
    productImage: string | null;
    color: string | null;
    size: string | null;
    series: string | null;
    quantity: number;
    price: number;
  }[];
  commission: {
    id: string;
    amount: number;
    baseAmount: number;
    rate: number;
    status: string;
    reason: string | null;
    breakdown: { productId: string; price: number; quantity: number; rate: number; amount: number }[];
  } | null;
}

interface CommissionEvent {
  commission_id: string;
  from_status: string | null;
  to_status: string | null;
  amount: number | null;
  note: string | null;
  created_at: string;
}

const ORDER_STATUSES = ["pending", "diproses", "dikirim", "selesai", "dibatalkan"];

function exportCsv(rows: OrderRow[]) {
  const head = [
    "Nomor Pesanan",
    "Tanggal",
    "Produk",
    "Jumlah",
    "Nilai Pesanan",
    "Komisi",
    "Status Pesanan",
    "Status Komisi",
  ];
  const body = rows.map((o) => [
    o.orderNumber,
    tgl(o.createdAt),
    o.items.map((i) => i.productName).join("; "),
    o.items.reduce((s, i) => s + i.quantity, 0),
    o.subtotal,
    o.commission?.amount ?? 0,
    ORDER_STATUS_LABEL[o.status] || o.status,
    o.commission ? COMMISSION_STATUS_LABEL[o.commission.status] || o.commission.status : "-",
  ]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [head.map(esc).join(","), ...body.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pesanan-affiliate.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AffiliateOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [events, setEvents] = useState<CommissionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [st, setSt] = useState("");
  const [cs, setCs] = useState("");
  const [page, setPage] = useState(1);
  const { open, close } = useModal();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [orderJson, commissionJson] = await Promise.all([
          affiliateFetch<{ orders: OrderRow[] }>("/api/affiliate/orders"),
          affiliateFetch<{ events: CommissionEvent[] }>("/api/affiliate/commissions"),
        ]);
        if (!alive) return;
        setOrders(orderJson.orders || []);
        setEvents(commissionJson.events || []);
      } catch (e) {
        console.error("[AFFILIATE] Gagal memuat pesanan:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": orders.length };
    for (const s of ORDER_STATUSES) c[s] = orders.filter((o) => o.status === s).length;
    return c;
  }, [orders]);

  const list = useMemo(
    () =>
      orders.filter((o) => {
        if (tab && o.status !== tab) return false;
        if (st && o.status !== st) return false;
        if (cs && o.commission?.status !== cs) return false;
        if (q && !o.orderNumber.toLowerCase().includes(q.toLowerCase())) return false;
        const day = o.createdAt.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      }),
    [orders, tab, st, cs, q, from, to],
  );

  const pg = paginate(list, page, 10);

  const showDetail = (order: OrderRow) => {
    const history = order.commission
      ? events.filter((e) => e.commission_id === order.commission?.id)
      : [];
    open({
      size: "lg",
      title: `Detail Pesanan ${order.orderNumber}`,
      body: (
        <div className="grid g2">
          <div>
            <div className="row wrap" style={{ marginBottom: 14 }}>
              <Badge label={ORDER_STATUS_LABEL[order.status] || order.status} />
              {order.commission ? (
                <Badge
                  label={
                    COMMISSION_STATUS_LABEL[order.commission.status] || order.commission.status
                  }
                />
              ) : null}
            </div>

            <div className="kv box">
              <dt>Nomor pesanan</dt>
              <dd>{order.orderNumber}</dd>
              <dt>Tanggal</dt>
              <dd>{jam(order.createdAt)}</dd>
              <dt>Pembeli</dt>
              <dd>
                {order.customer} · {order.city || "-"}
              </dd>
              <dt>Kode referral</dt>
              <dd>{order.referralCode || "-"}</dd>
              <dt>Waktu atribusi</dt>
              <dd>{order.attributedAt ? jam(order.attributedAt) : "-"}</dd>
              <dt>Status pemenuhan</dt>
              <dd>{ORDER_STATUS_LABEL[order.status] || order.status}</dd>
            </div>

            <h4 className="b dark mt" style={{ marginBottom: 8 }}>
              Daftar Produk
            </h4>
            {order.items.map((it, i) => (
              <div className="row between box" style={{ marginBottom: 8 }} key={i}>
                <ProductCell
                  name={it.productName || "-"}
                  image={it.productImage}
                  size={40}
                />
                <div style={{ textAlign: "right" }} className="small">
                  <div>
                    {it.quantity} × {money(it.price)}
                  </div>
                  <div className="muted">
                    {it.size ? `Ukuran ${it.size}` : ""}
                    {it.color && it.color !== "default" ? ` · ${it.color}` : ""}
                  </div>
                  <b className="dark">{money(it.quantity * it.price)}</b>
                </div>
              </div>
            ))}

            <div className="kv" style={{ padding: "4px 2px" }}>
              <dt>Subtotal produk</dt>
              <dd>{money(order.subtotal)}</dd>
              <dt>Ongkos kirim (tidak dikomisikan)</dt>
              <dd>{money(order.shippingCost)}</dd>
              <dt className="b dark">Total pesanan</dt>
              <dd>{money(order.total)}</dd>
            </div>
          </div>

          <div>
            <div className="box">
              <div className="b dark" style={{ marginBottom: 10 }}>
                Perhitungan Komisi
              </div>
              {order.commission?.breakdown?.length ? (
                order.commission.breakdown.map((b, i) => (
                  <div className="row between small" style={{ marginBottom: 6 }} key={i}>
                    <span className="muted">
                      {money(b.price * b.quantity)} × {b.rate}%
                    </span>
                    <b>{money(b.amount)}</b>
                  </div>
                ))
              ) : (
                <p className="small muted">Belum ada rincian komisi.</p>
              )}
              <div
                className="row between"
                style={{ borderTop: "1px solid var(--af-bd)", paddingTop: 8, marginTop: 6 }}
              >
                <b>Nilai komisi</b>
                <b style={{ color: "var(--af-pri)" }}>{money(order.commission?.amount || 0)}</b>
              </div>
            </div>

            {order.commission?.reason ? (
              <div
                className="note mt"
                style={{ background: "var(--af-errbg)", color: "var(--af-err)", borderColor: "#FECACA" }}
              >
                <Icon name="alert" className="sm" />
                <span>
                  <b>Catatan komisi:</b> {order.commission.reason}
                </span>
              </div>
            ) : null}

            <h4 className="b dark mt" style={{ marginBottom: 10 }}>
              Riwayat Perubahan Komisi
            </h4>
            {history.length === 0 ? (
              <p className="small muted">Belum ada riwayat perubahan komisi.</p>
            ) : (
              <ul className="tl">
                {history.map((h, i) => (
                  <li key={i}>
                    <div className="small b dark">
                      {h.from_status || "baru"} → {h.to_status || "-"}
                      {h.amount ? ` · ${money(h.amount)}` : ""}
                    </div>
                    {h.note ? <div className="small muted">{h.note}</div> : null}
                    <div className="small muted">{jam(h.created_at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ),
      foot: (
        <button className="btn p" onClick={close} type="button">
          Tutup
        </button>
      ),
    });
  };

  return (
    <div className="card">
      <div className="ch">
        <div>
          <h3>Pesanan Teratribusi</h3>
          <p>Data pembeli disamarkan.</p>
        </div>
        <button className="btn s sm" onClick={() => exportCsv(list)} type="button">
          <Icon name="download" className="sm" />
          Ekspor CSV
        </button>
      </div>

      <div style={{ padding: "0 16px" }}>
        <Tabs
          items={[
            ["", "Semua Pesanan", counts[""] || 0],
            ...ORDER_STATUSES.map((s) => [s, ORDER_STATUS_LABEL[s] || s, counts[s] || 0] as [string, string, number]),
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
        />
      </div>

      <div className="filters">
        <Search
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Cari nomor pesanan…"
        />
        <input
          type="date"
          className="inp"
          style={{ width: "auto" }}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          title="Dari tanggal"
        />
        <span className="muted small">s.d.</span>
        <input
          type="date"
          className="inp"
          style={{ width: "auto" }}
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          title="Sampai tanggal"
        />
        <Select
          value={st}
          onChange={(v) => {
            setSt(v);
            setPage(1);
          }}
          options={[
            ["", "Semua Status Pesanan"],
            ...ORDER_STATUSES.map((s) => [s, ORDER_STATUS_LABEL[s] || s] as [string, string]),
          ]}
        />
        <Select
          value={cs}
          onChange={(v) => {
            setCs(v);
            setPage(1);
          }}
          options={[
            ["", "Semua Status Komisi"],
            ["menunggu", "Menunggu Validasi"],
            ["disetujui", "Disetujui"],
            ["dibayarkan", "Dibayarkan"],
            ["ditolak", "Tidak Disetujui"],
          ]}
        />
        {q || from || to || st || cs ? (
          <button
            className="btn g sm"
            onClick={() => {
              setQ("");
              setFrom("");
              setTo("");
              setSt("");
              setCs("");
              setPage(1);
            }}
            type="button"
          >
            Reset
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="cp muted small">Memuat pesanan…</div>
      ) : pg.total === 0 ? (
        <Empty icon="receipt" title="Pesanan tidak ditemukan" text="Belum ada pesanan yang teratribusi referral." />
      ) : (
        <>
          <Table
            columns={[
              {
                label: "No. Pesanan",
                render: (o) => (
                  <button
                    className="b"
                    style={{ border: 0, background: "none", color: "var(--af-pri)", cursor: "pointer", padding: 0 }}
                    onClick={() => showDetail(o)}
                    type="button"
                  >
                    {o.orderNumber}
                  </button>
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
              {
                label: "Jumlah",
                num: true,
                render: (o) => num(o.items.reduce((s, i) => s + i.quantity, 0)),
              },
              { label: "Nilai Pesanan", num: true, render: (o) => money(o.subtotal) },
              {
                label: "Komisi",
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
              {
                label: "Status Komisi",
                render: (o) =>
                  o.commission ? (
                    <Badge label={COMMISSION_STATUS_LABEL[o.commission.status] || o.commission.status} />
                  ) : (
                    "-"
                  ),
              },
              {
                label: "Aksi",
                render: (o) => (
                  <button className="btn s sm" onClick={() => showDetail(o)} type="button">
                    Detail
                  </button>
                ),
              },
            ]}
            rows={pg.rows}
          />
          <Pager page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onPage={setPage} />
        </>
      )}
    </div>
  );
}
