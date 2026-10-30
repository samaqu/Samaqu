"use client";

import { useEffect, useState } from "react";
import { NEUTRAL_ITEM_PHOTO } from "@/lib/order-photo";

/**
 * Foto produk portal reseller (kartu katalog & pemilih produk).
 * Kalau URL kosong atau gagal dimuat, tampilkan placeholder netral tanpa
 * teks alt — bukan nama produk yang bocor sebagai teks gambar rusak.
 */
export default function ProductPhoto({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const show = Boolean(src) && !failed;
  return (
    <img
      className="ph"
      src={show ? (src as string) : NEUTRAL_ITEM_PHOTO}
      alt={show ? name : ""}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
