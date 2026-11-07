"use client";

import { itemMeta, money, productName, totalDraft, type Draft } from "./draft-format";

const sectionLabel = "text-[10px] font-bold uppercase tracking-[0.12em]";

export default function OrderSummaryCard({ draft }: { draft: Draft }) {
  const payload = draft.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const subtotal = items.reduce(
    (sum: number, item: any) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0),
    0,
  );
  const shipping = Number(payload.shipping_cost) || 0;
  const discount = Number(payload.discount) || 0;
  const total = totalDraft(payload);

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-[0_1px_3px_rgba(20,20,20,0.04)] sm:p-5" style={{ borderColor: "#E7E6E1" }}>
      <p className={sectionLabel} style={{ color: "#8A8880" }}>Pesanan</p>
      <div className="mt-3 divide-y" style={{ borderColor: "#F0EEE9" }}>
        {items.map((item: any, index: number) => (
          <div key={`${item?.product_id || "item"}-${index}`} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-snug" style={{ color: "#141414" }}>{productName(item)}</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "#8A8880" }}>{itemMeta(item)}</p>
            </div>
            <p className="shrink-0 text-[12px] font-black tabular-nums" style={{ color: "#141414" }}>
              {money((Number(item?.price) || 0) * (Number(item?.quantity) || 1))}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5 border-t pt-3 text-[11px]" style={{ borderColor: "#F0EEE9", color: "#6B6A64" }}>
        <div className="flex justify-between gap-3"><span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
        <div className="flex justify-between gap-3">
          <span>Ongkir{payload.shipping_method ? ` ${payload.shipping_method}` : ""}</span>
          <span className="tabular-nums">{money(shipping)}</span>
        </div>
        {discount > 0 ? (
          <div className="flex justify-between gap-3"><span>Diskon</span><span className="tabular-nums">-{money(discount)}</span></div>
        ) : null}
        <div className="flex justify-between gap-3 border-t pt-2 text-[13px] font-black" style={{ borderColor: "#F0EEE9", color: "#1F7A4D" }}>
          <span>Total</span><span className="tabular-nums">{money(total)}</span>
        </div>
      </div>
    </section>
  );
}
