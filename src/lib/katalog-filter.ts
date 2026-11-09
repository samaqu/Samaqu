export interface FilterState {
  sizes: string[];
  colors: string[];
  priceRange: string | null;
}

export const priceRanges = [
  { id: "under300", label: "Di bawah Rp 300.000", min: 0, max: 299999 },
  { id: "300to500", label: "Rp 300.000 - 500.000", min: 300000, max: 500000 },
  { id: "above500", label: "Di atas Rp 500.000", min: 500001, max: Infinity },
];

/** Terapkan filter katalog ke daftar produk. */
export function applyFilters<T extends { colors: string[]; price: number }>(
  items: T[],
  filters: FilterState,
): T[] {
  let result = items;
  if (filters.colors.length > 0) {
    result = result.filter((p) => p.colors.some((c) => filters.colors.includes(c)));
  }
  if (filters.priceRange) {
    const range = priceRanges.find((r) => r.id === filters.priceRange);
    if (range) {
      result = result.filter((p) => p.price >= range.min && p.price <= range.max);
    }
  }
  return result;
}
