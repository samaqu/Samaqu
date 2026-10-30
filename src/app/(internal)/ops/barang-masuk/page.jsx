"use client";

import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@/lib/ops-router";
import { base44 } from "@/lib/ops-api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp, Calendar as CalendarIcon, Hash, FileText, X, RotateCcw, Save, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { usePageUrl } from "@/lib/ops-router";
import { useToast } from "@/components/ops/ui/use-toast";
import { SIZES } from "@/lib/ops-variants";
import { isPaketKategori, PAKET_SIZE, variantName } from "@/lib/item-label";
import { generateVariantSku, resolveColorName } from "@/lib/sku";
import ProductCombobox from "@/components/ops/barang-masuk/ProductCombobox";

const today = () => format(new Date(), "yyyy-MM-dd");

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyItem() {
  return {
    key: uid(),
    product_id: "",
    variant_id: "",
    /** Jumlah masuk per ukuran: { S: "2", M: "3" }. Paket memakai satu kunci PAKET_SIZE. */
    quantities: {},
    redirected_from: "",
    follow_name: "",
    editing: true,
  };
}

function stockAt(variant, size) {
  if (!variant || !size) return 0;
  const src = variant.stock_efektif ?? variant.stock ?? {};
  const key = Object.keys(src).find((k) => String(k).toUpperCase() === String(size).toUpperCase());
  return Number(src[key] ?? 0) || 0;
}

/** Ukuran yang benar-benar dimiliki varian (bukan daftar tetap), urut standar lalu A-Z. */
function sizesFor(variant) {
  const own = variant?.stock && typeof variant.stock === "object" ? variant.stock : {};
  const efektif =
    variant?.stock_efektif && typeof variant.stock_efektif === "object" ? variant.stock_efektif : {};
  const unique = new Map();
  for (const key of [...Object.keys(own), ...Object.keys(efektif)]) {
    const label = String(key ?? "").trim();
    if (!label || label.toUpperCase() === "ALL SIZE") continue;
    if (!unique.has(label.toUpperCase())) unique.set(label.toUpperCase(), label);
  }
  return [...unique.values()].sort((a, b) => {
    const indexA = SIZES.indexOf(String(a).toUpperCase());
    const indexB = SIZES.indexOf(String(b).toUpperCase());
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return String(a).localeCompare(String(b));
  });
}

/**
 * SKU per ukuran: pakai SKU yang tersimpan di baris varian; kalau kosong, hasilkan
 * dari aturan SKU yang sama dengan form produk. SKU produk tidak pernah dipakai
 * sebagai pengganti SKU ukuran (itu yang membuat semua ukuran tampak KOK-GGR).
 */
function variantSkuFor(product, variant, size) {
  const key = String(size ?? "").toUpperCase();
  const stored = variant?.skus?.[key];
  if (stored && String(stored).trim()) return String(stored).trim();
  const color = resolveColorName({
    color: variant?.color,
    productName: product?.name,
    category: product?.category,
    series: product?.series,
  });
  return (
    generateVariantSku({
      category: product?.category,
      kain: product?.jenis_kain?.name,
      color,
      series: product?.series,
      size,
    }) || ""
  );
}

function totalQty(item) {
  return Object.values(item?.quantities || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function focusStep(itemKey, step) {
  if (typeof document === "undefined") return;
  setTimeout(() => {
    const selector =
      step === "color"
        ? `[data-stockin-color="${itemKey}"]`
        : step === "size"
          ? `[data-stockin-size="${itemKey}"]`
          : `[data-stockin-qty="${itemKey}"]`;
    document.querySelector(selector)?.focus();
  }, 0);
}

export default function TambahBarangMasuk() {
  const navigate = useNavigate();
  const pageUrl = usePageUrl();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    date: today(),
    notes: "",
    items: [emptyItem()],
  });
  const [errors, setErrors] = useState({});
  const requestIdRef = useRef(null);
  const submittingRef = useRef(false);
  const addButtonRef = useRef(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => base44.entities.Product.list(),
    initialData: [],
  });

  const { data: allVariants = [] } = useQuery({
    queryKey: ["productVariants"],
    queryFn: () => base44.entities.ProductVariant.list(),
    initialData: [],
  });

  const variantsOf = (productId) => allVariants.filter((v) => v.product_id === productId);
  const productOf = (item) => products.find((p) => p.id === item.product_id) || null;
  const variantOf = (item) => allVariants.find((v) => v.id === item.variant_id) || null;

  // Produk turunan (Bayati/Imron/Imalah/Karim) tidak boleh muncul di picker:
  // stoknya hidup di produk induk. Fallback ke data varian kalau field API belum ada.
  const derivedIds = useMemo(
    () => new Set(allVariants.filter((v) => v.base_product_id).map((v) => v.product_id)),
    [allVariants]
  );
  const pickerProducts = useMemo(
    () => products.filter((p) => !p.base_product_id && !derivedIds.has(p.id)),
    [products, derivedIds]
  );

  // Nama turunan per induk — keterangan "Stok bersama dengan ..." di bawah field produk.
  const sharedWith = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      if (!p.base_product_id) continue;
      if (!map.has(p.base_product_id)) map.set(p.base_product_id, []);
      const label = String(p.series || p.name || "").trim();
      if (label) map.get(p.base_product_id).push(label);
    }
    return map;
  }, [products]);

  function sharedLabel(productId) {
    const names = Array.from(new Set(sharedWith.get(productId) || []));
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} dan ${names[names.length - 1]}`;
  }

  const createMutation = useMutation({
    mutationFn: (payload) => base44.entities.StockIn.createBatch(payload),
    onSuccess: () => {
      submittingRef.current = false;
      requestIdRef.current = null;
      queryClient.invalidateQueries(["stockIns"]);
      queryClient.invalidateQueries(["products"]);
      queryClient.invalidateQueries(["productVariants"]);
      toast({
        title: "✅ Barang masuk berhasil ditambahkan",
        description: "Stok dan HPP sudah diperbarui di server",
        variant: "success",
      });
      navigate(pageUrl("MasterProduk"));
    },
    onError: (error) => {
      submittingRef.current = false;
      toast({
        title: "❌ Gagal menambahkan barang masuk",
        description: error.message || "Terjadi kesalahan saat menyimpan data.",
        variant: "destructive",
      });
    },
  });

  function updateItem(key, patch) {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** Buang jumlah ukuran yang tidak ada di varian baru (mis. setelah ganti warna). */
  function pruneQuantities(quantities, nextVariant, paket) {
    if (paket) {
      const value = quantities?.[PAKET_SIZE] ?? "";
      return value === "" ? {} : { [PAKET_SIZE]: value };
    }
    const allowed = sizesFor(nextVariant);
    const next = {};
    for (const [size, value] of Object.entries(quantities || {})) {
      const match = allowed.find((item) => String(item).toUpperCase() === String(size).toUpperCase());
      if (match) next[match] = value;
    }
    return next;
  }

  function handleProductChange(item, productId) {
    if (!productId) {
      updateItem(item.key, {
        product_id: "",
        variant_id: "",
        quantities: {},
        redirected_from: "",
        follow_name: "",
      });
      return;
    }

    const product = products.find((p) => p.id === productId) || null;
    const linkedVariant = allVariants.find((v) => v.product_id === productId && v.base_product_id);
    const baseId = product?.base_product_id || linkedVariant?.base_product_id || null;
    const effectiveId = baseId || productId;
    const effectiveProduct = products.find((p) => p.id === effectiveId) || product;
    const groups = allVariants.filter((v) => v.product_id === effectiveId);
    const originalColor = String(
      allVariants.find((v) => v.product_id === productId)?.color || "default"
    ).toLowerCase();
    const pick =
      groups.length === 1
        ? groups[0]
        : groups.find((v) => String(v.color || "default").toLowerCase() === originalColor) || null;
    const paket = isPaketKategori(effectiveProduct?.category);

    updateItem(item.key, {
      product_id: effectiveId,
      variant_id: pick?.id || "",
      quantities: {},
      redirected_from: baseId ? productId : "",
      follow_name: baseId
        ? product?.stok_bersama?.mengikuti || effectiveProduct?.series || effectiveProduct?.name || baseId
        : "",
    });
    focusStep(item.key, pick ? "qty" : "color");
  }

  function handleVariantChange(item, variantId) {
    const product = productOf(item);
    const paket = isPaketKategori(product?.category);
    const nextVariant = allVariants.find((v) => v.id === variantId) || null;
    updateItem(item.key, {
      variant_id: variantId,
      quantities: pruneQuantities(item.quantities, nextVariant, paket),
    });
    focusStep(item.key, "qty");
  }

  function handleQtyChange(item, size, value) {
    const digits = String(value ?? "").replace(/[^\d]/g, "");
    updateItem(item.key, {
      quantities: { ...(item.quantities || {}), [size]: digits },
    });
  }

  /** Enter pindah ke input ukuran berikutnya; di input terakhir pindah ke Simpan produk. */
  function handleQtyKeyDown(event, itemKey) {
    if (["e", "E", "+", "-", ".", ","].includes(event.key)) {
      event.preventDefault();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const inputs = Array.from(document.querySelectorAll(`[data-stockin-input^="${itemKey}|"]`));
    const index = inputs.indexOf(event.currentTarget);
    const next = inputs[index + 1];
    if (next) next.focus();
    else document.querySelector(`[data-stockin-save="${itemKey}"]`)?.focus();
  }

  function addItem() {
    setFormData((prev) => {
      // Jangan biarkan dua baris kosong terbuka sekaligus.
      const blankEditing = prev.items.some(
        (item) => item.editing && !item.product_id && totalQty(item) === 0
      );
      if (blankEditing) return prev;
      return {
        ...prev,
        items: [...prev.items.map((item) => ({ ...item, editing: false })), emptyItem()],
      };
    });
  }

  function removeItem(key) {
    setFormData((prev) => {
      if (prev.items.length <= 1) return prev;
      return { ...prev, items: prev.items.filter((item) => item.key !== key) };
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function effectiveKeyFor(item, variant, size) {
    if (!item.product_id || !size) return "";
    const color = String(variant?.color || "default").toLowerCase();
    return `${item.product_id}|${color}|${String(size).toUpperCase()}`;
  }

  function filledEntries(item) {
    return Object.entries(item.quantities || {})
      .map(([size, raw]) => ({ size, qty: Number(raw) || 0 }))
      .filter((entry) => entry.qty > 0);
  }

  function hasDuplicate(item, variant) {
    return filledEntries(item).some((entry) =>
      duplicateKeys.has(effectiveKeyFor(item, variant, entry.size))
    );
  }

  const duplicateKeys = useMemo(() => {
    const counts = new Map();
    for (const item of formData.items) {
      const variant = variantOf(item);
      const seen = new Set();
      for (const entry of filledEntries(item)) {
        const key = effectiveKeyFor(item, variant, entry.size);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }, [formData.items, allVariants]);

  const totalPcs = formData.items.reduce((sum, item) => sum + totalQty(item), 0);
  const savedItems = formData.items.filter((item) => !item.editing);

  function rowMessage(item, index) {
    const row = `Produk ${index + 1}`;
    const product = productOf(item);
    const groups = variantsOf(item.product_id);
    const variant = variantOf(item);
    const paket = isPaketKategori(product?.category);
    if (!item.product_id) return `${row}: pilih produk.`;
    if (groups.length === 0) return `${row}: varian produk belum tersedia.`;
    if (!item.variant_id || !variant) return `${row}: pilih ${paket ? "varian" : "warna"}.`;
    const sizes = paket ? [PAKET_SIZE] : sizesFor(variant);
    if (sizes.length === 0) return `${row}: ukuran produk belum tersedia.`;
    const allowed = new Set(sizes.map((size) => String(size).toUpperCase()));
    for (const [, raw] of Object.entries(item.quantities || {})) {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        return `${row}: jumlah harus bilangan bulat 0 atau lebih.`;
      }
    }
    const filled = filledEntries(item);
    if (filled.length === 0) {
      return `${row}: isi jumlah minimal 1 di salah satu ukuran.`;
    }
    for (const entry of filled) {
      if (!allowed.has(String(entry.size).toUpperCase())) {
        return `${row}: ukuran ${entry.size} tidak tersedia untuk varian ini.`;
      }
      if (duplicateKeys.has(effectiveKeyFor(item, variant, entry.size))) {
        return `${row}: produk & ukuran ini sudah ada di produk lain — gabungkan.`;
      }
    }
    return "";
  }

  function saveRow(item, index) {
    if (createMutation.isPending || submittingRef.current) return;
    const message = rowMessage(item, index);
    if (message) {
      setErrors((prev) => ({ ...prev, [item.key]: message }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next[item.key];
      return next;
    });
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((row) =>
        row.key === item.key ? { ...row, editing: false } : row
      ),
    }));
    setTimeout(() => addButtonRef.current?.focus(), 0);
  }

  function editItem(key) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((row) => ({ ...row, editing: row.key === key })),
    }));
  }

  function validate() {
    const next = {};
    formData.items.forEach((item, index) => {
      const message = rowMessage(item, index);
      if (message) next[item.key] = message;
    });
    setErrors(next);
    const firstInvalid = formData.items.find((item) => next[item.key]);
    if (firstInvalid) {
      setFormData((prev) => ({
        ...prev,
        items: prev.items.map((row) => ({
          ...row,
          editing: row.key === firstInvalid.key ? true : row.editing,
        })),
      }));
    }
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (createMutation.isPending || submittingRef.current) return;
    if (!formData.date) {
      toast({ title: "⚠️ Tanggal wajib diisi", variant: "destructive" });
      return;
    }
    if (!validate()) {
      toast({
        title: "⚠️ Periksa produk yang merah",
        description: "Lengkapi produk, warna, dan isi jumlah minimal 1 di salah satu ukuran.",
        variant: "destructive",
      });
      return;
    }

    const requestId = requestIdRef.current || (requestIdRef.current = uid());
    // Satu produk = banyak ukuran. Ukuran dengan qty 0 dilewati; semua baris yang
    // tersisa dikirim dalam SATU batch supaya RPC menyimpannya sebagai satu transaksi.
    const items = formData.items.flatMap((item) => {
      const product = productOf(item);
      const variant = variantOf(item);
      const paket = isPaketKategori(product?.category);
      return filledEntries(item).map((entry) => ({
        product_id: item.product_id,
        variant_color: variant?.color || "default",
        variant_size: paket ? PAKET_SIZE : entry.size,
        qty: entry.qty,
        total_price: 0,
      }));
    });

    if (items.length === 0) {
      toast({
        title: "⚠️ Minimal satu barang dengan jumlah lebih dari 0",
        description: "Isi qty minimal 1 di salah satu ukuran.",
        variant: "destructive",
      });
      return;
    }

    submittingRef.current = true;
    createMutation.mutate({
      date: formData.date,
      notes: formData.notes.trim() || null,
      request_id: requestId,
      items,
    });
  }

  function handleReset() {
    submittingRef.current = false;
    requestIdRef.current = null;
    setFormData({ date: today(), notes: "", items: [emptyItem()] });
    setErrors({});
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@600;700;800;900&display=swap');
        .font-inter { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .font-outfit { font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .font-tabular { font-variant-numeric: tabular-nums; }
        .tracking-heading { letter-spacing: -0.02em; }
        .tracking-body { letter-spacing: 0.01em; }
        .tracking-label { letter-spacing: 0.02em; }
        .tracking-caps { letter-spacing: 0.05em; }
        .leading-heading { line-height: 1.2; }
        .leading-body { line-height: 1.6; }
        .leading-tight { line-height: 1.3; }
      `}</style>

      <div className="max-w-5xl mx-auto p-6 md:p-8">
        <div className="mb-8">
          <button
            onClick={() => navigate(pageUrl("MasterProduk"))}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-5 transition-colors"
            style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "0.01em" }}
          >
            <ArrowLeft size={18} />
            <span className="font-inter">Kembali</span>
          </button>
          <h1 className="font-outfit tracking-heading leading-heading" style={{ fontSize: "32px", fontWeight: 800, color: "#0F172A", marginBottom: "8px" }}>
            Tambah Barang Masuk
          </h1>
          <p className="font-inter tracking-body" style={{ fontSize: "15px", fontWeight: 500, color: "#64748B", lineHeight: "1.6" }}>
            Catat beberapa produk sekaligus — stok langsung masuk ke gudang
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  <TrendingUp size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="font-outfit tracking-heading" style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF", lineHeight: "1.3" }}>
                    Informasi Barang Masuk
                  </h3>
                  <p className="font-inter" style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255,255,255,0.9)", marginTop: "2px", letterSpacing: "0.01em" }}>
                    Tanggal dan keterangan dipakai untuk semua baris
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block font-inter tracking-label" style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Tanggal <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="date"
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100 transition-all duration-200 font-inter font-tabular"
                      style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "0.01em" }}
                    />
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="block font-inter tracking-label" style={{ fontSize: "13px", fontWeight: 700, color: "#1E293B", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Keterangan (Optional)
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-4 top-4 text-gray-400" size={20} />
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows="2"
                      placeholder="Contoh: restock produksi Oktober"
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100 transition-all duration-200 resize-none font-inter leading-body"
                      style={{ fontSize: "15px", fontWeight: 500, letterSpacing: "0.01em", lineHeight: "1.6" }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div>
                  <h4 className="font-outfit" style={{ fontSize: "17px", fontWeight: 800, color: "#0F172A" }}>Daftar Barang</h4>
                  <p className="font-inter" style={{ fontSize: "12.5px", color: "#64748B", marginTop: 2 }}>Satu kartu = satu produk, isi jumlah per ukuran.</p>
                </div>
                <button
                  ref={addButtonRef}
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-green-500 bg-white px-4 py-2.5 text-sm font-bold text-green-700 transition hover:bg-green-50"
                >
                  <Plus size={17} /> Tambah Produk
                </button>
              </div>

              <div className="space-y-4">
                {formData.items.map((item, index) => {
                  const product = productOf(item);
                  const selectedProduct = pickerProducts.find((p) => p.id === item.product_id);
                  const variant = variantOf(item);
                  const groups = variantsOf(item.product_id);
                  const needsVariant = groups.length > 1;
                  const paket = isPaketKategori(product?.category);
                  const sizeList = !paket && variant ? sizesFor(variant) : [];
                  const quantities = item.quantities || {};
                  const incomingQty = totalQty(item);
                  const currentStock = variant
                    ? paket
                      ? stockAt(variant, PAKET_SIZE)
                      : sizeList.reduce((sum, size) => sum + stockAt(variant, size), 0)
                    : Number(product?.stock_efektif ?? product?.stock ?? 0) || 0;
                  const afterStock = currentStock + incomingQty;
                  const paketSku = paket && variant ? variantSkuFor(product, variant, PAKET_SIZE) : "";
                  const duplicate = hasDuplicate(item, variant);
                  const error = errors[item.key];

                  if (!item.editing) return null;
                  return (
                    <div
                      key={item.key}
                      className={`rounded-2xl border-2 p-4 md:p-5 transition-colors ${error ? "border-red-300 bg-red-50/40" : "border-gray-200 bg-gray-50/50"}`}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <p className="font-outfit" style={{ fontSize: "15px", fontWeight: 800, color: "#0F172A" }}>
                          Produk {index + 1}
                        </p>
                        {formData.items.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeItem(item.key)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 size={14} /> Hapus
                          </button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <label className="block font-inter tracking-label" style={{ fontSize: "12px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                            Cari &amp; Pilih Produk <span className="text-red-500">*</span>
                          </label>
                          <ProductCombobox
                            products={pickerProducts}
                            variants={allVariants}
                            value={item.product_id}
                            onSelect={(productId) => handleProductChange(item, productId)}
                            autoFocus
                          />
                          {selectedProduct ? (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 font-inter text-[11px]">
                              <span className="font-bold text-slate-700">SKU {selectedProduct.sku}</span>
                              <span className="text-slate-500">
                                Stok total {selectedProduct.stock_efektif ?? selectedProduct.stock ?? 0} pcs
                              </span>
                              {selectedProduct.jenis_kain?.name ? (
                                <span className="text-slate-500">Kain {selectedProduct.jenis_kain.name}</span>
                              ) : null}
                            </div>
                          ) : null}
                          {item.product_id && sharedLabel(item.product_id) ? (
                            <p className="font-inter" style={{ fontSize: "12.5px", fontWeight: 600, color: "#047857", marginTop: 2 }}>
                              Stok bersama dengan {sharedLabel(item.product_id)}
                            </p>
                          ) : null}
                        </div>

                        {needsVariant ? (
                          <div className="space-y-2 md:col-span-2">
                            <label className="block font-inter tracking-label" style={{ fontSize: "12px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                              {paket ? "Varian" : "Warna"} <span className="text-red-500">*</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {groups.map((v, groupIndex) => {
                                const active = item.variant_id === v.id;
                                const label = variantName(v.color) || v.series_name || "Varian";
                                const total = Object.values(v.stock_efektif ?? v.stock ?? {}).reduce(
                                  (sum, value) => sum + (Number(value) || 0),
                                  0
                                );
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    data-stockin-color={groupIndex === 0 ? item.key : undefined}
                                    onClick={() => handleVariantChange(item, v.id)}
                                    aria-pressed={active}
                                    className={`rounded-xl border-2 px-3.5 py-2 text-left transition ${
                                      active
                                        ? "border-green-600 bg-green-600 text-white shadow-sm"
                                        : "border-gray-200 bg-white text-slate-700 hover:border-green-300 hover:bg-green-50"
                                    }`}
                                  >
                                    <span className="block font-inter text-[12.5px] font-bold">{label}</span>
                                    <span className={`block font-inter text-[10px] font-semibold ${active ? "text-green-100" : "text-slate-400"}`}>
                                      stok {total}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {!paket ? (
                          <div className="space-y-2 md:col-span-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="block font-inter tracking-label" style={{ fontSize: "12px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                Jumlah per Ukuran <span className="text-red-500">*</span>
                              </label>
                              <span className="font-inter text-[10px] font-semibold text-slate-400">
                                Kosong / 0 dilewati · Enter pindah ke ukuran berikutnya
                              </span>
                            </div>
                            {variant ? (
                              sizeList.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                                  {sizeList.map((size, sizeIndex) => {
                                    const stock = stockAt(variant, size);
                                    const raw = quantities[size] ?? "";
                                    const qty = Number(raw) || 0;
                                    const sku = variantSkuFor(product, variant, size);
                                    return (
                                      <div
                                        key={size}
                                        className={`min-w-0 rounded-xl border-2 p-2.5 transition ${
                                          qty > 0
                                            ? "border-green-500 bg-green-50/70"
                                            : "border-gray-200 bg-white"
                                        }`}
                                      >
                                        <div className="flex items-baseline justify-between gap-1">
                                          <span className="font-inter text-[12.5px] font-extrabold text-slate-800">
                                            {size}
                                          </span>
                                          <span className="font-inter text-[9.5px] font-semibold text-slate-400">
                                            stok {stock}
                                          </span>
                                        </div>
                                        <input
                                          type="number"
                                          min="0"
                                          step="1"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          data-stockin-input={`${item.key}|${size}`}
                                          data-stockin-qty={sizeIndex === 0 ? item.key : undefined}
                                          value={raw}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(e) => handleQtyChange(item, size, e.target.value)}
                                          onKeyDown={(e) => handleQtyKeyDown(e, item.key)}
                                          onWheel={(e) => e.currentTarget.blur()}
                                          placeholder="0"
                                          aria-label={`Jumlah masuk ukuran ${size}`}
                                          className="mt-1.5 w-full min-w-0 rounded-lg border-2 border-gray-200 bg-white px-2 py-1.5 text-center font-inter font-tabular transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
                                          style={{ fontSize: "16px", fontWeight: 800 }}
                                        />
                                        {qty > 0 ? (
                                          <p className="mt-1 text-center font-inter text-[9.5px] font-bold text-emerald-700">
                                            stok {stock} → {stock + qty}
                                          </p>
                                        ) : null}
                                        {sku ? (
                                          <p className="mt-1 break-all text-center font-mono text-[9.5px] leading-tight text-slate-400">
                                            {sku}
                                          </p>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white px-4 py-3 font-inter text-[12.5px] font-semibold text-slate-400">
                                  Ukuran produk belum tersedia.
                                </div>
                              )
                            ) : (
                              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white px-4 py-3 font-inter text-[12.5px] font-semibold text-slate-400">
                                Pilih {needsVariant ? "warna" : "produk"} dulu.
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <label className="block font-inter tracking-label" style={{ fontSize: "12px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.03em" }}>Ukuran</label>
                              <div className="rounded-xl border-2 border-gray-200 bg-white px-4 py-3.5 font-inter" style={{ fontSize: "15px", fontWeight: 600, color: "#475569" }}>
                                {PAKET_SIZE}
                              </div>
                              {paketSku ? (
                                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                                  <p className="font-inter text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-green-700">
                                    SKU varian
                                  </p>
                                  <p className="font-mono text-[12px] font-bold text-green-900 break-all">{paketSku}</p>
                                </div>
                              ) : null}
                            </div>

                            <div className="space-y-2">
                              <label className="block font-inter tracking-label" style={{ fontSize: "12px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                Jumlah <span className="text-red-500">*</span>
                              </label>
                              <div className="relative">
                                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={19} />
                                <input
                                  type="number"
                                  required
                                  min="0"
                                  step="1"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  data-stockin-qty={item.key}
                                  data-stockin-input={`${item.key}|${PAKET_SIZE}`}
                                  value={quantities[PAKET_SIZE] ?? ""}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => handleQtyChange(item, PAKET_SIZE, e.target.value)}
                                  onKeyDown={(e) => handleQtyKeyDown(e, item.key)}
                                  onWheel={(e) => e.currentTarget.blur()}
                                  placeholder="0"
                                  className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all font-inter font-tabular"
                                  style={{ fontSize: "17px", fontWeight: 800 }}
                                />
                              </div>
                            </div>
                          </>
                        )}

                        <div className="md:col-span-2 grid grid-cols-3 gap-2 sm:gap-3">
                          <div className="min-w-0 rounded-xl border-2 border-green-200 bg-green-50 px-2.5 py-2.5 text-center sm:px-4 sm:py-3">
                            <p className="font-inter tracking-caps" style={{ fontSize: "9px", fontWeight: 800, color: "#059669", textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.25 }}>
                              Stok Total Sekarang
                            </p>
                            <p className="font-outfit font-tabular" style={{ fontSize: "22px", fontWeight: 900, color: "#059669", lineHeight: 1.15 }}>{currentStock}</p>
                          </div>
                          <div className="min-w-0 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-2.5 py-2.5 text-center sm:px-4 sm:py-3">
                            <p className="font-inter tracking-caps" style={{ fontSize: "9px", fontWeight: 800, color: "#047857", textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.25 }}>
                              Total Masuk
                            </p>
                            <p className="font-outfit font-tabular" style={{ fontSize: "22px", fontWeight: 900, color: "#047857", lineHeight: 1.15 }}>{incomingQty}</p>
                          </div>
                          <div className="min-w-0 rounded-xl border-2 border-green-200 bg-green-50 px-2.5 py-2.5 text-center sm:px-4 sm:py-3">
                            <p className="font-inter tracking-caps" style={{ fontSize: "9px", fontWeight: 800, color: "#059669", textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.25 }}>
                              Stok Total Setelah
                            </p>
                            <p className="font-outfit font-tabular" style={{ fontSize: "22px", fontWeight: 900, color: "#059669", lineHeight: 1.15 }}>{afterStock}</p>
                          </div>
                        </div>
                      </div>

                      {item.redirected_from && item.follow_name ? (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 font-inter" style={{ fontSize: "12.5px", fontWeight: 600, color: "#047857" }}>
                          Stok masuk ke <b>{item.follow_name}</b> (ikut stok bersama).
                        </div>
                      ) : null}

                      {duplicate && !error ? (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 font-inter" style={{ fontSize: "12.5px", fontWeight: 600, color: "#B45309" }}>
                          Produk & ukuran ini sudah ada di produk lain — gabungkan supaya tidak dobel.
                        </div>
                      ) : null}

                      {error ? (
                        <p className="mt-3 font-inter" style={{ fontSize: "12.5px", fontWeight: 700, color: "#B91C1C" }}>{error}</p>
                      ) : null}

                      <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
                        <button
                          type="button"
                          data-stockin-save={item.key}
                          disabled={createMutation.isPending || submittingRef.current}
                          onClick={() => saveRow(item, index)}
                          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save size={16} /> Simpan produk
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {savedItems.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                  <table className="w-full min-w-[640px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                        <th className="px-4 py-3">Produk</th>
                        <th className="px-4 py-3">Ukuran</th>
                        <th className="px-4 py-3 text-center">Qty</th>
                        <th className="px-4 py-3 text-center">Stok</th>
                        <th className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedItems.map((item) => {
                        const product = productOf(item);
                        const variant = variantOf(item);
                        const paket = isPaketKategori(product?.category);
                        const entries = filledEntries(item);
                        const qty = totalQty(item);
                        const sizeList = paket ? [PAKET_SIZE] : sizesFor(variant);
                        const current = variant
                          ? paket
                            ? stockAt(variant, PAKET_SIZE)
                            : sizeList.reduce((sum, size) => sum + stockAt(variant, size), 0)
                          : Number(product?.stock_efektif ?? product?.stock ?? 0) || 0;
                        const after = current + qty;
                        const error = errors[item.key];
                        const duplicate = hasDuplicate(item, variant);
                        const variantText = [variant ? variantName(variant.color) : null, product?.series]
                          .filter(Boolean)
                          .join(" · ");
                        const skuText = entries
                          .map((entry) => variantSkuFor(product, variant, paket ? PAKET_SIZE : entry.size))
                          .filter(Boolean)
                          .join(" · ");
                        const sizeText = entries.map((entry) => `${entry.size} ×${entry.qty}`).join(" · ");

                        return (
                          <tr key={item.key} className={`border-b border-gray-100 last:border-0 align-top ${error ? "bg-red-50/60" : ""}`}>
                            <td className="px-4 py-3">
                              <p className="font-inter text-[13.5px] font-bold text-black">{product?.name || "Produk"}</p>
                              {variantText ? <p className="font-inter mt-0.5 text-[11.5px] text-slate-500">{variantText}</p> : null}
                              {skuText ? <p className="mt-0.5 font-mono text-[10.5px] text-slate-400 break-all">{skuText}</p> : null}
                              {item.product_id && sharedLabel(item.product_id) ? (
                                <p className="font-inter mt-0.5 text-[11px] font-semibold text-emerald-700">
                                  Stok bersama {sharedLabel(item.product_id)}
                                </p>
                              ) : null}
                              {duplicate && !error ? (
                                <p className="font-inter mt-0.5 text-[11px] font-semibold text-amber-700">
                                  Produk & ukuran sudah ada di produk lain.
                                </p>
                              ) : null}
                              {error ? <p className="font-inter mt-0.5 text-[11px] font-bold text-red-600">{error}</p> : null}
                            </td>
                            <td className="px-4 py-3 font-inter text-[13px] font-semibold text-slate-700">{sizeText || "-"}</td>
                            <td className="px-4 py-3 text-center font-inter text-[13px] font-bold text-black">{qty}</td>
                            <td className="px-4 py-3 text-center font-inter text-[12px] text-slate-600">{current} → {after}</td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => editItem(item.key)}
                                className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                              >
                                Ubah
                              </button>
                              {formData.items.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.key)}
                                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
                                >
                                  Hapus
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 md:p-5">
                <p className="font-inter tracking-caps" style={{ fontSize: "10px", fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total pcs</p>
                <p className="font-outfit font-tabular" style={{ fontSize: "28px", fontWeight: 900, color: "#0F172A" }}>{totalPcs}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => navigate(pageUrl("MasterProduk"))}
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-white border-2 border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 shadow-sm hover:shadow-md font-outfit"
              style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "0.01em" }}
            >
              <X size={20} /> Batal
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-gray-100 border-2 border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-200 hover:border-gray-300 transition-all duration-200 shadow-sm hover:shadow-md font-outfit"
              style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "0.01em" }}
            >
              <RotateCcw size={20} /> Reset
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl hover:from-green-600 hover:to-emerald-700 hover:shadow-lg hover:scale-[1.02] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-md font-outfit"
              style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "0.01em" }}
            >
              <Save size={20} />
              {createMutation.isPending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
