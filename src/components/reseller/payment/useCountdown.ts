"use client";

import { useEffect, useState } from "react";

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
  const label = `${String(Math.floor(remainingMs / 60_000)).padStart(2, "0")}:${String(
    Math.floor((remainingMs % 60_000) / 1000)
  ).padStart(2, "0")}`;

  return { remainingMs, expired: remainingMs === 0, label, mounted };
}
