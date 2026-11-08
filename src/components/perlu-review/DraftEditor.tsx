"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Save,
  Search,
  Shirt,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isPaketItem, variantName } from "@/lib/item-label";

type Draft = {
  id: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  payload: any;
};

type Variant = {
  id: string;
  product_id: string;
  product_name: string;
  series_name?: string;
  jenis_kain_name?: string;
  category?: string;
  image?: string;
  color?: string;
  price?: number;
  prices?: Record<string, number>;
  stock?: Record<string, number>;
  stock_efektif?: Record<string, number>;
};

type Item = {
  product_id: string;
  product_name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
};

type ProductGroup = {
  key: string;
  product_id: string;
  name: string;
  category: string;
  kain: string;
  image: string;
  variants: Variant[];
  series: string[];
  warnas: string[];
  stockTotal: number;
};

const money = (value: unknown) => "Rp" + Number(value || 0).toLocaleString("id-ID");
const labelClass = "text-[11px] font-bold uppercase tracking-wider";
const inputClass = "w-full rounded-xl border px-3 py-2.5 text-sm font-medium outline-none";
const inputStyle = { borderColor: "#dbe4eb", color: "#2a1a22", background: "#fff" };

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

function stockOf(variant: Variant | undefined, size: string) {
  if (!variant) return 0;
  return Number(variant.stock_efektif?.[size] ?? variant.stock?.[size] ?? 0);
}

function priceOf(variant: Variant | undefined, size: string) {
  if (!variant) return 0;
  return Number(variant.prices?.[size] ?? variant.price ?? 0);
}

function sizesOf(variant: Variant | undefined) {
  if (!variant) return [];
  return Object.keys(variant.stock_efektif || variant.stock || {});
}

function phone(value: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
}

export default function DraftEditor({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialShipping = draft.payload?.shipping || {};
  const [shipping, setShipping] = useState({
    address: String(initialShipping.address || ""),
    kecamatan: String(initialShipping.kecamatan || ""),
    city: String(initialShipping.city || ""),
    province: String(initialShipping.province || ""),
    postal_code: String(initialShipping.postal_code || ""),
  });
  const [items, setItems] = useState<Item[]>(
    (Array.isArray(draft.payload?.items) ? draft.payload.items : []).map((item: any) => ({
      product_id: String(item.product_id || ""),
      product_name: String(item.product_name || item.product_id || ""),
      color: String(item.color || "default"),
      size: String(item.size || "").toUpperCase(),
      quantity: Math.max(1, Number(item.quantity) || 1),
      price: Number(item.price) || 0,
    })),
  );
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [categoryChip, setCategoryChip] = useState("all");
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [addQty, setAddQty] = useState(1);
  const [addressEditing, setAddressEditing] = useState(false);
  const [discountInput, setDiscountInput] = useState(String(Number(draft.payload?.discount) || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/ops/product-variants?for=sale", { headers: await authHeaders() });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `Gagal memuat produk (${res.status})`);
        if (alive) setVariants(Array.isArray(json?.items) ? json.items : []);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Gagal memuat produk.");
      } finally {
        if (alive) setLoadingProducts(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const productGroups = useMemo(() => {
    const map = new Map<string, ProductGroup>();
    for (const variant of variants) {
      const category = String(variant.category || "");
      const kain = String(variant.jenis_kain_name || "");
      const key = `${category}|${kain}|${variant.product_name}`;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          product_id: variant.product_id,
          name: variant.product_name,
          category,
          kain,
          image: "",
          variants: [],
          series: [],
          warnas: [],
          stockTotal: 0,
        };
        map.set(key, group);
      }
      group.variants.push(variant);
      if (!group.image && variant.image) group.image = variant.image;
      if (variant.series_name && !group.series.includes(variant.series_name)) group.series.push(variant.series_name);
      const warna = variant.color && variant.color !== "default" ? variant.color : variant.product_name;
      if (!group.warnas.includes(warna)) group.warnas.push(warna);
      group.stockTotal += sizesOf(variant).reduce((sum, size) => sum + stockOf(variant, size), 0);
    }
    return [...map.values()];
  }, [variants]);

  const categoryOptions = useMemo(
    () => [...new Set(productGroups.map((group) => group.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")),
    [productGroups],
  );

  const visibleGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return productGroups
      .filter((group) => categoryChip === "all" || group.category === categoryChip)
      .filter((group) => {
        if (!term) return true;
        return `${group.name} ${group.kain} ${group.category} ${group.warnas.join(" ")}`.toLowerCase().includes(term);
      })
      .sort((a, b) => a.category.localeCompare(b.category, "id") || a.kain.localeCompare(b.kain, "id") || a.name.localeCompare(b.name, "id"));
  }, [productGroups, categoryChip, search]);

  const selectedGroup = productGroups.find((group) => group.key === selectedGroupKey) || null;
  const selectedVariant =
    selectedGroup?.variants.find((variant) => variant.id === selectedVariantId) || selectedGroup?.variants[0];
  const availableSizes = selectedVariant
    ? sizesOf(selectedVariant).filter((size) => stockOf(selectedVariant, size) > 0)
    : [];

  function chooseGroup(group: ProductGroup) {
    const variant = group.variants[0];
    const first = variant ? sizesOf(variant).find((size) => stockOf(variant, size) > 0) : "";
    setSelectedGroupKey(group.key);
    setSelectedVariantId(variant?.id || "");
    setSelectedSize(first || "");
    setAddQty(1);
    setError("");
  }

  function chooseVariant(variant: Variant) {
    const first = sizesOf(variant).find((size) => stockOf(variant, size) > 0);
    setSelectedVariantId(variant.id);
    setSelectedSize(first || "");
    setAddQty(1);
    setError("");
  }

  function itemVariant(item: Item) {
    const exact = variants.find(
      (entry) => entry.product_id === item.product_id && (entry.color || "default") === item.color,
    );
    if (exact) return exact;
    // Warna produk bisa menempel di nama ("Thobe Mint Karim") sementara baris variannya
    // berwarna "default". Pakai varian default supaya stok & ukuran tetap terbaca.
    return variants.find(
      (entry) => entry.product_id === item.product_id && (entry.color || "default") === "default",
    );
  }

  function changeSize(index: number, size: string) {
    const item = items[index];
    const variant = itemVariant(item);
    if (!variant || stockOf(variant, size) < 1) return;
    setItems((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, size, price: priceOf(variant, size) || row.price } : row,
      ),
    );
  }

  function changeQty(index: number, value: number) {
    const item = items[index];
    const stock = stockOf(itemVariant(item), item.size);
    const max = stock > 0 ? stock : 99;
    const next = Math.max(1, Math.min(Number(value) || 1, max));
    setItems((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, quantity: next } : row)),
    );
  }

  function addItem() {
    if (!selectedVariant || !selectedSize) return;
    const stock = stockOf(selectedVariant, selectedSize);
    const existingQty = items
      .filter(
        (item) =>
          item.product_id === selectedVariant.product_id &&
          item.color === (selectedVariant.color || "default") &&
          item.size === selectedSize,
      )
      .reduce((sum, item) => sum + item.quantity, 0);
    if (existingQty >= stock) {
      setError(`Stok ${selectedSize} tinggal ${stock}.`);
      return;
    }
    const quantity = Math.max(1, Math.min(Number(addQty) || 1, stock - existingQty));
    const next: Item = {
      product_id: selectedVariant.product_id,
      product_name: selectedVariant.product_name,
      color: selectedVariant.color || "default",
      size: selectedSize,
      quantity,
      price: priceOf(selectedVariant, selectedSize),
    };
    setItems((current) => {
      const index = current.findIndex(
        (item) =>
          item.product_id === next.product_id && item.color === next.color && item.size === next.size,
      );
      if (index === -1) return [...current, next];
      const copy = [...current];
      copy[index] = { ...copy[index], quantity: copy[index].quantity + quantity };
      return copy;
    });
    setSelectedGroupKey("");
    setSelectedVariantId("");
    setSelectedSize("");
    setAddQty(1);
    setSearch("");
    setAddOpen(false);
    setError("");
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingCost = Number(draft.payload?.shipping_cost) || 0;
  const discount = Math.min(Math.max(0, Math.round(Number(discountInput) || 0)), subtotal);
  const total = subtotal + shippingCost - discount;
  const addressLine = [
    shipping.address,
    shipping.kecamatan ? `Kec. ${shipping.kecamatan}` : "",
    shipping.city,
    shipping.province,
    shipping.postal_code,
  ].filter(Boolean).join(", ");

  async function save() {
    setError("");
    if (!items.length) {
      setError("Draft harus punya minimal 1 produk.");
      return;
    }
    if (!shipping.address.trim() || !shipping.kecamatan.trim() || !shipping.city.trim() || !shipping.province.trim() || !shipping.postal_code.trim()) {
      setError("Alamat lengkap, kecamatan, kota, provinsi, dan kode pos wajib diisi.");
      setAddressEditing(true);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ops/perlu-review", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          action: "draft_update",
          id: draft.id,
          payload: { ...draft.payload, shipping, items, discount },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Gagal menyimpan (${res.status})`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan draft.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-[#2a1a22]/35 backdrop-blur-[1px]" onMouseDown={onClose}>
      <div
        className="flex h-full w-full max-w-[520px] flex-col overflow-hidden bg-white shadow-2xl sm:rounded-l-3xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0 px-6 pb-5 pt-6" style={{ background: "linear-gradient(130deg,#e8f3fb 0%,#fdf0f4 100%)" }}>
          <button type="button" onClick={onClose} className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#2a1a22] shadow-sm" aria-label="Tutup">
            <X size={19} />
          </button>
          <p className="text-xs font-bold" style={{ color: "#4a90c2" }}>Hai Lea, mau ubah apa?</p>
          <h2 className="mt-0.5 text-2xl font-black" style={{ color: "#2a1a22" }}>Ubah Pesanan</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-bold" style={{ color: "#2f6f9e" }}>
              DRAFT-{draft.id.slice(0, 8).toUpperCase()}
            </span>
            <span className="rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: "#e7f5eb", color: "#2f7a4f" }}>
              Menunggu review
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex items-start gap-2.5 rounded-2xl px-4 py-3 text-xs font-medium" style={{ background: "#e8f3fb", color: "#2f6f9e" }}>
            <span className="mt-px text-sm">💡</span>
            <span>Boleh ubah alamat, ukuran, atau tambah produk. Total pesanan ikut menyesuaikan.</span>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "#e3ebf1" }}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black" style={{ background: "#fdf0f4", color: "#2a1a22" }}>
              {(draft.customer_name || "C").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black" style={{ color: "#2a1a22" }}>{draft.customer_name || "Customer"}</p>
              <p className="mt-0.5 truncate text-xs font-medium" style={{ color: "#8a7d83" }}>
                {phone(draft.customer_whatsapp)} · {shipping.city || "-"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border px-4 py-3" style={{ borderColor: "#e3ebf1" }}>
            <div className="flex items-start gap-3">
              <MapPin size={17} className="mt-0.5 shrink-0" style={{ color: "#4a90c2" }} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#8a7d83" }}>Alamat pengiriman · bisa diubah</p>
                <p className="mt-1 truncate text-sm font-semibold" style={{ color: "#2a1a22" }} title={addressLine}>{addressLine || "Alamat belum lengkap"}</p>
              </div>
              <button type="button" onClick={() => setAddressEditing((value) => !value)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold" style={{ borderColor: "#d5e3ee", color: "#2f6f9e", background: "#fff" }}>
                <Pencil size={13} /> {addressEditing ? "Tutup" : "Ubah alamat"}
              </button>
            </div>

            {addressEditing ? (
              <div className="mt-3 grid gap-2.5 border-t pt-3" style={{ borderColor: "#edf1f4" }}>
                <div>
                  <label className={labelClass} style={{ color: "#8a7d83" }}>Alamat lengkap</label>
                  <textarea value={shipping.address} onChange={(event) => setShipping({ ...shipping, address: event.target.value })} rows={2} className={`${inputClass} mt-1 resize-none`} style={inputStyle} />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className={labelClass} style={{ color: "#8a7d83" }}>Kecamatan</label>
                    <input value={shipping.kecamatan} onChange={(event) => setShipping({ ...shipping, kecamatan: event.target.value })} className={`${inputClass} mt-1`} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: "#8a7d83" }}>Kota / Kabupaten</label>
                    <input value={shipping.city} onChange={(event) => setShipping({ ...shipping, city: event.target.value })} className={`${inputClass} mt-1`} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: "#8a7d83" }}>Provinsi</label>
                    <input value={shipping.province} onChange={(event) => setShipping({ ...shipping, province: event.target.value })} className={`${inputClass} mt-1`} style={inputStyle} />
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: "#8a7d83" }}>Kode pos</label>
                    <input value={shipping.postal_code} onChange={(event) => setShipping({ ...shipping, postal_code: event.target.value })} className={`${inputClass} mt-1`} style={inputStyle} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <p className="mb-2 mt-5 text-[11px] font-black uppercase tracking-wider" style={{ color: "#7c93a6" }}>Produk di pesanan</p>
          <div className="space-y-3">
            {items.map((item, index) => {
              const variant = itemVariant(item);
              const sizes = sizesOf(variant);
              const stock = stockOf(variant, item.size);
              // Nama dari master produk; series tidak diulang lagi di judul karena sudah
              // tampil sebagai chip. Kategori paket menampilkan nama variannya.
              const baseName = String(variant?.product_name || item.product_name || "");
              const seriesName = String(variant?.series_name || "").trim();
              const cleanBase =
                seriesName && baseName.toLowerCase().endsWith(seriesName.toLowerCase())
                  ? baseName
                      .slice(0, baseName.length - seriesName.length)
                      .replace(/[\s—–-]+$/, "")
                      .trim() || baseName
                  : baseName;
              const paketVariant = isPaketItem({ size: item.size }) ? variantName(item.color) : "";
              const colorLabel = item.color && item.color !== "default" ? String(item.color).trim() : "";
              const itemTitle = paketVariant
                ? paketVariant.toLowerCase().startsWith(cleanBase.toLowerCase())
                  ? paketVariant
                  : cleanBase.toLowerCase().includes(paketVariant.toLowerCase())
                    ? cleanBase
                    : `${cleanBase} - ${paketVariant}`
                : colorLabel && !cleanBase.toLowerCase().includes(colorLabel.toLowerCase())
                  ? `${cleanBase} - ${colorLabel}`
                  : cleanBase;
              return (
                <div key={`${item.product_id}-${item.color}-${item.size}-${index}`} className="rounded-2xl border p-3.5" style={{ borderColor: "#e3ebf1", background: "#fff" }}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-16 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: "#f5f1ee", color: "#b9a99c" }}>
                      {variant?.image ? (
                        <img src={variant.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Shirt size={28} strokeWidth={1.5} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-black leading-snug" style={{ color: "#2a1a22" }}>{itemTitle}</p>
                        <button type="button" onClick={() => setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "#fdf0f4", color: "#d85b78" }} aria-label="Hapus produk">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {variant?.series_name ? <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#e8f3fb", color: "#2f6f9e" }}>{variant.series_name}</span> : null}
                        {variant?.jenis_kain_name ? <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#fdf0f4", color: "#b65b78" }}>{variant.jenis_kain_name}</span> : null}
                      </div>
                      <p className="mt-1.5 text-[11px] font-medium" style={{ color: "#8a7d83" }}>Stok tersedia {stock}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="flex gap-1">
                          {sizes.map((size) => {
                            const sizeStock = stockOf(variant, size);
                            const active = size === item.size;
                            return (
                              <button
                                key={size}
                                type="button"
                                disabled={sizeStock < 1 && !active}
                                onClick={() => changeSize(index, size)}
                                className="h-8 min-w-8 rounded-full px-2 text-[11px] font-bold disabled:opacity-35"
                                style={{
                                  background: active ? "#4a90c2" : "#f2f6f9",
                                  color: active ? "#fff" : "#5b6f7c",
                                  border: active ? "1px solid #4a90c2" : "1px solid #e3ebf1",
                                }}
                              >
                                {size}
                              </button>
                            );
                          })}
                        </div>
                        <div className="ml-auto flex items-center gap-1 rounded-full border px-1" style={{ borderColor: "#e3ebf1" }}>
                          <button type="button" onClick={() => changeQty(index, item.quantity - 1)} className="flex h-7 w-7 items-center justify-center" style={{ color: "#62717c" }} aria-label="Kurangi qty"><Minus size={13} /></button>
                          <span className="min-w-5 text-center text-xs font-bold" style={{ color: "#2a1a22" }}>{item.quantity}</span>
                          <button type="button" onClick={() => changeQty(index, item.quantity + 1)} className="flex h-7 w-7 items-center justify-center" style={{ color: "#62717c" }} aria-label="Tambah qty"><Plus size={13} /></button>
                        </div>
                        <span className="text-xs font-bold" style={{ color: "#2a1a22" }}>{money(item.price * item.quantity)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button type="button" onClick={() => setAddOpen((value) => !value)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-xs font-bold" style={{ borderColor: "#bed6e7", color: "#2f6f9e", background: "#f8fbfd" }}>
            <Plus size={15} /> {addOpen ? "Tutup pilihan produk" : "Tambah produk"}
          </button>

          {addOpen ? (
            <div className="mt-3 overflow-hidden rounded-2xl border" style={{ borderColor: "#cfe1ef", background: "#fff" }}>
              <div className="p-3.5">
                <div className="flex items-center gap-2 rounded-xl border-2 px-3" style={{ borderColor: "#2a1a22", background: "#fff" }}>
                  <Search size={16} style={{ color: "#2a1a22" }} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari produk… (mis. super, grey, b-01)" className="h-11 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none" style={{ color: "#2a1a22" }} />
                </div>

                {categoryOptions.length > 1 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {["all", ...categoryOptions].map((category) => {
                      const active = categoryChip === category;
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setCategoryChip(category)}
                          className="rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors"
                          style={{
                            background: active ? "#7fb8e5" : "#fff",
                            borderColor: active ? "#7fb8e5" : "#d5e3ee",
                            color: active ? "#fff" : "#5b6f7c",
                          }}
                        >
                          {category === "all" ? "Semua" : category}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {!selectedGroup ? (
                <div className="max-h-[300px] divide-y overflow-y-auto border-t" style={{ borderColor: "#edf2f6" }}>
                  {loadingProducts ? (
                    <p className="px-4 py-4 text-xs" style={{ color: "#8a7d83" }}>Memuat daftar produk...</p>
                  ) : visibleGroups.length === 0 ? (
                    <p className="px-4 py-4 text-xs" style={{ color: "#8a7d83" }}>Produk tidak ditemukan. Coba kata lain (mis. “super”, “grey”, “b-01”).</p>
                  ) : (
                    visibleGroups.map((group) => (
                      <button key={group.key} type="button" onClick={() => chooseGroup(group)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f7fbfe]">
                        <span className="flex h-12 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: "#f5f1ee" }}>
                          {group.image ? (
                            <img src={group.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Shirt size={22} strokeWidth={1.5} style={{ color: "#b9a99c" }} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black" style={{ color: "#2a1a22" }}>{group.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] font-medium" style={{ color: "#8a7d83" }}>
                            {[group.kain ? `Kain ${group.kain}` : "", group.category, group.series.length > 1 ? `${group.series.length} series` : ""].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-bold" style={{ color: group.stockTotal > 0 ? "#22945b" : "#9aacb8" }}>
                          {group.stockTotal > 0 ? `sisa ${group.stockTotal}` : "habis"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="border-t p-3.5" style={{ borderColor: "#edf2f6" }}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: "#f5f1ee" }}>
                      {selectedGroup.image ? <img src={selectedGroup.image} alt="" className="h-full w-full object-cover" /> : <Shirt size={22} strokeWidth={1.5} style={{ color: "#b9a99c" }} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black" style={{ color: "#2a1a22" }}>{selectedGroup.name}</p>
                      <p className="text-[11px]" style={{ color: "#8a7d83" }}>{selectedGroup.kain ? `Kain ${selectedGroup.kain}` : ""}{selectedGroup.category ? ` · ${selectedGroup.category}` : ""}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedGroupKey("")} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold" style={{ color: "#2f6f9e" }}>Ganti</button>
                  </div>

                  {selectedGroup.variants.length > 1 ? (
                    <div className="mt-3">
                      <p className={labelClass} style={{ color: "#8a7d83" }}>Series / warna</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {selectedGroup.variants.map((variant) => {
                          const active = selectedVariant?.id === variant.id;
                          return (
                            <button
                              key={variant.id}
                              type="button"
                              onClick={() => chooseVariant(variant)}
                              className="rounded-full border px-2.5 py-1.5 text-[11px] font-bold"
                              style={{
                                background: active ? "#e8f3fb" : "#fff",
                                borderColor: active ? "#7fb8e5" : "#d5e3ee",
                                color: active ? "#2f6f9e" : "#5b6f7c",
                              }}
                            >
                              {variant.series_name || variant.color || "Default"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3">
                    <p className={labelClass} style={{ color: "#8a7d83" }}>Ukuran</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {availableSizes.map((size) => {
                        const active = selectedSize === size;
                        return (
                          <button
                            key={size}
                            type="button"
                            onClick={() => setSelectedSize(size)}
                            className="h-8 min-w-9 rounded-full border px-2 text-[11px] font-bold"
                            style={{
                              background: active ? "#4a90c2" : "#fff",
                              borderColor: active ? "#4a90c2" : "#d5e3ee",
                              color: active ? "#fff" : "#5b6f7c",
                            }}
                          >
                            {size}
                          </button>
                        );
                      })}
                      {availableSizes.length === 0 ? <span className="text-xs" style={{ color: "#9B2C2C" }}>Stok habis.</span> : null}
                    </div>
                  </div>

                  <div className="mt-3 flex items-end gap-2">
                    <div className="w-24">
                      <label className={labelClass} style={{ color: "#8a7d83" }}>Qty</label>
                      <input type="number" min={1} value={addQty} onChange={(event) => setAddQty(Math.max(1, Number(event.target.value) || 1))} className={`${inputClass} mt-1`} style={inputStyle} />
                    </div>
                    <button type="button" onClick={addItem} disabled={!selectedSize} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white disabled:opacity-40" style={{ background: "#2f6f9e" }}>
                      <Plus size={15} /> Tambah ke pesanan
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 rounded-2xl border px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "#e3ebf1", background: "#fbfcfd" }}>
            <div>
              <p className={labelClass} style={{ color: "#8a7d83" }}>Diskon</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "#9aacb8" }}>Potongan harga, maksimal subtotal.</p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="flex h-10 min-w-0 flex-1 items-center rounded-xl border bg-white px-3 sm:w-40 sm:flex-none" style={{ borderColor: "#d5e3ee" }}>
                <span className="mr-1.5 text-xs font-bold" style={{ color: "#8a7d83" }}>Rp</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={subtotal}
                  step={1000}
                  value={discountInput}
                  onChange={(event) => setDiscountInput(event.target.value)}
                  placeholder="0"
                  aria-label="Diskon dalam rupiah"
                  className="min-w-0 flex-1 bg-transparent text-right text-sm font-bold tabular-nums outline-none"
                  style={{ color: "#2a1a22" }}
                />
              </div>
              {discount > 0 ? (
                <button type="button" onClick={() => setDiscountInput("")} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-bold" style={{ color: "#2f6f9e", background: "#e8f3fb" }}>
                  Hapus
                </button>
              ) : null}
            </div>
          </div>

          <div className="mb-2 mt-4 flex justify-between text-xs" style={{ color: "#8a7d83" }}>
            <span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span>
          </div>
          <div className="flex justify-between text-xs" style={{ color: "#8a7d83" }}>
            <span>Ongkir</span><span className="tabular-nums">{money(shippingCost)}</span>
          </div>
          {discount > 0 ? <div className="mt-1 flex justify-between text-xs" style={{ color: "#8a7d83" }}><span>Diskon</span><span className="tabular-nums">-{money(discount)}</span></div> : null}

          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs" style={{ background: "#FCE8E8", borderColor: "#F3CFCB", color: "#9B2C2C" }}>
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t bg-white px-4 py-3 sm:px-6 sm:py-4" style={{ borderColor: "#e3ebf1" }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#8a7d83" }}>Total pesanan</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className="text-2xl font-black tabular-nums" style={{ color: "#2a1a22" }}>{money(total)}</p>
                <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "#e7f5eb", color: "#2f7a4f" }}>Belum dipotong</span>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
              <button type="button" onClick={onClose} disabled={saving} className="h-11 min-w-0 rounded-xl px-4 text-xs font-bold transition-colors hover:bg-[#e9edf1] disabled:opacity-50" style={{ background: "#f2f4f6", color: "#62717c" }}>Batal</button>
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold text-white transition-colors hover:bg-[#255d86] disabled:opacity-50" style={{ background: "#2f6f9e" }}>
                {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} <span className="truncate">Simpan Perubahan</span>
              </button>
            </div>
          </div>
          <p className="mt-2 text-[10px]" style={{ color: "#8a7d83" }}>Edit tidak memotong stok. Stok dipotong saat Setujui.</p>
        </div>
      </div>
    </div>
  );
}
