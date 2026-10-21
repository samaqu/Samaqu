"use client";

/**
 * Countdown Open Order — mengikuti mockup (grayscale, kotak angka gelap, animasi roll).
 *
 * Tiga varian:
 * - `card`   — kartu timer besar di langkah 1 (daftar produk),
 * - `pill`   — pil timer di detail produk (hanya saat event sudah dibuka / sudah berakhir),
 * - `inline` — isi tombol yang terkunci: ikon kunci + "SEGERA DIBUKA" + angka.
 *
 * Tiga fase event (dihitung di luar, di `OpenOrderWizard`):
 * - `upcoming` — event belum dibuka: label "Segera dibuka", titik amber.
 * - `live`     — event jalan: label "Buruan, sisa waktu", titik hijau + denyut.
 * - `ended`    — event selesai: label "Follow kami, tunggu batch berikutnya", titik abu.
 *
 * Angka hitung mundur dihitung setelah komponen ter-mount (SSR tidak punya jam yang sama
 * dengan klien), jadi sebelum mount angkanya "00" — mencegah hydration mismatch.
 */

import { useEffect, useState } from "react";
import { Bell, Clock, Lock } from "lucide-react";
import { splitCountdown } from "@/lib/open-order-window";

export type OpenOrderPhase = "upcoming" | "live" | "ended";

const pad = (value: number) => (value < 10 ? `0${value}` : String(value));

/** Label utama sesuai fase event (sama persis dengan mockup). */
export function phaseLabel(phase: OpenOrderPhase): string {
  if (phase === "upcoming") return "Segera dibuka";
  if (phase === "live") return "Buruan, sisa waktu";
  return "Follow kami, tunggu batch berikutnya";
}

/** Sisa waktu (ms) + pecahannya, dihitung tiap detik. */
function useCountdown(target: number | null) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (target == null) return;
    const tick = () => setRemaining(Math.max(0, target - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return { remaining, parts: remaining == null ? null : splitCountdown(remaining) };
}

/** Kotak angka gaya mockup: 44×44, radius 10px, latar hitam, angka putih. */
function CardDigit({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="flex flex-col items-center">
      <span className="oo-roll flex h-11 w-11 items-center justify-center rounded-[10px] bg-neutral-950 text-white">
        {/* `key` = nilai → span di-remount → animasi roll diputar ulang tiap angka berubah. */}
        <span key={value} className="block text-lg font-bold tabular-nums">
          {value}
        </span>
      </span>
      <span className="mt-1.5 text-[9px] font-medium uppercase tracking-[.18em] text-neutral-500">{unit}</span>
    </span>
  );
}

/** Kotak angka versi pil (kecil, 34×32) — dipakai di detail produk. */
function PillDigit({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="flex flex-col items-center">
      <span className="oo-tick flex h-8 w-[34px] items-center justify-center overflow-hidden rounded-lg bg-[#0a0a0a] text-white">
        <span key={value} className="inline-block min-w-[1.4ch] text-center text-[14px] font-bold tabular-nums">
          {value}
        </span>
      </span>
      <span className="mt-[3px] text-[8.5px] font-medium uppercase tracking-[.14em] text-[#9a9a9a]">{unit}</span>
    </span>
  );
}

/** Pemisah ":" di antara kotak angka. */
function Colon({ small }: { small?: boolean }) {
  return (
    <span
      className={`font-bold leading-8 text-[#bbb] ${small ? "text-[13px]" : "text-lg text-neutral-800"}`}
      style={small ? undefined : { lineHeight: "44px" }}
    >
      :
    </span>
  );
}

export default function Countdown({
  target,
  phase,
  variant = "card",
  startInfo,
  endInfo,
  remindLabel,
  onRemind,
}: {
  /** Batas hitung mundur (epoch ms). */
  target: number | null;
  /** Fase event — menentukan warna titik & label. */
  phase: OpenOrderPhase;
  variant?: "card" | "pill" | "inline";
  /** "21 Oktober 2026 · 10.00 WIB" — baris info saat event belum dibuka. */
  startInfo?: string;
  /** "22 Okt 2026 · 23.59 WIB" — baris info saat event sudah berakhir. */
  endInfo?: string;
  /** Label tombol pengingat (default mengikuti fase). */
  remindLabel?: string;
  /** Callback tombol pengingat (kalau ada, tombolnya dirender). */
  onRemind?: () => void;
}) {
  const { parts } = useCountdown(target);

  const days = parts?.days ?? 0;
  const hours = parts?.hours ?? 0;
  const minutes = parts?.minutes ?? 0;
  const seconds = parts?.seconds ?? 0;

  // ── Varian inline: isi tombol terkunci ──
  if (variant === "inline") {
    return (
      <span className="flex items-center justify-center gap-3">
        <Lock size={15} strokeWidth={2.2} className="shrink-0" />
        <span className="text-xs tracking-[.12em] opacity-70">SEGERA DIBUKA</span>
        <span className="text-base font-bold tabular-nums">
          {days > 0 ? `${days}h ` : ""}
          {pad(hours)}:{pad(minutes)}:{pad(seconds)}
        </span>
      </span>
    );
  }

  // ── Varian pill: baris timer di detail produk ──
  if (variant === "pill") {
    return (
      <div className="flex w-full items-center justify-between gap-4 rounded-2xl border border-black/[.06] bg-white py-2.5 pl-3 pr-3 shadow-[0_1px_2px_rgba(0,0,0,.04),0_10px_30px_-16px_rgba(0,0,0,.22)] sm:gap-5">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100">
            <Clock size={14} strokeWidth={2} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  phase === "live" ? "bg-emerald-500 oo-ping" : phase === "upcoming" ? "bg-amber-500" : "bg-neutral-400"
                }`}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[.2em]">{phaseLabel(phase)}</span>
            </span>
          </span>
        </span>
        {phase === "ended" ? (
          <span className="text-[11px] font-semibold">{endInfo}</span>
        ) : (
          <b className="flex items-start gap-1">
            <PillDigit value={pad(days)} unit="hari" />
            <Colon small />
            <PillDigit value={pad(hours)} unit="jam" />
            <Colon small />
            <PillDigit value={pad(minutes)} unit="mnt" />
            <Colon small />
            <PillDigit value={pad(seconds)} unit="dtk" />
          </b>
        )}
      </div>
    );
  }

  // ── Varian card: kartu timer besar di langkah 1 ──
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-black/[.06] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,.04),0_12px_32px_-18px_rgba(0,0,0,.25)] sm:flex-row sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15">
            <Clock size={16} strokeWidth={2} />
          </span>
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                phase === "live" ? "bg-emerald-500 oo-ping" : phase === "upcoming" ? "bg-amber-400" : "bg-neutral-500"
              }`}
            />
            <span className="text-[12px] font-semibold uppercase tracking-[.22em]">{phaseLabel(phase)}</span>
          </span>
        </div>

        {phase === "ended" ? (
          <div className="text-sm text-neutral-500">
            Berakhir <b className="font-semibold text-neutral-900">{endInfo}</b>
          </div>
        ) : (
          <div className="flex items-start gap-1.5">
            <CardDigit value={pad(days)} unit="Hari" />
            <Colon />
            <CardDigit value={pad(hours)} unit="Jam" />
            <Colon />
            <CardDigit value={pad(minutes)} unit="Menit" />
            <Colon />
            <CardDigit value={pad(seconds)} unit="Detik" />
          </div>
        )}
      </div>

      {phase === "upcoming" && (startInfo || onRemind) && (
        <div className="mt-4 flex flex-col items-center justify-center gap-3 text-sm sm:flex-row">
          {startInfo && (
            <span className="text-neutral-500">
              Dibuka <b className="font-semibold text-neutral-900">{startInfo}</b>
            </span>
          )}
          {onRemind && (
            <button
              type="button"
              onClick={onRemind}
              className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold transition hover:bg-black hover:text-white"
            >
              <Bell size={13} strokeWidth={2} />
              {remindLabel || "Ingatkan Saya"}
            </button>
          )}
        </div>
      )}

      {phase === "ended" && onRemind && (
        <div className="mt-4 flex flex-col items-center justify-center gap-3 text-sm sm:flex-row">
          <span className="text-neutral-500">Terima kasih untuk semua pesanan periode ini.</span>
          <button
            type="button"
            onClick={onRemind}
            className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:opacity-80"
          >
            <Bell size={13} strokeWidth={2} />
            {remindLabel || "Kabari Periode Berikutnya"}
          </button>
        </div>
      )}
    </div>
  );
}
