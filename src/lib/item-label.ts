/**
 * Label varian/item untuk pembeli — SATU sumber supaya keranjang, checkout, ringkasan
 * pesanan, dan pesan WhatsApp tidak merangkai sendiri-sendiri.
 *
 * Kategori **paket** (Cover & Hanger dan Kabak) bukan pakaian: variannya berupa NAMA
 * (mis. "Hanger saja", "Kabak 01"), bukan warna × ukuran. Di database variannya tetap satu
 * baris `product_variants` dengan `color` = nama varian dan `size` = "ALL SIZE"
 * (lihat `ProductForm.tsx`).
 *
 * Karena `order_items` tidak menyimpan kategori produk, item dikenali sebagai paket dari
 * ukuran penandanya (`ALL SIZE`) — satu-satunya ukuran yang dipakai kategori ini. Untuk data
 * yang memang membawa kategori (halaman produk, keranjang dari halaman produk), kategorinya
 * juga dihormati.
 */

export const PAKET_CATEGORY = "Cover & Hanger";
export const KABAK_CATEGORY = "Kabak";
export const PAKET_SIZE = "ALL SIZE";

function kategoriWords(category?: string | null): string[] {
  const teks = String(category ?? "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return teks ? teks.split(" ") : [];
}

/** Ukuran penanda kategori paket. */
export function isPaketSize(size?: string | null): boolean {
  return String(size ?? "").trim().toUpperCase() === PAKET_SIZE;
}

/** Kategori Cover & Hanger (ejaan lama: "Cover Hanger", "Hanger", "Cover"). */
export function isCoverHangerKategori(category?: string | null): boolean {
  const words = kategoriWords(category);
  return words.includes("hanger") || words.join(" ") === "cover";
}

/** Kategori Kabak (termasuk ejaan "Kabak 01", "Kabak Box", dst). */
export function isKabakKategori(category?: string | null): boolean {
  return kategoriWords(category).includes("kabak");
}

/**
 * Kategori paket: Cover & Hanger + Kabak. Dipakai SEMUA tempat supaya kategori ini tidak
 * pernah lagi jatuh ke alur pakaian hanya karena ejaannya berbeda.
 */
export function isPaketKategori(category?: string | null): boolean {
  return isCoverHangerKategori(category) || isKabakKategori(category);
}

/** Item ini varian "paket" (Cover & Hanger / Kabak)? */
export function isPaketItem(item?: { size?: string | null; category?: string | null } | null): boolean {
  if (!item) return false;
  if (isPaketKategori(item.category)) return true;
  return isPaketSize(item.size);
}

/** Nama varian yang layak ditampilkan (buang "default" dan "-" penanda kosong). */
export function variantName(color?: string | null): string {
  const nama = String(color ?? "").trim();
  if (!nama || nama === "-" || nama.toLowerCase() === "default") return "";
  return nama;
}

/**
 * Baris varian untuk ditampilkan di bawah nama produk:
 *  - paket (Cover & Hanger) → nama paket saja, tanpa ukuran;
 *  - lainnya → "Warna · Ukuran" (bagian kosong tidak ikut tampil).
 */
export function itemVariantLabel(item?: {
  color?: string | null;
  size?: string | null;
  /** Dipakai membaca paket dari data lama yang menaruh nama paketnya di kolom `series`. */
  series?: string | null;
  category?: string | null;
} | null): string {
  if (!item) return "";
  // Paket: nama paketnya bisa tersimpan di `color` atau (data lama) di `series`.
  if (isPaketItem(item)) return variantName(item.color) || variantName(item.series);
  return [variantName(item.color), String(item.size ?? "").trim()].filter(Boolean).join(" · ");
}

/** Nama item satu baris: "Cover Thobe - Hanger saja" (paket) atau "Thobe X - Superblack · L". */
export function itemDisplayName(item?: {
  name?: string | null;
  color?: string | null;
  size?: string | null;
  category?: string | null;
} | null): string {
  if (!item) return "";
  const nama = String(item.name ?? "").trim();
  const label = itemVariantLabel(item);
  return label ? `${nama} - ${label}` : nama;
}

/**
 * Akhiran nama item untuk pesan teks (WhatsApp admin/customer):
 * paket → " - Hanger saja"; lainnya → " (Superblack / L)" seperti format lama.
 */
export function itemNameSuffix(item?: {
  color?: string | null;
  size?: string | null;
  category?: string | null;
} | null): string {
  if (!item) return "";
  if (isPaketItem(item)) {
    const paket = variantName(item.color);
    return paket ? ` - ${paket}` : "";
  }
  const varian = [String(item.color ?? "").trim(), String(item.size ?? "").trim()].filter(Boolean).join(" / ");
  return varian ? ` (${varian})` : "";
}

/**
 * Item untuk baris produk notifikasi WhatsApp.
 * Sumber field: `order_items.product_name`, `series`, `kain`, `color`, `size`, `quantity`
 * (atau objek item yang dibaca server dari katalog).
 */
export interface WhatsAppProductItem {
  name?: string | null;
  series?: string | null;
  kain?: string | null;
  color?: string | null;
  size?: string | null;
  quantity?: number | null;
  category?: string | null;
}

/** Bersihkan teks: null/undefined literal dibuang, spasi ganda dirapatkan. */
function waClean(value?: string | null): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return /^(undefined|null)$/i.test(text) ? "" : text;
}

/** Warna saja — tanpa "default"/"-", tanpa kurung, tanpa kode kain. */
function waColor(value?: string | null): string {
  const raw = waClean(value);
  if (!raw || raw === "-" || raw.toLowerCase() === "default") return "";
  return waClean(
    raw
      .replace(/\s*\(\s*kain\s*[^)]*\)/gi, "")
      .replace(/\bkain\s+[a-z0-9][a-z0-9.-]*\b/gi, ""),
  );
}

/** Kode kain tanpa awalan "Kain". */
function waKain(value?: string | null): string {
  const raw = waClean(value);
  return raw ? waClean(raw.replace(/^kain\s+/i, "")) : "";
}

/** Cari kode kain di teks lama, mis. "Latte (Kain B-01)" → "B-01". */
function waKainFromText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const match = waClean(value).match(/\bkain\s*[:\-]?\s*([a-z0-9][a-z0-9.-]*)/i);
    if (match?.[1]) return match[1];
  }
  return "";
}

/** "Jiharkah" → "Jiharkah Series"; "Jiharkah Series" tetap. */
function waSeries(value?: string | null): string {
  const raw = waClean(value);
  if (!raw) return "";
  return /\bseries\b/i.test(raw) ? raw : `${raw} Series`;
}

/** "L" / "Size L" → "size L". */
function waSize(value?: string | null): string {
  const raw = waClean(value).replace(/^size\s+/i, "");
  return raw ? `size ${raw.toUpperCase()}` : "";
}

function waHas(text: string, part: string): boolean {
  return part ? text.toLowerCase().includes(part.toLowerCase()) : false;
}

/** Rapikan nama lama: "(Kain B-01)" → "Kain B-01", "Size M" → "size M". */
function waNormalizeName(value: string): string {
  return waClean(
    value
      .replace(/\(\s*kain\s*([^)]+)\)/gi, "Kain $1")
      .replace(/\bsize\s*([a-z0-9]+)\b/gi, (_match, size: string) => `size ${size.toUpperCase()}`),
  );
}

/** Pisahkan nama produk katalog ("Thobe Soft Grey") jadi base + warna yang menempel. */
function waSplitName(name: string, color: string): { base: string; embedded: string } {
  if (color) {
    const index = name.toLowerCase().lastIndexOf(color.toLowerCase());
    if (index > 0) return { base: name.slice(0, index).trim(), embedded: color };
    if (index === 0) return { base: "", embedded: color };
    return { base: name, embedded: "" };
  }
  const words = name.split(" ").filter(Boolean);
  if (words.length > 1) return { base: words[0], embedded: words.slice(1).join(" ") };
  return { base: name, embedded: "" };
}

/**
 * Satu baris produk untuk notifikasi WhatsApp:
 * `[nama] [Series] [warna] [Kain X] size [UKURAN] x[qty]`.
 *
 * Data lama (series/kain kosong, nama sudah lengkap) dipakai apa adanya setelah dirapikan,
 * jadi tidak ada "undefined"/"null"/spasi ganda. Paket (Cover & Hanger/Kabak) memakai
 * format sendiri yang lebih masuk akal.
 */
export function formatWhatsAppProductLine(item?: WhatsAppProductItem | null): string {
  if (!item) return "";
  const qty = Math.max(1, Number(item.quantity) || 1);
  const seriesRaw = waClean(item.series);
  const series = waSeries(seriesRaw);
  const color = waColor(item.color);
  const kain = waKain(item.kain) || waKainFromText(item.color) || waKainFromText(item.name);
  const kainText = kain ? `Kain ${kain}` : "";
  const size = waSize(item.size);

  let name = waClean(item.name);
  // Open Order menyimpan series di nama ("Thobe Soft Grey — Nahawand"). Buang bagian itu
  // supaya series bisa disusun di urutan yang benar, bukan menempel di belakang warna.
  if (seriesRaw) {
    const escaped = seriesRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    name = waClean(name.replace(new RegExp(`\\s*[—–-]\\s*${escaped}\\s*$`, "i"), ""));
  }

  // Paket/aksesori: "Kabak 01 x1" / "Cover Hanger - Hanger saja x1".
  if (isPaketItem(item)) {
    const variant = variantName(item.color) || variantName(item.series);
    let label = name;
    if (variant && !waHas(label, variant)) {
      if (variant.toLowerCase().startsWith(label.toLowerCase())) label = variant;
      else if (label) label = `${label} - ${variant}`;
      else label = variant;
    }
    return `${waClean(label) || "Produk"} x${qty}`;
  }

  if (!name) {
    return `${waClean([series, color, kainText, size].filter(Boolean).join(" ")) || "Produk"} x${qty}`;
  }

  const seriesKey = seriesRaw.replace(/\s*series\s*$/i, "");
  const hasSeriesInName = Boolean(seriesKey) && waHas(name, seriesKey);
  const hasKainInName = Boolean(kain) && waHas(name, kain);
  // Nama yang sudah memuat series/kain adalah snapshot lama yang lengkap — jangan disusun ulang.
  const useNameAsIs = (Boolean(seriesKey) && hasSeriesInName) || (Boolean(kain) && hasKainInName) || (!seriesRaw && !kain);

  let base: string;
  let parts: string[];
  if (useNameAsIs) {
    base = waNormalizeName(name);
    parts = [series, color, kainText, size];
  } else {
    const split = waSplitName(name, color);
    base = waNormalizeName(split.base);
    parts = [series, color || split.embedded, kainText, size];
  }

  let text = base;
  for (const part of parts) {
    const clean = waClean(part);
    if (!clean) continue;
    if (waHas(text, clean)) continue;
    if (/^size\s/i.test(clean) && /\bsize\s+[a-z0-9]+\b/i.test(text)) continue;
    text = text ? `${text} ${clean}` : clean;
  }

  return `${waClean(text) || "Produk"} x${qty}`;
}

/**
 * Label produk TANPA akhiran jumlah — untuk invoice Mayar yang menambahkan `xQty` sendiri.
 * Contoh: "Thobe Jiharkah Series Soft Grey Kain A-02 size L".
 */
export function formatProductLabel(item?: WhatsAppProductItem | null): string {
  return formatWhatsAppProductLine(item).replace(/\s+x\d+$/, "");
}

/**
 * Nama item untuk label pengiriman (AWB).
 *
 * Nama produk Open Order sudah memuat series, mis. "Thobe Grey Indigo — Jiharkah",
 * sementara kolom `series` juga berisi "Jiharkah". Jangan ditempel lagi kalau teksnya
 * sudah ada, supaya label tidak menulis "Jiharkah Jiharkah".
 */
export function labelItemName(item?: {
  product_name?: string | null;
  name?: string | null;
  series?: string | null;
} | null): string {
  const name = String(item?.product_name ?? item?.name ?? "").trim();
  const series = String(item?.series ?? "").trim();
  if (!series) return name;
  if (!name) return series;
  return name.toLowerCase().includes(series.toLowerCase()) ? name : `${name} ${series}`;
}
