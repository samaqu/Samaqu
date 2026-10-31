"use client";

/**
 * Langkah 5 — review pesanan: item, ongkir J&T, catatan untuk admin, lalu submit ke /api/open-order.
 */

import { cloudinaryUrl } from "@/lib/cloudinary";
import { money } from "@/lib/open-order-catalog";
import { OPEN_ORDER_ADDON } from "@/lib/open-order-config";
import { normalizeMethodType, paymentMethodLabel, type PaymentMethodRow } from "@/lib/payment-methods";
import { useSafeTranslations } from "@/lib/safe-i18n";
import { PaymentIcon } from "@/lib/payment-icons";
import type { OpenOrderProduct } from "@/lib/open-order-offering";
import type { CartLine, DraftShipping } from "@/components/open-order/types";
import { lineColorLabel, lineImage, lineName } from "./PromoStepCart";
import { DANGER, Field, FIELD_BG, LINE, MUTED, PrimaryButton, SummaryRow, TextArea } from "@/components/open-order/ui";

export default function PromoStepReview({
  lines,
  products,
  subtotal,
  totalWeight,
  extraCover,
  shipping,
  loadingOngkir,
  ongkirError,
  notes,
  onNotes,
  paymentMethods,
  selectedPayment,
  onSelectPayment,
  onSubmit,
  submitting,
  error,
}: {
  lines: CartLine[];
  products: OpenOrderProduct[];
  subtotal: number;
  /** Berat kirim total (gram, apa adanya — tanpa pembulatan). */
  totalWeight: number;
  extraCover: boolean;
  shipping: DraftShipping | null;
  loadingOngkir: boolean;
  ongkirError: boolean;
  notes: string;
  onNotes: (value: string) => void;
  /** Metode pembayaran dari dashboard admin (tabel `payment_methods`). */
  paymentMethods: PaymentMethodRow[];
  selectedPayment: string;
  onSelectPayment: (id: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string;
}) {
  const t = useSafeTranslations("openOrder");
  const addonTotal = extraCover ? OPEN_ORDER_ADDON.price : 0;
  const ongkir = shipping?.cost ?? 0;
  const total = subtotal + addonTotal + ongkir;

  return (
    <div>
      {/* Item */}
      <div className="space-y-3">
        {lines.map((line) => {
          const image = lineImage(line, products);
          return (
            <div key={line.key} className="flex items-center gap-3.5 rounded-2xl px-4 py-3.5" style={{ border: `1px solid ${LINE}`, background: FIELD_BG }}>
              <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg" style={{ background: "#e5e5e5" }}>
                {image && (
                  <img src={cloudinaryUrl(image, { width: 200 })} alt={lineName(line, products)} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{lineName(line, products)}</p>
                <p className="mt-0.5 text-[11.5px]" style={{ color: MUTED }}>
                  {[lineColorLabel(line, products), line.size, line.series ? `Series ${line.series}` : ""].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11.5px]" style={{ color: MUTED }}>
                  x{line.quantity}
                </p>
                <p className="text-[13px] font-semibold tabular-nums">{money(line.price * line.quantity)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ringkasan */}
      <div className="mt-6 space-y-2.5 rounded-2xl p-5" style={{ background: FIELD_BG, border: "1px solid rgba(0,0,0,.25)" }}>
        <SummaryRow label="Subtotal" value={money(subtotal)} />
        {extraCover && <SummaryRow label={OPEN_ORDER_ADDON.name} value={money(addonTotal)} />}
        <SummaryRow
          label={shipping ? `Ongkir (J&T — ${shipping.service})` : "Ongkir"}
          value={loadingOngkir ? "Menghitung…" : shipping ? money(ongkir) : "—"}
        />
        <SummaryRow
          label="Total berat"
          value={`${totalWeight.toLocaleString("id-ID")} g (${(totalWeight / 1000).toLocaleString("id-ID", { maximumFractionDigits: 3 })} kg)`}
        />
        {ongkirError && (
          <p className="text-[11px] leading-relaxed" style={{ color: MUTED }}>
            Ongkir otomatis belum tersedia — admin akan menghitung dan mengabari kamu.
          </p>
        )}
        <div className="pt-2.5" style={{ borderTop: `1px solid ${LINE}` }}>
          <SummaryRow label="Total" value={money(total)} strong />
        </div>
      </div>

      {/* Metode pembayaran — datanya dari dashboard admin (Pengaturan → Metode Pembayaran). */}
      <div className="mt-6">
        <p className="text-[11px] sm:text-[12px] tracking-[0.12em] uppercase font-ui font-medium mb-3" style={{ color: "var(--espresso)" }}>
          Metode Pembayaran
        </p>
        {paymentMethods.length === 0 ? (
          <p className="text-[12px]" style={{ color: MUTED }}>
            Metode pembayaran belum tersedia — admin akan menghubungi kamu lewat WhatsApp.
          </p>
        ) : (
          <div className="space-y-2">
            {paymentMethods.map((method) => {
              const type = normalizeMethodType(method.method_type);
              const active = selectedPayment === method.id;
              const note = (type === "bank" || type === "ewallet") && method.account_name ? `a.n. ${method.account_name}` : null;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => onSelectPayment(method.id)}
                  aria-pressed={active}
                  className="w-full flex items-center gap-3 rounded-xl p-4 text-left transition-all"
                  style={{ border: `1.5px solid ${active ? "var(--gold)" : "rgba(0,0,0,.25)"}`, background: active ? "white" : "transparent" }}
                >
                  <span className="relative w-4 h-4 rounded-full border-2 shrink-0" style={{ borderColor: active ? "var(--gold)" : MUTED }}>
                    {active && <span className="absolute inset-[3px] rounded-full" style={{ background: "var(--gold)" }} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-ui font-medium truncate" style={{ color: "var(--espresso)" }}>
                      {paymentMethodLabel(method)}
                    </span>
                    {note && <span className="block text-[11px] font-ui mt-0.5 truncate" style={{ color: MUTED }}>{note}</span>}
                  </span>
                  <PaymentIcon type={method.icon || method.method_type || undefined} size={22} style={{ color: MUTED }} />
                </button>
              );
            })}
          </div>
        )}
        {paymentMethods.length > 0 && !selectedPayment && (
          <p className="mt-2 text-[11.5px]" style={{ color: DANGER }}>
            Pilih metode pembayaran dulu ya.
          </p>
        )}
      </div>

      {/* Catatan */}
      <div className="mt-6">
        <Field label="Catatan untuk Admin">
          <TextArea
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            rows={3}
            placeholder={t("notesPlaceholder")}
          />
        </Field>
      </div>

      {error && (
        <p className="mt-4 text-[12px]" style={{ color: DANGER }}>
          {error}
        </p>
      )}

      <div className="mt-6">
        <PrimaryButton onClick={onSubmit} disabled={submitting || (paymentMethods.length > 0 && !selectedPayment)}>
          {submitting ? "Mengirim…" : "Submit Pesanan"}
        </PrimaryButton>
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
        Pesanan masuk sebagai menunggu konfirmasi admin. Admin akan menghubungi kamu lewat WhatsApp sebelum invoice
        diterbitkan.
      </p>
    </div>
  );
}
