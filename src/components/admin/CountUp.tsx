"use client";

/**
 * Angka kartu metrik yang "dihitung naik" dari nilai sebelumnya ke nilai baru.
 *
 * Dipakai kartu metrik dashboard admin (`DashboardView`) dan kartu Laporan Keuangan ops
 * (`src/app/(internal)/ops/laporan/page.tsx`) — permintaan pemilik 2026-10-24:
 * "kasih animasi counter di masing2 card nya". Angkanya tetap dari data asli; komponen ini hanya
 * menganimasikan tampilannya (requestAnimationFrame, ease-out, ~0,7 detik) dan memformat tiap frame
 * dengan `format` yang sama seperti angka akhirnya — jadi "Rp 48.331.123" naik dari Rp 0 dan
 * tidak pernah menampilkan angka karangan yang berbeda dari nilai akhir.
 *
 * Nilai berubah (mis. 0 pada masa loading → angka asli setelah data masuk) → animasi jalan lagi
 * dari angka yang sedang tampil. Pengguna yang meminta gerak dikurangi
 * (`prefers-reduced-motion: reduce`) langsung melihat angka akhirnya.
 *
 * Komponen yang baru di-mount dengan nilai bukan nol WAJIB ikut beranimasi: React Strict Mode
 * menjalankan effect dua kali (mount → unmount → mount) di mode dev, jadi posisi animasi disimpan
 * di `displayedRef` yang hanya berubah saat sebuah frame benar-benar ditampilkan. Dulu cleanup
 * menulis target akhir ke ref-nya, sehingga mount kedua menganggap "sudah sampai" dan kartu
 * tertahan di Rp 0.
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
  /** Angka yang benar-benar sedang tampil, dipakai sebagai titik awal animasi berikutnya. */
  const displayedRef = useRef(0);

  useEffect(() => {
    const from = displayedRef.current;
    const to = Number.isFinite(value) ? value : 0;
    if (from === to) {
      setShown(to);
      return undefined;
    }

    const calm =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (calm || duration <= 0) {
      displayedRef.current = to;
      setShown(to);
      return undefined;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // `now` bisa sedikit LEBIH AWAL dari `start` (timestamp rAF = awal frame), jadi
      // progres dijepit 0..1 — tanpa itu frame pertama sempat bernilai negatif.
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - p, 3); // ease-out kubik: cepat di awal, mendarat halus
      const next = p < 1 ? from + (to - from) * eased : to;
      displayedRef.current = next;
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return <>{format(shown)}</>;
}
