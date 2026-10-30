"use client";

/**
 * Tautan langsung ke detail pesanan (`/reseller/pesanan/EP-...`).
 *
 * Detail kini tampil sebagai drawer di halaman daftar. Supaya tautan lama
 * (bookmark, pesan WhatsApp ke reseller) tidak putus, rute ini dialihkan ke
 * daftar dengan drawer terbuka lewat query `?pesanan=`.
 *
 * Rute pembayaran kekurangan (`.../[orderNumber]/bayar`) TIDAK disentuh.
 */

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ResellerPesananDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const router = useRouter();
  const orderNumber = decodeURIComponent(params?.orderNumber || "");

  useEffect(() => {
    if (!orderNumber) return;
    // `replace` -> tombol kembali tidak kembali ke rute kosong ini.
    router.replace(`/reseller/pesanan?pesanan=${encodeURIComponent(orderNumber)}`);
  }, [orderNumber, router]);

  return null;
}
