"use client";

/**
 * Bar pengumuman "Open Order" untuk halaman Bio Link.
 *
 * Satu-satunya elemen "live" di halaman ini: kalau ada jendela Open Order yang sedang
 * dibuka atau mau dibuka, bar ini muncul di bawah header — lengkap dengan hitung mundur
 * sungguhan. Kalau periodenya sudah lewat, bar-nya nggak muncul sama sekali (nggak ada
 * tombol mati di halaman).
 *
 * Gerakannya sengaja sedikit: titik amber berdenyut, angka detik yang berdetak, dan satu
 * sapuan shimmer lambat. Semuanya dimatikan kalau pengguna memilih reduced motion.
 */

import { useEffect, useState } from "react";
import { splitCountdown } from "@/lib/open-order-window";

export type BioOpenOrderPhase = "upcoming" | "live";

const pad = (value: number) => (value < 10 ? `0${value}` : String(value));

function ArrowUpRight() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M7 17L17 7M8 7h9v9" />
    </svg>
  );
}

export default function BioOpenOrderBanner({
  phase,
  target,
  href,
  caption,
}: {
  /** Fase event: `upcoming` (belum dibuka) atau `live` (sedang dibuka). */
  phase: BioOpenOrderPhase;
  /** Batas hitung mundur (epoch ms). */
  target: number;
  /** Link tujuan (mis. "/id/open-order"). */
  href: string;
  /** Keterangan singkat: kapan event dibuka / ditutup. */
  caption: string;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, target - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  const parts = remaining == null ? null : splitCountdown(remaining);
  const showDays = parts != null && parts.days > 0;
  const digits = parts
    ? showDays
      ? `${pad(parts.days)}:${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
      : `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
    : "--:--:--";

  return (
    <a
      href={href}
      className="bio-oo group relative block overflow-hidden rounded-2xl bg-[#0B0B0B] text-white"
    >
      {/* Sapuan shimmer pelan — tanda "live feed", bukan dekorasi. */}
      <span className="bio-oo-sweep" aria-hidden="true" />

      <div className="relative flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10">
            <span className="bio-oo-dot" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-[15px] font-extrabold tracking-[-.01em]">Open Order</span>
              <span className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.16em] text-white/75">
                {phase === "live" ? "Sedang buka" : "Segera buka"}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] font-medium text-white/50">
              {caption}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="flex items-center gap-1 tabular-nums">
            {digits.split(":").map((chunk, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-white/30">:</span>}
                <span className="bio-oo-box">{chunk}</span>
              </span>
            ))}
          </span>
          <span className="bio-oo-arrow grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#0B0B0B]">
            <ArrowUpRight />
          </span>
        </div>
      </div>
    </a>
  );
}
