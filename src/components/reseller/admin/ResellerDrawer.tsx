"use client";

import { useEffect, useState } from "react";
import { opsResellerApi, type ResellerAdminRow, type ResellerDetail } from "./api";
import { ledgerTypeLabel, rupiah, tglJamID } from "@/lib/reseller/format";
import { Modal } from "./Modal";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-emerald-100 text-emerald-700" },
  suspended: { label: "Nonaktif", cls: "bg-amber-100 text-amber-700" },
  rejected: { label: "Ditolak", cls: "bg-red-100 text-red-700" },
  pending: { label: "Menunggu", cls: "bg-slate-100 text-slate-600" },
};

/** Drawer detail reseller: profil, saldo, mutasi terakhir, pesanan terakhir. */
export default function ResellerDrawer({
  row,
  onClose,
}: {
  row: ResellerAdminRow;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ResellerDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    opsResellerApi
      .resellerDetail(row.id)
      .then((res) => alive && setDetail(res))
      .catch(() => alive && setError("Gagal memuat detail reseller."));
    return () => {
      alive = false;
    };
  }, [row.id]);

  const badge = STATUS_LABEL[detail?.reseller.status || row.status] || STATUS_LABEL.pending;

  return (
    <Modal title={`Detail reseller — ${row.store_name}`} onClose={onClose} width={620}>
      {error ? <p className="text-sm text-red-600 font-semibold">{error}</p> : null}
      {!detail && !error ? <p className="text-sm text-slate-400">Memuat…</p> : null}

      {detail ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-extrabold text-slate-900">{detail.reseller.store_name}</p>
              <p className="text-[12px] text-slate-500">
                {detail.reseller.owner_name} · {detail.reseller.whatsapp || "—"}
              </p>
              <p className="text-[12px] text-slate-500">{detail.reseller.city || "—"}</p>
            </div>
            <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold ${badge.cls}`}>{badge.label}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Saldo</p>
              <p className="font-extrabold text-slate-900 text-[15px]">{rupiah(detail.saldo.saldo_tersedia)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Ditahan</p>
              <p className="font-extrabold text-slate-900 text-[15px]">{rupiah(detail.saldo.saldo_ditahan)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total</p>
              <p className="font-extrabold text-slate-900 text-[15px]">{rupiah(detail.saldo.saldo_total)}</p>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">Mutasi terakhir</p>
            {detail.ledger.length === 0 ? (
              <p className="text-[12px] text-slate-400">Belum ada mutasi saldo.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.ledger.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3 py-2">
                    <div>
                      <p className="text-[12px] font-bold text-slate-800">{ledgerTypeLabel(item.type)}</p>
                      <p className="text-[11px] text-slate-500">{item.note || "—"} · {tglJamID(item.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[12px] font-extrabold ${item.amount >= 0 ? "text-emerald-600" : "text-slate-900"}`}>
                        {item.amount >= 0 ? "+" : "−"}
                        {rupiah(Math.abs(item.amount))}
                      </p>
                      <p className="text-[11px] text-slate-500">saldo {rupiah(item.balance_after)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">Pesanan terakhir</p>
            {detail.orders.length === 0 ? (
              <p className="text-[12px] text-slate-400">Belum ada pesanan.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.orders.map((order) => (
                  <div key={order.id} className="flex justify-between gap-3 py-2">
                    <div>
                      <p className="text-[12px] font-bold text-slate-800">{order.order_number}</p>
                      <p className="text-[11px] text-slate-500">
                        {order.customer_name || "—"} · {tglJamID(order.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] font-extrabold text-slate-900">{rupiah(order.total)}</p>
                      <p className="text-[11px] text-slate-500">{order.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-[12px] text-slate-600">
            <b>Rekening:</b> {detail.reseller.bank_name || "—"} {detail.reseller.bank_number || ""}{" "}
            {detail.reseller.bank_holder ? `a.n. ${detail.reseller.bank_holder}` : ""}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
