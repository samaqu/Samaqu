"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { resellerApi, type OrderListRow } from "@/lib/reseller/client";
import { orderStatus, rupiah, tglJamID } from "@/lib/reseller/format";
import { EmptyState, Note, SkeletonRows, StatusBadge } from "./ui";

const STATUS_TABS: { key: string; label: string; match: string[] }[] = [
  { key: "semua", label: "Semua", match: [] },
  { key: "pending", label: "Menunggu konfirmasi", match: ["pending"] },
  { key: "diproses", label: "Diproses", match: ["diproses"] },
  { key: "dikirim", label: "Dikirim", match: ["dikirim"] },
  { key: "selesai", label: "Selesai", match: ["selesai"] },
  { key: "dibatalkan", label: "Dibatalkan", match: ["dibatalkan"] },
];

/** Daftar pesanan reseller: filter status + cari nomor/nama customer. */
export default function PesananPanel() {
  const [rows, setRows] = useState<OrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("semua");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await resellerApi.orders({ page: 1, pageSize: 50 });
      setRows(res.rows);
    } catch {
      setError("Gagal memuat pesanan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const active = STATUS_TABS.find((t) => t.key === tab);
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (active && active.match.length > 0 && !active.match.includes(row.status)) return false;
      if (!needle) return true;
      return (
        row.order_number.toLowerCase().includes(needle) ||
        String(row.customer_name || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, tab, query]);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-b stack" style={{ gap: 12 }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 12, color: "var(--rs-mut)" }} />
            <input
              className="in"
              style={{ paddingLeft: 34 }}
              placeholder="Cari nomor pesanan atau nama customer…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="tabs">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`tab ${tab === t.key ? "on" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
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
        <div className="card-b" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {loading ? (
            <SkeletonRows rows={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              text="Belum ada pesanan. Mulai dari menu Buat Pesanan."
              action={
                <Link className="btn sm" href="/reseller/pesanan/baru">
                  Buat Pesanan
                </Link>
              }
            />
          ) : (
            filtered.map((order) => {
              const status = orderStatus(order.status);
              return (
                <Link
                  className="list-row"
                  key={order.id}
                  href={`/reseller/pesanan/${encodeURIComponent(order.order_number)}`}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{order.order_number}</div>
                    <div className="s">
                      {order.customer_name || "—"}
                      {order.shipping_city ? ` · ${order.shipping_city}` : ""}
                    </div>
                    <div className="s">{tglJamID(order.created_at)}</div>
                  </div>
                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                    <StatusBadge status={status} />
                    <span className="small bold">{rupiah(order.total)}</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
