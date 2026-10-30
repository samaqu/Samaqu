"use client";

import { useLocation } from "@/lib/ops-router";
import ProductForm from "@/components/admin/ProductForm";

/**
 * Halaman "Tambah Produk" ops.
 *
 * TAMBAH dan EDIT sama-sama memakai komponen bersama `ProductForm` (mode "ops"): struktur
 * sama dengan form admin (Jenis Kain, Kategori, banyak series sekaligus, Produk Dasar untuk
 * stok sharing, stok per ukuran, harga per series) TANPA bagian foto, plus field internal
 * SKU / HPP / Tipe Produk.
 *
 * - Produk baru dari ops dibuat `is_published=false` (belum tampil di website).
 * - Edit memuat data lengkap lewat `editProductId` dan memperbarui baris yang ada
 *   (tidak membuat duplikat).
 *
 * Form lama (`OpsTambahProdukForm`) sudah dihapus.
 */
export default function TambahProdukPage() {
  const location = useLocation();
  const productToEdit = location.state?.product || null;
  return <ProductForm mode="ops" editProductId={productToEdit?.id} />;
}
