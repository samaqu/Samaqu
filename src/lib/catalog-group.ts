import type { Product } from "@/lib/katalog-data";

/**
 * Bentuk kartu katalog: satu kartu = satu produk utama (nama + kategori),
 * semua series digabung. Dipakai dashboard customer supaya grouping-nya
 * sama dengan halaman /katalog, tanpa menyalin aturan ke dalam JSX.
 */
export interface CatalogProduct extends Product {
  availableSeries?: string[];
}

export function catalogPrice(product: Product): number {
  return product.create_your_price_enabled && product.minimum_price
    ? product.minimum_price
    : product.price;
}

/** Kunci grup katalog website: satu kartu = satu kategori + nama produk. */
export function catalogGroupKey(product: { category: string; name: string }): string {
  return `${product.category}::${product.name}`;
}

export function groupCatalogProducts(raw: Product[]): {
  items: CatalogProduct[];
  memberIdsByRep: Record<string, string[]>;
} {
  const groups = new Map<string, Product[]>();
  for (const product of raw) {
    const key = catalogGroupKey(product);
    const list = groups.get(key) || [];
    list.push(product);
    groups.set(key, list);
  }

  const items: CatalogProduct[] = [];
  const memberIdsByRep: Record<string, string[]> = {};

  for (const group of groups.values()) {
    const rep: CatalogProduct = { ...group[0] };
    memberIdsByRep[rep.id] = group.map((member) => member.id);

    if (group.length > 1) {
      const colors = new Set<string>();
      let cheapest = group[0];
      let cheapestValue = catalogPrice(group[0]);
      for (const member of group) {
        member.colors.forEach((color) => colors.add(color));
        const value = catalogPrice(member);
        if (value < cheapestValue) {
          cheapestValue = value;
          cheapest = member;
        }
      }
      rep.colors = [...colors];
      rep.price = cheapestValue;
      rep.minimum_price = cheapest.minimum_price;
      rep.create_your_price_enabled = cheapest.create_your_price_enabled;
      rep.availableSeries = [
        ...new Set(group.map((member) => member.series).filter((series): series is string => !!series)),
      ].sort();
    }

    items.push(rep);
  }

  return { items, memberIdsByRep };
}
