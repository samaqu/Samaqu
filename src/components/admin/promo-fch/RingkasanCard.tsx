"use client";

/**
 * Ringkasan cepat di bawah preview: berapa produk ikut promo, bonus terpakai,
 * sisa kuota, dan stok Cover & Hanger.
 *
 * Peringatan muncul bila stok Cover & Hanger lebih kecil dari sisa kuota — artinya sebagian
 * kuota tidak akan bisa dibagikan karena barangnya kurang (sudah terlihat di screenshot: "Habis").
 */

import { PROMO_COLORS, TEXT, TEXT_MUTED } from "./primitives";

const formatTanggal = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[12.5px]">
      <span style={{ color: TEXT_MUTED }}>{label}</span>
      <span
        className={strong ? "font-semibold tabular-nums" : "tabular-nums"}
        style={{ color: strong ? PROMO_COLORS.ink : TEXT }}
      >
        {value}
      </span>
    </div>
  );
}

export function RingkasanCard({
  productsOn,
  productsTotal,
  quotaTotal,
  quotaLeft,
  bonusStock,
  startDate,
  endDate,
}: {
  productsOn: number;
  productsTotal: number;
  quotaTotal: number;
  quotaLeft: number;
  /** Stok Cover & Hanger saat ini. `null` = belum terbaca. */
  bonusStock: number | null;
  startDate: string;
  endDate: string;
}) {
  const used = Math.max(0, quotaTotal - quotaLeft);
  const stokKurang = bonusStock !== null && bonusStock < quotaLeft;

  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "var(--card)", border: "1px solid var(--bd)", boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}
    >
      <h2 className="mb-2 text-[13.5px] font-bold" style={{ color: TEXT }}>
        Ringkasan
      </h2>
      <div className="divide-y" style={{ borderColor: "var(--bd)" }}>
        <Row label="Produk ikut promo" value={`${productsOn} dari ${productsTotal}`} />
        <Row label="Bonus terpakai" value={`${used} pcs`} />
        <Row label="Sisa kuota" value={`${Math.max(0, quotaLeft)} pcs`} strong />
        <Row
          label="Stok Cover & Hanger"
          value={
            bonusStock === null ? "—" : (
              <span style={{ color: bonusStock === 0 ? "#b91c1c" : undefined }}>{bonusStock} pcs</span>
            )
          }
        />
        <Row
          label="Periode"
          value={
            startDate || endDate
              ? `${startDate ? formatTanggal(startDate) : "sekarang"} — ${endDate ? formatTanggal(endDate) : "habis kuota"}`
              : "Tanpa batas"
          }
        />
      </div>

      {stokKurang ? (
        <p
          className="mt-3 rounded-lg px-3 py-2 text-[11.5px] leading-relaxed"
          style={{ background: "#FEF6E7", border: "1px solid #F5DDA8", color: "#8a4b08" }}
        >
          {bonusStock === 0
            ? "Stok Cover & Hanger 0 — bonus tidak akan ditawarkan ke siapa pun. Isi lewat Stok Opname sebelum promo dijalankan."
            : `Stok Cover & Hanger (${bonusStock} pcs) lebih kecil dari sisa kuota (${quotaLeft} pcs) — sebagian kuota tidak akan bisa dibagikan.`}
        </p>
      ) : null}
    </section>
  );
}
