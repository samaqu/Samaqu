export type Category =
  | "Thobe"
  | "Kandora"
  | "Koko"
  | "Vest"
  | "Kabak"
  | "Cover & Hanger";

export interface MediaItem {
  src: string;
  type: "image" | "video";
  color?: string; // optional: which color variant this media belongs to
}

export interface JenisKain {
  id: string;
  name: string;
  material: string | null;
  texture: string | null;
  suitable_for: string | null;
  care_instructions: string | null;
  image_url: string | null;
  display_order: number;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  description?: string;
  kain?: string;
  series?: string;
  colors: string[];
  price: number;
  weight?: number; // grams, used for shipping cost calculation
  tag?: "Baru" | "Eksklusif";
  badge_type?: string | null;
  note?: string;
  image: string;
  images: string[];
  media: MediaItem[];
  // Jenis Kain (structured)
  jenis_kain_id?: string | null;
  jenis_kain?: JenisKain | null;
  catatan_harga?: string | null;
  // Create Your Price
  minimum_price?: number | null;
  recommended_price?: number | null;
  create_your_price_enabled?: boolean;
  cyp_microcopy_override?: string | null;
  /** Ikut tampil di katalog halaman /open-order (kolom `products.open_order_enabled`). */
  open_order_enabled?: boolean;
  /**
   * Ikut tampil di katalog promo Free Cover Hanger (kolom `products.promo_fch_enabled`).
   * Terpisah dari `open_order_enabled` — promo punya jalur produknya sendiri.
   */
  promo_fch_enabled?: boolean;
  /** Harga khusus Open Order (kampanye). Null = pakai harga katalog di atas. */
  open_order_price?: number | null;
  open_order_minimum_price?: number | null;
  open_order_recommended_price?: number | null;
  open_order_cyp_enabled?: boolean | null;
  open_order_cyp_microcopy?: string | null;
}

/* ── Color hex map ── */
export const colorMap: Record<string, string> = {
  Superblack: "#1a1a1a",
  "Broken White": "#f5f0e8",
  Latte: "#c4a882",
  "Grey Indigo": "#4a5568",
  Mint: "#a8d5ba",
  Navy: "#1e3a5f",
  "Coffee Brown": "#5c3d2e",
  "Deep Maroon": "#5c1a1a",
  "Charcoal Grey": "#3d3d3d",
  "Soft Grey": "#b0b0b0",
  Army: "#4b5320",
  Beige: "#d4c5a9",
  "Abu Silver": "#a8a8a8",
  Cinnamon: "#8b5e3c",
  Maroon: "#6b1d1d",
  Black: "#111111",
  White: "#f8f8f8",
  Grey: "#808080",
  Brown: "#6b4226",
  Plum: "#5b2c6f",
  Jetblack: "#0a0a0a",
  "Deep Forest Green": "#1a3a2a",
  "Light Greige": "#c8bfb0",
  "Dark Taupe": "#5e5040",
  "Light Warm Grey": "#b5aa9a",
};

/* ── Helper: generate product image placeholder color ── */
function ph(category: Category): string {
  const map: Record<Category, string> = {
    Thobe: "#e5e5e5",
    Kandora: "#d8cfc0",
    Koko: "#c8bfb0",
    Vest: "#b8afa0",
    Kabak: "#a89f90",
    "Cover & Hanger": "#988f80",
  };
  return map[category];
}

/* ── All products ── */
const priceMap: Record<Category, number> = {
  Thobe: 389000,
  Kandora: 349000,
  Koko: 289000,
  Vest: 249000,
  Kabak: 189000,
  "Cover & Hanger": 89000,
};

const weightMap: Record<Category, number> = {
  Thobe: 800,
  Kandora: 750,
  Koko: 700,
  Vest: 500,
  Kabak: 600,
  "Cover & Hanger": 300,
};

export { weightMap };

/* ── Helper: generate images/media arrays from single image ── */
function withImages(image: string): { image: string; images: string[]; media: MediaItem[] } {
  return { image, images: [image], media: [{ src: image, type: "image" }] };
}

export const products: Product[] = [
  // ── THOBE B-01 ──
  ...(["Jiharkah", "Imron", "Bayati", "Nahawand", "Karim", "Imalah"] as const).map(
    (series, i) => {
      const isJiharkah = series === "Jiharkah";
      const jiharkahMedia: MediaItem[] = [
        { src: "/products/jiharkah/video%20(1).mp4", type: "video" },
        { src: "/products/jiharkah/video%20(2).mp4", type: "video" },
        { src: "/products/jiharkah/15.jpg", type: "image" },
        { src: "/products/jiharkah/16.jpg", type: "image" },
        { src: "/products/jiharkah/17.jpg", type: "image" },
        { src: "/products/jiharkah/18.jpg", type: "image" },
        { src: "/products/jiharkah/19.jpg", type: "image" },
        { src: "/products/jiharkah/20.jpg", type: "image" },
        { src: "/products/jiharkah/21.jpg", type: "image" },
        { src: "/products/jiharkah/22.jpg", type: "image" },
        { src: "/products/jiharkah/23.jpg", type: "image" },
      ];
      const fallbackMedia = withImages(`/images/products/thobe-b01-${i + 1}.jpg`);
      return {
        id: `thobe-b01-${series.toLowerCase()}`,
        name: `Thobe ${series}`,
        category: "Thobe" as Category,
        kain: "B-01",
        series,
        colors: ["Superblack", "Broken White", "Latte", "Grey Indigo", "Mint", "Navy"],
        price: priceMap.Thobe,
        ...(isJiharkah
          ? {
              image: "/products/jiharkah/15.jpg",
              images: jiharkahMedia.map((m) => m.src),
              media: jiharkahMedia,
            }
          : fallbackMedia),
      };
    }
  ),

  // ── THOBE B-02 ──
  {
    id: "thobe-b02-coffee",
    name: "Thobe Coffee Brown",
    category: "Thobe",
    kain: "B-02",
    colors: ["Coffee Brown", "Deep Maroon"],
    price: priceMap.Thobe,
    ...withImages("/images/products/thobe-b02-1.jpg"),
  },
  {
    id: "thobe-b02-maroon",
    name: "Thobe Deep Maroon",
    category: "Thobe",
    kain: "B-02",
    colors: ["Coffee Brown", "Deep Maroon"],
    price: priceMap.Thobe,
    ...withImages("/images/products/thobe-b02-2.jpg"),
  },

  // ── THOBE A-02 ──
  {
    id: "thobe-a02-charcoal",
    name: "Thobe Charcoal",
    category: "Thobe",
    kain: "A-02",
    colors: ["Charcoal Grey", "Soft Grey"],
    price: priceMap.Thobe,
    ...withImages("/images/products/thobe-a02-1.jpg"),
  },
  {
    id: "thobe-a02-softgrey",
    name: "Thobe Soft Grey",
    category: "Thobe",
    kain: "A-02",
    colors: ["Charcoal Grey", "Soft Grey"],
    price: priceMap.Thobe,
    ...withImages("/images/products/thobe-a02-2.jpg"),
  },

  // ── THOBE C-01 ──
  ...(["Superblack", "Broken White", "Army", "Beige", "Abu Silver", "Navy", "Cinnamon", "Maroon"] as const).map(
    (color, i) => ({
      id: `thobe-c01-${color.toLowerCase().replace(/\s/g, "-")}`,
      name: `Thobe ${color}`,
      category: "Thobe" as Category,
      kain: "C-01",
      colors: [color],
      price: priceMap.Thobe,
      tag: i < 2 ? ("Baru" as const) : undefined,
      ...withImages(`/images/products/thobe-c01-${i + 1}.jpg`),
    })
  ),

  // ── KANDORA B-01 ──
  ...(["Superblack", "Broken White", "Latte", "Grey Indigo", "Mint", "Navy"] as const).map(
    (color, i) => ({
      id: `kandora-b01-${color.toLowerCase().replace(/\s/g, "-")}`,
      name: `Kandora ${color}`,
      category: "Kandora" as Category,
      kain: "B-01",
      colors: [color],
      price: priceMap.Kandora,
      ...withImages(`/images/products/kandora-${i + 1}.jpg`),
    })
  ),

  // ── KOKO ZAHWAN ──
  ...(["Black", "White", "Grey", "Brown", "Plum"] as const).map(
    (color, i) => ({
      id: `koko-zahwan-${color.toLowerCase()}`,
      name: `Koko Zahwan ${color}`,
      category: "Koko" as Category,
      series: "Zahwan",
      colors: [color],
      price: priceMap.Koko,
      ...withImages(`/images/products/koko-${i + 1}.jpg`),
    })
  ),

  // ── VEST DUHA ──
  ...(["Jetblack", "Deep Forest Green", "Light Greige", "Dark Taupe", "Light Warm Grey"] as const).map(
    (color, i) => ({
      id: `vest-duha-${color.toLowerCase().replace(/\s/g, "-")}`,
      name: `Vest Duha ${color}`,
      category: "Vest" as Category,
      series: "Duha",
      colors: [color],
      price: priceMap.Vest,
      tag: i === 0 ? ("Eksklusif" as const) : undefined,
      ...withImages(`/images/products/vest-${i + 1}.jpg`),
    })
  ),

  // ── KABAK ──
  ...([1, 2, 3, 4, 5, 12, 13] as const).map((n) => ({
    id: `kabak-${n}`,
    name: `Kabak ${String(n).padStart(2, "0")}`,
    category: "Kabak" as Category,
    colors: [],
    price: priceMap.Kabak,
    note: "Include box / Box only",
    ...withImages(`/images/products/kabak-${n}.jpg`),
  })),

  // ── COVER & HANGER ──
  {
    id: "cover-thobe",
    name: "Cover Thobe",
    category: "Cover & Hanger",
    colors: [],
    price: priceMap["Cover & Hanger"],
    note: "Cover + Hanger / Cover only",
    ...withImages("/images/products/cover-thobe.jpg"),
  },
  {
    id: "cover-koko",
    name: "Cover Koko",
    category: "Cover & Hanger",
    colors: [],
    price: priceMap["Cover & Hanger"],
    note: "Cover + Hanger / Cover only / Hanger only",
    ...withImages("/images/products/cover-koko.jpg"),
  },
];

/* ── All categories ── */
export const allCategories: Category[] = [
  "Thobe",
  "Kandora",
  "Koko",
  "Vest",
  "Kabak",
  "Cover & Hanger",
];

/* ── Get product by ID ── */
export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

/* ── Get unique kain for a category ── */
export function getKainOptions(category: Category): string[] {
  return [...new Set(products.filter((p) => p.category === category).map((p) => p.kain).filter(Boolean))] as string[];
}

/* ── Get unique series for a category ── */
export function getSeriesOptions(category: Category): string[] {
  return [...new Set(products.filter((p) => p.category === category).map((p) => p.series).filter(Boolean))] as string[];
}

/* ── Get unique colors for a category ── */
export function getColorOptions(category: Category): string[] {
  const colors = new Set<string>();
  products.filter((p) => p.category === category).forEach((p) => p.colors.forEach((c) => colors.add(c)));
  return [...colors];
}
