"use client";

/**
 * Helper tanggal zona WIB (`Asia/Jakarta`) untuk panel admin.
 *
 * Dipakai bersama oleh header (tanggal panjang) dan beranda (filter data + kutipan harian) supaya
 * satu sumber kebenaran. Semua perhitungan memakai `Intl` dengan `timeZone: "Asia/Jakarta"`, jadi
 * zona waktu perangkat tidak berpengaruh.
 */
import { useEffect, useState } from "react";

const TZ = "Asia/Jakarta";
const DAY_MS = 86_400_000;
/** WIB = UTC+7 tanpa DST, jadi offsetnya tetap. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const keyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const longFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const hourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  hourCycle: "h23",
});

/** Kunci tanggal WIB `YYYY-MM-DD` (stabil, aman untuk perbandingan & indeks kutipan). */
export function wibDateKey(d: Date = new Date()): string {
  return keyFmt.format(d);
}

/** Tanggal WIB panjang berbahasa Indonesia, contoh: "Jumat, 16 Oktober 2026". */
export function wibLongDate(d: Date = new Date()): string {
  return longFmt.format(d);
}

/** Kunci tanggal WIB dengan pergeseran hari (mis. -60 untuk 60 hari lalu). */
export function wibDateOffset(offsetDays: number): string {
  return wibDateKey(new Date(Date.now() + offsetDays * DAY_MS));
}

/** Jam WIB (0–23), tidak bergantung zona waktu perangkat. */
export function wibHour(d: Date = new Date()): number {
  return Number(hourFmt.format(d));
}

/** Sapaan waktu WIB: pagi 04–10, siang 11–14, sore 15–17, malam 18–03. */
export function wibGreeting(d: Date = new Date()): string {
  const hour = wibHour(d);
  if (hour >= 4 && hour < 11) return "Selamat Pagi";
  if (hour >= 11 && hour < 15) return "Selamat Siang";
  if (hour >= 15 && hour < 18) return "Selamat Sore";
  return "Selamat Malam";
}

/** Sisa milidetik sampai tengah malam WIB berikutnya (+1 detik sebagai pengaman). */
export function msToNextWibMidnight(now: Date = new Date()): number {
  const wibMs = now.getTime() + WIB_OFFSET_MS;
  const nextMidnightWib = (Math.floor(wibMs / DAY_MS) + 1) * DAY_MS;
  return nextMidnightWib - wibMs + 1000;
}

/**
 * Indeks kutipan harian yang deterministik dari tanggal WIB — bukan acak, bukan hitungan
 * kunjungan. Pada tanggal yang sama semua admin melihat kutipan yang sama; berganti tepat saat
 * hari WIB berganti.
 */
export function dailyIndexForDate(key: string, length: number): number {
  const [y, m, d] = key.split("-").map(Number);
  const days = Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / DAY_MS);
  return ((days % length) + length) % length;
}

/**
 * Menandai pergantian hari WIB: memaksa render ulang tepat saat tengah malam WIB, lalu menjadwalkan
 * ulang untuk hari berikutnya. Timer dibersihkan saat komponen dilepas.
 */
function useWibDayTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setTick((t) => t + 1);
        schedule();
      }, msToNextWibMidnight());
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
}

/** Kunci tanggal WIB hari ini; otomatis diperbarui saat melewati tengah malam WIB. */
export function useWibToday(): string {
  useWibDayTick();
  return wibDateKey();
}

/** Tanggal WIB panjang hari ini; otomatis diperbarui saat melewati tengah malam WIB. */
export function useWibLongDate(): string {
  useWibDayTick();
  return wibLongDate();
}

/**
 * Sapaan waktu WIB yang otomatis berganti tepat saat jam WIB berubah.
 * Timer dijadwalkan ke batas jam berikutnya (bukan polling tiap detik).
 */
export function useWibGreeting(): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const wibMs = Date.now() + WIB_OFFSET_MS;
      const msToNextHour = 60 * 60 * 1000 - (wibMs % (60 * 60 * 1000)) + 1000;
      timer = setTimeout(() => {
        setTick((t) => t + 1);
        schedule();
      }, msToNextHour);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return wibGreeting();
}
