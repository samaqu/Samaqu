"use client";

import { LazyMotion } from "framer-motion";

/**
 * Memuat fitur animasi framer-motion setelah halaman tampil, bukan di bundle awal.
 * `domMax` dipakai (bukan domAnimation) karena katalog memakai animasi `layout`
 * saat kartu bergeser/filter berubah. Komponen memakai `m` (bukan `motion`)
 * supaya ikut jalur ringan ini; tampilan dan gerakannya sama.
 */
const loadFeatures = () => import("framer-motion").then((mod) => mod.domMax);

export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
