"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Foto publik yang dirender lewat `next/image` (same-origin `/_next/image`), supaya tidak
 * bergantung pada jangkauan host R2 (`samaqu-media.samaqu.workers.dev`) dari perangkat
 * pengunjung. Parent WAJIB `relative` karena komponen ini memakai `fill`.
 *
 * Kalau `src` kosong atau gagal dimuat, yang tampil blok abu (opsional dengan label),
 * bukan kotak kosong tanpa keterangan.
 */
export default function PublicPhoto({
  src,
  alt,
  sizes,
  priority = false,
  className = "object-cover",
  style,
  fallbackLabel,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`absolute inset-0 grid place-items-center bg-[#f5f5f4] ${
          fallbackLabel ? "p-2 text-center" : ""
        }`}
      >
        {fallbackLabel ? (
          <span className="text-[11px] font-medium leading-snug text-neutral-500">{fallbackLabel}</span>
        ) : null}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      /* Next 16 hanya mengizinkan quality bawaan config (75). */
      quality={75}
      priority={priority}
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
