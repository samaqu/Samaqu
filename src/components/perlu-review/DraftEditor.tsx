"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, Save, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

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

const money = (value: unknown) => "Rp" + Number(value || 0).toLocaleString("id-ID");
const labelClass = "text-[11px] font-bold uppercase tracking-wide";

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
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [addQty, setAddQty] = useState(1);
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return variants;
    return variants.filter((item) =>
      `${item.product_name} ${item.series_name || ""} ${item.color || ""}`.toLowerCase().includes(term),
    );
  }, [variants, search]);

  const selectedVariant = variants.find((item) => item.id === selectedProduct);
  const sizes = selectedVariant
    ? Object.keys(selectedVariant.stock_efektif || selectedVariant.stock || {})
        .filter((size) => stockOf(selectedVariant, size) > 0)
        .sort((a, b) => a.localeCompare(b, "id", { numeric: true }))
    : [];

  function selectProduct(id: string) {
    setSelectedProduct(id);
    const variant = variants.find((item) => item.id === id);
    const first = variant
      ? Object.keys(variant.stock_efektif || variant.stock || {}).find((size) => stockOf(variant, size) > 0)
      : "";
    setSelectedSize(first || "");
    setAddQty(1);
    setError("");
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
    const quantity = Math.max(1, Math.min(Number(addQty) || 1, stock - existingQty));
    if (existingQty >= stock) {
      setError(`Stok ${selectedSize} tinggal ${stock}.`);
      return;
    }
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
    setSelectedProduct("");
    setSelectedSize("");
    setAddQty(1);
    setSearch("");
    setError("");
  }

  function changeQty(index: number, value: number) {
    const item = items[index];
    const variant = variants.find(
      (entry) =>
        entry.product_id === item.product_id && (entry.color || "default") === item.color,
    );
    const stock = stockOf(variant, item.size);
    const max = stock > 0 ? stock : 99;
    const next = Math.max(1, Math.min(Number(value) || 1, max));
    setItems((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, quantity: next } : row)));
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingCost = Number(draft.payload?.shipping_cost) || 0;
  const discount = Number(draft.payload?.discount) || 0;
  const total = subtotal + shippingCost - discount;

  async function save() {
    setError("");
    if (!items.length) {
      setError("Draft harus punya minimal 1 produk.");
      return;
    }
    if (!shipping.address.trim() || !shipping.kecamatan.trim() || !shipping.city.trim() || !shipping.province.trim() || !shipping.postal_code.trim()) {
      setError("Alamat lengkap, kecamatan, kota, provinsi, dan kode pos wajib diisi.");
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
          payload: {
            ...draft.payload,
            shipping,
            items,
          },
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

  const inputClass = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
  const inputStyle = { borderColor: "#E7E6E1", color: "#141414" };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl"
        style={{ borderColor: "#E7E6E1" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: "#E7E6E1" }}>
          <div>
            <h2 className="text-base font-black" style={{ color: "#141414" }}>Edit draft transaksi</h2>
            <p className="mt-0.5 text-xs" style={{ color: "#6B6A64" }}>
              {draft.customer_name || "Customer"} · stok baru dipotong saat Setujui
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border" style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}>
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3">
            <div>
              <label className={labelClass} style={{ color: "#8A8880" }}>Alamat lengkap</label>
              <textarea
                value={shipping.address}
                onChange={(event) => setShipping({ ...shipping, address: event.target.value })}
                rows={2}
                className={`${inputClass} mt-1 resize-none`}
                style={inputStyle}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={{ color: "#8A8880" }}>Kecamatan</label>
                <input value={shipping.kecamatan} onChange={(event) => setShipping({ ...shipping, kecamatan: event.target.value })} className={`${inputClass} mt-1`} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={{ color: "#8A8880" }}>Kota / Kabupaten</label>
                <input value={shipping.city} onChange={(event) => setShipping({ ...shipping, city: event.target.value })} className={`${inputClass} mt-1`} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={{ color: "#8A8880" }}>Provinsi</label>
                <input value={shipping.province} onChange={(event) => setShipping({ ...shipping, province: event.target.value })} className={`${inputClass} mt-1`} style={inputStyle} />
              </div>
              <div>
                <label className={labelClass} style={{ color: "#8A8880" }}>Kode pos</label>
                <input value={shipping.postal_code} onChange={(event) => setShipping({ ...shipping, postal_code: event.target.value })} className={`${inputClass} mt-1`} style={inputStyle} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-3" style={{ borderColor: "#E7E6E1" }}>
            <p className={labelClass} style={{ color: "#8A8880" }}>Produk di draft</p>
            <div className="mt-2 space-y-2">
              {items.map((item, index) => {
                const variant = variants.find(
                  (entry) => entry.product_id === item.product_id && (entry.color || "default") === item.color,
                );
                const stock = stockOf(variant, item.size);
                return (
                  <div key={`${item.product_id}-${item.color}-${item.size}-${index}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-[#FAF9F6] px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: "#141414" }}>
                        {item.product_name}{item.color !== "default" ? ` · ${item.color}` : ""} · {item.size}
                      </p>
                      <p className="text-[11px]" style={{ color: stock < item.quantity ? "#9B2C2C" : "#6B6A64" }}>
                        {money(item.price)} · stok {stock}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) => changeQty(index, Number(event.target.value))}
                      className="h-8 w-16 rounded-lg border px-2 text-center text-sm"
                      style={inputStyle}
                    />
                    <span className="w-24 text-right text-sm font-bold" style={{ color: "#141414" }}>{money(item.price * item.quantity)}</span>
                    <button type="button" onClick={() => setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="rounded-lg p-1.5" style={{ color: "#9B2C2C" }} aria-label="Hapus produk">
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              {items.length === 0 ? <p className="py-2 text-xs" style={{ color: "#9A9892" }}>Belum ada produk.</p> : null}
            </div>
          </div>

          <div className="rounded-xl border p-3" style={{ borderColor: "#E7E6E1" }}>
            <p className={labelClass} style={{ color: "#8A8880" }}>Tambah produk</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border px-2" style={{ borderColor: "#E7E6E1" }}>
              <Search size={15} style={{ color: "#9A9892" }} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama / series / warna..." className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" style={{ color: "#141414" }} />
            </div>
            <select value={selectedProduct} onChange={(event) => selectProduct(event.target.value)} className={`${inputClass} mt-2`} style={inputStyle}>
              <option value="">{loadingProducts ? "Memuat produk..." : "Pilih produk"}</option>
              {filtered.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.product_name}{item.series_name ? ` · ${item.series_name}` : ""}{item.color && item.color !== "default" ? ` · ${item.color}` : ""}
                </option>
              ))}
            </select>
            {selectedVariant ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[120px] flex-1">
                  <label className={labelClass} style={{ color: "#8A8880" }}>Ukuran</label>
                  <select value={selectedSize} onChange={(event) => setSelectedSize(event.target.value)} className={`${inputClass} mt-1`} style={inputStyle}>
                    <option value="">Pilih ukuran</option>
                    {sizes.map((size) => <option key={size} value={size}>{size} · stok {stockOf(selectedVariant, size)}</option>)}
                  </select>
                </div>
                <div className="w-20">
                  <label className={labelClass} style={{ color: "#8A8880" }}>Qty</label>
                  <input type="number" min={1} value={addQty} onChange={(event) => setAddQty(Number(event.target.value))} className={`${inputClass} mt-1`} style={inputStyle} />
                </div>
                <button type="button" onClick={addItem} disabled={!selectedSize} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white disabled:opacity-40" style={{ background: "#1F7A4D" }}>
                  <Plus size={15} /> Tambah
                </button>
              </div>
            ) : null}
            {selectedVariant && sizes.length === 0 ? <p className="mt-2 text-xs" style={{ color: "#9B2C2C" }}>Ukuran produk ini sedang habis.</p> : null}
          </div>

          <div className="rounded-xl bg-[#FAF9F6] p-3 text-sm">
            <div className="flex justify-between" style={{ color: "#6B6A64" }}><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="mt-1 flex justify-between" style={{ color: "#6B6A64" }}><span>Ongkir</span><span>{money(shippingCost)}</span></div>
            {discount > 0 ? <div className="mt-1 flex justify-between" style={{ color: "#6B6A64" }}><span>Diskon</span><span>-{money(discount)}</span></div> : null}
            <div className="mt-2 flex justify-between border-t pt-2 font-bold" style={{ borderColor: "#E7E6E1", color: "#1F7A4D" }}><span>Total</span><span>{money(total)}</span></div>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs" style={{ background: "#FCE8E8", borderColor: "#F3CFCB", color: "#9B2C2C" }}>
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-5 py-4" style={{ borderColor: "#E7E6E1" }}>
          <p className="text-[11px]" style={{ color: "#6B6A64" }}>Edit tidak memotong stok. Stok dipotong saat Setujui.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border px-4 text-xs font-bold disabled:opacity-50" style={{ borderColor: "#E7E6E1", color: "#6B6A64", background: "#fff" }}>Batal</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50" style={{ background: "#1F7A4D" }}>
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Simpan draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
