"use client";

import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

/**
 * Thumbnail produk dengan fallback netral: kalau URL kosong ATAU gambar gagal
 * dimuat (onError), tampil kotak abu + ikon — tanpa teks alt.
 */
export default function ProductThumb({
  src,
  className = "",
}: {
  src: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  if (!showImage) {
    return (
      <span
        className={`grid place-items-center rounded-lg bg-slate-100 text-slate-300 ${className}`}
        aria-hidden="true"
      >
        <ImageIcon size={16} />
      </span>
    );
  }

  return (
    <img
      src={src || ""}
      alt=""
      className={`object-cover bg-slate-100 ${className}`}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
