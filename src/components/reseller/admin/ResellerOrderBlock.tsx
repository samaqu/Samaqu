"use client";

import { rupiah, shortfallStatus } from "@/lib/reseller/format";
import type { ReactNode } from "react";

/**
 * Blok kecil "Reseller" di drawer Detail Pesanan — HANYA dirender kalau
 * orders.reseller_id terisi (pemanggil yang memutuskan). Menampilkan nama
 * toko + WA, status kekurangan, dan harga beli vs harga jual per item.
 */
export default function ResellerOrderBlock({ order }: { order: Record<string, any> }): ReactNode {
  if (!order?.reseller_id) return null;

  const shortfall = Number(order.reseller_shortfall_amount) || 0;
  const status = shortfallStatus(String(order.reseller_shortfall_status || "none"));
  const items: Array<Record<string, any>> = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-0.5">Reseller</p>
      <p className="text-[13px] font-extrabold text-slate-900 leading-tight">{order.reseller_store_name || "—"}</p>
      <p className="text-[11px] text-slate-600">
        {order.reseller_whatsapp || "—"}
        {order.reseller_owner_name ? ` · ${order.reseller_owner_name}` : ""}
      </p>

      {shortfall > 0 || (order.reseller_shortfall_status && order.reseller_shortfall_status !== "none") ? (
        <p className="text-[11px] font-semibold text-amber-700 mt-1">
          Kekurangan {rupiah(shortfall)} · {status.label}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-2 pt-2 border-t border-emerald-200 space-y-1">
          {items.map((item, index) => {
            const buy = Number(item.reseller_buy_price ?? item.price) || 0;
            const sell = Number(item.reseller_sell_price) || 0;
            return (
              <div key={index} className="flex items-start justify-between gap-2 text-[11px]">
                <span className="text-slate-700 leading-snug">
                  {item.product_name}
                  {item.size ? ` · ${item.size}` : ""} × {item.quantity}
                </span>
                <span className="text-slate-700 font-semibold whitespace-nowrap">
                  beli {rupiah(buy)} → jual {rupiah(sell)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {order.show_reseller_name_on_label ? (
        <p className="text-[10px] text-emerald-700 mt-1.5">Nama toko tampil di label pengirim.</p>
      ) : null}
    </div>
  );
}
