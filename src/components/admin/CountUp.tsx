"use client";

/**
 * Angka kartu metrik yang "dihitung naik" dari nilai sebelumnya ke nilai baru.
 *
 * Dipakai kartu metrik dashboard admin (`DashboardView`) — permintaan pemilik 2026-10-24:
 * "kasih animasi counter di masing2 card nya". Angkanya tetap dari data asli; komponen ini hanya
 * menganimasikan tampilannya (requestAnimationFrame, ease-out, ~0,7 detik) dan memformat tiap frame
 * dengan `format` yang sama seperti angka akhirnya — jadi "Rp 48.331.123" naik dari Rp 0 dan
 * tidak pernah menampilkan angka karangan yang berbeda dari nilai akhir.
 *
 * Nilai berubah (mis. 0 pada masa loading → angka asli setelah data masuk) → animasi jalan lagi
 * dari angka yang sedang tampil. Pengguna yang meminta gerak dikurangi
 * (`prefers-reduced-motion: reduce`) langsung melihat angka akhirnya.
 */

import { useEffect, useRef, useState } from "react";

export default function CountUp({ value, format, duration = 700 }: {
  value: number;
  /** Pemformat angka per frame — pakai pemformat yang sama dengan angka akhirnya. */
  format: (n: number) => string;
  /** Lama animasi (ms). */
  duration?: number;
}) {
  const [shown, setShown] = useState(0);
  /** Angka yang sedang tampil, dipakai sebagai titik awal animasi berikutnya. */
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number.isFinite(value) ? value : 0;
    if (from === to) return;

    const calm =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (calm || duration <= 0) {
      fromRef.current = to;
      setShown(to);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out kubik: cepat di awal, mendarat halus
      setShown(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = to;
    };
  }, [value, duration]);

  return <>{format(shown)}</>;
}
