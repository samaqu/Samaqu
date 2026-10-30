import type { KatalogProduct } from "@/lib/reseller/client";

/** Satu baris produk pada pesanan yang sedang disusun. */
export interface OrderLine {
  /** Kunci unik produk+warna+ukuran. */
  key: string;
  product: KatalogProduct;
  color: string;
  size: string;
  quantity: number;
  /** Harga jual ke customer (belum termasuk ongkir). */
  sellPrice: number;
  /** Stok efektif varian ini (dari API katalog). */
  stock: number;
}

export interface AddressValue {
  name: string;
  whatsapp: string;
  province: string;
  city: string;
  district: string;
  postalCode: string;
  address: string;
  notes: string;
}

export const EMPTY_ADDRESS: AddressValue = {
  name: "",
  whatsapp: "",
  province: "",
  city: "",
  district: "",
  postalCode: "",
  address: "",
  notes: "",
};

export function lineKey(productId: string, color: string, size: string): string {
  return `${productId}|${color}|${size}`;
}

export function lineSubtotal(line: OrderLine): number {
  return line.product.buy_price * line.quantity;
}

export function lineProfit(line: OrderLine): number {
  return (Math.round(line.sellPrice) - Math.round(line.product.buy_price)) * line.quantity;
}
