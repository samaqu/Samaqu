"use client";

/**
 * Countdown Open Order — hitung mundur ala marketplace.
 *
 * Dua mode (mode-nya ditentukan dari state jendela, bukan dari komponen ini):
 * - **"Berakhir dalam"** — event sudah dibuka; ngitung ke `23:59:59.999 WIB` tanggal tutup.
 * - **"Buka dalam"** — event belum dimulai; ngitung ke `00:00:00 WIB` tanggal mulai.
 *
 * Tiga varian:
 * - `banner`  — kartu besar di langkah 1 (daftar produk),
 * - `compact` — pil ringkas di header lengket (ikut di semua langkah),
 * - `inline`  — angka polos (tanpa kotak), buat DI DALAM tombol yang terkunci.
 *
 * **Responsif** (mobile-first): kotak angka dibuat kecil di layar sempit dan membesar
 * di `sm+`; label + keterangan di tengah (bukan %), angka di bawahnya. Bagian **HARI
 * selalu ditampilkan** (nilainya `00` kalau sisa waktu < 24 jam) — kalau disembunyikan
 * saat 0, lebar kartu ikut berubah tiap pergantian hari dan tampilannya "bergeser".
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

/** Kotak angka countdown — dipakai varian banner. */
function Box({ value, hint }: { value: string; hint: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className="grid min-w-[38px] place-items-center rounded-lg px-1.5 py-1.5 text-[14px] font-semibold tabular-nums sm:min-w-[44px] sm:px-2 sm:py-1.5 sm:text-[16px]"
        style={{ background: INK, color: "var(--cream)" }}
      >
        {value}
      </span>
      <span
        className="text-[8px] font-medium uppercase tracking-[0.12em] sm:text-[9px] sm:tracking-[0.14em]"
        style={{ color: MUTED }}
      >
        {hint}
      </span>
    </span>
  );
}

function Separator() {
  return (
    <span
      className="self-start pt-1.5 text-[14px] font-semibold sm:pt-1.5 sm:text-[16px]"
      style={{ color: "var(--gold-deep)" }}
    >
      :
    </span>
  );
}

export default function Countdown({
  deadline,
  variant = "banner",
  label = "Berakhir dalam",
  caption,
  tone = "live",
}: {
  /** Batas akhir (epoch ms). `null` → tidak ada hitung mundur yang bisa ditampilkan. */
  deadline: number | null;
  variant?: "banner" | "compact" | "inline";
  label?: string;
  /** Keterangan singkat di bawah label (mis. tanggal bukanya). */
  caption?: string;
  /** Warna titik di depan label: `live` (hijau, event jalan) atau `soon` (amber, belum buka). */
  tone?: "live" | "soon";
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

  // Angka polos: "HH:MM:SS" (atau "DD:HH:MM:SS" kalau lewat 24 jam).
  const digits = parts
    ? showDays
      ? `${pad(parts.days)}:${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
      : `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
    : "--:--:--";

  // Varian inline — buat DI DALAM tombol terkunci. Satu baris, tabular-nums.
  if (variant === "inline") {
    return (
      <span className="whitespace-nowrap tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
        {digits}
      </span>
    );
  }

  // Varian compact — pil di header lengket. Selalu 4 bagian (hari ikut, walau 00) supaya
  // lebarnya stabil dan tidak "bergeser" saat pergantian hari.
  if (variant === "compact") {
    const compact = parts
      ? `${pad(parts.days)}:${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
      : "--:--:--:--";
    return (
      <span
        className="inline-flex max-w-full items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium sm:gap-2 sm:px-3.5 sm:py-1.5 sm:text-[11.5px]"
        style={{ background: "#ffffff", border: `1px solid ${LINE}`, color: INK }}
      >
        <Clock size={13} className="h-3 w-3 shrink-0 sm:h-[13px] sm:w-[13px]" style={{ color: "var(--gold-deep)" }} />
        <span className="whitespace-nowrap">{label}</span>
        <span className="whitespace-nowrap font-semibold tabular-nums">{compact}</span>
      </span>
    );
  }

  // Varian banner — kartu besar di langkah 1.
  // Mobile: ikon + titik + label jadi SATU baris di tengah, angka di bawahnya, tanpa
  // caption (biar ringkas kayak mockup). Desktop: blok kiri (ikon + label + caption)
  // dan angka di kanan.
  return (
    <div
      className="relative mt-5 w-full overflow-hidden rounded-2xl"
      style={{ background: "#ffffff", boxShadow: "0 10px 28px -20px rgba(0,0,0,.45)" }}
    >
      <div className="flex flex-col items-center gap-3 px-4 py-4 sm:flex-row sm:justify-between sm:gap-6 sm:px-6 sm:py-5">
        <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:min-w-0 sm:items-start sm:gap-3">
          <span className="flex w-full items-center justify-center gap-2.5 sm:w-auto sm:justify-start sm:gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full sm:h-10 sm:w-10"
              style={{ background: "rgba(0,0,0,.05)", color: "var(--espresso)" }}
            >
              <Clock size={16} className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />
            </span>
            <span className="flex flex-col items-center gap-1 sm:items-start">
              <span className="flex items-center justify-center gap-1.5 sm:justify-start">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: tone === "soon" ? "#d97706" : "#16a34a" }}
                />
                <span
                  className="text-[10.5px] font-semibold uppercase tracking-[0.18em] sm:text-[11px] sm:tracking-[0.22em]"
                  style={{ color: "var(--gold-deep)" }}
                >
                  {label}
                </span>
              </span>
              {caption && (
                <span
                  className="hidden text-[12px] leading-relaxed sm:block"
                  style={{ color: "var(--stone)" }}
                >
                  {caption}
                </span>
              )}
            </span>
          </span>
        </div>

        <span className="flex shrink-0 items-start gap-1 tabular-nums sm:gap-1.5">
          <Box value={parts ? pad(parts.days) : "--"} hint="Hari" />
          <Separator />
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
