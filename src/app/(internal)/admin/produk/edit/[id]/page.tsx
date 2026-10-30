"use client";

/**
 * Halaman Edit Produk (tanpa prefix locale).
 *
 * Dulu halaman ini SALINAN TERPISAH dari form Tambah Produk (~1000 baris, punya editor
 * warna/ukuran sendiri), jadi setiap perubahan di `ProductForm` tidak ikut terbawa — termasuk
 * kategori **Cover & Hanger** yang di form Tambah memakai daftar NAMA varian, tapi di halaman
 * ini masih tampil sebagai chip warna + blok ukuran.
 *
 * Sekarang satu komponen untuk mode Tambah **dan** Edit: `src/components/admin/ProductForm.tsx`
 * (memuat data lama lewat `editProductId`). Jangan buat salinan baru — ubah komponen itu.
 */

import { useParams } from "next/navigation";
import ProductForm from "@/components/admin/ProductForm";

export default function EditProdukPage() {
  const params = useParams<{ id?: string }>();
  const id = params?.id ? String(params.id) : "";
  return <ProductForm editProductId={id} />;
}
