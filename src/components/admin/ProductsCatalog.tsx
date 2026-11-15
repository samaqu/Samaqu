"use client";

/**
 * Panel "Produk" admin — wireframe-accurate "Dashboard Products Catalog"
 * (needmcp wireframe:dashboard-products-catalog).
 *
 * Tata letak mengikuti wireframe: judul + "menampilkan X dari Y", toggle tampilan
 * grid/list, sort, tombol Tambah Produk, strip pill kategori, lalu grid 12 kolom =
 * rail filter (col-span-3) + grid kartu produk (col-span-9).
 *
 * SEMUA angka & opsi filter dihitung dari data asli (kategori, jenis kain, harga,
 * stok). Tidak ada rating / "terjual" / SKU karangan — kolom itu tidak ada di tabel
 * `products`, jadi barisnya diganti data nyata (series & warna).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { LayoutGrid, ClipboardList, Plus, ChevronDown, Search, X, Package, Trash2, Eye, Edit, SlidersHorizontal } from "lucide-react";
import { allCategories } from "@/lib/katalog-data";

export interface CatalogCard {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  minimum_price?: number | null;
  create_your_price_enabled?: boolean;
  series?: string | null;
  kain?: string | null;
  jenis_kain?: { name: string } | null;
  colors?: string[];
  availableSeries?: string[];
  memberIds?: string[];
  totalStock?: number;
  matchedSeries?: string;
  seriesStock?: { name: string; stock: number; isDerived: boolean; follows?: string }[];
  /** Status keikutsertaan di /open-order (kolom `products.open_order_enabled`, default true). */
  openOrderEnabled?: boolean;
  /** Tampil di katalog website (kolom `products.is_published`). false = "Dari Ops, belum tampil". */
  isPublished?: boolean;
  /** Harga khusus Open Order (kolom `products.open_order_price`); null = pakai harga katalog. */
  openOrderPrice?: number | null;
}

/**
 * Mode "Open Order" — kartu katalog dipakai juga di menu admin "Open Order", tapi aksi
 * kartunya diganti sakelar Tampil/Tersembunyi + tombol Edit (form produk & harga khusus
 * Open Order) — tanpa Hapus.
 */
export interface OpenOrderMode {
  isEnabled: (p: CatalogCard) => boolean;
  onToggle: (p: CatalogCard) => void;
  /** id kartu yang sedang disimpan (tombolnya jadi "Menyimpan…"). */
  savingId?: string | null;
  /** Tujuan tombol Edit (form produk + harga khusus Open Order). Kosong = tombol Edit disembunyikan. */
  editHref?: (p: CatalogCard) => string;
}

type Availability = "all" | "ready" | "low" | "out";
type SortKey = "name-asc" | "price-asc" | "price-desc" | "stock-desc";

const PRICE_BUCKETS = [
  { key: "b1", label: "Di bawah Rp 150rb", min: 0, max: 150_000 },
  { key: "b2", label: "Rp 150rb – Rp 300rb", min: 150_000, max: 300_000 },
  { key: "b3", label: "Rp 300rb – Rp 500rb", min: 300_000, max: 500_000 },
  { key: "b4", label: "Rp 500rb ke atas", min: 500_000, max: Infinity },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name-asc", label: "Nama A–Z" },
  { value: "price-asc", label: "Harga terendah" },
  { value: "price-desc", label: "Harga tertinggi" },
  { value: "stock-desc", label: "Stok terbanyak" },
];

const money = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

/** Harga efektif — sama dengan aturan lama: harga minimum bila Create Your Price aktif. */
function effectivePrice(p: CatalogCard): number {
  return p.create_your_price_enabled && p.minimum_price ? p.minimum_price : p.price;
}

/** Nama kain produk — dari relasi `jenis_kain`, fallback kolom `kain`. */
const fabricOf = (p: CatalogCard) => (p.jenis_kain?.name || p.kain || "").trim();

/** Bucket harga (untuk filter rentang) berdasarkan harga efektif. */
const bucketOf = (p: CatalogCard) =>
  PRICE_BUCKETS.find((b) => effectivePrice(p) >= b.min && effectivePrice(p) < b.max)?.key ?? "";

/** Status stok → pill di atas foto (data asli dari totalStock). */
function stockTone(stock: number) {
  if (stock > 10) return { label: "Aktif", dot: "#047857", bg: "#ecfdf5", color: "#047857" };
  if (stock > 0) return { label: "Stok menipis", dot: "#d97706", bg: "#fffbeb", color: "#b45309" };
  return { label: "Habis", dot: "#dc2626", bg: "#fef2f2", color: "#b91c1c" };
}

/* ── aksi baris kartu (identik untuk grid & list) ── */
function CardActions({
  p,
  onDelete,
  onDetail,
}: {
  p: CatalogCard;
  onDelete?: (id: string, name: string, memberIds?: string[]) => void;
  onDetail?: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 mt-3">
      <Link
        href={`/admin/produk/edit/${p.id}`}
        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg text-white"
        style={{ background: "var(--fg)" }}
      >
        <Edit size={13} strokeWidth={2} /> Edit
      </Link>
      {/* Detail dibuka sebagai drawer (bukan pindah halaman); halaman
          /admin/produk/detail/<id> tetap ada sebagai tautan langsung. */}
      <button
        onClick={() => onDetail?.(p.id)}
        className="w-9 h-9 flex items-center justify-center rounded-lg"
        style={{ border: "1px solid var(--bd)", color: "var(--fg2)" }}
        title="Detail produk"
      >
        <Eye size={15} strokeWidth={2} />
      </button>
      <button
        onClick={() => onDelete?.(p.id, p.name, p.memberIds)}
        className="w-9 h-9 flex items-center justify-center rounded-lg"
        style={{ border: "1px solid var(--bd)", color: "#b91c1c" }}
        title="Hapus produk"
      >
        <Trash2 size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

/** Aksi kartu mode Open Order: sakelar Tampil/Tersembunyi + tombol Edit + tombol detail. */
function OpenOrderAction({
  p,
  openOrder,
  onDetail,
}: {
  p: CatalogCard;
  openOrder: OpenOrderMode;
  onDetail?: (id: string) => void;
}) {
  const on = openOrder.isEnabled(p);
  const saving = openOrder.savingId === p.id;
  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={() => openOrder.onToggle(p)}
        disabled={saving}
        aria-pressed={on}
        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-lg whitespace-nowrap"
        style={
          on
            ? { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857" }
            : { background: "var(--sub)", border: "1px solid var(--bd)", color: "var(--fg2)" }
        }
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: on ? "#047857" : "var(--fg3)" }} />
        {saving ? "Menyimpan…" : on ? "Tampil di Open Order" : "Tersembunyi"}
      </button>
      {openOrder.editHref && (
        <Link
          href={openOrder.editHref(p)}
          className="flex items-center justify-center gap-1.5 text-xs font-bold py-2 px-3 rounded-lg text-white shrink-0 whitespace-nowrap"
          style={{ background: "var(--fg)" }}
          title="Edit produk & harga Open Order"
        >
          <Edit size={13} strokeWidth={2} /> Edit
        </Link>
      )}
      {onDetail && (
        <button
          onClick={() => onDetail(p.id)}
          className="w-9 h-9 flex items-center justify-center rounded-lg shrink-0"
          style={{ border: "1px solid var(--bd)", color: "var(--fg2)" }}
          title="Detail produk"
        >
          <Eye size={15} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

/* ── isi kartu: label kategori + nama + meta nyata + chip series + harga + stok ── */
function CardBody({
  p,
  maxStock,
  openOrder,
}: {
  p: CatalogCard;
  maxStock: number;
  /** Mode Open Order: tampilkan harga khusus Open Order bila ada (fallback harga katalog). */
  openOrder?: boolean;
}) {
  const price = openOrder && p.openOrderPrice != null ? p.openOrderPrice : effectivePrice(p);
  const stock = p.totalStock ?? 0;
  const fabric = fabricOf(p);

  /* Daftar series lengkap untuk chip. Utamakan `seriesStock` (sudah ada angka
     stoknya dari product_variants); kalau kosong, jatuh ke `availableSeries`
     lalu ke series tunggal produk — supaya nama series tetap tampil. */
  const seriesList = ((): { name: string; stock: number | null; isDerived?: boolean; follows?: string }[] => {
    if (p.seriesStock && p.seriesStock.length > 0) {
      return p.seriesStock.map((sr) => ({ name: sr.name, stock: sr.stock, isDerived: sr.isDerived, follows: sr.follows }));
    }
    const names = p.availableSeries && p.availableSeries.length > 0 ? p.availableSeries : p.series ? [p.series] : [];
    return names.map((name) => ({ name, stock: null }));
  })();

  return (
    <>
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] truncate" style={{ color: "var(--fg3)" }}>
        {p.category}
        {fabric ? ` · ${fabric}` : ""}
      </p>
      <h3 className="text-sm font-extrabold mt-1 leading-snug" style={{ color: "var(--fg)" }}>
        {p.name}
      </h3>

      {p.isPublished === false && (
        <span
          className="mt-1.5 inline-flex items-center self-start px-1.5 py-0.5 rounded text-[9px] font-bold"
          style={{ background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" }}
        >
          Dari Ops, belum tampil
        </span>
      )}

      {/* Baris meta — data nyata; nama series ditampilkan lengkap sebagai chip di bawah */}
      <p className="text-[10px] font-bold mt-1" style={{ color: "var(--fg3)" }}>
        {p.colors && p.colors.length > 0 ? `${p.colors.length} warna` : p.series || "—"}
      </p>
      {p.matchedSeries && (
        <span
          className="mt-1.5 inline-flex items-center self-start px-1.5 py-0.5 rounded text-[9px] font-bold"
          style={{ background: "var(--sub)", color: "var(--fg2)" }}
        >
          Cocok: {p.matchedSeries}
        </span>
      )}

      <div className="flex items-center justify-between mt-2.5">
        <span className="text-base font-extrabold" style={{ color: "var(--fg)" }}>
          {money(price)}
        </span>
        <span
          className="text-[10px] font-bold"
          style={{ color: stock > 10 ? "var(--fg3)" : stock > 0 ? "#b45309" : "#b91c1c" }}
        >
          {stock > 0 ? `${stock} stok` : "Habis"}
        </span>
      </div>

      {/* Bar stok — relatif terhadap stok terbesar di katalog (angka asli) */}
      <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: "var(--sub)" }}>
        <div
          className="h-full rounded-full transition-all"
          title={`Stok ${stock} dari ${maxStock}`}
          style={{
            width: `${Math.max(stock > 0 ? 4 : 0, (stock / maxStock) * 100)}%`,
            background: stock > 10 ? "var(--fg)" : stock > 0 ? "#d97706" : "#dc2626",
          }}
        />
      </div>

      {/* Chip series — nama series tampil lengkap, ala tab "Pilih Series" di
          halaman katalog detail. Tiap chip membawa stok serinya (data asli dari
          product_variants). Produk tanpa series tidak merender blok ini. */}
      {seriesList.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: "var(--fg3)" }}>
            Series
          </p>
          <div className="flex flex-wrap gap-1.5">
            {seriesList.map((sr) => (
              <span
                key={sr.name}
                title={sr.isDerived && sr.follows ? `Stok mengikuti ${sr.follows}` : sr.stock === null ? undefined : `Stok ${sr.name}`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold"
                style={{ background: "var(--card)", border: "1px solid var(--bd)", color: "var(--fg2)" }}
              >
                <span className="truncate max-w-[92px]">{sr.name}</span>
                {sr.stock !== null && (
                  <span
                    className="shrink-0 tabular-nums"
                    style={{ color: sr.stock === 0 ? "#b91c1c" : sr.stock < 5 ? "#b45309" : "var(--fg)" }}
                  >
                    {sr.stock}
                  </span>
                )}
              </span>
            ))}
          </div>
          {/* baris bantu bila ada series turunan yang menumpang stok series lain */}
          {seriesList.some((sr) => sr.isDerived && sr.follows) && (
            <p className="text-[9px] font-bold mt-1.5" style={{ color: "var(--fg3)" }}>
              {seriesList
                .filter((sr) => sr.isDerived && sr.follows)
                .map((sr) => `${sr.name} mengikuti ${sr.follows}`)
                .join(" · ")}
            </p>
          )}
        </div>
      )}
    </>
  );
}

export default function ProductsCatalog({
  items,
  total,
  thumbnails,
  search,
  setSearch,
  onDelete,
  onDetail,
  loading = false,
  openOrder,
  title,
  subtitle,
}: {
  /** Hasil pencarian dari caller (topbar) — jadi dasar perhitungan facet di rail. */
  items: CatalogCard[];
  /** Jumlah produk katalog sebelum filter apa pun (untuk baris "menampilkan X dari Y"). */
  total: number;
  thumbnails: Record<string, string>;
  search: string;
  setSearch: (v: string) => void;
  onDelete?: (id: string, name: string, memberIds?: string[]) => void;
  /** Buka detail produk sebagai drawer (disediakan kedua dashboard admin). */
  onDetail?: (id: string) => void;
  loading?: boolean;
  /** Diisi = mode Open Order: aksi kartu jadi sakelar Tampil/Tersembunyi. */
  openOrder?: OpenOrderMode;
  title?: string;
  subtitle?: string;
}) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<Availability>("all");
  const [buckets, setBuckets] = useState<Set<string>>(new Set());
  const [fabrics, setFabrics] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  /* ── pilihan facet ──
     Semua kategori di daftar statis `allCategories` selalu tampil, meski jumlah
     produknya 0 — supaya admin sadar ada kategori yang belum terisi (katalog
     customer juga memakai daftar ini, jadi tampilannya selaras). Kategori yang
     ada di data tapi tidak ada di daftar tetap ikut (diurutkan belakangan). */
  const facets = useMemo(() => {
    const catMap: Record<string, number> = {};
    const fabricMap: Record<string, number> = {};
    const bucketCounts: Record<string, number> = {};
    let maxStock = 1;
    for (const p of items) {
      if (p.category) catMap[p.category] = (catMap[p.category] || 0) + 1;
      const f = fabricOf(p);
      if (f) fabricMap[f] = (fabricMap[f] || 0) + 1;
      const bk = bucketOf(p);
      if (bk) bucketCounts[bk] = (bucketCounts[bk] || 0) + 1;
      maxStock = Math.max(maxStock, p.totalStock ?? 0);
    }

    const known = allCategories as readonly string[];
    const extra = Object.keys(catMap).filter((c) => !known.includes(c));
    const categories = [
      ...known.map((name) => ({ name, count: catMap[name] || 0 })),
      ...extra.sort().map((name) => ({ name, count: catMap[name] || 0 })),
    ];

    return {
      categories,
      fabrics: Object.entries(fabricMap).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      bucketCounts,
      maxStock,
    };
  }, [items]);

  const anyFilter = cats.size > 0 || buckets.size > 0 || fabrics.size > 0 || availability !== "all" || !!search.trim();

  const clearAll = () => {
    setCats(new Set());
    setBuckets(new Set());
    setFabrics(new Set());
    setAvailability("all");
    setSearch("");
  };

  /* ── terapkan filter + sort ── */
  const rows = useMemo(() => {
    const out = items.filter((p) => {
      if (cats.size > 0 && !cats.has(p.category)) return false;
      if (fabrics.size > 0 && !fabrics.has(fabricOf(p))) return false;
      if (buckets.size > 0 && !buckets.has(bucketOf(p))) return false;
      const st = p.totalStock ?? 0;
      if (availability === "ready" && st <= 10) return false;
      if (availability === "low" && !(st > 0 && st <= 10)) return false;
      if (availability === "out" && st > 0) return false;
      return true;
    });
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case "price-asc": return effectivePrice(a) - effectivePrice(b);
        case "price-desc": return effectivePrice(b) - effectivePrice(a);
        case "stock-desc": return (b.totalStock ?? 0) - (a.totalStock ?? 0);
        default: return a.name.localeCompare(b.name, "id");
      }
    });
    return sorted;
  }, [items, cats, fabrics, buckets, availability, sort]);

  /* ── foto: produk tanpa foto dikelompokkan terpisah (urutan di dalam tiap kelompok tetap mengikuti sort) ── */
  const hasPhoto = (p: CatalogCard) => !!(thumbnails[p.id] || p.image);
  const withPhoto = rows.filter(hasPhoto);
  const noPhoto = rows.filter((p) => !hasPhoto(p));

  /** Kartu/baris produk. `noImg` = kelompok "Belum ada foto": penampung foto dipendekkan + ikon. */
  const renderItems = (list: CatalogCard[], noImg: boolean) =>
    view === "list" ? (
      <div className="space-y-3">
        {list.map((p) => (
          <div key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4" style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad3)" }}>
            <div className={`w-16 ${noImg ? "h-16" : "h-20"} rounded-xl overflow-hidden shrink-0 flex items-center justify-center`} style={{ background: "var(--sub)" }}>
              {noImg ? (
                <Package size={22} strokeWidth={1.6} style={{ color: "var(--fg3)" }} />
              ) : (
                <img src={thumbnails[p.id] || p.image || ""} alt={p.name} className="w-full h-full object-cover object-top" loading="lazy" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <CardBody p={p} maxStock={facets.maxStock} openOrder={!!openOrder} />
            </div>
            <div className={openOrder ? "sm:w-72 shrink-0" : "sm:w-44 shrink-0"}>
              {openOrder
                ? <OpenOrderAction p={p} openOrder={openOrder} onDetail={onDetail} />
                : <CardActions p={p} onDelete={onDelete} onDetail={onDetail} />}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((p) => {
          const tone = stockTone(p.totalStock ?? 0);
          return (
            <div key={p.id} className="overflow-hidden flex flex-col" style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad3)" }}>
              {/* Foto produk potret (3:4): rata atas supaya kepala model tidak terpotong. */}
              <div className={`relative ${noImg ? "h-28" : "aspect-[3/4]"}`} style={{ background: "var(--sub)" }}>
                {noImg ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package size={26} strokeWidth={1.6} style={{ color: "var(--fg3)" }} />
                  </div>
                ) : (
                  <img src={thumbnails[p.id] || p.image || ""} alt={p.name} className="w-full h-full object-cover object-top" loading="lazy" />
                )}
                <span
                  className="absolute top-3 left-3 inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold"
                  style={{ background: tone.bg, color: tone.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: tone.dot }} />
                  {tone.label}
                </span>
              </div>
              <div className="p-4 flex flex-col flex-1">
                <CardBody p={p} maxStock={facets.maxStock} openOrder={!!openOrder} />
                <div className="mt-auto">
                  {openOrder
                    ? <OpenOrderAction p={p} openOrder={openOrder} onDetail={onDetail} />
                    : <CardActions p={p} onDelete={onDelete} onDetail={onDetail} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* ── Baris judul: katalog-style, tanpa kartu statistik (sesuai wireframe) ── */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold leading-tight" style={{ color: "var(--fg)" }}>{title || "Katalog Produk"}</h2>
          <p className="text-sm mt-1" style={{ color: "var(--fg3)" }}>
            {subtitle ? `${subtitle} · ` : ""}Menampilkan {rows.length} dari {total} produk
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Toggle tampilan */}
          <div className="flex p-1" style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad2)" }}>
            <button
              onClick={() => setView("grid")}
              className="px-3 py-1.5 rounded-md flex items-center justify-center"
              style={view === "grid" ? { background: "var(--sub)", color: "var(--fg)" } : { color: "var(--fg3)" }}
              title="Tampilan grid"
            >
              <LayoutGrid size={15} strokeWidth={2} />
            </button>
            <button
              onClick={() => setView("list")}
              className="px-3 py-1.5 rounded-md flex items-center justify-center"
              style={view === "list" ? { background: "var(--sub)", color: "var(--fg)" } : { color: "var(--fg3)" }}
              title="Tampilan daftar"
            >
              <ClipboardList size={15} strokeWidth={2} />
            </button>
          </div>

          {/* Urutkan */}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="appearance-none pl-3 pr-9 py-2 text-sm font-bold cursor-pointer focus:outline-none"
              style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad2)", color: "var(--fg)" }}
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={13} strokeWidth={2.2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--fg3)" }} />
          </div>

          <Link
            href="/admin/produk/tambah"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white"
            style={{ background: "var(--fg)" }}
          >
            <Plus size={16} strokeWidth={2.2} /> Tambah Produk
          </Link>
        </div>
      </div>

      {/* ── Strip pill kategori ── */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setCats(new Set())}
          className="px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap"
          style={cats.size === 0
            ? { background: "var(--fg)", color: "#fff" }
            : { background: "var(--card)", border: "1px solid var(--bd)", color: "var(--fg2)" }}
        >
          Semua · {items.length}
        </button>
        {facets.categories.map((c) => {
          const on = cats.has(c.name);
          const empty = c.count === 0;
          return (
            <button
              key={c.name}
              onClick={() => setCats(toggle(cats, c.name))}
              className="px-4 py-2 text-xs font-bold rounded-full whitespace-nowrap"
              style={on
                ? { background: "var(--fg)", color: "#fff" }
                : empty
                  ? { background: "transparent", border: "1px dashed var(--bd)", color: "var(--fg3)" }
                  : { background: "var(--card)", border: "1px solid var(--bd)", color: "var(--fg2)" }}
            >
              {c.name} · {c.count}
            </button>
          );
        })}
      </div>

      {/* ── Rail filter (col-span-3) + area produk (col-span-9) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Rail filter */}
        <aside className="lg:col-span-3 p-6 space-y-6" style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad3)" }}>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-[0.08em] flex items-center gap-1.5" style={{ color: "var(--fg3)" }}>
              <SlidersHorizontal size={13} strokeWidth={2.2} /> Filter
            </h4>
            {anyFilter && (
              <button onClick={clearAll} className="text-[10px] font-extrabold" style={{ color: "var(--fg2)" }}>Atur Ulang</button>
            )}
          </div>

          {/* Pencarian — tersinkron dengan kolom pencarian di topbar */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--fg3)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari di katalog..."
              className="pl-9 pr-8 py-2 text-xs w-full focus:outline-none rounded-lg"
              style={{ background: "var(--sub)", border: "1px solid var(--bd)", color: "var(--fg)" }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--fg3)" }}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Kategori */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] mb-3" style={{ color: "var(--fg3)" }}>Kategori</p>
            <div className="space-y-2 text-xs font-bold">
              {facets.categories.map((c) => (
                <label
                  key={c.name}
                  className="flex items-center justify-between cursor-pointer"
                  style={{ color: c.count === 0 ? "var(--fg3)" : "var(--fg2)" }}
                >
                  <span className="flex items-center min-w-0">
                    <input
                      type="checkbox"
                      checked={cats.has(c.name)}
                      onChange={() => setCats(toggle(cats, c.name))}
                      className="mr-2 shrink-0"
                      style={{ accentColor: "var(--fg)" }}
                    />
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span style={{ color: "var(--fg3)" }}>{c.count === 0 ? "kosong" : c.count}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Ketersediaan */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] mb-3" style={{ color: "var(--fg3)" }}>Ketersediaan</p>
            <div className="space-y-2 text-xs font-bold">
              {([["all", "Semua"], ["ready", "Stok aman (>10)"], ["low", "Stok menipis (1–10)"], ["out", "Habis"]] as [Availability, string][]).map(([v, label]) => (
                <label key={v} className="flex items-center cursor-pointer" style={{ color: "var(--fg2)" }}>
                  <input
                    type="radio"
                    name="availability"
                    checked={availability === v}
                    onChange={() => setAvailability(v)}
                    className="mr-2"
                    style={{ accentColor: "var(--fg)" }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Rentang harga */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] mb-3" style={{ color: "var(--fg3)" }}>Rentang Harga</p>
            <div className="space-y-2 text-xs font-bold">
              {PRICE_BUCKETS.map((b) => {
                const on = buckets.has(b.key);
                const count = facets.bucketCounts[b.key] || 0;
                return (
                  <button
                    key={b.key}
                    onClick={() => setBuckets(toggle(buckets, b.key))}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2"
                    style={on
                      ? { background: "var(--fg)", color: "#fff" }
                      : { background: "var(--sub)", border: "1px solid var(--bd)", color: "var(--fg2)" }}
                  >
                    <span className="truncate">{b.label}</span>
                    <span className="ml-2 shrink-0" style={{ opacity: 0.6 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kain — kolom nyata di tabel produk (pengganti "rating" yang tidak ada datanya) */}
          {facets.fabrics.length > 0 && (
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] mb-3" style={{ color: "var(--fg3)" }}>Kain</p>
              <div className="space-y-2 text-xs font-bold">
                {facets.fabrics.map((f) => (
                  <label key={f.name} className="flex items-center justify-between cursor-pointer" style={{ color: "var(--fg2)" }}>
                    <span className="flex items-center min-w-0">
                      <input
                        type="checkbox"
                        checked={fabrics.has(f.name)}
                        onChange={() => setFabrics(toggle(fabrics, f.name))}
                        className="mr-2 shrink-0"
                        style={{ accentColor: "var(--fg)" }}
                      />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <span style={{ color: "var(--fg3)" }}>{f.count}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Area produk */}
        <div className="lg:col-span-9 min-w-0">
          {loading ? (
            <div className="p-10 text-center text-sm font-bold" style={{ color: "var(--fg3)" }}>Memuat produk…</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center" style={{ background: "var(--card)", border: "1px solid var(--bd)", borderRadius: "var(--rad3)" }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--sub)" }}>
                <Package size={26} strokeWidth={1.6} style={{ color: "var(--fg3)" }} />
              </div>
              <p className="text-sm font-extrabold" style={{ color: "var(--fg)" }}>
                {anyFilter ? "Tidak ada produk yang cocok" : "Belum ada produk"}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--fg3)" }}>
                {anyFilter ? "Coba ubah kata kunci atau filter Anda." : "Mulai tambahkan produk pertama Anda."}
              </p>
              {anyFilter && (
                <button onClick={clearAll} className="mt-4 text-xs font-bold px-4 py-2 rounded-lg" style={{ border: "1px solid var(--bd)", color: "var(--fg)" }}>
                  Atur Ulang Filter
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {withPhoto.length > 0 ? renderItems(withPhoto, false) : null}
              {/* Produk tanpa foto dikelompokkan di bawah supaya grid utama tetap rapi. */}
              {noPhoto.length > 0 ? (
                <section aria-label="Produk belum ada foto">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-3">
                    <h3 className="text-sm font-extrabold" style={{ color: "var(--fg)" }}>Belum ada foto</h3>
                    <span className="text-[11px] font-bold" style={{ color: "var(--fg3)" }}>
                      {noPhoto.length} produk · tambahkan foto lewat tombol Edit
                    </span>
                  </div>
                  {renderItems(noPhoto, true)}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
