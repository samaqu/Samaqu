import type { KatalogProduct } from "@/lib/reseller/client";

/** Satu baris produk pada pesanan yang sedang disusun. */
export interface OrderLine {
  /** Identitas baris (stabil walau varian berubah). */
  uid: string;
  /** Kunci unik produk+warna+ukuran (untuk dedupe varian yang sama). */
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

export function newLineUid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Stok efektif varian tertentu (0 kalau tidak ada). */
export function variantStock(product: KatalogProduct, color: string, size: string): number {
  return Math.max(0, product.variants.find((v) => v.color === color && v.size === size)?.stock || 0);
}

/** Varian pertama yang masih ada stok — dipakai saat series dipilih. */
export function firstAvailableVariant(
  product: KatalogProduct
): { color: string; size: string; stock: number } | null {
  const colors = [...new Set(product.variants.map((v) => v.color))];
  for (const color of colors) {
    const variant = product.variants.find((v) => v.color === color && v.stock > 0);
    if (variant) return { color, size: variant.size, stock: Math.max(0, variant.stock) };
  }
  return null;
}

/** Baris baru dari series terpilih; null kalau semua varian stok 0. */
export function createOrderLine(product: KatalogProduct): OrderLine | null {
  const variant = firstAvailableVariant(product);
  if (!variant) return null;
  return {
    uid: newLineUid(),
    key: lineKey(product.id, variant.color, variant.size),
    product,
    color: variant.color,
    size: variant.size,
    quantity: 1,
    sellPrice: product.min_sell_price,
    stock: variant.stock,
  };
}

export function lineSubtotal(line: OrderLine): number {
  return line.product.buy_price * line.quantity;
}

export function lineProfit(line: OrderLine): number {
  return (Math.round(line.sellPrice) - Math.round(line.product.buy_price)) * line.quantity;
}
