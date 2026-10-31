"use client";

/**
 * Mini banner yang meniru tampilan bar sisa bonus di halaman pesan.
 * Semua nilainya datang dari state form yang sedang diisi, jadi berubah live sebelum disimpan.
 */

import { PROMO_COLORS, TEXT, TEXT_MUTED } from "./primitives";

const formatTanggal = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

export function PreviewCard({
  active,
  eyebrow,
  title,
  description,
  quotaTotal,
  quotaLeft,
  quotaNote,
  startDate,
  endDate,
}: {
  active: boolean;
  eyebrow: string;
  title: string;
  description: string;
  quotaTotal: number;
  quotaLeft: number;
  quotaNote: string;
  startDate: string;
  endDate: string;
}) {
  const pct = quotaTotal > 0 ? Math.max(0, Math.min(100, Math.round((quotaLeft / quotaTotal) * 100))) : 0;
  const exhausted = quotaLeft <= 0;
  // Banner tidak ditampilkan di halaman pesan bila promo mati atau kuota habis.
  const hidden = !active || exhausted;

  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "var(--card)", border: "1px solid var(--bd)", boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13.5px] font-bold" style={{ color: TEXT }}>
          Preview banner
        </h2>
        <span className="text-[11px]" style={{ color: TEXT_MUTED }}>
          live
        </span>
      </div>

      <div className="rounded-xl p-4" style={{ background: "#FAFCFE", border: "1px solid var(--bd)" }}>
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em]" style={{ color: TEXT_MUTED }}>
            {eyebrow}
          </p>
        ) : null}
        <h3
          className="mt-1.5 text-[19px] font-bold leading-tight"
          style={{ color: TEXT, opacity: title ? 1 : 0.35 }}
        >
          {title || "Judul besar"}
        </h3>
        <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: TEXT_MUTED }}>
          {description || "Deskripsi promo akan tampil di sini."}
        </p>

        <div className="mt-4 rounded-lg p-3" style={{ background: "#FFFFFF", border: "1px solid var(--bd)" }}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-semibold" style={{ color: TEXT }}>
              Sisa bonus
            </span>
            <span className="text-[12px] tabular-nums" style={{ color: TEXT_MUTED }}>
              <b style={{ fontSize: 15, color: PROMO_COLORS.ink }}>{Math.max(0, quotaLeft)}</b> dari {quotaTotal}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "#E4E4E4" }}>
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: PROMO_COLORS.accent }}
            />
          </div>
          {quotaNote ? (
            <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: TEXT_MUTED }}>
              {quotaNote}
            </p>
          ) : null}
        </div>

        {startDate || endDate ? (
          <p className="mt-3 text-[11px] tabular-nums" style={{ color: TEXT_MUTED }}>
            Periode: {startDate ? formatTanggal(startDate) : "sekarang"} —{" "}
            {endDate ? formatTanggal(endDate) : "sampai kuota habis"}
          </p>
        ) : null}
      </div>

      {hidden ? (
        <p
          className="mt-3 rounded-lg px-3 py-2 text-[11.5px] font-medium"
          style={{ background: "#FEF6E7", border: "1px solid #F5DDA8", color: "#8a4b08" }}
        >
          {active ? "Bonus sudah habis — halaman pesan menampilkan “Bonus sudah habis”." : "Promo nonaktif, banner ini tidak tampil di halaman pesan."}
        </p>
      ) : null}
    </section>
  );
}
