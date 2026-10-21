"use client";

/**
 * Countdown Open Order — hitung mundur ala marketplace.
 *
 * Dua mode (mode-nya ditentukan dari state jendela, bukan dari komponen ini):
 * - **"Berakhir dalam"** — event sudah dibuka; ngitung ke `23:59:59.999 WIB` tanggal tutup.
 * - **"Buka dalam"** — event belum dimulai; ngitung ke `00:00:00 WIB` tanggal mulai.
 *
 * Gaya: kartu putih + aksen emas, angka jam:menit:detik di dalam kotak (tabular-nums) —
 * biar angka tidak "bergeser" tiap detik. Ada tiga varian:
 * - `banner`  — blok besar di langkah 1 (daftar produk),
 * - `compact` — pil ringkas di header lengket (ikut di semua langkah),
 * - `inline`  — angka polos (tanpa kotak), buat DI DALAM tombol yang terkunci.
 *
 * Countdown ini **murni tampilan**: kalau waktu habis, angka jadi 00:00:00. Yang mengunci
 * pemesanan bukan komponen ini, tapi state jendela (`before` → tombol tambah disabled).
 *
 * Hitungan dimulai setelah komponen ter-mount (SSR tidak punya jam yang sama dengan klien),
 * jadi sebelum mount angkanya ditampilkan sebagai "--" supaya tidak ada hydration mismatch.
 */

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { splitCountdown } from "@/lib/open-order-window";
import { INK, LINE, MUTED } from "./ui";

const pad = (value: number) => (value < 10 ? `0${value}` : String(value));

/** Kotak angka countdown — dipakai kedua varian. */
function Box({ value, hint }: { value: string; hint: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className="grid min-w-[44px] place-items-center rounded-lg px-2 py-1.5 text-[16px] font-semibold tabular-nums"
        style={{ background: "var(--espresso)", color: "var(--cream)" }}
      >
        {value}
      </span>
      <span className="text-[9px] font-medium uppercase tracking-[0.14em]" style={{ color: MUTED }}>
        {hint}
      </span>
    </span>
  );
}

function Separator() {
  return (
    <span className="self-start pt-1.5 text-[16px] font-semibold" style={{ color: "var(--gold-deep)" }}>
      :
    </span>
  );
}

export default function Countdown({
  deadline,
  variant = "banner",
  label = "Berakhir dalam",
  caption,
}: {
  /** Batas akhir (epoch ms). `null` → tidak ada hitung mundur yang bisa ditampilkan. */
  deadline: number | null;
  variant?: "banner" | "compact" | "inline";
  label?: string;
  /** Keterangan singkat di bawah label (mis. tanggal bukanya). */
  caption?: string;
}) {
  /** Sisa waktu dalam ms — `null` sampai komponen ter-mount (SSR vs klien). */
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (deadline == null) return;
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  // Tanpa tanggal → tidak ada yang bisa dihitung, jangan tampilkan apa pun.
  if (deadline == null) return null;

  const parts = remaining == null ? null : splitCountdown(remaining);
  const showDays = parts != null && parts.days > 0;

  // Varian inline — angka polos (tanpa kotak, tanpa label) buat DI DALAM tombol terkunci.
  // Satu baris, tabular-nums, dan ukurannya menyesuaikan supaya muet di HP tanpa scroll.
  if (variant === "inline") {
    const digits = parts
      ? showDays
        ? `${pad(parts.days)}:${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
        : `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
      : "--:--:--";
    return (
      <span className="tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
        {digits}
      </span>
    );
  }

  if (variant === "compact") {
    return (
      <span
        className="inline-flex items-center justify-center gap-2 rounded-full px-3.5 py-1.5 text-[11.5px] font-medium"
        style={{ background: "#ffffff", border: `1px solid ${LINE}`, color: INK }}
      >
        <Clock size={13} style={{ color: "var(--gold-deep)" }} />
        <span>{label}</span>
        <span className="flex items-center gap-1 tabular-nums">
          {showDays && (
            <>
              <strong className="font-semibold">{parts ? pad(parts.days) : "--"}</strong>
              <span style={{ color: MUTED }}>hari</span>
            </>
          )}
          <strong className="font-semibold">{parts ? pad(parts.hours) : "--"}</strong>
          <span style={{ color: MUTED }}>:</span>
          <strong className="font-semibold">{parts ? pad(parts.minutes) : "--"}</strong>
          <span style={{ color: MUTED }}>:</span>
          <strong className="font-semibold">{parts ? pad(parts.seconds) : "--"}</strong>
        </span>
      </span>
    );
  }

  return (
    <div
      className="relative mt-5 w-full overflow-hidden rounded-2xl"
      style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,.1)" }}
    >
      {/* Aksen tipis emas di tepi kiri — penanda "live" tanpa bikin kartu jadi gelap/coklat. */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: "var(--gold)" }} />
      <div className="relative flex flex-col items-center gap-4 px-5 py-4 sm:flex-row sm:justify-between sm:gap-6 sm:px-6 sm:py-5">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{ background: "rgba(0,0,0,.05)", color: "var(--espresso)" }}
          >
            <Clock size={17} />
          </span>
          <span className="text-left">
            <span
              className="block text-[11px] font-medium uppercase tracking-[0.22em]"
              style={{ color: "var(--gold-deep)" }}
            >
              {label}
            </span>
            {caption && (
              <span className="mt-1 block text-[12px] leading-relaxed" style={{ color: "var(--stone)" }}>
                {caption}
              </span>
            )}
          </span>
        </div>

        <span className="flex items-start gap-1.5 tabular-nums">
          {showDays && (
            <>
              <Box value={parts ? pad(parts.days) : "--"} hint="Hari" />
              <Separator />
            </>
          )}
          <Box value={parts ? pad(parts.hours) : "--"} hint="Jam" />
          <Separator />
          <Box value={parts ? pad(parts.minutes) : "--"} hint="Menit" />
          <Separator />
          <Box value={parts ? pad(parts.seconds) : "--"} hint="Detik" />
        </span>
      </div>
    </div>
  );
}
