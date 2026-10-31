"use client";

/**
 * Pengaturan promo "Free Cover Hanger" — isi halaman /admin/promo dan /panel-admin/promo.
 *
 * Dua bagian, mengikuti bentuk menu admin "Open Order":
 *  1. **Pengaturan program** — status aktif, judul & deskripsi katalog, kuota bonus, dan
 *     periode. Tersimpan di baris tunggal `store_settings` (id = 1) kolom `promo_fch_*`.
 *  2. **Produk di promo** — memakai `ProductsCatalog` yang SAMA dengan menu Produk /
 *     Open Order, hanya aksinya diganti sakelar "Tampil di promo". Menulis ke
 *     `products.promo_fch_enabled` untuk semua baris satu grup (kategori + nama).
 *
 * Sakelar produk ini SENGAJA terpisah dari `open_order_enabled`: produk bisa ikut promo
 * tanpa ikut Open Order, dan sebaliknya.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Tag } from "lucide-react";
import ProductsCatalog, { type CatalogCard } from "@/components/admin/ProductsCatalog";
import { getProducts } from "@/lib/db";
import type { Product } from "@/lib/katalog-data";
import { PROMO_ORDER_PATH, PROMO_FCH_SOURCE } from "@/lib/promo/free-cover-hanger";
import { supabase } from "@/lib/supabase";

/**
 * `CatalogCard` dari `ProductsCatalog` belum punya field promo; tambahkan lewat augmentasi
 * lokal supaya tidak perlu mengubah tipe komponen bersama.
 */
type PromoCard = CatalogCard & { promoFchEnabled?: boolean };

const LABEL = "text-[11px] font-medium uppercase tracking-[0.14em]";
const LABEL_COLOR = "var(--text-muted)";

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
 *  menu Produk & Open Order, jadi satu Thobe dengan beberapa series = satu kartu. */
function groupCatalog(products: Product[]): PromoCard[] {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const key = `${product.category}::${product.name}`;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }

  const items: PromoCard[] = [];
  for (const group of groups.values()) {
    const rep: PromoCard = {
      ...group[0],
      memberIds: group.map((member) => member.id),
      // Tampil di promo kalau minimal satu barisnya masih diikutkan.
      promoFchEnabled: group.some(
        (member) => (member as unknown as { promo_fch_enabled?: boolean }).promo_fch_enabled !== false,
      ),
    };
    if (group.length > 1) {
      let cheapest = group[0];
      for (const member of group) {
        if (effectivePrice(member) < effectivePrice(cheapest)) cheapest = member;
      }
      rep.price = effectivePrice(cheapest);
      rep.minimum_price = cheapest.minimum_price;
      rep.create_your_price_enabled = cheapest.create_your_price_enabled;
      rep.availableSeries = [...new Set(group.map((m) => m.series).filter((s): s is string => !!s))].sort();
    }
    items.push(rep);
  }
  return items;
}

function effectivePrice(p: Product): number {
  return p.create_your_price_enabled && p.minimum_price ? p.minimum_price : p.price;
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--bd)" }}>
      <p className="mb-4 flex items-center gap-2 text-[13px] font-bold" style={{ color: "var(--fg)" }}>
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

export default function PromoFchSettingsForm() {
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [missingColumn, setMissingColumn] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
          setSettings({
            active: row.promo_fch_active !== false,
            title: String(row.promo_fch_title ?? ""),
            eyebrow: String(row.promo_fch_eyebrow ?? ""),
            description: String(row.promo_fch_description ?? ""),
            quotaTotal: total,
            quotaLeft: Math.min(total, Number(row.promo_fch_quota_left) ?? 0),
            quotaNote: String(row.promo_fch_quota_note ?? ""),
            startDate: String(row.promo_fch_start_date ?? ""),
            endDate: String(row.promo_fch_end_date ?? ""),
          });
        }
        setLoading(false);
      });

    getProducts()
      .then((rows) => {
        if (active) setProducts(rows);
      })
      .catch(() => {
        if (active) setProducts([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const cards = useMemo(() => groupCatalog(products), [products]);

  async function saveSettings() {
    setSaving(true);
    const { error } = await supabase
      .from("store_settings")
      .update({
        promo_fch_active: settings.active,
        promo_fch_title: settings.title.trim() || null,
        promo_fch_eyebrow: settings.eyebrow.trim() || null,
        promo_fch_description: settings.description.trim() || null,
        promo_fch_quota_total: Math.max(1, Math.round(settings.quotaTotal)),
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
    setNotice({ kind: "ok", text: "Pengaturan promo tersimpan" });
  }

  /**
   * Sakelar produk promo — menulis `products.promo_fch_enabled` untuk SEMUA baris dalam satu
   * grup (kategori + nama), sama seperti sakelar Open Order.
   */
  async function toggleProduct(card: PromoCard) {
    const current = card.promoFchEnabled !== false;
    const next = !current;
    setSavingId(card.id);
    const { error } = await supabase
      .from("products")
      .update({ promo_fch_enabled: next })
      .eq("category", card.category)
      .eq("name", card.name);
    setSavingId(null);

    if (error) {
      setNotice({ kind: "err", text: `Gagal mengubah produk: ${error.message}` });
      return;
    }
    // Perbarui state lokal hanya setelah server mengonfirmasi.
    setProducts((prev) =>
      prev.map((p) =>
        p.category === card.category && p.name === card.name
          ? ({ ...p, promo_fch_enabled: next } as Product)
          : p,
      ),
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13px]" style={{ color: LABEL_COLOR }}>
        <Loader2 size={16} className="animate-spin" /> Memuat pengaturan promo…
      </div>
    );
  }

  const onCount = cards.filter((c) => (c as unknown as { promoFchEnabled?: boolean }).promoFchEnabled !== false).length;

  return (
    <div className="flex flex-col gap-5 pb-16">
      <header>
        <p className={LABEL} style={{ color: LABEL_COLOR }}>
          Pengaturan
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-[22px] font-bold" style={{ color: "var(--fg)" }}>
          <Tag size={20} strokeWidth={2.2} /> Promo Free Cover Hanger
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--fg2)" }}>
          Program bonus Cover Hanger untuk pembelian pertama. Halaman pesan:{" "}
          <code style={{ fontSize: 12 }}>{PROMO_ORDER_PATH}</code>
        </p>
      </header>

      {notice ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl p-3.5 text-[12.5px]"
          style={
            notice.kind === "ok"
              ? { background: "rgba(31,111,69,.09)", border: "1px solid rgba(31,111,69,.35)", color: "#1f6f45" }
              : { background: "rgba(185,28,28,.08)", border: "1px solid rgba(185,28,28,.35)", color: "#b91c1c" }
          }
        >
          {notice.kind === "ok" ? (
            <Check size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      ) : null}

      {missingColumn && (
        <div
          className="flex items-start gap-2 rounded-xl p-4 text-[12.5px]"
          style={{ background: "rgba(180,83,9,.08)", border: "1px solid rgba(180,83,9,.35)", color: "#8a4b08" }}
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Kolom <code>promo_fch_*</code> belum ada di database. Jalankan{" "}
            <code>supabase/migrations/20261031_promo_free_cover_hanger.sql</code> dulu — sebelum itu
            penyimpanan akan gagal.
          </span>
        </div>
      )}

      <Section title="Status program" icon={<Tag size={14} strokeWidth={2.2} />}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
              Promo aktif
            </p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--fg2)" }}>
              Saat dimatikan, bonus tidak ditawarkan di halaman pesan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettings((s) => ({ ...s, active: !s.active }))}
            aria-pressed={settings.active}
            className="rounded-full px-4 py-2 text-[12px] font-bold"
            style={{
              background: settings.active ? "#111" : "transparent",
              color: settings.active ? "#fff" : "var(--fg)",
              border: "1px solid var(--bd)",
            }}
          >
            {settings.active ? "Aktif" : "Nonaktif"}
          </button>
        </div>
      </Section>

      <Section title="Teks katalog promo" icon={<Tag size={14} strokeWidth={2.2} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className={LABEL} style={{ color: LABEL_COLOR }}>
              Judul besar
            </span>
            <input
              value={settings.title}
              onChange={(e) => setSettings((s) => ({ ...s, title: e.target.value }))}
              placeholder="Free Cover Hanger"
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-[13px]"
              style={{ background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--fg)" }}
            />
          </label>
          <label className="block">
            <span className={LABEL} style={{ color: LABEL_COLOR }}>
              Teks kecil di atas judul
            </span>
            <input
              value={settings.eyebrow}
              onChange={(e) => setSettings((s) => ({ ...s, eyebrow: e.target.value }))}
              placeholder="Pembelian Pertama"
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-[13px]"
              style={{ background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--fg)" }}
            />
          </label>
        </div>
        <label className="mt-4 block">
          <span className={LABEL} style={{ color: LABEL_COLOR }}>
            Deskripsi
          </span>
          <textarea
            value={settings.description}
            onChange={(e) => setSettings((s) => ({ ...s, description: e.target.value }))}
            rows={3}
            placeholder="Beli Thobe, Kandora, atau Koko pertamamu dan Cover Hanger senilai Rp35.000 masuk otomatis…"
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-[13px]"
            style={{ background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--fg)" }}
          />
        </label>
      </Section>

      <Section title="Kuota bonus" icon={<Tag size={14} strokeWidth={2.2} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className={LABEL} style={{ color: LABEL_COLOR }}>
              Total bonus
            </span>
            <input
              type="number"
              min={1}
              value={settings.quotaTotal}
              onChange={(e) => setSettings((s) => ({ ...s, quotaTotal: Number(e.target.value) || 0 }))}
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-[13px] tabular-nums"
              style={{ background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--fg)" }}
            />
          </label>
          <label className="block">
            <span className={LABEL} style={{ color: LABEL_COLOR }}>
              Sisa bonus (angka di bar)
            </span>
            <input
              type="number"
              min={0}
              max={settings.quotaTotal}
              value={settings.quotaLeft}
              onChange={(e) => setSettings((s) => ({ ...s, quotaLeft: Number(e.target.value) || 0 }))}
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-[13px] tabular-nums"
              style={{ background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--fg)" }}
            />
          </label>
        </div>
        <label className="mt-4 block">
          <span className={LABEL} style={{ color: LABEL_COLOR }}>
            Keterangan di bawah bar
          </span>
          <input
            value={settings.quotaNote}
            onChange={(e) => setSettings((s) => ({ ...s, quotaNote: e.target.value }))}
            placeholder="Bonus terbatas. Begitu kuotanya habis, program selesai."
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-[13px]"
            style={{ background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--fg)" }}
          />
        </label>
      </Section>

      <Section title="Periode (opsional)" icon={<Tag size={14} strokeWidth={2.2} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className={LABEL} style={{ color: LABEL_COLOR }}>
              Mulai
            </span>
            <input
              type="date"
              value={settings.startDate}
              onChange={(e) => setSettings((s) => ({ ...s, startDate: e.target.value }))}
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-[13px]"
              style={{ background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--fg)" }}
            />
          </label>
          <label className="block">
            <span className={LABEL} style={{ color: LABEL_COLOR }}>
              Selesai
            </span>
            <input
              type="date"
              value={settings.endDate}
              onChange={(e) => setSettings((s) => ({ ...s, endDate: e.target.value }))}
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-[13px]"
              style={{ background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--fg)" }}
            />
          </label>
        </div>
      </Section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={saveSettings}
          disabled={saving}
          className="rounded-lg px-6 py-3 text-[12px] font-bold uppercase tracking-[0.14em] disabled:opacity-50"
          style={{ background: "var(--fg)", color: "var(--bg)" }}
        >
          {saving ? "Menyimpan…" : "Simpan pengaturan"}
        </button>
      </div>

      <Section title={`Produk di promo (${onCount} dari ${cards.length})`} icon={<Tag size={14} strokeWidth={2.2} />}>
        <p className="mb-4 text-[12px]" style={{ color: "var(--fg2)" }}>
          Sakelar ini <b>terpisah</b> dari Open Order — produk bisa tampil di promo tanpa ikut
          Open Order. Penanda di menu Transaksi: <b>{PROMO_FCH_SOURCE}</b>.
        </p>
        <ProductsCatalog
          items={cards}
          total={cards.length}
          thumbnails={{}}
          search={search}
          setSearch={setSearch}
          openOrder={{
            isEnabled: (p) => (p as PromoCard).promoFchEnabled !== false,
            onToggle: (p) => toggleProduct(p as PromoCard),
            savingId,
          }}
        />
      </Section>
    </div>
  );
}
