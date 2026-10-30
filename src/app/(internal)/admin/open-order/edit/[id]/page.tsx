"use client";

import { use } from "react";
import ProductForm from "@/components/admin/ProductForm";

/**
 * Form harga Open Order (/admin/open-order/edit/<id>).
 *
 * Memakai komponen form produk yang SAMA (`ProductForm`) — tampilan, varian, stok, foto, dan
 * Create Your Price persis seperti menu Produk — tetapi harga & CYP disimpan ke kolom khusus
 * Open Order (`open_order_*`), jadi harga katalog di menu Produk tidak ikut berubah.
 */
export default function OpenOrderEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProductForm editProductId={id} priceTarget="openOrder" />;
}
