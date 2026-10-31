"use client";

/**
 * Pengaturan promo "Free Cover Hanger" — isi halaman /admin/promo dan /panel-admin/promo.
 *
 * Dipecah jadi komponen kecil di folder `promo-fch/` supaya gampang ditambah bagian baru.
 *
 * LOGIC TIDAK BERUBAH:
 *  - Pengaturan disimpan lewat `saveSettings()` ke `store_settings` (baris id = 1, kolom promo_fch_*).
 *  - Produk promo dibaca dari `products` dan ditulis ke `products.promo_fch_enabled`.
 *  - Sakelar produk ini SENGAJA terpisah dari `open_order_enabled`.
 *
 * Perubahan perilaku yang disengaja (sesuai permintaan):
 *  - Ubah "Total kuota" TIDAK me-reset sisa. Sisa baru = total baru − terpakai.
 *  - "Sisa bonus" tidak bisa diketik lagi; kuota berkurang otomatis di server.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Tag } from "lucide-react";
import { getCatalogProducts } from "@/lib/db";
import type { Product } from "@/lib/katalog-data";
import { PROMO_ORDER_PATH } from "@/lib/promo/free-cover-hanger";
import { OPEN_ORDER_ADDON_TARGET_ID, OPEN_ORDER_ADDON_VARIANT } from "@/lib/open-order-config";
import { supabase } from "@/lib/supabase";
import { StatusCard } from "./promo-fch/StatusCard";
import { TeksCard } from "./promo-fch/TeksCard";
import { KuotaCard } from "./promo-fch/KuotaCard";
import { PeriodeCard } from "./promo-fch/PeriodeCard";
import { PreviewCard } from "./promo-fch/PreviewCard";
import { RingkasanCard } from "./promo-fch/RingkasanCard";
import { ProdukCard, type PromoProduct, type PromoVariant } from "./promo-fch/ProdukCard";
import { SaveBar } from "./promo-fch/SaveBar";
import { PROMO_FORM_CSS, TEXT, TEXT_MUTED } from "./promo-fch/primitives";

const COLUMNS =
  "promo_fch_active, promo_fch_title, promo_fch_eyebrow, promo_fch_description, promo_fch_quota_total, promo_fch_quota_left, promo_fch_quota_note, promo_fch_start_date, promo_fch_end_date";

type Settings = {
  active: boolean;
  title: string;
  eyebrow: string;
  description: string;
  quotaTotal: number;
  quotaLeft: number;
  quotaNote: string;
  startDate: string;
  endDate: string;
};

const EMPTY_SETTINGS: Settings = {
  active: true,
  title: "",
  eyebrow: "",
  description: "",
  quotaTotal: 100,
  quotaLeft: 100,
  quotaNote: "",
  startDate: "",
  endDate: "",
};

/** Kelompokkan baris `products` per produk utama (kategori + nama) — aturan yang sama dengan
 *  menu Produk & Open Order, jadi satu Thobe dengan beberapa series = satu baris. */
function groupCatalog(products: Product[]): PromoProduct[] {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const key = `${product.category}::${product.name}`;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }

  const items: PromoProduct[] = [];
  for (const group of groups.values()) {
    const rep = group[0] as Product & { promo_fch_enabled?: boolean };
    const cheapest = group.reduce((best, member) =>
      effectivePrice(member) < effectivePrice(best) ? member : best,
    );
    items.push({
      ...rep,
      // Harga termurah dari grup supaya sama dengan yang tampil di halaman pesan.
      price: effectivePrice(cheapest),
      memberIds: group.map((member) => member.id),
      // Tampil di promo kalau minimal satu barisnya masih diikutkan (default true).
      promoFchEnabled: group.some(
        (member) => (member as unknown as { promo_fch_enabled?: boolean }).promo_fch_enabled !== false,
      ),
    });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function effectivePrice(product: Product): number {
  return product.create_your_price_enabled && product.minimum_price ? product.minimum_price : product.price;
}

export default function PromoFchSettingsForm() {
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [productNotice, setProductNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  /** Salinan terakhir yang tersimpan — dipakai tombol Batal & indikator perubahan. */
  const [saved, setSaved] = useState<Settings>(EMPTY_SETTINGS);
  const [missingColumn, setMissingColumn] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bonusStock, setBonusStock] = useState<number | null>(null);
  /** Stok per produk (id baris → total stok semua varian) — sumber `product_variants`. */
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  /** Varian per produk (id baris → daftar ukuran) — sumber sakelar promo per ukuran. */
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, PromoVariant[]>>({});
  /** id varian (`product_id|color|size`) yang sedang disimpan. */
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null);
  const savedRef = useRef<Settings>(EMPTY_SETTINGS);

  useEffect(() => {
    let active = true;
    supabase
      .from("store_settings")
      .select(COLUMNS)
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          // Kolom belum dibuat → tampilkan peringatan, halaman tetap terbuka.
          setMissingColumn(true);
          setLoading(false);
          return;
        }
        if (data) {
          const row = data as Record<string, unknown>;
          const total = Number(row.promo_fch_quota_total) || 100;
          const next: Settings = {
            active: row.promo_fch_active !== false,
            title: String(row.promo_fch_title ?? ""),
            eyebrow: String(row.promo_fch_eyebrow ?? ""),
            description: String(row.promo_fch_description ?? ""),
            quotaTotal: total,
            quotaLeft: Math.min(total, Number(row.promo_fch_quota_left) ?? 0),
            quotaNote: String(row.promo_fch_quota_note ?? ""),
            startDate: String(row.promo_fch_start_date ?? ""),
            endDate: String(row.promo_fch_end_date ?? ""),
          };
          savedRef.current = next;
          setSettings(next);
          setSaved(next);
        }
        setLoading(false);
      });

    // Produk yang bisa diatur di promo = produk yang AKTIF di katalog (`is_published = true`).
    // Halaman pesan promo juga hanya menarik produk aktif, jadi daftar di sini mencerminkan
    // isi promo yang sebenarnya. Produk nonaktif (mis. Kabak, Cover & Hanger) tidak ditampilkan.
    getCatalogProducts()
      .then((rows) => {
        if (active) setProducts(rows);
      })
      .catch(() => {
        if (active) setProducts([]);
      });

    // Stok Cover & Hanger (produk bonus) — dipakai peringatan di Ringkasan.
    supabase
      .from("product_variants")
      .select("stock")
      .eq("product_id", OPEN_ORDER_ADDON_TARGET_ID)
      .eq("color", OPEN_ORDER_ADDON_VARIANT.color)
      .eq("size", OPEN_ORDER_ADDON_VARIANT.size)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setBonusStock(typeof data?.stock === "number" ? data.stock : 0);
      });

    // Varian per produk: total stok untuk badge + daftar ukuran untuk sakelar promo per ukuran.
    supabase
      .from("product_variants")
      .select("product_id, color, size, stock, promo_fch_enabled")
      .then(({ data }) => {
        if (!active || !data) return;
        const totals: Record<string, number> = {};
        const sizes: Record<string, PromoVariant[]> = {};
        for (const row of data as PromoVariant[]) {
          if (!row.product_id) continue;
          totals[row.product_id] = (totals[row.product_id] ?? 0) + (row.stock ?? 0);
          (sizes[row.product_id] ??= []).push(row);
        }
        setStockByProduct(totals);
        setVariantsByProduct(sizes);
      });

    return () => {
      active = false;
    };
  }, []);

  const cards = useMemo(() => {
    const grouped = groupCatalog(products);
    // Total stok = jumlah stok semua baris (series) dalam grup.
    return grouped.map((card) => ({
      ...card,
      totalStock: card.memberIds.reduce((sum, id) => sum + (stockByProduct[id] ?? 0), 0),
    }));
  }, [products, stockByProduct]);
  const productsOn = cards.filter((card) => card.promoFchEnabled).length;

  const dirty = useMemo(
    () =>
      settings.active !== saved.active ||
      settings.title !== saved.title ||
      settings.eyebrow !== saved.eyebrow ||
      settings.description !== saved.description ||
      settings.quotaTotal !== saved.quotaTotal ||
      settings.quotaNote !== saved.quotaNote ||
      settings.startDate !== saved.startDate ||
      settings.endDate !== saved.endDate,
    [settings, saved],
  );

  function patch(next: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...next }));
  }

  /**
   * Ubah Total kuota: sisa TIDAK di-reset ke total baru.
   * Sisa baru = total baru − terpakai, minimal 0.
   */
  function patchQuotaTotal(value: number) {
    const total = Math.max(0, Math.round(Number(value) || 0));
    setSettings((prev) => {
      const used = Math.max(0, prev.quotaTotal - prev.quotaLeft);
      return { ...prev, quotaTotal: total, quotaLeft: Math.max(0, total - used) };
    });
  }

  async function saveSettings() {
    setSaving(true);
    setNotice(null);
    const { error } = await supabase
      .from("store_settings")
      .update({
        promo_fch_active: settings.active,
        promo_fch_title: settings.title.trim() || null,
        promo_fch_eyebrow: settings.eyebrow.trim() || null,
        promo_fch_description: settings.description.trim() || null,
        promo_fch_quota_total: Math.max(1, Math.round(settings.quotaTotal)),
        // Sisa ikut disimpan karena bisa berubah saat Total kuota diubah (total − terpakai).
        promo_fch_quota_left: Math.max(0, Math.round(settings.quotaLeft)),
        promo_fch_quota_note: settings.quotaNote.trim() || null,
        promo_fch_start_date: settings.startDate || null,
        promo_fch_end_date: settings.endDate || null,
      })
      .eq("id", 1);
    setSaving(false);

    if (error) {
      setNotice({ kind: "err", text: `Gagal menyimpan: ${error.message}` });
      return;
    }
    savedRef.current = settings;
    setSaved(settings);
    setNotice({ kind: "ok", text: "Pengaturan promo tersimpan" });
  }

  function resetSettings() {
    setSettings(savedRef.current);
    setNotice(null);
  }

  /**
   * Sakelar produk promo — menulis `products.promo_fch_enabled` untuk SEMUA baris dalam satu
   * grup (kategori + nama). Bukan field Open Order.
   */
  async function toggleProduct(card: PromoProduct) {
    const next = !card.promoFchEnabled;
    setSavingId(card.id);
    setProductNotice(null);
    const { error } = await supabase
      .from("products")
      .update({ promo_fch_enabled: next })
      .eq("category", card.category)
      .eq("name", card.name);
    setSavingId(null);

    if (error) {
      setProductNotice({ kind: "err", text: `Gagal mengubah produk: ${error.message}` });
      return;
    }
    setProductNotice({
      kind: "ok",
      text: next ? `${card.name} ikut promo` : `${card.name} tidak ikut promo`,
    });
    // Perbarui state lokal hanya setelah server mengonfirmasi.
    setProducts((prev) =>
      prev.map((product) =>
        product.category === card.category && product.name === card.name
          ? ({ ...product, promo_fch_enabled: next } as Product)
          : product,
      ),
    );
  }

  /**
   * Sakelar promo PER UKURAN — menulis `product_variants.promo_fch_enabled` pada satu baris
   * (produk + warna + ukuran). Ukuran yang dimatikan otomatis hilang dari pilihan ukuran di
   * halaman pesan promo, tapi produknya tetap tampil selama masih ada ukuran yang ikut.
   */
  async function toggleVariant(variant: PromoVariant) {
    const next = variant.promo_fch_enabled === false;
    setSavingVariantId(`${variant.product_id}|${variant.color}|${variant.size}`);
    setProductNotice(null);
    const { error } = await supabase
      .from("product_variants")
      .update({ promo_fch_enabled: next })
      .eq("product_id", variant.product_id)
      .eq("color", variant.color)
      .eq("size", variant.size);
    setSavingVariantId(null);

    if (error) {
      setProductNotice({ kind: "err", text: `Gagal mengubah ukuran: ${error.message}` });
      return;
    }
    setProductNotice({
      kind: "ok",
      text: `${variant.color} ${variant.size} ${next ? "ikut" : "tidak ikut"} promo`,
    });
    setVariantsByProduct((prev) => {
      const list = prev[variant.product_id] ?? [];
      return {
        ...prev,
        [variant.product_id]: list.map((row) =>
          row.color === variant.color && row.size === variant.size
            ? { ...row, promo_fch_enabled: next }
            : row,
        ),
      };
    });
  }

  /**
   * Aktifkan/matikan SEMUA produk promo (dipanggil setelah konfirmasi modal).
   *
   * Dibatasi ke produk yang AKTIF di katalog (`is_published = true`) — sama dengan daftar
   * yang tampil. Tanpa batas ini, aksi massal diam-diam menyalakan promo untuk produk yang
   * tidak dijual di katalog (mis. Kabak).
   */
  async function bulkToggle(enabled: boolean) {
    setProductNotice(null);
    const ids = [...new Set(products.map((product) => product.id))];
    if (ids.length === 0) {
      setProductNotice({ kind: "err", text: "Belum ada produk aktif di katalog." });
      return;
    }
    const { error } = await supabase
      .from("products")
      .update({ promo_fch_enabled: enabled })
      .in("id", ids)
      .select("id");
    if (error) {
      setProductNotice({ kind: "err", text: `Gagal mengubah produk: ${error.message}` });
      return;
    }
    setProductNotice({
      kind: "ok",
      text: enabled ? "Semua produk aktif sekarang ikut promo" : "Semua produk dimatikan dari promo",
    });
    setProducts((prev) => prev.map((product) => ({ ...product, promo_fch_enabled: enabled }) as Product));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13px]" style={{ color: TEXT_MUTED }}>
        <Loader2 size={16} className="animate-spin" /> Memuat pengaturan promo…
      </div>
    );
  }

  const bonusExhausted = settings.quotaLeft <= 0;
  const status = !settings.active ? "Nonaktif" : bonusExhausted ? "Bonus habis" : "Sedang berjalan";
  const statusTone = !settings.active
    ? { bg: "#F1F1F1", bd: "#DDDDDD", fg: "#6b6b6b" }
    : bonusExhausted
      ? { bg: "#FEF6E7", bd: "#F5DDA8", fg: "#8a4b08" }
      : { bg: "#EAF7F0", bd: "#BFE6D2", fg: "#1F6F45" };

  return (
    <div className="pf-form flex flex-col gap-5 pb-4">
      {/* Gaya isian & kartu halaman promo. Di-scope `.pf-form` supaya reset border dari
          preflight Tailwind tidak ikut — CSS global tidak diubah. */}
      <style>{PROMO_FORM_CSS}</style>
      {/* ── Header halaman ── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="flex items-center gap-2 text-[22px] font-bold" style={{ color: TEXT }}>
              <Tag size={20} strokeWidth={2.2} /> Promo Free Cover Hanger
            </h1>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: statusTone.bg, border: `1px solid ${statusTone.bd}`, color: statusTone.fg }}
            >
              {status}
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed" style={{ color: TEXT_MUTED }}>
            Bonus Cover Hanger gratis untuk pembelian pertama. Atur teks, kuota, periode, dan produk yang ikut promo.
          </p>
        </div>
        <a
          href={PROMO_ORDER_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold"
          style={{ border: "1px solid var(--bd)", color: TEXT, background: "var(--card)" }}
        >
          Lihat halaman promo <ExternalLink size={13} />
        </a>
      </header>

      {notice ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px]"
          style={
            notice.kind === "ok"
              ? { background: "#EAF7F0", border: "1px solid #BFE6D2", color: "#1F6F45" }
              : { background: "#FDECEC", border: "1px solid #F5C2C2", color: "#B42318" }
          }
        >
          {notice.kind === "ok" ? (
            <Check size={15} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      ) : null}

      {missingColumn ? (
        <div
          className="flex items-start gap-2 rounded-xl p-4 text-[12.5px]"
          style={{ background: "#FEF6E7", border: "1px solid #F5DDA8", color: "#8a4b08" }}
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Kolom <code>promo_fch_*</code> belum ada di database. Jalankan{" "}
            <code>supabase/migrations/20261031_promo_free_cover_hanger.sql</code> dan{" "}
            <code>20261101_promo_fch_quota_logic.sql</code> dulu — sebelum itu penyimpanan akan gagal.
          </span>
        </div>
      ) : null}

      {/* ── Layout 2 kolom: form di kiri, preview sticky di kanan ── */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <StatusCard
            active={settings.active}
            onChange={(active) => patch({ active })}
            bonusExhausted={bonusExhausted}
          />
          <TeksCard
            eyebrow={settings.eyebrow}
            title={settings.title}
            description={settings.description}
            onChange={patch}
          />
          <KuotaCard
            quotaTotal={settings.quotaTotal}
            quotaLeft={settings.quotaLeft}
            quotaNote={settings.quotaNote}
            onChange={(next) => {
              if (next.quotaTotal !== undefined) patchQuotaTotal(next.quotaTotal);
              if (next.quotaNote !== undefined) patch({ quotaNote: next.quotaNote });
            }}
          />
          <PeriodeCard startDate={settings.startDate} endDate={settings.endDate} onChange={patch} />
          <ProdukCard
            products={cards}
            savingId={savingId}
            notice={productNotice}
            onToggle={toggleProduct}
            onBulk={bulkToggle}
            variants={variantsByProduct}
            savingVariantId={savingVariantId}
            onToggleVariant={toggleVariant}
          />
          <SaveBar dirty={dirty} saving={saving} onReset={resetSettings} onSave={saveSettings} />
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-4">
          <PreviewCard
            active={settings.active}
            eyebrow={settings.eyebrow}
            title={settings.title}
            description={settings.description}
            quotaTotal={settings.quotaTotal}
            quotaLeft={settings.quotaLeft}
            quotaNote={settings.quotaNote}
            startDate={settings.startDate}
            endDate={settings.endDate}
          />
          <RingkasanCard
            productsOn={productsOn}
            productsTotal={cards.length}
            quotaTotal={settings.quotaTotal}
            quotaLeft={settings.quotaLeft}
            bonusStock={bonusStock}
            startDate={settings.startDate}
            endDate={settings.endDate}
          />
        </div>
      </div>
    </div>
  );
}
