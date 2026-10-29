"use client";

/**
 * Thumbnail foto item pesanan untuk halaman customer (/akun dan /akun/pesanan).
 *
 * Kenapa ada: `order_items.product_image` adalah snapshot. Sebagian mengarah ke aset Cloudinary
 * yang sudah dihapus (404) dan sebagian kosong. Dulu `<img src>` dirender apa adanya tanpa
 * `onError`, jadi browser menampilkan ikon gambar rusak; kalau kosong, yang tampil ikon kotak
 * generik meski foto katalog sebenarnya tersedia.
 *
 * Perilaku: coba daftar kandidat BERURUTAN (urutan tetap milik `photoCandidates` di
 * `src/lib/order-photo.ts`). Kalau satu gagal dimuat (`onError`), pindah ke kandidat berikutnya;
 * indeks hanya maju, jadi tidak ada loop. Kalau semua habis, tampilkan `fallback` dari pemanggil,
 * atau placeholder netral.
 */

import { useEffect, useState, type ReactNode } from "react";
import { NEUTRAL_ITEM_PHOTO, photoCandidates, type OrderItemPhotoKey, type OrderPhotoLookup } from "@/lib/order-photo";

export default function OrderItemThumb({
  item,
  lookup,
  className = "",
  imgClassName = "w-full h-full object-cover",
  fallback,
  alt,
}: {
  item: OrderItemPhotoKey;
  /** Lookup foto katalog (lihat `loadOrderPhotoLookup`). Boleh null. */
  lookup?: OrderPhotoLookup | null;
  /** Kelas wadah (ukuran, radius, overflow) — dipakai apa adanya supaya layout tidak berubah. */
  className?: string;
  imgClassName?: string;
  /** Tampilan pengganti kalau tidak ada foto yang bisa dimuat (mis. ikon kotak bawaan). */
  fallback?: ReactNode;
  alt?: string;
}) {
  const kandidat = photoCandidates(item, lookup);
  const [coba, setCoba] = useState(0);

  // Daftar kandidat berganti (item/lookup berubah) → mulai lagi dari kandidat pertama.
  useEffect(() => {
    setCoba(0);
  }, [item.product_image, item.product_id, item.color, lookup]);

  const src = kandidat[coba];

  if (!src) {
    // Kandidat habis. Kalau pemanggil punya tampilan sendiri, pakai itu; kalau tidak, netral.
    return <div className={className}>{fallback ?? <img src={NEUTRAL_ITEM_PHOTO} alt={alt || "Foto produk"} className={imgClassName} />}</div>;
  }

  return (
    <div className={className}>
      <img
        src={src}
        alt={alt || item.product_name || "Foto produk"}
        className={imgClassName}
        loading="lazy"
        decoding="async"
        onError={() => setCoba((n) => n + 1)}
      />
    </div>
  );
}
