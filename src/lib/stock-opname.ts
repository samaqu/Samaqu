/**
 * Stok Opname — helper bersama (server & klien).
 *
 * Sumber angka stok tetap `product_variants` (lihat src/lib/ops-stock.ts untuk aturan stok
 * sharing). Modul ini hanya menyiapkan baris hitung: satu baris = satu kombinasi
 * produk × warna × ukuran, dengan `system_stock` SUDAH memakai stok efektif (baris series
 * turunan menampilkan stok induknya dan ditandai `is_derived` supaya tidak ikut dihitung).
 */

export const OPNAME_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;

export const OPNAME_STATUS = {
  draft: { label: "Draft", tone: "draft" },
  menunggu: { label: "Menunggu Persetujuan", tone: "wait" },
  disetujui: { label: "Disetujui", tone: "ok" },
  ditolak: { label: "Ditolak", tone: "reject" },
} as const;

export type OpnameStatus = keyof typeof OPNAME_STATUS;

/** Penyebab selisih — wajib dipilih kalau hitungan fisik berbeda dari stok sistem. */
export const OPNAME_REASONS = [
  { value: "salah_hitung", label: "Salah hitung" },
  { value: "rusak", label: "Rusak/cacat" },
  { value: "hilang", label: "Hilang" },
  { value: "retur", label: "Retur belum tercatat" },
  { value: "salah_input", label: "Salah input transaksi" },
  { value: "lainnya", label: "Lainnya" },
] as const;

export function reasonLabel(value?: string | null): string {
  return OPNAME_REASONS.find((r) => r.value === value)?.label || "-";
}

export type OpnameLine = {
  id?: string;
  product_id: string;
  product_name: string;
  sku: string;
  category: string;
  jenis_kain: string;
  series: string;
  color: string;
  size: string;
  system_stock: number;
  counted_stock: number | null;
  reason: string | null;
  reason_note: string | null;
  price: number;
  is_derived: boolean;
  base_product_id: string | null;
  base_product_name: string | null;
};

/** Selisih = hitungan fisik − stok sistem. `null` = belum dihitung. */
export function lineDiff(line: OpnameLine): number | null {
  if (line.is_derived) return null;
  if (line.counted_stock === null || line.counted_stock === undefined) return null;
  return Number(line.counted_stock) - Number(line.system_stock);
}

/** Keadaan warna sel: cocok / kurang / lebih / belum dihitung / info (stok sharing). */
export function lineState(line: OpnameLine): "cocok" | "kurang" | "lebih" | "belum" | "info" {
  if (line.is_derived) return "info";
  const diff = lineDiff(line);
  if (diff === null) return "belum";
  if (diff === 0) return "cocok";
  return diff < 0 ? "kurang" : "lebih";
}

export function formatRupiah(value: number): string {
  return Math.abs(Math.round(Number(value) || 0)).toLocaleString("id-ID");
}

/**
 * Nama warna yang ditampilkan: `default` = produk satu warna, jangan tampilkan nilai mentahnya
 * (konvensi yang sama dengan Laporan Stok & drawer produk).
 */
export function displayColor(color?: string | null, productName?: string | null): string {
  const value = String(color || "").trim();
  if (!value || value.toLowerCase() === "default") return productName || "-";
  return value;
}

export type StockBuildProducts = {
  id: string;
  name?: string | null;
  series?: string | null;
  price?: number | null;
  hpp?: number | null;
  category?: string | null;
  jenis_kain?: { name?: string | null } | null;
};

export type StockBuildVariant = {
  product_id: string;
  color?: string | null;
  size?: string | null;
  stock?: number | null;
  sku?: string | null;
  base_product_id?: string | null;
  base_size?: string | null;
};

/**
 * Susun baris hitung dari data katalog. Urutan sengaja sama dengan Laporan Stok
 * (kategori → jenis kain → produk → warna → ukuran) supaya staf gudang tidak bingung.
 */
export function buildOpnameLines(
  products: StockBuildProducts[],
  variants: StockBuildVariant[],
): OpnameLine[] {
  const byId = new Map<string, StockBuildProducts>();
  for (const p of products || []) byId.set(p.id, p);

  // Stok milik sendiri per produk+warna+ukuran → dipakai baris turunan.
  const stockMap = new Map<string, number>();
  const key = (pid: string, color: string, size: string) => `${pid}|${color}|${size}`;
  for (const v of variants || []) {
    const color = String(v.color || "default").toLowerCase();
    const size = String(v.size || "").toUpperCase();
    if (!size) continue;
    stockMap.set(key(v.product_id, color, size), Number(v.stock) || 0);
  }

  const lines: OpnameLine[] = [];
  for (const v of variants || []) {
    const size = String(v.size || "").toUpperCase();
    if (!size) continue;
    const color = String(v.color || "default").toLowerCase();
    const product = byId.get(v.product_id);
    const baseId = v.base_product_id ? String(v.base_product_id) : null;
    const baseSize = String(v.base_size || size).toUpperCase();
    const isDerived = Boolean(baseId);
    const systemStock = isDerived
      ? stockMap.get(key(baseId as string, color, baseSize)) ?? 0
      : Number(v.stock) || 0;
    const baseProduct = baseId ? byId.get(baseId) : null;
    const hpp = Number(product?.hpp) || 0;
    const price = hpp > 0 ? hpp : Number(product?.price) || 0;

    lines.push({
      product_id: v.product_id,
      product_name: product?.name || v.product_id,
      sku: String(v.sku || "").trim(),
      category: String(product?.category || ""),
      jenis_kain: String(product?.jenis_kain?.name || ""),
      series: String(product?.series || ""),
      color,
      size,
      system_stock: systemStock,
      counted_stock: null,
      reason: null,
      reason_note: null,
      price,
      is_derived: isDerived,
      base_product_id: baseId,
      base_product_name: baseId
        ? baseProduct?.series || baseProduct?.name || baseId
        : null,
    });
  }

  lines.sort((a, b) =>
    [a.category, a.jenis_kain, a.product_name, a.color, a.size]
      .join("|")
      .localeCompare([b.category, b.jenis_kain, b.product_name, b.color, b.size].join("|"), "id", {
        sensitivity: "base",
      }),
  );

  return lines;
}

/** "SO-001" dari nomor terakhir yang tersimpan. */
export function nextOpnameCode(last?: string | null): string {
  const match = /^SO-(\d+)$/i.exec(String(last || "").trim());
  const next = match ? Number(match[1]) + 1 : 1;
  return `SO-${String(next).padStart(3, "0")}`;
}

/** Nilai selisih (rupiah): qty × harga (HPP kalau ada, kalau tidak harga jual). */
export function lineDiffValue(line: OpnameLine): number {
  const diff = lineDiff(line);
  return diff === null ? 0 : diff * (Number(line.price) || 0);
}
