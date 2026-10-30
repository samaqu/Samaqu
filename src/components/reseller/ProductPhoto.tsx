"use client";

import { useEffect, useState } from "react";

function initialsOf(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SQ";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Foto produk portal reseller (kartu katalog & pemilih produk).
 *
 * URL kosong / gagal dimuat → placeholder netral yang jelas bukan gambar rusak:
 * latar lembut + wordmark SAMAQU halus + inisial/nama series. Placeholder
 * dekoratif (`aria-hidden`), jadi tidak ada teks alt yang bocor.
 */
export default function ProductPhoto({
  src,
  name,
  series,
  className = "ph",
}: {
  src: string | null;
  name: string;
  series?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const show = Boolean(src) && !failed;
  if (!show) {
    const label = String(series || name || "").trim();
    return (
      <div className={`${className} ph-empty`} aria-hidden="true">
        <span className="wm">SAMAQU</span>
        <span className="init">{initialsOf(label)}</span>
        {series ? <span className="sub">{series}</span> : null}
      </div>
    );
  }

  return (
    <img
      className={className}
      src={src as string}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
