"use client";

/**
 * Bar pengumuman "Open Order" untuk halaman Bio Link.
 *
 * Satu-satunya elemen "live" di halaman ini: kalau ada jendela Open Order yang sedang
 * dibuka atau mau dibuka, bar ini muncul di bawah header — lengkap dengan hitung mundur
 * sungguhan. Kalau periodenya sudah lewat, bar-nya nggak muncul sama sekali (nggak ada
 * tombol mati di halaman).
 *
 * Tata letaknya **satu baris di semua ukuran** (mobile pun): ikon, judul, badge, timer, dan
 * panah/sejajar horizontal. Di layar sempit badge & keterangan disembunyikan biar bar-nya
 * tetap muat tanpa membungkus ke baris kedua.
 *
 * Gerakannya sengaja sedikit: titik berdenyut, angka detik yang berdetak, dan satu sapuan
 * shimmer lambat. Semuanya dimatikan kalau pengguna memilih reduced motion.
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
}: {
  /** Fase event: `upcoming` (belum dibuka) atau `live` (sedang dibuka). */
  phase: BioOpenOrderPhase;
  /** Batas hitung mundur (epoch ms). */
  target: number;
  /** Link tujuan (mis. "/id/open-order"). */
  href: string;
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

  // Katanya langsung, bukan tanggal — jadi kebaca satu kalimat: "Dibuka dalam 20:10:17".
  const phaseText = phase === "live" ? "Berakhir dalam" : "Dibuka dalam";

  return (
    <a
      href={href}
      className="bio-oo group relative block overflow-hidden rounded-2xl bg-[#0B0B0B] text-white"
    >
      {/* Sapuan shimmer pelan — tanda "live feed", bukan dekorasi. */}
      <span className="bio-oo-sweep" aria-hidden="true" />

      <div className="relative px-3.5 py-3.5 sm:px-5 sm:py-4">
        {/* Baris 1 — judul + ikon live */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 sm:h-9 sm:w-9 sm:rounded-xl">
            <span
              className={`bio-oo-dot ${phase === "live" ? "bio-oo-dot-live" : ""}`}
              aria-hidden="true"
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold tracking-[-.01em] sm:text-[15px]">
            Open Order
          </span>
          <span className="bio-oo-arrow grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[#0B0B0B] sm:h-9 sm:w-9">
            <ArrowUpRight />
          </span>
        </div>

        {/* Baris 2 — hitung mundur, indent-nya sejajar sama judul biar rapi */}
        <div className="mt-2.5 flex items-center gap-2 pl-[42px] sm:pl-[48px] sm:gap-2.5">
          <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[.06em] text-white/50 sm:text-[11px] sm:tracking-[.08em]">
            {phaseText}
          </span>
          <span className="flex items-center gap-0.5 tabular-nums sm:gap-1">
            {digits.split(":").map((chunk, i) => (
              <span key={i} className="flex items-center gap-0.5 sm:gap-1">
                {i > 0 && <span className="text-white/30">:</span>}
                <span className="bio-oo-box">{chunk}</span>
              </span>
            ))}
          </span>
        </div>
      </div>
    </a>
  );
}
