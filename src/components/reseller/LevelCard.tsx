"use client";

import { Award, Gem, Medal, Check } from "lucide-react";
import type { LevelKey, LevelSummary } from "@/lib/reseller/level";
import { rupiah } from "@/lib/reseller/format";

const ICONS = { silver: Medal, gold: Award, platinum: Gem } as const;

/** Rp2,5 jt / Rp750 rb / Rp1.250 — ringkas untuk kalimat, bukan angka akuntansi. */
function ringkas(amount: number): string {
  if (amount >= 1_000_000) {
    const juta = Math.round((amount / 1_000_000) * 10) / 10;
    return `Rp${String(juta).replace(".", ",")} jt`;
  }
  if (amount >= 10_000) return `Rp${Math.round(amount / 1000)} rb`;
  return rupiah(amount);
}

/** Kartu level reseller di Beranda: badge, progres ke level berikutnya, dan tangga level. */
export default function LevelCard({ level }: { level: LevelSummary }) {
  const Icon = ICONS[level.key];
  const currentIndex = level.tiers.findIndex((tier) => tier.key === level.key);
  const fillKey: LevelKey = level.next ? level.next.key : level.key;

  const message = level.next
    ? `Naik ke ${level.next.label} kalau rata-rata belanjamu ${ringkas(level.next.min)} per bulan. Kurang ${ringkas(level.sisa)} lagi.`
    : `Kamu di level tertinggi. Pertahankan rata-rata belanja ${ringkas(level.tiers[currentIndex].min)} per bulan.`;

  const basis = level.bulan_dihitung >= 3 ? "Rata-rata belanja 3 bulan terakhir." : "Rata-rata belanja sejak kamu bergabung.";

  return (
    <section className={`level-card lv-${level.key}`} aria-label={`Level reseller: ${level.label}`}>
      <div className="lv-top">
        <span className="lv-badge" aria-hidden="true">
          <Icon size={24} />
        </span>
        <div className="lv-head">
          <small>Level kamu</small>
          <b>{level.label}</b>
        </div>
        <div className="lv-avg">
          <small>Rata-rata belanja / bulan</small>
          <b>{rupiah(level.rata_rata)}</b>
        </div>
      </div>

      <div
        className={`lv-bar lv-fill-${fillKey}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={level.progress}
        aria-label={level.next ? `Progres menuju ${level.next.label}` : "Level tertinggi"}
      >
        <span style={{ width: `${level.progress}%` }} />
      </div>

      <p className="lv-msg">{message}</p>

      <ol className="lv-steps">
        {level.tiers.map((tier, index) => (
          <li
            key={tier.key}
            className={`${index < currentIndex ? "done" : ""} ${index === currentIndex ? "now" : ""}`.trim()}
            aria-current={index === currentIndex ? "step" : undefined}
          >
            <span className={`lv-dot lv-dot-${tier.key}`}>{index < currentIndex ? <Check size={11} strokeWidth={3} /> : null}</span>
            <b>{tier.label}</b>
            <small>{tier.min === 0 ? "Mulai" : `${ringkas(tier.min)}/bln`}</small>
          </li>
        ))}
      </ol>

      <p className="lv-note">
        {level.manual ? "Level ini ditetapkan oleh admin SAMAQU. " : ""}
        {basis} Pesanan batal tidak dihitung.
      </p>
    </section>
  );
}
