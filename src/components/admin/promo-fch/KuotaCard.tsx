"use client";

/**
 * Kartu "Kuota bonus".
 *
 * Admin hanya mengisi **Total kuota**. "Sisa" tidak bisa diketik lagi — ditampilkan
 * read-only dari nilai tersimpan (`promo_fch_quota_left`), karena kuota berkurang otomatis
 * setiap pesanan mendapat bonus (lihat `samaqu_consume_promo_quota`).
 */

import { Card, FieldLabel, HelperText, PROMO_COLORS, PromoInput, TEXT, TEXT_DIM, TEXT_MUTED } from "./primitives";

export function KuotaCard({
  quotaTotal,
  quotaLeft,
  quotaNote,
  onChange,
}: {
  quotaTotal: number;
  quotaLeft: number;
  quotaNote: string;
  onChange: (patch: { quotaTotal?: number; quotaNote?: string }) => void;
}) {
  const total = Math.max(0, quotaTotal);
  const left = Math.max(0, Math.min(total, quotaLeft));
  const used = Math.max(0, total - left);
  const pct = total > 0 ? Math.round((left / total) * 100) : 0;

  return (
    <Card title="Kuota bonus" description="Berapa Cover Hanger gratis yang disediakan program.">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="promo-quota-total">Total kuota</FieldLabel>
          <div className="relative">
            <PromoInput
              id="promo-quota-total"
              type="number"
              min={1}
              value={quotaTotal}
              onChange={(e) => onChange({ quotaTotal: Number(e.target.value) || 0 })}
              style={{ paddingRight: 48, fontVariantNumeric: "tabular-nums" }}
            />
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px]"
              style={{ color: TEXT_MUTED }}
            >
              pcs
            </span>
          </div>
          <HelperText>Jumlah total bonus yang disiapkan untuk program ini.</HelperText>
        </div>

        {/* Sisa bonus — read-only, bukan isian. */}
        <div>
          <FieldLabel>Sisa bonus</FieldLabel>
          <div
            className="flex flex-col justify-center rounded-[10px] px-3.5"
            style={{ minHeight: 44, background: "#F7F5F2", border: "1px solid #D9CFC1" }}
          >
            <p className="text-[12.5px]" style={{ color: TEXT }}>
              Terpakai <b className="tabular-nums">{used}</b>, Sisa{" "}
              <b className="tabular-nums" style={{ color: PROMO_COLORS.ink }}>
                {left}
              </b>{" "}
              <span style={{ color: TEXT_MUTED }}>dari {total}</span>
            </p>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full"
              style={{ background: "#E4DED6" }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${pct}%`, background: PROMO_COLORS.accent }}
              />
            </div>
          </div>
          <HelperText>Berkurang otomatis tiap ada pesanan yang mendapat bonus.</HelperText>
        </div>
      </div>

      <div className="mt-4">
        <FieldLabel htmlFor="promo-quota-note">Keterangan di bawah bar</FieldLabel>
        <PromoInput
          id="promo-quota-note"
          value={quotaNote}
          onChange={(e) => onChange({ quotaNote: e.target.value })}
          placeholder="Bonus terbatas. Begitu kuotanya habis, program selesai."
        />
        <HelperText style={{ color: TEXT_DIM }}>
          Kalimat kecil di bawah bar sisa bonus pada halaman pesan.
        </HelperText>
      </div>
    </Card>
  );
}
