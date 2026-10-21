"use client";

/**
 * Pengaturan Open Order (menu admin "Open Order") — isi halaman /admin/open-order dan
 * /id/admin/open-order.
 *
 * Dua bagian:
 * - **Jendela Open Order** — tanggal mulai + tanggal tutup. Status buka/tutup dihitung dari
 *   tanggalnya (lihat `src/lib/open-order-window.ts`), bukan toggle manual. Read-only sampai
 *   tombol Edit ditekan.
 * - **Produk di Open Order** — memakai komponen yang sama dengan menu **Produk**
 *   (`ProductsCatalog`): kartu/list dengan foto, kategori, harga, stok, dan chip series. Bedanya
 *   aksi kartunya diganti sakelar **Tampil di Open Order / Tersembunyi** (mode `openOrder`),
 *   tersimpan langsung ke kolom `products.open_order_enabled` untuk semua baris satu grup
 *   (category + name) — jadi produk Thobe (banyak series) ikut berubah sekaligus.
 *
 * Tanggal tersimpan di baris tunggal `store_settings` (id = 1): `open_order_start_date`,
 * `open_order_end_date`. Kolomnya dibuat oleh `supabase/open-order-settings.sql` — selama belum
 * dijalankan halaman ini menampilkan peringatan dan simpan akan gagal.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Calendar, Edit, Loader2, Shirt } from "lucide-react";
import { useToast } from "@/components/AdminToast";
import ProductsCatalog, { type CatalogCard } from "@/components/admin/ProductsCatalog";
import { getProducts } from "@/lib/db";
import type { Product } from "@/lib/katalog-data";
import { getThumbnailFromImages } from "@/lib/product-thumbnail";
import { OPEN_ORDER_PERIOD } from "@/lib/open-order-config";
import {
  formatDateLabel,
  formatOpenOrderPeriod,
  resolveOpenOrderState,
  type OpenOrderState,
} from "@/lib/open-order-window";
import { supabase } from "@/lib/supabase";

const LABEL = "text-[11px] font-medium uppercase tracking-[0.14em]";
const LABEL_COLOR = "var(--text-muted)";

/** Tampilan status hasil hitungan tanggal — supaya admin langsung lihat efek tanggalnya. */
const STATE_STYLE: Record<OpenOrderState, { label: string; color: string; background: string }> = {
  open: { label: "Dibuka — customer bisa memesan", color: "#1f6f45", background: "rgba(31,111,69,.09)" },
  before: { label: "Belum dibuka", color: "#8a6516", background: "rgba(138,101,22,.1)" },
  closed: { label: "Ditutup — menunggu periode berikutnya", color: "#7a5548", background: "rgba(122,85,72,.1)" },
};

type VariantRow = { product_id: string; stock: number; base_product_id: string | null };

function effectivePrice(p: Product): number {
  return p.create_your_price_enabled && p.minimum_price ? p.minimum_price : p.price;
}

/**
 * Kelompokkan baris `products` per produk utama (kategori + nama) — aturan yang sama dengan
 * menu Produk & halaman Katalog, jadi satu produk Thobe dengan beberapa series jadi satu kartu.
 */
function groupCatalog(products: Product[]): CatalogCard[] {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const key = `${product.category}::${product.name}`;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }

  const items: CatalogCard[] = [];
  for (const group of groups.values()) {
    const openOrderPrices = group
      .map((member) => member.open_order_price)
      .filter((v): v is number => typeof v === "number");
    const rep: CatalogCard = {
      ...group[0],
      memberIds: group.map((member) => member.id),
      // Produk tampil di /open-order kalau minimal satu barisnya masih diikutkan.
      openOrderEnabled: group.some((member) => member.open_order_enabled !== false),
      // Harga khusus Open Order (terendah antar series) untuk tampilan kartu — null = harga katalog.
      openOrderPrice: openOrderPrices.length > 0 ? Math.min(...openOrderPrices) : null,
    };
    if (group.length > 1) {
      let cheapest = group[0];
      for (const member of group) {
        if (effectivePrice(member) < effectivePrice(cheapest)) cheapest = member;
      }
      rep.price = effectivePrice(cheapest);
      rep.minimum_price = cheapest.minimum_price;
      rep.create_your_price_enabled = cheapest.create_your_price_enabled;
      rep.availableSeries = [...new Set(group.map((member) => member.series).filter((s): s is string => !!s))].sort();
    }
    items.push(rep);
  }
  return items;
}

/** Total stok + stok per series — aturan sama dengan menu Produk (series turunan ikut produk dasar). */
function withStock(
  items: CatalogCard[],
  variants: VariantRow[],
  seriesByProduct: Record<string, string>
): CatalogCard[] {
  const stockByProduct: Record<string, number> = {};
  const baseLinkByProduct: Record<string, string> = {};
  for (const variant of variants) {
    if (variant.base_product_id) baseLinkByProduct[variant.product_id] = variant.base_product_id;
    else stockByProduct[variant.product_id] = (stockByProduct[variant.product_id] || 0) + variant.stock;
  }

  return items.map((item) => {
    const seriesStock: NonNullable<CatalogCard["seriesStock"]> = [];
    let totalStock = 0;
    for (const memberId of item.memberIds ?? []) {
      const name = seriesByProduct[memberId] || memberId;
      const baseId = baseLinkByProduct[memberId];
      if (baseId) {
        const baseStock = stockByProduct[baseId] || 0;
        seriesStock.push({ name, stock: baseStock, isDerived: true, follows: seriesByProduct[baseId] || baseId });
        totalStock += baseStock;
      } else {
        const stock = stockByProduct[memberId] || 0;
        seriesStock.push({ name, stock, isDerived: false });
        totalStock += stock;
      }
    }
    seriesStock.sort((a, b) => a.name.localeCompare(b.name));
    return { ...item, totalStock, seriesStock };
  });
}

export default function OpenOrderSettingsForm() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [needsSql, setNeedsSql] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // Jam buka & jam tutup (HH:MM, WIB) — kolom opsional, kosong = 00:00 / 23:59.
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  /** `true` kalau kolom jam sudah ada di database (SQL-nya sudah dijalankan). */
  const [hasTimeColumns, setHasTimeColumns] = useState(false);
  // Nilai tanggal terakhir yang tersimpan — dasar tombol Batal & penanda perubahan.
  const [original, setOriginal] = useState({ start: "", end: "" });
  const [originalTime, setOriginalTime] = useState({ start: "", end: "" });

  // Berat kirim add-on "Extra Cover & Hanger" (gram) — setting internal, tidak tampil di publik.
  const [addonWeight, setAddonWeight] = useState("");
  const [originalAddonWeight, setOriginalAddonWeight] = useState("");
  const [editingAddon, setEditingAddon] = useState(false);
  const [savingAddon, setSavingAddon] = useState(false);

  // Produk di Open Order (kartu katalog + sakelar)
  const [items, setItems] = useState<CatalogCard[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase
      .from("store_settings")
      .select("open_order_start_date, open_order_end_date, open_order_addon_weight")
      .eq("id", 1)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          // Paling sering: kolomnya belum ada karena SQL-nya belum dijalankan.
          setNeedsSql(true);
        } else if (data) {
          const savedStart = data.open_order_start_date ?? "";
          const savedEnd = data.open_order_end_date ?? "";
          setStart(savedStart);
          setEnd(savedEnd);
          setOriginal({ start: savedStart, end: savedEnd });

          const savedAddon = data.open_order_addon_weight == null ? "" : String(data.open_order_addon_weight);
          setAddonWeight(savedAddon);
          setOriginalAddonWeight(savedAddon);
        }
        setLoading(false);
      });

    // Jam buka/tutup — kolom opsional. Kalau belum ada di database, query-nya error dan
    // jamnya tetap kosong (fallback 00:00 / 23:59) tanpa bikin form ini ikut rusak.
    supabase
      .from("store_settings")
      .select("open_order_start_time, open_order_end_time")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error || !data) return;
        const savedStartTime = data.open_order_start_time ?? "";
        const savedEndTime = data.open_order_end_time ?? "";
        setStartTime(savedStartTime);
        setEndTime(savedEndTime);
        setOriginalTime({ start: savedStartTime, end: savedEndTime });
        setHasTimeColumns(true);
      });

    // Katalog: produk + varian (stok) + foto — sumber yang sama dengan menu Produk.
    async function loadCatalog() {
      const products = await getProducts();
      if (!mounted) return;
      const ids = products.map((product) => product.id);
      const [variantsRes, imagesRes] = await Promise.all([
        supabase.from("product_variants").select("product_id, stock, base_product_id"),
        ids.length > 0
          ? supabase.from("product_images").select("product_id, url, is_video").in("product_id", ids).order("display_order")
          : Promise.resolve({ data: [] as { product_id: string; url: string; is_video: boolean }[] }),
      ]);
      if (!mounted) return;

      const images = (imagesRes.data ?? []) as { product_id: string; url: string; is_video: boolean }[];
      const thumbs: Record<string, string> = {};
      const seriesByProduct: Record<string, string> = {};
      for (const product of products) {
        thumbs[product.id] = getThumbnailFromImages(product.id, product.image, images);
        if (product.series) seriesByProduct[product.id] = product.series;
      }
      setThumbnails(thumbs);
      setItems(withStock(groupCatalog(products), (variantsRes.data ?? []) as VariantRow[], seriesByProduct));
      setCatalogLoading(false);
    }
    loadCatalog().catch(() => {
      if (mounted) setCatalogLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const windowSettings = {
    open_order_start_date: start || null,
    open_order_end_date: end || null,
    open_order_start_time: startTime || null,
    open_order_end_time: endTime || null,
  };
  const state = resolveOpenOrderState(windowSettings);
  const periodLabel = formatOpenOrderPeriod(windowSettings, OPEN_ORDER_PERIOD);
  const invalidRange = Boolean(start && end && end < start);
  const dirty =
    start !== original.start ||
    end !== original.end ||
    startTime !== originalTime.start ||
    endTime !== originalTime.end;
  const enabledCount = items.filter((item) => item.openOrderEnabled !== false).length;

  function cancel() {
    setStart(original.start);
    setEnd(original.end);
    setStartTime(originalTime.start);
    setEndTime(originalTime.end);
    setEditing(false);
  }

  async function save() {
    if (invalidRange) return;
    setSaving(true);
    // Kolom jam hanya ikut kalau sudah ada di database — kalau belum (SQL belum dijalankan),
    // upsert dengan kolom itu akan ditolak PostgREST dan seluruh simpan gagal.
    const payload: Record<string, unknown> = {
      id: 1,
      open_order_start_date: start || null,
      open_order_end_date: end || null,
      updated_at: new Date().toISOString(),
    };
    if (hasTimeColumns) {
      payload.open_order_start_time = startTime || null;
      payload.open_order_end_time = endTime || null;
    }
    const { error } = await supabase.from("store_settings").upsert(payload);
    setSaving(false);
    if (error) {
      toast.showToast("error", error.message);
      return;
    }
    setOriginal({ start, end });
    setOriginalTime({ start: startTime, end: endTime });
    setEditing(false);
    toast.showToast("success", "Jendela Open Order disimpan");
  }

  /**
   * Simpan berat add-on Extra Cover & Hanger (gram) ke `store_settings`. Nilai ini
   * dipakai hitungan ongkir J&T di wizard /open-order dan divalidasi ulang di server.
   */
  async function saveAddon() {
    const grams = Math.round(Number(addonWeight));
    if (!Number.isFinite(grams) || grams <= 0) {
      toast.showToast("error", "Berat harus berupa angka lebih dari 0 gram");
      return;
    }
    setSavingAddon(true);
    const { error } = await supabase.from("store_settings").upsert({
      id: 1,
      open_order_addon_weight: grams,
      updated_at: new Date().toISOString(),
    });
    setSavingAddon(false);
    if (error) {
      toast.showToast("error", error.message);
      return;
    }
    const saved = String(grams);
    setAddonWeight(saved);
    setOriginalAddonWeight(saved);
    setEditingAddon(false);
    toast.showToast("success", "Berat Cover & Hanger disimpan");
  }

  /** Sakelar kartu: simpan langsung ke SEMUA baris katalog pada grup nama + kategori ini. */
  async function toggleProduct(card: CatalogCard) {
    const next = card.openOrderEnabled === false;
    setSavingId(card.id);
    const { error } = await supabase
      .from("products")
      .update({ open_order_enabled: next })
      .eq("category", card.category)
      .eq("name", card.name);
    setSavingId(null);
    if (error) {
      toast.showToast("error", error.message);
      return;
    }
    setItems((prev) => prev.map((item) => (item.id === card.id ? { ...item, openOrderEnabled: next } : item)));
    toast.showToast("success", next ? `${card.name} tampil di Open Order` : `${card.name} disembunyikan dari Open Order`);
  }

  const fieldStyle = {
    background: "#fff",
    border: "1px solid rgba(17,17,17,.12)",
    color: "var(--espresso)",
  };
  const labelStyle = { color: LABEL_COLOR };

  return (
    <section className="mx-auto max-w-[1200px] p-5 lg:p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--espresso)" }}>
          Open Order
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: LABEL_COLOR }}>
          Atur tanggal buka &amp; tutup, lalu tentukan produk mana yang tampil di halaman /open-order
          lewat sakelar di tiap kartu produk.
        </p>
        {!catalogLoading && (
          <p className="mt-2 text-[12.5px] font-medium" style={{ color: "var(--espresso)" }}>
            {enabledCount} dari {items.length} produk tampil di Open Order.
          </p>
        )}
      </header>

      {!needsSql && !hasTimeColumns && (
        <div
          className="flex gap-3 rounded-xl p-4"
          style={{ background: "#fdf6e7", border: "1px solid rgba(181,140,74,.28)" }}
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: "var(--gold-deep)" }} />
          <p className="text-[13px] leading-relaxed" style={{ color: "#7a5c22" }}>
            Kolom jam buka/tutup belum ada di Supabase — jalankan{" "}
            <code>supabase/migrations/20261021_open_order_time.sql</code> di SQL editor Supabase,
            lalu muat ulang halaman ini. Sampai itu dijalankan, jam buka/tutup memakai default
            (buka 00:00, tutup 23:59 WIB).
          </p>
        </div>
      )}

      {needsSql && (
        <div
          className="flex gap-3 rounded-xl p-4"
          style={{ background: "#fdf6e7", border: "1px solid rgba(181,140,74,.28)" }}
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: "var(--gold-deep)" }} />
          <p className="text-[13px] leading-relaxed" style={{ color: "#7a5c22" }}>
            Kolom pengaturan Open Order belum lengkap di Supabase. Jalankan{" "}
            <code>supabase/open-order-settings.sql</code> dan{" "}
            <code>supabase/open-order-addon-weight.sql</code> di SQL editor Supabase, lalu muat
            ulang halaman ini.
          </p>
        </div>
      )}

      {/* Jendela Open Order */}
      <div className="max-w-3xl rounded-2xl bg-white p-6 sm:p-7" style={{ border: "1px solid rgba(17,17,17,.08)" }}>
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{ background: "rgba(17,17,17,.04)", color: "var(--espresso)" }}
          >
            <Calendar size={17} />
          </span>
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "var(--espresso)" }}>
              Jendela Open Order
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: LABEL_COLOR }}>
              Status buka/tutup dihitung otomatis dari dua tanggal ini.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--gold)" }} />
          </div>
        ) : (
          <>
            {editing ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL} style={labelStyle}>
                    Tanggal mulai
                  </span>
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors duration-150"
                    style={fieldStyle}
                  />
                </label>
                <label className="block">
                  <span className={LABEL} style={labelStyle}>
                    Tanggal tutup
                  </span>
                  <input
                    type="date"
                    value={end}
                    min={start || undefined}
                    onChange={(e) => setEnd(e.target.value)}
                    className="mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors duration-150"
                    style={fieldStyle}
                  />
                </label>
                {/* Jam buka & jam tutup (WIB) — opsional. Kosong = 00:00 / 23:59. */}
                <label className="block">
                  <span className={LABEL} style={labelStyle}>
                    Jam buka (WIB)
                  </span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={!hasTimeColumns}
                    className="mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors duration-150 disabled:opacity-50"
                    style={fieldStyle}
                  />
                </label>
                <label className="block">
                  <span className={LABEL} style={labelStyle}>
                    Jam tutup (WIB)
                  </span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    disabled={!hasTimeColumns}
                    className="mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors duration-150 disabled:opacity-50"
                    style={fieldStyle}
                  />
                </label>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <span className={LABEL} style={labelStyle}>
                    Tanggal mulai
                  </span>
                  <p className="mt-2 text-sm font-medium" style={{ color: start ? "var(--espresso)" : LABEL_COLOR }}>
                    {formatDateLabel(start) || "Belum diatur"}
                  </p>
                </div>
                <div>
                  <span className={LABEL} style={labelStyle}>
                    Tanggal tutup
                  </span>
                  <p className="mt-2 text-sm font-medium" style={{ color: end ? "var(--espresso)" : LABEL_COLOR }}>
                    {formatDateLabel(end) || "Belum diatur"}
                  </p>
                </div>
                <div>
                  <span className={LABEL} style={labelStyle}>
                    Jam buka (WIB)
                  </span>
                  <p className="mt-2 text-sm font-medium" style={{ color: startTime ? "var(--espresso)" : LABEL_COLOR }}>
                    {startTime || "00:00 (default)"}
                  </p>
                </div>
                <div>
                  <span className={LABEL} style={labelStyle}>
                    Jam tutup (WIB)
                  </span>
                  <p className="mt-2 text-sm font-medium" style={{ color: endTime ? "var(--espresso)" : LABEL_COLOR }}>
                    {endTime || "23:59 (default)"}
                  </p>
                </div>
              </div>
            )}

            {editing && invalidRange && (
              <p className="mt-3 text-[12.5px]" style={{ color: "#b3261e" }}>
                Tanggal tutup harus setelah tanggal mulai.
              </p>
            )}

            <p className="mt-4 text-[12.5px] leading-relaxed" style={{ color: LABEL_COLOR }}>
              Tampil di halaman /open-order sebagai <span style={{ color: "var(--espresso)" }}>Periode {periodLabel}</span>
              {startTime || endTime ? (
                <>
                  , dibuka{" "}
                  <span style={{ color: "var(--espresso)" }}>
                    {startTime || "00:00"} WIB
                  </span>{" "}
                  dan ditutup{" "}
                  <span style={{ color: "var(--espresso)" }}>
                    {endTime || "23:59"} WIB
                  </span>
                  . Hitung mundur di halaman itu memakai jam ini.
                </>
              ) : (
                " (jam buka/tutup belum diatur → buka 00:00, tutup 23:59 WIB)."
              )}
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium"
                style={{ background: STATE_STYLE[state].background, color: STATE_STYLE[state].color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATE_STYLE[state].color }} />
                {STATE_STYLE[state].label}
              </span>

              {editing ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || invalidRange || !dirty}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[13.5px] font-semibold text-white transition-opacity duration-150 disabled:opacity-50"
                    style={{ background: "var(--espresso)" }}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Edit size={16} />}
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={saving}
                    className="inline-flex items-center rounded-xl px-5 py-3 text-[13.5px] font-semibold transition-colors duration-150 disabled:opacity-50"
                    style={{ border: "1px solid rgba(17,17,17,.14)", color: "var(--espresso)" }}
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[13.5px] font-semibold transition-colors duration-150"
                  style={{ border: "1px solid rgba(17,17,17,.14)", color: "var(--espresso)" }}
                >
                  <Edit size={16} />
                  Edit tanggal
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Extra Cover & Hanger — berat kirim add-on (internal, tidak tampil di publik). */}
      <div className="max-w-3xl rounded-2xl bg-white p-6 sm:p-7" style={{ border: "1px solid rgba(17,17,17,.08)" }}>
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{ background: "rgba(17,17,17,.04)", color: "var(--espresso)" }}
          >
            <Shirt size={17} />
          </span>
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "var(--espresso)" }}>
              Extra Cover &amp; Hanger
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: LABEL_COLOR }}>
              Berat kirim add-on ini dipakai untuk hitungan ongkir J&amp;T. Hanya untuk internal —
              tidak ditampilkan sebagai pengaturan di halaman publik.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--gold)" }} />
          </div>
        ) : (
          <>
            <div className="mt-6 max-w-xs">
              <span className={LABEL} style={labelStyle}>
                Berat (gram)
              </span>
              {editingAddon ? (
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={addonWeight}
                  onChange={(e) => setAddonWeight(e.target.value)}
                  className="mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors duration-150"
                  style={fieldStyle}
                />
              ) : (
                <p className="mt-2 text-sm font-medium" style={{ color: addonWeight ? "var(--espresso)" : LABEL_COLOR }}>
                  {addonWeight ? `${Number(addonWeight).toLocaleString("id-ID")} gram` : "Belum diatur (default 300 g)"}
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              {editingAddon ? (
                <>
                  <button
                    type="button"
                    onClick={saveAddon}
                    disabled={savingAddon}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[13.5px] font-semibold text-white transition-opacity duration-150 disabled:opacity-50"
                    style={{ background: "var(--espresso)" }}
                  >
                    {savingAddon ? <Loader2 size={16} className="animate-spin" /> : <Edit size={16} />}
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddonWeight(originalAddonWeight);
                      setEditingAddon(false);
                    }}
                    disabled={savingAddon}
                    className="inline-flex items-center rounded-xl px-5 py-3 text-[13.5px] font-semibold transition-colors duration-150 disabled:opacity-50"
                    style={{ border: "1px solid rgba(17,17,17,.14)", color: "var(--espresso)" }}
                  >
                    Batal
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingAddon(true)}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[13.5px] font-semibold transition-colors duration-150"
                  style={{ border: "1px solid rgba(17,17,17,.14)", color: "var(--espresso)" }}
                >
                  <Edit size={16} />
                  Edit berat
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Produk di Open Order — komponen yang sama dengan menu Produk */}
      <ProductsCatalog
        items={items}
        total={items.length}
        thumbnails={thumbnails}
        search={search}
        setSearch={setSearch}
        loading={catalogLoading}
        title="Produk di Open Order"
        openOrder={{
          isEnabled: (card) => card.openOrderEnabled !== false,
          onToggle: toggleProduct,
          savingId,
          // Form produk yang sama dengan menu Produk, tapi harga tersimpan khusus Open Order.
          editHref: (card) => `/admin/open-order/edit/${card.id}`,
        }}
      />
    </section>
  );
}
