"use client";

import { useEffect, useState } from "react";

/** 22 jam 40 menit 43 detik -> "22:40:43"; kurang dari 1 jam -> "40:43". Murni, bisa dites. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const jam = Math.floor(total / 3600);
  const menit = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const detik = String(total % 60).padStart(2, "0");
  return jam > 0 ? `${String(jam).padStart(2, "0")}:${menit}:${detik}` : `${menit}:${detik}`;
}

/**
 * Hitung mundur dari batas waktu ISO milik SERVER (bukan timer lokal), jadi
 * tetap benar setelah halaman di-refresh. Berganti tiap detik.
 */
export function useCountdown(deadlineIso: string | null | undefined) {
  const target = deadlineIso ? new Date(deadlineIso).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!target) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  if (target === null) return { remainingMs: null as number | null, expired: false, label: "", mounted };

  // Nilai waktu dihitung setelah mount supaya HTML server & klien sama (tanpa hydration mismatch).
  const remainingMs = Math.max(0, target - now);
  if (!mounted) return { remainingMs: null as number | null, expired: false, label: "", mounted };
  const label = formatCountdown(remainingMs);

  return { remainingMs, expired: remainingMs === 0, label, mounted };
}
