"use client";

// Form tambah produk admin (/admin/produk/tambah).
//
// Dulu file ini salinan penuh, dan salinan locale (`/id/admin/produk/tambah`) sudah
// tertinggal fitur "stok dari produk dasar". Sekarang kedua route merender komponen
// yang SAMA — `src/components/admin/ProductForm.tsx` — supaya perubahan form tidak
// pernah cuma masuk ke satu sisi.
export { default } from "@/components/admin/ProductForm";
