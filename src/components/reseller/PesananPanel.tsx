"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { resellerApi, type OrderListRow } from "@/lib/reseller/client";
import { rupiah, tglJamID } from "@/lib/reseller/format";
import {
  ORDER_STAGE_TABS_VISIBLE,
  SHIPPING_STATUS_LABEL,
  matchesStage,
  orderStage,
  shippingStatusOf,
  type OrderStageFilter,
} from "@/lib/order-flow";
import OrderStagePill from "./OrderStagePill";
import { EmptyState, Note, SkeletonRows } from "./ui";

function wibDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

function monthNow(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
}

function productLine(order: OrderListRow): { title: string; detail: string; extra: number } {
  const first = order.order_items?.[0];
  if (!first) return { title: "—", detail: "", extra: 0 };
  const detail = [
    first.kain ? `Kain ${first.kain}` : null,
    first.series,
    first.size,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    title: first.product_name,
    detail: `${detail}${detail ? " · " : ""}× ${first.quantity}`,
    extra: Math.max(0, (order.order_items?.length || 0) - 1),
  };
}

function StagePill({ stageKey }: { stageKey: ReturnType<typeof orderStage> }) {
  return <OrderStagePill stage={stageKey} />;
}

/** Daftar pesanan reseller — tabel desktop, kartu mobile; tahap sama dengan Transaksi admin. */
export default function PesananPanel() {
  const router = useRouter();
  const [rows, setRows] = useState<OrderListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query).trim().toLowerCase();
  const [month, setMonth] = useState(monthNow());
  const [date, setDate] = useState("");
  const [stage, setStage] = useState<OrderStageFilter>("semua");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await resellerApi.orders({ page: 1, pageSize: 200, month });
      setRows(res.rows);
      setTotal(res.total);
    } catch {
      setError("Gagal memuat pesanan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const stageTabs = useMemo(
    () =>
      ORDER_STAGE_TABS_VISIBLE.map((tab) => ({
        ...tab,
        count:
          tab.key === "semua" ? rows.length : rows.filter((row) => matchesStage(row, tab.key)).length,
      })),
    [rows]
  );

  const filtered = useMemo(() => {
    const phone = search.replace(/\D/g, "");
    return rows.filter((row) => {
      if (!matchesStage(row, stage)) return false;
      if (date && wibDate(row.created_at) !== date) return false;
      if (!search) return true;
      if (String(row.order_number || "").toLowerCase().includes(search)) return true;
      if (String(row.customer_name || "").toLowerCase().includes(search)) return true;
      if (String(row.customer_whatsapp || "").includes(search)) return true;
      return phone.length >= 4 && String(row.customer_whatsapp || "").replace(/\D/g, "").includes(phone);
    });
  }, [rows, search, stage, date]);

  const resetFilters = () => {
    setQuery("");
    setDate("");
    setStage("semua");
    setMonth(monthNow());
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card">
        <div className="card-b stack" style={{ gap: 10 }}>
          <div className="orders-filters">
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <Search size={15} style={{ position: "absolute", left: 12, top: 14, color: "var(--rs-mut)" }} />
              <input
                className="in"
                style={{ paddingLeft: 34 }}
                placeholder="Cari nomor pesanan, nama, atau nomor HP…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <input
              className="in"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || monthNow())}
              aria-label="Filter bulan"
              style={{ maxWidth: 170 }}
            />
            <input
              className="in"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Filter tanggal"
              style={{ maxWidth: 160 }}
            />
            {query || date || stage !== "semua" ? (
              <button type="button" className="btn ghost sm" onClick={resetFilters}>
                Reset
              </button>
            ) : null}
          </div>

          <div className="order-tabs">
            {stageTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`order-tab ${stage === tab.key ? "on" : ""}`}
                onClick={() => setStage(tab.key)}
              >
                {tab.label}
                <span>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <Note tone="err">
          {error}{" "}
          <button className="btn ghost sm" type="button" onClick={load} style={{ marginLeft: 8 }}>
            Coba lagi
          </button>
        </Note>
      ) : null}

      <div className="card">
        {loading ? (
          <div className="card-b">
            <SkeletonRows rows={6} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-b">
            <EmptyState
              text="Belum ada pesanan pada filter ini."
              action={
                <Link className="btn sm" href="/reseller/pesanan/baru">
                  Buat Pesanan
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <div className="orders-table-wrap">
              <table className="orders-table">
                <colgroup>
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "15%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>No. Pesanan</th>
                    <th>Pelanggan</th>
                    <th>Produk</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th>No. Resi</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => {
                    const product = productLine(order);
                    const shipStatus = shippingStatusOf(order);
                    const href = `/reseller/pesanan/${encodeURIComponent(order.order_number)}`;
                    return (
                      <tr key={order.id} onClick={() => router.push(href)}>
                        <td data-label="No. Pesanan">
                          <span className="oid">{order.order_number}</span>
                          <small>{tglJamID(order.created_at)}</small>
                        </td>
                        <td data-label="Pelanggan">
                          <b>{order.customer_name || "—"}</b>
                          <small>{order.customer_whatsapp || "—"}</small>
                        </td>
                        <td data-label="Produk">
                          <span className="oprod">{product.title}</span>
                          <small>
                            {product.detail}
                            {product.extra > 0 ? ` · +${product.extra} lainnya` : ""}
                          </small>
                        </td>
                        <td data-label="Total" style={{ textAlign: "right" }}>
                          <b>{rupiah(order.total)}</b>
                        </td>
                        <td data-label="No. Resi">
                          {order.awb_no ? <span className="oresi">{order.awb_no}</span> : <span className="muted">–</span>}
                          {shipStatus ? <small>{SHIPPING_STATUS_LABEL[shipStatus]}</small> : null}
                        </td>
                        <td data-label="Status">
                          <StagePill stageKey={orderStage(order)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="orders-cards">
              {filtered.map((order) => {
                const product = productLine(order);
                return (
                  <Link
                    className="order-card"
                    key={order.id}
                    href={`/reseller/pesanan/${encodeURIComponent(order.order_number)}`}
                  >
                    <div className="oc-top">
                      <div>
                        <div className="oc-id">{order.order_number}</div>
                        <div className="small muted">{tglJamID(order.created_at)}</div>
                      </div>
                      <StagePill stageKey={orderStage(order)} />
                    </div>
                    <div className="oc-cust">{order.customer_name || "—"}</div>
                    <div className="small muted">
                      {product.title}
                      {product.detail ? ` · ${product.detail}` : ""}
                      {product.extra > 0 ? ` · +${product.extra} lainnya` : ""}
                    </div>
                    <div className="oc-bottom">
                      <b>{rupiah(order.total)}</b>
                      <span className="small muted">{order.awb_no ? `Resi ${order.awb_no}` : "Belum ada resi"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {total > rows.length ? (
              <p className="hint" style={{ padding: "10px 16px" }}>
                Menampilkan {rows.length} dari {total} pesanan bulan ini.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
