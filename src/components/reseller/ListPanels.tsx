"use client";

import Link from "next/link";
import { ledgerTypeLabel, rupiah, tglJamID } from "@/lib/reseller/format";
import type { LedgerRow, OrderListRow } from "@/lib/reseller/client";
import { orderStatus } from "@/lib/reseller/format";
import { EmptyState, SkeletonRows, StatusBadge } from "./ui";

/** Baris mutasi saldo: label jenis, catatan/referensi, nominal +/−, saldo akhir. */
export function MutasiList({ rows, loading }: { rows: LedgerRow[]; loading?: boolean }) {
  if (loading) return <SkeletonRows rows={4} />;
  if (rows.length === 0) return <EmptyState text="Belum ada mutasi saldo." />;

  return (
    <div>
      {rows.map((row) => (
        <div className="list-row" key={row.id}>
          <div style={{ minWidth: 0 }}>
            <div className="t">{ledgerTypeLabel(row.type)}</div>
            <div className="s">
              {row.note || row.reference || "—"} · {tglJamID(row.created_at)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className={`amount ${row.amount >= 0 ? "pos" : "neg"}`}>
              {row.amount >= 0 ? "+" : "−"}
              {rupiah(Math.abs(row.amount))}
            </div>
            <div className="s">Saldo {rupiah(row.balance_after)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Daftar pesanan ringkas (dashboard & halaman pesanan memakai komponen ini). */
export function PesananList({ rows, loading }: { rows: OrderListRow[]; loading?: boolean }) {
  if (loading) return <SkeletonRows rows={3} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        text="Belum ada pesanan. Mulai dari menu Buat Pesanan."
        action={
          <Link className="btn sm" href="/reseller/pesanan/baru">
            Buat Pesanan
          </Link>
        }
      />
    );
  }

  return (
    <div>
      {rows.map((order) => {
        const status = orderStatus(order.status);
        return (
          <Link className="list-row" key={order.id} href={`/reseller/pesanan/${encodeURIComponent(order.order_number)}`}>
            <div style={{ minWidth: 0 }}>
              <div className="t">{order.order_number}</div>
              <div className="s">
                {order.customer_name || "—"} · {tglJamID(order.created_at)}
              </div>
            </div>
            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
              <StatusBadge status={status} />
              <span className="small bold">{rupiah(order.total)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
