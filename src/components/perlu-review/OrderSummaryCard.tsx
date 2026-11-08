"use client";

import { Shirt } from "lucide-react";
import { money, productName, totalDraft, type Draft } from "./draft-format";

const sectionLabel = "text-[10px] font-bold uppercase tracking-[0.12em]";
const chip = "rounded-full px-2 py-0.5 text-[10px] font-bold";

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
      <p className={sectionLabel} style={{ color: "#8A8880" }}>Informasi Produk</p>
      <div className="mt-3 divide-y" style={{ borderColor: "#F0EEE9" }}>
        {items.map((item: any, index: number) => {
          const qty = Number(item?.quantity) || 1;
          const size = String(item?.size || "").trim();
          const series = String(item?.series || "").trim();
          const kain = String(item?.kain || "").trim();
          return (
            <div
              key={`${item?.product_id || "item"}-${index}`}
              className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <div
                  className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                  style={{ background: "#f5f1ee", color: "#b9a99c" }}
                >
                  {item?.image ? (
                    <img src={String(item.image)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Shirt size={20} strokeWidth={1.5} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold leading-snug" style={{ color: "#141414" }}>
                    {productName(item)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {kain ? (
                      <span className={chip} style={{ background: "#e8f3fb", color: "#2f6f9e" }}>{kain}</span>
                    ) : null}
                    {series ? (
                      <span className={chip} style={{ background: "#eef1f4", color: "#5b6f7c" }}>{series}</span>
                    ) : null}
                    <span className={chip} style={{ background: "#f2f4f6", color: "#62717c" }}>
                      {[size, `${qty} pcs`].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </div>
              </div>
              <p className="shrink-0 text-[12px] font-black tabular-nums" style={{ color: "#141414" }}>
                {money((Number(item?.price) || 0) * qty)}
              </p>
            </div>
          );
        })}
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
