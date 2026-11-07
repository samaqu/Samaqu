"use client";

import { addressText, phone, type Draft } from "./draft-format";

const sectionLabel = "text-[10px] font-bold uppercase tracking-[0.12em]";

export default function RecipientCard({ draft }: { draft: Draft }) {
  const shipping = draft.payload?.shipping || {};
  const address = addressText(shipping);
  const copyValue = addressText(shipping, draft.customer_name, draft.customer_whatsapp);
  const region = [shipping.kecamatan, shipping.city, shipping.province, shipping.postal_code]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-[0_1px_3px_rgba(20,20,20,0.04)]" style={{ borderColor: "#E7E6E1" }}>
      <div className="flex items-start justify-between gap-3">
        <p className={sectionLabel} style={{ color: "#8A8880" }}>Penerima & alamat</p>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(copyValue)}
          className="shrink-0 text-[11px] font-bold underline underline-offset-2"
          style={{ color: "#1F7A4D" }}
        >
          Salin semua
        </button>
      </div>
      <p className="mt-3 text-sm font-black" style={{ color: "#141414" }}>{draft.customer_name || "Tanpa nama"}</p>
      <p className="mt-0.5 text-xs" style={{ color: "#6B6A64" }}>{phone(draft.customer_whatsapp)}</p>
      <div className="my-3 border-t" style={{ borderColor: "#F0EEE9" }} />
      <p className="text-xs leading-relaxed" style={{ color: "#141414" }}>{address || "Alamat belum tersedia."}</p>
      {region ? <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "#6B6A64" }}>{region}</p> : null}
      {draft.payload?.shipping_method ? (
        <span className="mt-3 inline-flex rounded-md px-2 py-1 text-[10px] font-bold" style={{ background: "#F1F5F7", color: "#4E6472" }}>
          {draft.payload.shipping_method}
        </span>
      ) : null}
    </section>
  );
}
