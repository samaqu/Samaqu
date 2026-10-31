"use client";

/**
 * Bangku ("row") produk promo — pengganti grid katalog besar.
 *
 * SENGAJA BUKAN `ProductsCatalog`: komponen itu dipakai halaman Produk dan Open Order dan
 * masih menulis label "Tampil di Open Order" di dalam kodenya. Daftar promo punya tabel
 * ringkas sendiri supaya halaman lain tidak tersentuh dan labelnya bisa "Ikut promo".
 *
 * Toggle menulis ke `products.promo_fch_enabled` (field inklusi promo) — BUKAN field Open Order.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Image as ImageIcon, Loader2, Search } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import { cloudinaryUrl } from "@/lib/cloudinary";
import type { Product } from "@/lib/katalog-data";
import { PROMO_COLORS, TEXT, TEXT_MUTED } from "./primitives";
import { ToggleSwitch } from "./ToggleSwitch";

export type PromoProduct = Product & {
  promoFchEnabled: boolean;
  memberIds: string[];
  /** Total stok seluruh varian grup (tidak ada di `Product`, dihitung `ProductsCatalog`). */
  totalStock?: number;
};

const INITIAL_VISIBLE = 8;

const rupiah = (value: number) => "Rp " + Math.round(value || 0).toLocaleString("id-ID");

/** Thumbnail kecil; kalau gagal dimuat → kotak abu netral (tanpa alt text mentah). */
function Thumb({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
        style={{ background: "#EDEDED", border: "1px solid var(--bd)" }}
        aria-label="Foto tidak tersedia"
        role="img"
      >
        <ImageIcon size={14} style={{ color: "#B5B5B5" }} />
      </div>
    );
  }

  return (
    <img
      src={cloudinaryUrl(src, { width: 120 })}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-md object-cover"
      style={{ background: "#EDEDED", border: "1px solid var(--bd)" }}
    />
  );
}

function StockBadge({ stock }: { stock: number }) {
  const tone =
    stock <= 0
      ? { bg: "#FDECEC", bd: "#F5C2C2", fg: "#B42318", label: "Habis" }
      : stock <= 5
        ? { bg: "#FEF6E7", bd: "#F5DDA8", fg: "#8a4b08", label: `Sisa ${stock}` }
        : { bg: "#EAF7F0", bd: "#BFE6D2", fg: "#1F6F45", label: `${stock} pcs` };

  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.fg }}
    >
      {tone.label}
    </span>
  );
}

export function ProdukCard({
  products,
  savingId,
  notice,
  onToggle,
  onBulk,
}: {
  products: PromoProduct[];
  savingId: string | null;
  notice: { kind: "ok" | "err"; text: string } | null;
  onToggle: (product: PromoProduct) => void;
  onBulk: (enabled: boolean) => Promise<void> | void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [showAll, setShowAll] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<boolean | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== "Semua" && product.category !== category) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        (product.kain ?? "").toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q)
      );
    });
  }, [products, category, search]);

  // Filter berubah → kembali ke 8 pertama supaya tidak bingung.
  useEffect(() => {
    setShowAll(false);
  }, [search, category]);

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);
  const remaining = filtered.length - visible.length;
  const onCount = filtered.filter((product) => product.promoFchEnabled).length;
  // Target aksi massal mengikuti hasil filter yang sedang tampil.
  const targetCount = filtered.length;

  async function runBulk() {
    if (bulkConfirm === null) return;
    setBulkSaving(true);
    await onBulk(bulkConfirm);
    setBulkSaving(false);
    setBulkConfirm(null);
  }

  return (
    <section className="pf-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[13.5px] font-bold" style={{ color: TEXT }}>
            Produk yang ikut promo
          </h2>
          <p className="mt-0.5 text-[12px]" style={{ color: TEXT_MUTED }}>
            Hanya produk bertanda “Ikut promo” yang tampil di halaman pesan promo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBulkConfirm(false)}
            className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold"
            style={{ border: "1px solid var(--bd)", color: TEXT, background: "var(--card)" }}
          >
            Matikan semua
          </button>
          <button
            type="button"
            onClick={() => setBulkConfirm(true)}
            className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold"
            style={{ background: PROMO_COLORS.chipBg, border: `1px solid ${PROMO_COLORS.chipBorder}`, color: PROMO_COLORS.chipText }}
          >
            Aktifkan semua
          </button>
        </div>
      </div>

      {notice ? (
        <div
          className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
          style={
            notice.kind === "ok"
              ? { background: "#EAF7F0", border: "1px solid #BFE6D2", color: "#1F6F45" }
              : { background: "#FDECEC", border: "1px solid #F5C2C2", color: "#B42318" }
          }
        >
          {notice.kind === "ok" ? <Check size={14} /> : <AlertTriangle size={14} />}
          {notice.text}
        </div>
      ) : null}

      {/* Search + chip kategori */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "#9aa5ad" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama produk atau kain…"
            aria-label="Cari produk promo"
            className="pf-input"
            style={{ paddingLeft: 38, paddingRight: 14 }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ name: "Semua", count: products.length }, ...categories.map(([name, count]) => ({ name, count }))].map(
            ({ name, count }) => {
              const active = category === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCategory(name)}
                  className="rounded-full px-3 py-1.5 text-[11.5px] font-medium whitespace-nowrap"
                  style={
                    active
                      ? { background: PROMO_COLORS.chipBg, border: `1px solid ${PROMO_COLORS.chipBorder}`, color: PROMO_COLORS.chipText }
                      : { background: "var(--card)", border: "1px solid var(--bd)", color: TEXT_MUTED }
                  }
                >
                  {name} <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            },
          )}
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between text-[11.5px]" style={{ color: TEXT_MUTED }}>
        <span>
          Menampilkan <b style={{ color: TEXT }}>{visible.length}</b> dari {filtered.length} produk
        </span>
        <span>
          Ikut promo: <b style={{ color: PROMO_COLORS.ink }}>{onCount}</b>
        </span>
      </div>

      {/* Tabel — di layar kecil boleh scroll horizontal di dalam box-nya sendiri. */}
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--bd)" }}>
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <thead>
            <tr style={{ background: "var(--sub)", color: TEXT_MUTED }}>
              <th className="px-3 py-2 text-left font-semibold">Produk</th>
              <th className="px-3 py-2 text-left font-semibold">Kategori</th>
              <th className="px-3 py-2 text-right font-semibold">Harga</th>
              <th className="px-3 py-2 text-left font-semibold">Stok</th>
              <th className="px-3 py-2 text-right font-semibold">Ikut promo</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((product) => {
              const saving = savingId === product.id;
              return (
                <tr key={product.id} style={{ borderTop: "1px solid var(--bd)" }}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <Thumb src={product.image} name={product.name} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold" style={{ color: TEXT }}>
                          {product.name}
                        </p>
                        <p className="truncate text-[11px]" style={{ color: TEXT_MUTED }}>
                          {product.kain ? `Kain ${product.kain}` : "—"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2" style={{ color: TEXT_MUTED }}>
                    {product.category}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: TEXT }}>
                    {rupiah(product.price)}
                  </td>
                  <td className="px-3 py-2">
                    <StockBadge stock={product.totalStock ?? 0} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {saving ? <Loader2 size={13} className="animate-spin" style={{ color: "#9a9a98" }} /> : null}
                      <ToggleSwitch
                        checked={product.promoFchEnabled}
                        disabled={saving}
                        onChange={() => onToggle(product)}
                        label={`Ikut promo ${product.name}`}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center" style={{ color: TEXT_MUTED }}>
                  Tidak ada produk yang cocok dengan pencarian.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 w-full rounded-lg py-2 text-[12px] font-semibold"
          style={{ border: "1px solid var(--bd)", color: TEXT, background: "var(--card)" }}
        >
          Tampilkan {remaining} produk lainnya
        </button>
      ) : null}

      <ConfirmModal
        open={bulkConfirm !== null}
        title={bulkConfirm ? "Aktifkan promo untuk semua produk?" : "Matikan promo untuk semua produk?"}
        message={
          bulkConfirm
            ? `${targetCount} produk akan ditampilkan di halaman pesan promo. Lanjutkan?`
            : `Matikan promo untuk ${targetCount} produk? Produk tetap ada, hanya tidak tampil di halaman pesan promo.`
        }
        confirmText={bulkSaving ? "Menyimpan…" : "Ya, lanjutkan"}
        cancelText="Batal"
        danger={!bulkConfirm}
        onConfirm={runBulk}
        onCancel={() => setBulkConfirm(null)}
      />
    </section>
  );
}
