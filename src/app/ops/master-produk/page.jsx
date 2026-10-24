"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/lib/ops-api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "@/lib/ops-router";
import { formatWeightExact } from "@/lib/shipping-weight";
import { resolveColorName } from "@/lib/sku";
import StockMovementsPanel from "@/components/ops/StockMovementsPanel";
import {
  Package,
  TrendingUp,
  TrendingDown,
  BarChart,
  Plus,
  Edit,
  Trash2,
  X,
  Tag,
  Hash,
  DollarSign,
  Percent,
  Calendar,
  Box,
  FileText,
  Search,
  Info,
  AlertCircle,
  AlertTriangle,
  ShoppingCart,
  ClipboardList,
  Eye,
  Archive,
  Warehouse,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Gift,
  Upload, // Added for import button
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Shield,
  ArrowUpDown
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, subDays } from "date-fns";
import ConfirmDeleteModal from "@/components/ops/ConfirmDeleteModal";
import ImportProductModal from "@/components/ops/ImportProductModal"; // Import the new modal
import { useToast } from "@/components/ops/ui/use-toast";
import { usePageUrl } from "@/lib/ops-router";
import { MetricCardSkeleton } from "@/components/ops/ui/skeleton";
import { SIZES, stockStatus } from "@/lib/ops-variants";
import { isPaketKategori } from "@/lib/item-label";
import { IconBoxes, IconLayers, IconCalendarClock, IconPackageX, IconArrowDownToLine, IconAlertTriangle } from "@/components/ops/icons";

/**
 * Stok yang ditampilkan di Laporan Stok & detail produk memakai stok EFEKTIF
 * (`stock_efektif` dari API) — sama seperti Daftar Produk. Varian produk series
 * menumpang stok produk basisnya, jadi tidak lagi dihitung "habis".
 *
 * Total stok varian = jumlah SEMUA ukuran yang benar-benar ada di data, bukan cuma XS–XXL.
 * Kategori Cover & Hanger memakai satu "ukuran" tetap `ALL SIZE` (variannya dibedakan lewat
 * nama/warna), dan `normalizeStock` — daftar ukuran standar — membuang kunci di luar itu.
 * Dulu varian seperti itu terbaca total 0 / status "Habis" padahal stoknya ada
 * (mis. produk `cover-thobe`).
 */
const stokVarianTotal = (v) => {
  const src = v?.stock_efektif ?? v?.stock;
  if (!src || typeof src !== "object") return 0;
  return Object.values(src).reduce((sum, n) => sum + (Number(n) || 0), 0);
};

/**
 * Stok MENTAH semua ukuran (termasuk `ALL SIZE` / nama varian non-standar).
 * `stokVarianMap` sengaja hanya berisi XS–XXL; peta ini dipakai untuk membedakan
 * "ukuran tidak ada" (tampil "-") dari "ukuran ada tapi stok 0" (tampil 0 merah).
 */
const stokMentahMap = (v) => {
  const src = v?.stock_efektif ?? v?.stock;
  if (!src || typeof src !== "object") return {};
  const out = {};
  for (const [size, n] of Object.entries(src)) {
    const key = String(size || "").trim().toUpperCase();
    if (key) out[key] = Number(n) || 0;
  }
  return out;
};
const punyaUkuranStandar = (v) => Object.keys(stokMentahMap(v)).some((size) => SIZES.includes(size));
const punyaUkuranNonStandar = (v) => Object.keys(stokMentahMap(v)).some((size) => !SIZES.includes(size));
const stokNonStandar = (v) =>
  Object.entries(stokMentahMap(v))
    .filter(([size]) => !SIZES.includes(size))
    .reduce((sum, [, n]) => sum + (Number(n) || 0), 0);

/* ── Bantu pencarian & filter Laporan Stok (semua dari data yang ada) ── */
const varianKategori = (v) => String(v.category || "").trim();
const varianKain = (v) => String(v.jenis_kain_name || "").trim();
const varianSeries = (v) => String(v.series_name || "").trim();
/** Warna tampilan: warna asli, atau turunan dari nama produk untuk `default`. */
const titleCaseColor = (value) =>
  String(value || "").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

function displayVariantColor(color, product) {
  const raw = String(color || "").trim();
  if (raw && raw.toLowerCase() !== "default") return raw;
  const derived = resolveColorName({
    color: "",
    productName: product?.name,
    category: product?.category,
    series: product?.series,
  });
  return derived ? titleCaseColor(derived) : "-";
}

function variantLabel(color, size, product) {
  const label = displayVariantColor(color, product);
  return [label === "-" ? "" : label, size].filter(Boolean).join(" / ");
}

function findLiveVariant(variants, productId, color, size) {
  const wantedColor = String(color || "default").trim().toLowerCase();
  const wantedSize = String(size || "").trim().toUpperCase();
  return (
    (variants || []).find(
      (v) =>
        String(v.product_id || "") === String(productId || "") &&
        String(v.color || "default").trim().toLowerCase() === wantedColor &&
        String(v.size || "").trim().toUpperCase() === wantedSize,
    ) || null
  );
}

/** SKU varian terkini lewat relasi; fallback ke SKU tersimpan/produk. */
function displayVariantSku(variants, product, productId, color, size, storedSku) {
  const variant = findLiveVariant(variants, productId, color, size);
  return (
    String(variant?.sku || "").trim() ||
    String(storedSku || "").trim() ||
    String(product?.sku || "").trim() ||
    "-"
  );
}
/** Status varian = aturan kartu ringkasan: 0 habis, 1..5 menipis, sisa aman. */
const varianStatus = (v) => { const t = stokVarianTotal(v); return t === 0 ? "habis" : t <= 5 ? "menipis" : "aman"; };
const varianSearchText = (v) =>
  [v.product_name, v.category, v.jenis_kain_name, v.series_name].map((x) => String(x || "")).join(" ").toLowerCase();
const STATUS_LABEL = { aman: "Aman", menipis: "Menipis", habis: "Habis" };

/** Judul & subjudul header mengikuti tab yang aktif (berubah tanpa reload). */
const TAB_HEADERS = {
  produk: { title: "Master Produk", sub: "Kelola produk dan stok barang" },
  report: { title: "Laporan Stok", sub: "Pantau sisa stok per produk, kain, series, dan ukuran" },
  stockin: { title: "Barang Masuk", sub: "Riwayat stok yang masuk ke gudang" },
  stockout: { title: "Barang Keluar", sub: "Riwayat stok yang keluar dari gudang" },
};

/**
 * Batas kalender menurut WIB (bukan zona waktu browser): tanggal hari ini,
 * awal bulan, dan akhir bulan berjalan dalam format YYYY-MM-DD.
 */
function wibCalendarRange() {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    today: `${y}-${pad(m + 1)}-${pad(now.getUTCDate())}`,
    monthStart: `${y}-${pad(m + 1)}-01`,
    monthEnd: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  };
}

function AnimatedCounter({ value, prefix = "", suffix = "", duration = 1200, delay = 0 }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime;
    let animationFrame;

    const animate = (currentTime) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      
      const easeOutBounce = (t) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      };
      
      const easedProgress = easeOutBounce(progress);
      setCount(Math.floor(value * easedProgress));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setCount(value);
      }
    };

    const timeout = setTimeout(() => {
      animationFrame = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [value, duration, delay]);

  return (
    <span>
      {prefix}{count.toLocaleString('id-ID')}{suffix}
    </span>
  );
}

/** Tombol hapus-satu filter (chip). */
function FilterChip({ label, onRemove }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      title="Hapus filter ini"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900"
    >
      {label} <X size={12} />
    </button>
  );
}

/** Dropdown filter multi-pilih (checkbox) — bisa dipakai keyboard & layar kecil. */
function MultiFilter({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = (opt) => onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  const count = selected.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold shadow-sm transition-all ${
          count
            ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-900 dark:text-blue-300"
            : "bg-white border-gray-200 text-gray-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
        }`}
      >
        {label}
        {count > 0 && <span className="px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold">{count}</span>}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 right-0 min-w-[200px] max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:bg-slate-800 dark:border-slate-700 p-1.5"
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500">Tidak ada pilihan</p>
          ) : (
            options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-700 dark:text-slate-200"
              >
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="rounded" />
                <span>{opt}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProductDetailModal({ isOpen, onClose, product, stockIns = [], transactions = [], variants = [] }) {
  if (!isOpen || !product) return null;

  const pv = (variants || []).filter((v) => v.product_id === product.id);
  const totalStock = pv.reduce((s, v) => s + stokVarianTotal(v), 0);
  // Stok yang ditampilkan di detail = stok efektif (series turunan menumpang stok basisnya).
  const stokEfektif = product.stock_efektif ?? totalStock;
  const status = product.status_efektif || stockStatus(stokEfektif);
  const statusStyle = {
    habis: "bg-red-100 text-red-700 border-red-200",
    menipis: "bg-amber-100 text-amber-700 border-amber-200",
    aman: "bg-emerald-100 text-emerald-700 border-emerald-200",
  }[status];
  const statusLabel = { habis: "Habis", menipis: "Menipis", aman: "Aman" }[status];
  const paket = isPaketKategori(product.category);
  // SAMAQU menyimpan warna asli di NAMA produk; `color: "default"` hanyalah sisa
  // struktur varian lama. Yang benar-benar multi-warna tetap ditampilkan.
  const realColorRows = pv.filter((v) => {
    const color = String(v.color || "").trim().toLowerCase();
    return color !== "" && color !== "default";
  });
  const hasRealColors = realColorRows.length > 0;
  const isDerived = Boolean(product.base_product_id || product.stok_bersama);
  const baseLabel = String(product.stok_bersama?.mengikuti || "").trim();

  // Turunan stok bersama: label diambil dari relasi `base_product_id`, bukan hardcode.
  const childNames = new Map();
  for (const v of variants || []) {
    if (String(v.base_product_id || "") !== String(product.id)) continue;
    if (childNames.has(v.product_id)) continue;
    const label = String(v.series_name || v.product_name || "").trim();
    if (label) childNames.set(v.product_id, label);
  }
  const sharedNames = [...new Set(childNames.values())];
  const sharedText =
    sharedNames.length <= 1
      ? sharedNames[0] || ""
      : `${sharedNames.slice(0, -1).join(", ")} dan ${sharedNames[sharedNames.length - 1]}`;

  // Satu baris ukuran untuk produk default; baris per warna hanya kalau warna asli.
  const displayRows = hasRealColors ? realColorRows : pv.slice(0, 1);
  const detailSizeLayout = {
    showSizes: displayRows.some(punyaUkuranStandar),
    showExtra: displayRows.some(punyaUkuranNonStandar),
  };
  const detailSizeCount = new Set(displayRows.flatMap((v) => Object.keys(stokMentahMap(v)))).size;
  const footerVariant = hasRealColors
    ? `${displayRows.length} ${paket ? "varian" : "warna"}`
    : `${detailSizeCount} ukuran`;

  const productStockIns = (stockIns || []).filter((si) => si.product_id === product.id);
  const productTransactions = (transactions || []).filter((t) => t.product_id === product.id);
  // Penjualan di detail produk = yang sudah dibayar saja (belum bayar & batal dikecualikan).
  const validTransactions = productTransactions.filter((t) => {
    const st = String(t.status || "").toLowerCase();
    return st !== "return" && st !== "pending";
  });
  const totalIn = productStockIns.reduce((s, si) => s + (Number(si.qty) || 0), 0);
  const totalOut = validTransactions.reduce((s, t) => s + (Number(t.qty) || 0), 0);
  const revenue = validTransactions.reduce((s, t) => s + (Number(t.total) || 0), 0);
  const hpp = Number(product.hpp) || 0;
  const price = Number(product.price) || 0;
  const margin = price > 0 ? Math.round(((price - hpp) / price) * 100) : 0;
  const stockValue = stokEfektif * hpp;

  const Info = ({ label, value, tone = "" }) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-[15px] font-bold leading-tight ${tone || "text-slate-900 dark:text-white"}`}>{value}</p>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/45 z-[9998]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: 60, opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-[540px] bg-white dark:bg-[#141821] z-[9999] shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Detail produk"
          >
            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-[#18181b] to-[#27272a] px-5 py-4 shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                  <Package size={24} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-extrabold text-white leading-tight">{product.name}</h2>
                  <p className="text-[11px] text-white/80 font-mono mt-0.5">{product.sku}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${statusStyle}`}>{statusLabel}</span>
                    {product.product_type === "free_gift" && (
                      <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-pink-100 text-pink-600 border border-pink-200">Free Gift</span>
                    )}
                    {product.category && (
                      <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-white/15 text-white border border-white/20">{product.category}</span>
                    )}
                    {product.series && (
                      <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-white/15 text-white border border-white/20">{product.series}</span>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/15 shrink-0" aria-label="Tutup">
                  <X size={18} className="text-white" />
                </button>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Ringkasan */}
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Ringkasan</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <Info label="Total Stok" value={`${stokEfektif.toLocaleString("id-ID")} unit`} />
                  <Info label="HPP / unit" value={`Rp ${hpp.toLocaleString("id-ID")}`} />
                  <Info label="Harga Jual" value={`Rp ${price.toLocaleString("id-ID")}`} />
                  <Info
                    label="Margin"
                    value={`${margin}%`}
                    tone={margin > 0 ? "text-emerald-600" : margin < 0 ? "text-red-600" : ""}
                  />
                  <Info label="Nilai Stok (HPP)" value={`Rp ${stockValue.toLocaleString("id-ID")}`} />
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <Info label="Kategori" value={product.category || "-"} />
                  <Info label="Series" value={product.series || "Belum diatur"} />
                  <Info label="Jenis Kain" value={product.jenis_kain?.name || "-"} />
                  {product.stok_bersama ? (
                    <Info label="Stok Bersama" value={`Mengikuti ${product.stok_bersama.mengikuti}`} />
                  ) : null}
                  {product.weight ? <Info label="Berat" value={formatWeightExact(product.weight)} /> : null}
                  {product.created_at ? (
                    <Info label="Dibuat" value={format(new Date(product.created_at), "dd MMM yyyy")} />
                  ) : null}
                </div>
              </section>

              {/* Stok per ukuran / warna asli */}
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  {hasRealColors ? (paket ? "Stok per Varian" : "Stok per Warna & Ukuran") : "Stok per Ukuran"}
                </p>
                {!isDerived && sharedText ? (
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-2">
                    Stok bersama dengan{" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{sharedText}</span>.
                  </p>
                ) : null}
                {isDerived && baseLabel ? (
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-2">
                    Stok efektif dari induk ·{" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-200">ikut {baseLabel}</span>.
                  </p>
                ) : null}
                {displayRows.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada stok ukuran untuk produk ini.</p>
                ) : (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900/60">
                            {hasRealColors ? (
                              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-slate-500">
                                {paket ? "Varian" : "Warna"}
                              </th>
                            ) : null}
                            {detailSizeLayout.showSizes &&
                              SIZES.map((s) => (
                                <th key={s} className="px-2 py-2 text-center text-[10px] font-bold uppercase text-slate-500">{s}</th>
                              ))}
                            {detailSizeLayout.showExtra && (
                              <th className="px-2 py-2 text-center text-[10px] font-bold uppercase text-slate-500" title="Stok ukuran non-standar (mis. ALL SIZE)">
                                Stok
                              </th>
                            )}
                            <th className="px-3 py-2 text-center text-[10px] font-bold uppercase text-slate-500">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((v, index) => {
                            const raw = stokMentahMap(v);
                            // Total = SEMUA ukuran (termasuk ALL SIZE/nama varian non-standar).
                            const total = stokVarianTotal(v);
                            const extra = stokNonStandar(v);
                            const hasExtra = punyaUkuranNonStandar(v);
                            const extraTitle = Object.entries(raw)
                              .filter(([size]) => !SIZES.includes(size))
                              .map(([size, n]) => `${size}: ${n}`)
                              .join(", ");
                            return (
                              <tr key={v.id || index} className="border-t border-slate-100 dark:border-slate-800">
                                {hasRealColors ? (
                                  <td className="px-3 py-2 text-[13px] font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                                    {displayVariantColor(v.color, product)}
                                    {v.series_name ? <span className="block text-[10px] text-slate-400 font-medium">{v.series_name}</span> : null}
                                  </td>
                                ) : null}
                                {detailSizeLayout.showSizes && SIZES.map((sz) => {
                                  const has = Object.prototype.hasOwnProperty.call(raw, sz);
                                  const val = has ? raw[sz] : null;
                                  const cls = !has
                                    ? "text-gray-400 dark:text-slate-500"
                                    : val === 0
                                      ? "text-red-400"
                                      : "text-slate-700 dark:text-slate-200";
                                  return (
                                    <td key={sz} className={`px-2 py-2 text-center text-[13px] font-semibold ${cls}`}>
                                      {has ? val : "-"}
                                    </td>
                                  );
                                })}
                                {detailSizeLayout.showExtra && (
                                  <td
                                    className={`px-2 py-2 text-center text-[13px] font-semibold ${
                                      !hasExtra
                                        ? "text-gray-400 dark:text-slate-500"
                                        : extra === 0
                                          ? "text-red-400"
                                          : "text-slate-700 dark:text-slate-200"
                                    }`}
                                    title={extraTitle || undefined}
                                  >
                                    {hasExtra ? extra : "-"}
                                  </td>
                                )}
                                <td className="px-3 py-2 text-center text-[13px] font-black text-blue-600 dark:text-blue-400">{total}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>

              {/* Mutasi stok */}
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Mutasi Stok</p>
                <div className="grid grid-cols-3 gap-2.5">
                  <Info label="Masuk" value={`+${totalIn.toLocaleString("id-ID")}`} tone="text-emerald-600" />
                  <Info label="Keluar" value={`-${totalOut.toLocaleString("id-ID")}`} tone="text-red-600" />
                  <Info label="Pencatatan Masuk" value={`${productStockIns.length}x`} />
                </div>
              </section>

              {/* Riwayat barang masuk */}
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Riwayat Barang Masuk (5 terakhir)</p>
                {productStockIns.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada pencatatan barang masuk.</p>
                ) : (
                  <div className="space-y-2">
                    {productStockIns.slice(0, 5).map((si) => (
                      <div key={si.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{format(new Date(si.date), "dd MMM yyyy")}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {variantLabel(si.variant_color, si.variant_size, product) || si.notes || "-"}
                          </p>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[13px] font-bold whitespace-nowrap">
                          +{si.qty}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Riwayat penjualan */}
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Riwayat Penjualan (5 terakhir)</p>
                {validTransactions.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada penjualan produk ini.</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {validTransactions.slice(-5).reverse().map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-slate-900 dark:text-white">{format(new Date(t.date), "dd MMM yyyy")}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {t.order_id || "-"} · {variantLabel(t.variant_color, t.variant_size, product) || "-"}
                            </p>
                          </div>
                          <div className="text-right whitespace-nowrap">
                            <p className="text-[13px] font-bold text-slate-900 dark:text-white">-{t.qty}</p>
                            <p className="text-[11px] text-emerald-600">Rp {Number(t.total || 0).toLocaleString("id-ID")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                      <Info label="Total Omset" value={`Rp ${revenue.toLocaleString("id-ID")}`} />
                      <Info label="Estimasi Laba" value={`Rp ${(revenue - hpp * totalOut).toLocaleString("id-ID")}`} tone="text-emerald-600" />
                    </div>
                  </>
                )}
              </section>
            </div>

            {/* ── Footer ── */}
            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">
                {footerVariant} · {statusLabel}
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-all"
              >
                Tutup
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
export default function MasterProduk() {
  const navigate = useNavigate();
  const pageUrl = usePageUrl();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('produk');
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'descending' });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleteType, setDeleteType] = useState(null);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false); // State for import modal

  const queryClient = useQueryClient();

  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    initialData: [],
  });

  // ✅ VARIANT: stok per warna + ukuran
  const { data: variants = [], isLoading: isLoadingVariants } = useQuery({
    queryKey: ['productVariants'],
    queryFn: () => base44.entities.ProductVariant.list(),
    initialData: [],
  });

  const { data: stockIns = [], isLoading: isLoadingStockIns } = useQuery({
    queryKey: ['stockIns'],
    queryFn: () => base44.entities.StockIn.list('-created_date'),
    initialData: [],
  });

  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date'),
    initialData: [],
  });

  const isLoading = isLoadingProducts || isLoadingStockIns || isLoadingTransactions;

  // ── Ringkasan tab Barang Masuk (dari data stock_in yang sudah dimuat) ──
  // 1 unit = 1 pcs diterima · 1 pencatatan = 1 baris barang masuk · varian = kombinasi produk+warna+ukuran
  const wib = useMemo(() => wibCalendarRange(), []);
  const stockInMonth = useMemo(
    () => (stockIns || []).filter((si) => si.date && si.date >= wib.monthStart && si.date <= wib.monthEnd),
    [stockIns, wib],
  );
  const stockInMonthUnits = useMemo(
    () => stockInMonth.reduce((s, si) => s + (Number(si.qty) || 0), 0),
    [stockInMonth],
  );
  const stockInTodayUnits = useMemo(
    () => stockInMonth.filter((si) => si.date === wib.today).reduce((s, si) => s + (Number(si.qty) || 0), 0),
    [stockInMonth, wib],
  );
  const stockInMonthVariantCount = useMemo(() => {
    const keys = new Set();
    for (const si of stockInMonth) {
      keys.add(si.sku || [si.product_id, si.variant_color || "", si.variant_size || ""].join("|"));
    }
    return keys.size;
  }, [stockInMonth]);
  const stockInMonthRecordCount = stockInMonth.length;

  // ── Ringkasan tab Barang Keluar (dari order website, satuan unit) ──
  const stockOutUnits = useMemo(
    () => (transactions || []).reduce((s, t) => s + (Number(t.qty) || 0), 0),
    [transactions],
  );
  const stockOutTodayUnits = useMemo(
    () => (transactions || [])
      .filter((t) => t.date === wib.today)
      .reduce((s, t) => s + (Number(t.qty) || 0), 0),
    [transactions, wib],
  );
  const stockOutProductCount = useMemo(
    () => new Set((transactions || []).map((t) => t.product_id || t.product_name).filter(Boolean)).size,
    [transactions],
  );

  // ── Ringkasan tab Daftar Produk ──
  // "Aktif" = varian produknya masih punya stok (status dari server: aman/menipis/habis).
  const activeProductCount = useMemo(
    () => (products || []).filter((p) => String(p.status_efektif || p.status || "aman") !== "habis").length,
    [products],
  );
  // "Habis" = produk yang stok efektifnya 0 (aturan status yang sama dengan server).
  // Kartu pelengkap "Produk Aktif": aktif + habis = total produk.
  const outOfStockProductCount = useMemo(
    () => (products || []).filter((p) => String(p.status_efektif || p.status || "aman") === "habis").length,
    [products],
  );

  // ── Ringkasan stok untuk tab Laporan Stok (dihitung dari data yang sudah dimuat,
  //    bukan angka statis). Satuan = unit stok, bukan jumlah produk. ──
  const [stockFilter, setStockFilter] = useState("all"); // all | aman | menipis | habis
  const [reportSearch, setReportSearch] = useState("");
  const [reportFilters, setReportFilters] = useState({ kategori: [], kain: [], series: [] });

  // Pakai stok efektif (sama dengan Daftar Produk) supaya produk series yang
  // menumpang stok basisnya tidak dihitung sebagai varian habis.
  // Hanya varian yang MEMEGANG stoknya sendiri yang dihitung. Baris series turunan
  // (punya `base_product_id`) memakai stok basisnya — kalau ikut dijumlah, Total Stok
  // jadi dobel. Jadi kartu Total Stok / Menipis / Habis menghitung baris basis saja.
  const stokPemilikSaja = useMemo(
    () => (variants || []).filter((v) => !v.base_product_id),
    [variants],
  );

  const totalStockUnits = useMemo(
    () => stokPemilikSaja.reduce((s, v) => s + stokVarianTotal(v), 0),
    [stokPemilikSaja],
  );

  // "Menipis" memakai ambang yang sudah dipakai sistem: total 1..5 (0 = habis, lihat lib/ops-variants).
  // Sengaja tidak memakai <= 5 agar tidak menghitung dua kali dengan card "Stok Habis".
  const lowStockVariantCount = useMemo(
    () => stokPemilikSaja.filter((v) => { const t = stokVarianTotal(v); return t > 0 && t <= 5; }).length,
    [stokPemilikSaja],
  );

  const outOfStockVariantCount = useMemo(
    () => stokPemilikSaja.filter((v) => stokVarianTotal(v) === 0).length,
    [stokPemilikSaja],
  );

  // ── Laporan Stok: pencarian + filter (kategori/jenis kain/series/status) ──
  // Urutan baris TIDAK diubah filter — hanya menyaring (urutan tetap dari server).
  // Status memakai aturan kartu ringkasan (0 habis; 1..5 menipis; sisa aman); baris series
  // turunan otomatis ikut status induknya karena stok efektifnya = stok induk.
  const reportRows = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    return (variants || []).filter((v) => {
      if (stockFilter !== "all" && varianStatus(v) !== stockFilter) return false;
      if (reportFilters.kategori.length && !reportFilters.kategori.includes(varianKategori(v))) return false;
      if (reportFilters.kain.length && !reportFilters.kain.includes(varianKain(v))) return false;
      if (reportFilters.series.length && !reportFilters.series.includes(varianSeries(v))) return false;
      if (q && !varianSearchText(v).includes(q)) return false;
      return true;
    });
  }, [variants, stockFilter, reportSearch, reportFilters]);

  const reportKategoriOptions = useMemo(
    () => Array.from(new Set((variants || []).map(varianKategori).filter(Boolean))).sort((a, b) => a.localeCompare(b, "id")),
    [variants],
  );
  const reportKainOptions = useMemo(
    () => Array.from(new Set((variants || []).map(varianKain).filter(Boolean))).sort((a, b) => a.localeCompare(b, "id")),
    [variants],
  );
  const reportSeriesOptions = useMemo(() => {
    const order = ["Jiharkah", "Imron", "Bayati", "Nahawand", "Karim", "Imalah"];
    return Array.from(new Set((variants || []).map(varianSeries).filter(Boolean))).sort((a, b) => {
      const ia = order.indexOf(a); const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, "id");
    });
  }, [variants]);

  const reportTotal = (variants || []).length;
  // Total unit hasil filter — HANYA baris induk (tanpa `base_product_id`) supaya tidak dobel.
  const reportUnits = useMemo(
    () => reportRows.filter((v) => !v.base_product_id).reduce((s, v) => s + stokVarianTotal(v), 0),
    [reportRows],
  );
  /**
   * Layout kolom adaptif: kolom XS–XXL hanya berguna kalau ada baris berukuran standar.
   * Kolom "Stok" muncul kalau ada ukuran non-standar (mis. ALL SIZE milik Kabak).
   * Kalau filter hanya menampilkan Kabak, tabel otomatis jadi Produk/Kategori/Kain/
   * Series/Stok/Total tanpa kolom ukuran yang selalu 0.
   */
  const reportSizeLayout = useMemo(
    () => ({
      showSizes: reportRows.some(punyaUkuranStandar),
      showExtra: reportRows.some(punyaUkuranNonStandar),
    }),
    [reportRows],
  );
  const hasReportFilter =
    stockFilter !== "all" ||
    reportSearch.trim() !== "" ||
    reportFilters.kategori.length > 0 ||
    reportFilters.kain.length > 0 ||
    reportFilters.series.length > 0;

  const resetReportFilters = () => {
    setStockFilter("all");
    setReportSearch("");
    setReportFilters({ kategori: [], kain: [], series: [] });
  };

  const totalProducts = useMemo(() => products?.length || 0, [products]);
  const totalStock = useMemo(() => (products || []).reduce((sum, p) => sum + (p.stock_efektif ?? p.stock ?? 0), 0), [products]);
  const totalValue = useMemo(() => (products || []).reduce((sum, p) => sum + ((p.stock_efektif ?? p.stock ?? 0) * (p.hpp || 0)), 0), [products]);
  const lowStockCount = useMemo(() => (products || []).filter(p => (p.status_efektif || p.status) === 'menipis').length, [products]);

  // ── Stok yang tampil di halaman Produk ops ──
  // Pakai stok EFEKTIF dari API (`stock_efektif`): stok bersama ala series sudah
  // di-resolve ke produk basisnya. Rumus buku besar lama (initial_stock + masuk −
  // keluar) tidak dipakai lagi karena `initial_stock` tidak pernah diisi dan
  // `stock_in` masih kosong, jadi mustahil menghasilkan angka benar — akibatnya
  // semua produk tampil "HABIS 0%". Fallback ke `stock`/`status` lama kalau API
  // masih mengirim bentuk sebelumnya.
  const stokProduk = (product) => {
    const nilai = product.stock_efektif ?? product.stock ?? 0;
    return { nilai, status: product.status_efektif || product.status || stockStatus(nilai) };
  };

  const filteredProducts = useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    
    return products.filter(product => {
      const matchSearch = product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          product.sku?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || stokProduk(product).status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [products, searchTerm, statusFilter]);

  // Sorting Logic
  const sortedProducts = useMemo(() => {
    let sortableItems = [...filteredProducts];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let aValue, bValue;

        if (sortConfig.key === 'stockPercentage') {
          aValue = stokProduk(a).nilai;
          bValue = stokProduk(b).nilai;
        } else {
          aValue = a[sortConfig.key];
          bValue = b[sortConfig.key];
        }

        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredProducts, sortConfig, stockIns, transactions]);

  const handleSort = (key) => {
    let direction = 'descending'; // Default to descending (High to Low)
    if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'ascending';
    }
    setSortConfig({ key, direction });
  };

  // Ringkasan daftar produk: "Menampilkan X dari Y produk" — Y = totalProducts (lihat KPI di atas).
  const hasProductFilter = searchTerm.trim() !== '' || statusFilter !== 'all';

  // Status stok untuk tabel & kartu — HANYA badge status (tanpa angka "X unit" di
  // belakangnya; angka stok sudah tampil di kolom Stok / kotak Stok pada kartu).
  // Dasarnya stok EFEKTIF (sudah memperhitungkan stok bersama antar-series).
  const renderStockIndicator = (product) => {
    const { nilai, status } = stokProduk(product);
    const gaya = {
      habis: { cls: 'bg-red-100 border-red-300 text-red-600', label: 'HABIS' },
      menipis: { cls: 'bg-amber-100 border-amber-300 text-amber-700', label: 'MENIPIS' },
      aman: { cls: 'bg-emerald-100 border-emerald-300 text-emerald-700', label: 'AMAN' },
    }[status] || { cls: 'bg-slate-100 border-slate-300 text-slate-600', label: '—' };

    return (
      <span
        className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${gaya.cls}`}
        title={`Stok efektif ${nilai} unit`}
      >
        {gaya.label}
      </span>
    );
  };

  // NEW: Deadstock products (no transactions in last 60 days)
  const deadstockProducts = useMemo(() => {
    if (!products || !Array.isArray(products) || !transactions || !Array.isArray(transactions)) return [];
    
    const sixtyDaysAgo = subDays(new Date(), 60);
    return products.filter(product => {
      const productTransactions = transactions.filter(t => t.product_id === product.id);
      if (productTransactions.length === 0) return true; // No transactions at all
      
      const latestTransaction = productTransactions.reduce((latest, t) => {
        const tDate = new Date(t.date);
        return tDate > latest ? tDate : latest;
      }, new Date(0));
      
      return latestTransaction < sixtyDaysAgo;
    });
  }, [products, transactions]);

  // NEW: Low stock products (stock < 5)
  const lowStockProducts = useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    return products.filter(product => (product.stock_efektif ?? product.stock ?? 0) < 5);
  }, [products]);

  const handleDeleteClick = (item, type) => {
    setProductToDelete(item);
    setDeleteType(type);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    if (deleteType === 'product') {
      deleteProductMutation.mutate(productToDelete.id);
    } else if (deleteType === 'stockin') {
      deleteStockInMutation.mutate(productToDelete.id);
    }
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setProductToDelete(null);
    setDeleteType(null);
  };

  const deleteProductMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
      setShowDeleteModal(false);
      setProductToDelete(null);
      setDeleteType(null);
      toast({
        title: "🗑️ Produk berhasil dihapus",
        description: "Data produk telah dihapus dari daftar",
        variant: "destructive",
      });
    },
  });

  const deleteStockInMutation = useMutation({
    mutationFn: (id) => base44.entities.StockIn.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['stockIns']);
      setShowDeleteModal(false);
      setProductToDelete(null);
      setDeleteType(null);
      toast({
        title: "🗑️ Data barang masuk dihapus",
        description: "Data barang masuk telah dihapus dari daftar",
        variant: "destructive",
      });
    },
  });

  const handleDetailClick = (product) => {
    setSelectedProduct(product);
    setShowDetailModal(true);
  };

  const getStatusBadge = (status) => {
    if (status === 'aman') {
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full border border-green-200">
        ● Aman
      </span>;
    } else if (status === 'menipis') {
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full border border-yellow-200">
        ● Menipis
      </span>;
    } else if (status === 'habis') {
      return <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded-full border border-red-200">
        ● Habis
      </span>;
    }
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 text-[10px] font-bold rounded-full border border-gray-200">
      ● Unknown
    </span>;
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gray-100 dark:bg-[#0f1117] transition-colors duration-300">
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
        
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite linear;
        }
      `}</style>

      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header - SAME AS DASHBOARD */}
        <div className="bg-gradient-to-br from-[#18181b] to-[#27272a] dark:from-[#1a1d28] dark:to-[#1e222d] rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden transition-colors duration-300">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full blur-2xl -ml-10 -mb-10"></div>
          
          <div className="relative z-10">
            {/* Top Section */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/10 shadow-inner">
                  <Package size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight font-jakarta text-white">
                    {(TAB_HEADERS[activeTab] || TAB_HEADERS.produk).title}
                  </h1>
                  <p className="text-blue-100 font-medium mt-1 font-inter">
                    {(TAB_HEADERS[activeTab] || TAB_HEADERS.produk).sub}
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                <motion.button
                  onClick={() => setShowImportModal(true)}
                  className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-sm border border-white/10 text-white rounded-xl transition-all hover:bg-white/20 font-jakarta"
                  style={{ fontSize: '14px', fontWeight: 700 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Upload size={18} />
                  Import
                </motion.button>

                {activeTab !== 'produk' && (
                  <motion.button
                    onClick={() => navigate(pageUrl('TambahBarangMasuk'))}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-sm border border-white/10 text-white rounded-xl transition-all hover:bg-white/20 font-jakarta"
                    style={{ fontSize: '14px', fontWeight: 700 }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Plus size={18} />
                    Tambah Stok
                  </motion.button>
                )}

                <motion.button
                  onClick={() => navigate(pageUrl('TambahProduk'))}
                  className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-blue-600 rounded-xl shadow-lg transition-all hover:bg-blue-50 font-jakarta border border-transparent"
                  style={{ fontSize: '14px', fontWeight: 700 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Plus size={18} />
                  Tambah Produk
                </motion.button>
              </div>
            </div>
            {/* Metrics Grid - Custom Mobile Layout */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3 mt-5 md:mt-6">
              {isLoading ? (
                <>
                  <div className="col-span-2 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 h-[92px] animate-pulse"></div>
                  <div className="col-span-1 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 h-[92px] animate-pulse"></div>
                  <div className="col-span-1 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 h-[92px] animate-pulse"></div>
                  <div className="col-span-2 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 h-[92px] animate-pulse"></div>
                </>
              ) : activeTab === 'report' ? (
          <>
            {/* ── Tab Laporan Stok: 4 KPI stok ── */}
            <button
              type="button"
              onClick={() => setStockFilter('all')}
              className="col-span-2 lg:col-span-1 text-left bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.99] transition-all duration-300"
              title="Tampilkan semua stok"
            >
              <div className="flex items-center gap-2 text-white">
                <IconBoxes size={15} className="shrink-0 opacity-90" />
                <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Total Stok</p>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                {totalStockUnits.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> unit</span>
              </p>
              <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Total unit di gudang</p>
            </button>

            <button
              type="button"
              onClick={() => setStockFilter('menipis')}
              className="col-span-1 lg:col-span-1 text-left bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.99] transition-all duration-300"
              title="Filter produk yang stoknya menipis"
            >
              <div className="flex items-center gap-2 text-white">
                <IconAlertTriangle size={15} className="shrink-0 opacity-90" />
                <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Stok Menipis</p>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                {lowStockVariantCount.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> produk</span>
              </p>
              <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Sisa 5 unit atau kurang</p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stockin')}
              className="col-span-1 lg:col-span-1 text-left bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.99] transition-all duration-300"
              title="Lihat data barang masuk"
            >
              <div className="flex items-center gap-2 text-white">
                <IconArrowDownToLine size={15} className="shrink-0 opacity-90" />
                <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Barang Masuk</p>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                {stockInMonthUnits.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> unit</span>
              </p>
              <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Masuk bulan ini (WIB)</p>
            </button>

            <button
              type="button"
              onClick={() => setStockFilter('habis')}
              className="col-span-2 lg:col-span-1 text-left bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.99] transition-all duration-300"
              title="Filter produk yang stoknya habis"
            >
              <div className="flex items-center gap-2 text-white">
                <IconPackageX size={15} className="shrink-0 opacity-90" />
                <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Stok Habis</p>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                {outOfStockVariantCount.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> produk</span>
              </p>
              <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Stok sudah 0</p>
            </button>
          </>
        ) : activeTab === 'produk' ? (
          <>
            {/* ── Tab Daftar Produk: ringkasan katalog ── */}
            <div className="col-span-2 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
              <div className="flex items-center gap-2 text-white">
                <Package size={15} className="shrink-0 opacity-90" />
                <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Total Produk</p>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                {(products || []).length.toLocaleString('id-ID')}
              </p>
              <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Produk terdaftar</p>
            </div>

            <div className="col-span-1 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
              <div className="flex items-center gap-2 text-white">
                <CheckCircle size={15} className="shrink-0 opacity-90" />
                <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Produk Aktif</p>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                {activeProductCount.toLocaleString('id-ID')}
              </p>
              <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Status aktif</p>
            </div>

            <div className="col-span-1 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
              <div className="flex items-center gap-2 text-white">
                <IconBoxes size={15} className="shrink-0 opacity-90" />
                <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Total Stok</p>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                {totalStockUnits.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> unit</span>
              </p>
              <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Total unit di gudang</p>
            </div>

            <div className="col-span-2 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
              <div className="flex items-center gap-2 text-white">
                <IconPackageX size={15} className="shrink-0 opacity-90" />
                <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Produk Habis</p>
              </div>
              <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                {outOfStockProductCount.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> produk</span>
              </p>
              <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Stok sudah 0</p>
            </div>
          </>
        ) : activeTab === 'stockin' ? (
                <>
                  {/* ── Tab Barang Masuk: ringkasan penerimaan dari produksi ── */}
                  <div className="col-span-2 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
                    <div className="flex items-center gap-2 text-white">
                      <IconArrowDownToLine size={15} className="shrink-0 opacity-90" />
                      <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Total Barang Masuk</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                      {stockInMonthUnits.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> unit</span>
                    </p>
                    <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Unit diterima bulan ini</p>
                  </div>

                  <div className="col-span-1 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
                    <div className="flex items-center gap-2 text-white">
                      <IconCalendarClock size={15} className="shrink-0 opacity-90" />
                      <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Masuk Hari Ini</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                      {stockInTodayUnits.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> unit</span>
                    </p>
                    <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Diterima hari ini (WIB)</p>
                  </div>

                  <div className="col-span-1 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
                    <div className="flex items-center gap-2 text-white">
                      <IconBoxes size={15} className="shrink-0 opacity-90" />
                      <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">SKU Diterima</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                      {stockInMonthVariantCount.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> SKU</span>
                    </p>
                    <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Ukuran unik bulan ini</p>
                  </div>

                  <div className="col-span-2 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
                    <div className="flex items-center gap-2 text-white">
                      <ClipboardList size={15} className="shrink-0 opacity-90" />
                      <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Total Pencatatan</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                      {stockInMonthRecordCount.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> pencatatan</span>
                    </p>
                    <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Pencatatan bulan ini</p>
                  </div>
                </>
              ) : (
                <>
                  {/* ── Tab Barang Keluar: ringkasan stok yang berkurang ── */}
                  <div className="col-span-2 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
                    <div className="flex items-center gap-2 text-white">
                      <Package size={15} className="shrink-0 opacity-90" />
                      <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Total Barang Keluar</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                      {stockOutUnits.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> unit</span>
                    </p>
                    <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Total unit stok keluar</p>
                  </div>

                  <div className="col-span-1 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
                    <div className="flex items-center gap-2 text-white">
                      <ClipboardList size={15} className="shrink-0 opacity-90" />
                      <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Total Item Terjual</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                      {(transactions || []).length.toLocaleString('id-ID')}
                    </p>
                    <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Baris item dari pesanan</p>
                  </div>

                  <div className="col-span-1 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
                    <div className="flex items-center gap-2 text-white">
                      <IconLayers size={15} className="shrink-0 opacity-90" />
                      <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Produk Terjual</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                      {stockOutProductCount.toLocaleString('id-ID')}
                    </p>
                    <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Produk berbeda terjual</p>
                  </div>

                  <div className="col-span-2 lg:col-span-1 bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-white/15 transition-all duration-300">
                    <div className="flex items-center gap-2 text-white">
                      <IconCalendarClock size={15} className="shrink-0 opacity-90" />
                      <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide leading-tight min-h-[26px] md:min-h-[15px]">Keluar Hari Ini</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight leading-none mt-2">
                      {stockOutTodayUnits.toLocaleString('id-ID')}<span className="text-xs md:text-sm font-bold"> unit</span>
                    </p>
                    <p className="mt-1.5 text-[10px] md:text-[11px] text-white/85 leading-tight">Unit keluar hari ini (WIB)</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#2d3748]/80 backdrop-blur-sm rounded-xl p-1 border border-gray-200 dark:border-slate-600 shadow-sm transition-colors duration-300">
          <div className="grid grid-cols-2 md:flex md:gap-1">
            <button 
              onClick={() => setActiveTab('produk')}
              className={`flex items-center justify-center gap-2 px-2 md:px-6 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]/40 dark:focus-visible:ring-white/60 ${
                activeTab === 'produk'
                  ? 'bg-[#18181b] text-white shadow-sm dark:bg-white dark:text-[#18181b] font-semibold'
                  : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100/50 dark:hover:bg-slate-700/50 font-medium'
              }`}
              style={{ fontSize: '13px', letterSpacing: '0.01em' }}
            >
              <Package size={18} className="shrink-0" />
              <span className="truncate">Daftar Produk</span>
            </button>
            <button 
              onClick={() => setActiveTab('report')}
              className={`flex items-center justify-center gap-2 px-2 md:px-6 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]/40 dark:focus-visible:ring-white/60 ${
                activeTab === 'report'
                  ? 'bg-[#18181b] text-white shadow-sm dark:bg-white dark:text-[#18181b] font-semibold'
                  : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100/50 dark:hover:bg-slate-700/50 font-medium'
              }`}
              style={{ fontSize: '13px', letterSpacing: '0.01em' }}
            >
              <ClipboardList size={18} className="shrink-0" />
              <span className="truncate">Laporan Stok</span>
            </button>
            <button 
              onClick={() => setActiveTab('stockin')}
              className={`flex items-center justify-center gap-2 px-2 md:px-6 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]/40 dark:focus-visible:ring-white/60 ${
                activeTab === 'stockin'
                  ? 'bg-[#18181b] text-white shadow-sm dark:bg-white dark:text-[#18181b] font-semibold'
                  : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100/50 dark:hover:bg-slate-700/50 font-medium'
              }`}
              style={{ fontSize: '13px', letterSpacing: '0.01em' }}
            >
              <TrendingUp size={18} className="shrink-0" />
              <span className="truncate">Barang Masuk</span>
            </button>
            <button 
              onClick={() => setActiveTab('stockout')}
              className={`flex items-center justify-center gap-2 px-2 md:px-6 py-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]/40 dark:focus-visible:ring-white/60 ${
                activeTab === 'stockout'
                  ? 'bg-[#18181b] text-white shadow-sm dark:bg-white dark:text-[#18181b] font-semibold'
                  : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100/50 dark:hover:bg-slate-700/50 font-medium'
              }`}
              style={{ fontSize: '13px', letterSpacing: '0.01em' }}
            >
              <TrendingDown size={18} className="shrink-0" />
              <span className="truncate">Barang Keluar</span>
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'produk' && (
            <motion.div
              key="produk"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex flex-col md:flex-row gap-4 mb-6 md:max-w-[720px]">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={20} />
                  <input
                    type="text"
                    placeholder="Cari nama produk atau SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 text-gray-900 dark:text-slate-100 transition-all duration-200 font-inter"
                    style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '0.01em' }}
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer min-w-[180px] shadow-sm text-gray-900 dark:text-slate-100 transition-all duration-200 font-inter"
                  style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.01em' }}
                >
                  <option value="all">Semua Status</option>
                  <option value="aman">Stok Aman</option>
                  <option value="menipis">Stok Menipis</option>
                  <option value="habis">Stok Habis</option>
                </select>
              </div>

              {/* DESKTOP: TABLE VIEW */}
              <div className="hidden md:block bg-white dark:bg-[#1a1d28] rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden min-[1300px]:overflow-visible transition-colors duration-300">
                <div className="overflow-x-auto min-[1300px]:overflow-visible">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-[#1e3a5f]">
                        <th className="px-3 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f]">Produk</th>
                        <th className="px-3 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f] whitespace-nowrap">Series</th>
                        <th className="px-3 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f] whitespace-nowrap">Jenis Kain</th>
                        <th className="px-3 py-3.5 text-center font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f] whitespace-nowrap">Stok</th>
                        <th className="px-3 py-3.5 text-center font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f] whitespace-nowrap">Website</th>
                        <th
                          className="px-3 py-3.5 text-center font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f] whitespace-nowrap cursor-pointer select-none hover:bg-[#2d4a6f] transition-colors"
                          onClick={() => handleSort('stockPercentage')}
                        >
                          <span className="inline-flex items-center justify-center gap-1">
                            Status
                            <ArrowUpDown className="w-3 h-3 opacity-70" />
                          </span>
                        </th>
                        <th className="px-3 py-3.5 text-center font-inter text-xs font-bold text-white uppercase tracking-wide">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProducts.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="px-6 py-12 text-center font-inter text-sm text-gray-400 dark:text-slate-500">
                            Belum ada produk
                          </td>
                        </tr>
                      ) : (
                        sortedProducts.map((product, index) => {
                          const rowBg = index % 2 === 0 ? 'bg-white dark:bg-[#16171d]' : 'bg-blue-50/30 dark:bg-[#1a1d28]';
                          return (
                           <tr
                             key={product.id}
                              className={`${rowBg} hover:bg-blue-100/50 dark:hover:bg-slate-800 transition-colors border-b border-gray-100 dark:border-slate-800/50 ${product.product_type === 'free_gift' ? 'border-l-4 border-l-indigo-400' : ''} ${product.stok_bersama ? 'opacity-60' : ''}`}
                           >
                              <td className="px-3 py-3.5 text-left align-middle font-inter text-sm font-semibold text-gray-900 dark:text-white border-r border-gray-100 dark:border-slate-800/50">
                                <span className="block truncate max-w-[260px]" title={product.name}>{product.name}</span>
                                {product.stok_bersama ? (
                                  <span className="block text-[10px] font-medium text-amber-600 dark:text-amber-400" title={`ikut ${product.stok_bersama.mengikuti}`}>
                                    ikut {product.stok_bersama.mengikuti}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-3.5 text-left align-middle font-inter text-sm text-gray-600 dark:text-slate-300 border-r border-gray-100 dark:border-slate-800/50 whitespace-nowrap">
                                {product.series || <span className="text-gray-400 dark:text-slate-500">-</span>}
                              </td>
                              <td className="px-3 py-3.5 text-left align-middle font-inter text-sm text-gray-600 dark:text-slate-300 border-r border-gray-100 dark:border-slate-800/50 whitespace-nowrap">
                                {product.jenis_kain?.name || <span className="text-gray-400 dark:text-slate-500">Belum diatur</span>}
                              </td>
                              <td className="px-3 py-3.5 text-center align-middle font-inter text-sm font-black text-gray-900 dark:text-white border-r border-gray-100 dark:border-slate-800/50 whitespace-nowrap" title={product.stok_bersama ? `Stok bersama: mengikuti ${product.stok_bersama.mengikuti}` : undefined}>
                                {stokProduk(product).nilai}
                              </td>
                              <td className="px-3 py-3.5 text-center align-middle border-r border-gray-100 dark:border-slate-800/50">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${product.is_published === false ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900' : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900'}`}>
                                  {product.is_published === false ? 'Belum' : 'Tampil'}
                                </span>
                              </td>
                              <td className="px-3 py-3.5 text-center align-middle border-r border-gray-100 dark:border-slate-800/50">
                                {renderStockIndicator(product)}
                              </td>
                              <td className="px-3 py-3.5 text-center align-middle">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDetailClick(product);
                                    }}
                                    className="w-8 h-8 flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors"
                                    title="Lihat Detail"
                                  >
                                    <Eye size={16} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(pageUrl('TambahProduk'), { state: { product } });
                                    }}
                                    className="w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                                    title="Edit Produk"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteClick(product, 'product');
                                    }}
                                    className="w-8 h-8 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                                    title="Hapus Produk"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                           </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MOBILE: CARD LIST VIEW */}
              <div className="md:hidden space-y-3">
                {sortedProducts.length === 0 ? (
                  <div className="bg-white dark:bg-[#1a1d28] rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-8 text-center transition-colors duration-300">
                    <p className="font-inter text-gray-400 dark:text-slate-500" style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '0.01em' }}>
                      Belum ada produk
                    </p>
                  </div>
                ) : (
                  sortedProducts.map((product) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={`bg-gradient-to-br from-white to-gray-50/50 dark:from-[#2d3748] dark:to-slate-700/50 rounded-2xl shadow-md border border-gray-200/80 dark:border-slate-600 p-4 backdrop-blur-sm transition-colors duration-300 ${product.product_type === 'free_gift' ? 'border-l-4 border-l-indigo-400' : ''} ${product.stok_bersama ? 'opacity-60' : ''}`}
                      style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)' }}
                    >
                      <div className="flex items-start justify-between mb-3 pb-3 border-b border-gray-200/60 dark:border-slate-600">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                              <Package size={14} className="text-white" />
                            </div>
                            <p className="font-outfit text-blue-600 dark:text-blue-400" style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.01em' }}>
                              {product.sku}
                            </p>
                          </div>
                          <p className="font-inter text-gray-900 dark:text-slate-100 truncate whitespace-nowrap" style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '0.01em' }} title={product.name}>
                            {product.name}
                          </p>
                          <p className="font-inter text-gray-500 dark:text-slate-400 truncate whitespace-nowrap mt-0.5" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.01em' }}>
                            {[product.jenis_kain?.name, product.series].filter(Boolean).join(' · ') || 'Jenis kain belum diatur'}
                          </p>
                          {product.stok_bersama ? (
                            <p className="font-inter text-amber-600 truncate whitespace-nowrap mt-0.5" style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.01em' }}>
                              ikut {product.stok_bersama.mengikuti}
                            </p>
                          ) : null}
                          <span className={`mt-1 inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${product.is_published === false ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900' : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900'}`}>
                            {product.is_published === false ? 'Belum tampil' : 'Tampil di website'}
                          </span>
                        </div>
                        {renderStockIndicator(product)}
                        </div>

                        <div className="bg-blue-50/50 dark:bg-[#404B5C] rounded-xl p-3 mb-3 border border-blue-100/60 dark:border-slate-600/50 transition-colors duration-300">
                          <p className="font-inter text-xs text-blue-600 dark:text-blue-400 mb-1 font-semibold">Stok</p>
                          <p className="font-outfit font-tabular text-blue-600 dark:text-blue-400" style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.01em' }} title={product.stok_bersama ? `Stok bersama: mengikuti ${product.stok_bersama.mengikuti}` : undefined}>
                            {stokProduk(product).nilai}<span className="text-xs font-bold"> unit</span>
                          </p>
                        </div>

                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200/60 dark:border-slate-600">
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDetailClick(product);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-all font-inter border border-indigo-100"
                          style={{ fontSize: '12px', fontWeight: 600 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Eye size={15} />
                          Lihat
                        </motion.button>
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(pageUrl('TambahProduk'), { state: { product } });
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition-all font-inter border border-blue-100"
                          style={{ fontSize: '12px', fontWeight: 600 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Edit size={15} />
                          Edit
                        </motion.button>
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(product, 'product');
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-all font-inter border border-red-100"
                          style={{ fontSize: '12px', fontWeight: 600 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Trash2 size={15} />
                          Hapus
                        </motion.button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Ringkasan daftar — tanpa tombol halaman */}
              {totalProducts > 0 && (
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mt-6 bg-white dark:bg-[#1a1d28] p-4 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm transition-colors duration-300">
                  <p className="text-sm text-gray-600 dark:text-slate-400 font-inter">
                    {hasProductFilter ? (
                      <>Menampilkan <span className="font-bold text-gray-900 dark:text-white">{filteredProducts.length}</span> dari <span className="font-bold text-gray-900 dark:text-white">{totalProducts}</span> produk</>
                    ) : (
                      <>Menampilkan <span className="font-bold text-gray-900 dark:text-white">{totalProducts}</span> produk</>
                    )}
                  </p>
                  
                </div>
              )}
            </motion.div>
          )}

          {/* TAB: LAPORAN STOK */}
          {activeTab === 'report' && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Toolbar: search (kiri) + filter (kanan) */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={17} />
                  <input
                    type="text"
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Cari produk, kain, atau series..."
                    className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm placeholder:text-gray-400 dark:placeholder:text-slate-500 text-gray-900 dark:text-slate-100 font-inter transition-all"
                    style={{ fontSize: '14px', fontWeight: 500 }}
                  />
                  {reportSearch && (
                    <button
                      type="button"
                      onClick={() => setReportSearch("")}
                      aria-label="Hapus pencarian"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <MultiFilter label="Kategori" options={reportKategoriOptions} selected={reportFilters.kategori} onChange={(next) => setReportFilters((f) => ({ ...f, kategori: next }))} />
                  <MultiFilter label="Jenis Kain" options={reportKainOptions} selected={reportFilters.kain} onChange={(next) => setReportFilters((f) => ({ ...f, kain: next }))} />
                  <MultiFilter label="Series" options={reportSeriesOptions} selected={reportFilters.series} onChange={(next) => setReportFilters((f) => ({ ...f, series: next }))} />
                  <select
                    value={stockFilter}
                    onChange={(e) => setStockFilter(e.target.value)}
                    aria-label="Status stok"
                    className="px-3 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm transition-all"
                  >
                    <option value="all">Semua Status</option>
                    <option value="aman">Aman</option>
                    <option value="menipis">Menipis</option>
                    <option value="habis">Habis</option>
                  </select>
                  {hasReportFilter && (
                    <button
                      type="button"
                      onClick={resetReportFilters}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Ringkasan hasil + chip filter aktif */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <p className="text-sm text-gray-600 dark:text-slate-400 font-inter">
                  Menampilkan <span className="text-blue-600 dark:text-blue-400 font-bold">{reportRows.length}</span> dari {reportTotal} baris
                  <span className="text-gray-400 dark:text-slate-500"> · </span>
                  <span className="text-blue-600 dark:text-blue-400 font-bold">{reportUnits.toLocaleString('id-ID')}</span> unit
                </p>
                {stockFilter !== 'all' && (
                  <FilterChip label={`Status: ${STATUS_LABEL[stockFilter] || stockFilter}`} onRemove={() => setStockFilter('all')} />
                )}
                {reportFilters.kategori.map((k) => (
                  <FilterChip key={`kat-${k}`} label={k} onRemove={() => setReportFilters((f) => ({ ...f, kategori: f.kategori.filter((x) => x !== k) }))} />
                ))}
                {reportFilters.kain.map((k) => (
                  <FilterChip key={`kain-${k}`} label={`Kain ${k}`} onRemove={() => setReportFilters((f) => ({ ...f, kain: f.kain.filter((x) => x !== k) }))} />
                ))}
                {reportFilters.series.map((s) => (
                  <FilterChip key={`ser-${s}`} label={s} onRemove={() => setReportFilters((f) => ({ ...f, series: f.series.filter((x) => x !== s) }))} />
                ))}
              </div>

              {/* Desktop: Tabel stok per variant & ukuran */}
              <div className="hidden md:block bg-white dark:bg-[#1a1d28] rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden min-[1300px]:overflow-visible transition-colors duration-300">
                <div className="overflow-x-auto min-[1300px]:overflow-visible">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-[#1e3a5f]">
                        <th className="px-3 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f]">Produk</th>
                        <th className="w-[200px] px-3 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f] whitespace-nowrap">SKU</th>
                        <th className="px-3 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f] whitespace-nowrap">Kategori</th>
                        <th className="px-3 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f] whitespace-nowrap">Jenis Kain</th>
                        <th className="px-3 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f]">Series</th>
                        {reportSizeLayout.showSizes &&
                          SIZES.map((size) => (
                            <th key={size} className="w-11 px-2 py-3.5 text-center font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f]">{size}</th>
                          ))}
                        {reportSizeLayout.showExtra && (
                          <th className="w-16 px-3 py-3.5 text-center font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f]" title="Stok ukuran non-standar (mis. ALL SIZE)">
                            Stok
                          </th>
                        )}
                        <th className="w-16 px-3 py-3.5 text-center font-inter text-xs font-bold text-white uppercase tracking-wide">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportRows.length === 0 ? (
                        <tr>
                          <td colSpan={5 + (reportSizeLayout.showSizes ? SIZES.length : 0) + (reportSizeLayout.showExtra ? 1 : 0) + 1} className="px-6 py-12 text-center font-inter text-sm text-gray-400 dark:text-slate-500">
                            <div className="flex flex-col items-center gap-3">
                              <span>{hasReportFilter ? 'Tidak ada baris yang cocok dengan pencarian/filter.' : 'Belum ada baris — tambahkan produk dengan ukuran dulu'}</span>
                              {hasReportFilter && (
                                <button
                                  type="button"
                                  onClick={resetReportFilters}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                >
                                  Reset filter
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        reportRows.map((v, index) => {
                          const product = products.find(p => p.id === v.product_id);
                          const raw = stokMentahMap(v);
                          const total = stokVarianTotal(v);
                          const extra = stokNonStandar(v);
                          const hasExtra = punyaUkuranNonStandar(v);
                          const extraTitle = Object.entries(raw)
                            .filter(([size]) => !SIZES.includes(size))
                            .map(([size, n]) => `${size}: ${n}`)
                            .join(", ");
                          const rowBg = index % 2 === 0 ? 'bg-white dark:bg-[#16171d]' : 'bg-blue-50/30 dark:bg-[#1a1d28]';
                          return (
                            <tr key={v.id} className={`${rowBg} hover:bg-blue-100/50 dark:hover:bg-slate-800 transition-colors border-b border-gray-100 dark:border-slate-800/50 ${v.base_product_id ? 'opacity-60' : ''}`}>
                              <td className="px-3 py-3.5 text-left align-middle font-inter text-sm font-semibold text-gray-900 dark:text-white border-r border-gray-100 dark:border-slate-800/50">
                                {product?.name || v.product_name || '-'}
                                <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                  {displayVariantColor(v.color, product)}
                                </span>
                                {(v.base_series_name || v.base_product_name) ? (
                                  <span className="block text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                    ikut {v.base_series_name || v.base_product_name}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-3.5 text-left align-middle font-inter text-[12px] font-semibold text-slate-700 dark:text-slate-200 border-r border-gray-100 dark:border-slate-800/50 whitespace-nowrap">
                                {v.sku || product?.sku || '-'}
                              </td>
                              <td className="px-3 py-3.5 text-left align-middle border-r border-gray-100 dark:border-slate-800/50">
                                {varianKategori(v) ? (
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600">
                                    {varianKategori(v)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 dark:text-slate-500">-</span>
                                )}
                              </td>
                              <td className="px-3 py-3.5 text-left align-middle font-inter text-sm text-gray-600 dark:text-slate-300 border-r border-gray-100 dark:border-slate-800/50 whitespace-nowrap">
                                {varianKain(v) || <span className="text-gray-400 dark:text-slate-500">Belum diatur</span>}
                              </td>
                              <td className="px-3 py-3.5 text-left align-middle font-inter text-sm text-gray-600 dark:text-slate-300 border-r border-gray-100 dark:border-slate-800/50">
                                {varianSeries(v) || '-'}
                              </td>
                              {reportSizeLayout.showSizes && SIZES.map((sz) => {
                                const has = Object.prototype.hasOwnProperty.call(raw, sz);
                                const val = has ? raw[sz] : null;
                                const cls = !has
                                  ? 'text-gray-400 dark:text-slate-500'
                                  : val === 0
                                    ? 'text-red-500 dark:text-red-400'
                                    : val <= 5
                                      ? 'text-amber-500 dark:text-amber-400'
                                      : 'text-gray-800 dark:text-slate-200';
                                return (
                                  <td key={sz} className={`px-2 py-3.5 text-center align-middle font-inter text-sm font-semibold border-r border-gray-100 dark:border-slate-800/50 ${cls}`}>
                                    {has ? val : '-'}
                                  </td>
                                );
                              })}
                              {reportSizeLayout.showExtra && (
                                <td
                                  className={`px-2 py-3.5 text-center align-middle font-inter text-sm font-bold border-r border-gray-100 dark:border-slate-800/50 ${
                                    !hasExtra
                                      ? 'text-gray-400 dark:text-slate-500'
                                      : extra === 0
                                        ? 'text-red-500 dark:text-red-400'
                                        : extra <= 5
                                          ? 'text-amber-500 dark:text-amber-400'
                                          : 'text-gray-800 dark:text-slate-200'
                                  }`}
                                  title={extraTitle || undefined}
                                >
                                  {hasExtra ? extra : '-'}
                                </td>
                              )}
                              <td className="px-3 py-3.5 text-center align-middle font-inter text-sm font-black text-blue-600 dark:text-blue-400">
                                {total}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile: Card per variant */}
              <div className="md:hidden space-y-3">
                {reportRows.length === 0 ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
                    <p className="font-inter text-sm text-gray-400 mb-3">
                      {hasReportFilter ? 'Tidak ada baris yang cocok dengan pencarian/filter.' : 'Belum ada baris'}
                    </p>
                    {hasReportFilter && (
                      <button
                        type="button"
                        onClick={resetReportFilters}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        Reset filter
                      </button>
                    )}
                  </div>
                ) : (
                  reportRows.map((v) => {
                    const product = products.find(p => p.id === v.product_id);
                    const raw = stokMentahMap(v);
                    const total = stokVarianTotal(v);
                    const standardEntries = SIZES.map((sz) => [
                      sz,
                      Object.prototype.hasOwnProperty.call(raw, sz) ? raw[sz] : null,
                    ]);
                    const extraEntries = Object.entries(raw).filter(([size]) => !SIZES.includes(size));
                    return (
                      <div key={v.id} className={`bg-white rounded-2xl shadow-md border border-gray-200/80 p-4 ${v.base_product_id ? 'opacity-60' : ''}`}>
                        <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200/60">
                          <div>
                            <p className="font-inter text-sm font-semibold text-gray-900">{product?.name || v.product_name || '-'}</p>
                            <p className="text-[10px] font-medium text-gray-500">{displayVariantColor(v.color, product)}</p>
                            <p className="text-[10px] font-semibold text-slate-500 break-all">SKU: {v.sku || product?.sku || '-'}</p>
                            {(v.base_series_name || v.base_product_name) ? (
                              <p className="text-[10px] font-medium text-amber-600">
                                ikut {v.base_series_name || v.base_product_name}
                              </p>
                            ) : null}
                            <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                              {varianKategori(v) ? (
                                <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">{varianKategori(v)}</span>
                              ) : null}
                              {varianKain(v) ? <span>{varianKain(v)}</span> : null}
                              {varianSeries(v) ? <span>• {varianSeries(v)}</span> : null}
                            </p>
                          </div>
                          <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-black">{total} pcs</span>
                        </div>
                        {standardEntries.some(([, val]) => val !== null) && (
                          <div className="grid grid-cols-3 gap-2">
                            {standardEntries.map(([sz, val]) => {
                              const box = val === null
                                ? 'bg-gray-50/60 border-gray-200/60'
                                : val === 0
                                  ? 'bg-red-50/60 border-red-100'
                                  : val <= 5
                                    ? 'bg-amber-50/60 border-amber-100'
                                    : 'bg-gray-50/60 border-gray-200/60';
                              const txt = val === null
                                ? 'text-gray-400'
                                : val === 0
                                  ? 'text-red-500'
                                  : val <= 5
                                    ? 'text-amber-600'
                                    : 'text-gray-700';
                              return (
                                <div key={sz} className={`rounded-xl p-2 border text-center ${box}`}>
                                  <p className="text-[10px] font-bold text-gray-500 uppercase">{sz}</p>
                                  <p className={`text-base font-black ${txt}`}>{val === null ? '-' : val}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {extraEntries.length > 0 && (
                          <div className={`grid gap-2 ${extraEntries.length === 1 ? 'grid-cols-1' : 'grid-cols-3'} ${standardEntries.some(([, val]) => val !== null) ? 'mt-2' : ''}`}>
                            {extraEntries.map(([size, val]) => {
                              const box = val === 0
                                ? 'bg-red-50/60 border-red-100'
                                : val <= 5
                                  ? 'bg-amber-50/60 border-amber-100'
                                  : 'bg-gray-50/60 border-gray-200/60';
                              const txt = val === 0 ? 'text-red-500' : val <= 5 ? 'text-amber-600' : 'text-gray-700';
                              return (
                                <div key={size} className={`rounded-xl p-2 border text-center ${box}`}>
                                  <p className="text-[9px] font-bold text-gray-500 uppercase leading-tight break-words">{size}</p>
                                  <p className={`text-base font-black ${txt}`}>{val}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {standardEntries.every(([, val]) => val === null) && extraEntries.length === 0 && (
                          <p className="text-xs font-semibold text-gray-400">Belum ada ukuran.</p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

          {/* TAB: BARANG MASUK */}
          {activeTab === 'stockin' && (
            <motion.div
              key="stockin"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {(() => {
                const manualStockIns = stockIns.filter(si => !si.source || si.source === 'manual' || si.source === 'batal' || si.source === 'tukar_size' || si.source === 'return');
                return (
                  <>
                    {/* Action Button */}
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm text-gray-600 dark:text-slate-400 font-inter">
                        Menampilkan <span className="text-blue-600 dark:text-blue-400 font-bold">{manualStockIns.length}</span> data barang masuk
                      </p>
                      <motion.button
                        onClick={() => navigate(pageUrl('TambahBarangMasuk'))}
                        className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold text-sm transition-all shadow-md"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Plus size={18} />
                        Barang Masuk
                      </motion.button>
                    </div>

                    {/* Table - Google Sheet Style */}
                    <div className="bg-white dark:bg-[#1a1d28] rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden transition-colors duration-300">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse table-fixed min-w-[900px]">
                          <colgroup>
                            <col style={{ width: "11%" }} />
                            <col style={{ width: "16%" }} />
                            <col style={{ width: "21%" }} />
                            <col style={{ width: "11%" }} />
                            <col style={{ width: "7%" }} />
                            <col style={{ width: "7%" }} />
                            <col style={{ width: "21%" }} />
                            <col style={{ width: "6%" }} />
                          </colgroup>
                          <thead>
                            <tr className="bg-[#f8fafc] dark:bg-slate-800/60 border-b border-[#e2e8f0] dark:border-slate-700">
                              <th className="px-3.5 py-3 text-left font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em] whitespace-nowrap">
                                Tanggal
                              </th>
                              <th className="px-3.5 py-3 text-left font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em] whitespace-nowrap">
                                SKU
                              </th>
                              <th className="px-3.5 py-3 text-left font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em]">
                                Nama Produk
                              </th>
                              <th className="px-3.5 py-3 text-center font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em]">
                                Warna
                              </th>
                              <th className="px-3.5 py-3 text-center font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em]">
                                Ukuran
                              </th>
                              <th className="px-3.5 py-3 text-center font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em]">
                                Qty
                              </th>
                              <th className="px-3.5 py-3 text-left font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em]">
                                Catatan
                              </th>
                              <th className="px-3.5 py-3 text-center font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em]">
                                Aksi
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {manualStockIns.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="px-6 py-12 text-center font-inter text-sm text-gray-400 dark:text-slate-500">
                                  Belum ada data barang masuk
                                </td>
                              </tr>
                            ) : (
                              manualStockIns.map((si) => {
                                const product = products.find(p => p.id === si.product_id);
                                return (
                                  <tr key={si.id} className="hover:bg-[#eff6ff] dark:hover:bg-slate-800/70 transition-colors border-b border-[#e2e8f0] dark:border-slate-800/60">
                                    <td className="px-3.5 py-2.5 align-middle font-inter text-[13px] leading-snug text-gray-600 dark:text-slate-300 whitespace-nowrap">
                                      {format(new Date(si.date), 'dd MMM yyyy')}
                                    </td>
                                    <td className="px-3.5 py-2.5 align-middle font-mono text-[12px] leading-snug font-semibold text-gray-700 dark:text-slate-200 break-words">
                                      {displayVariantSku(variants, product, si.product_id, si.variant_color, si.variant_size, si.sku)}
                                    </td>
                                    <td className="px-3.5 py-2.5 align-middle font-inter text-[13px] leading-snug font-semibold text-gray-900 dark:text-white break-words">
                                      {si.product_name || product?.name || '-'}
                                    </td>
                                    <td className="px-3.5 py-2.5 text-center align-middle font-inter text-[12px] leading-snug text-gray-600 dark:text-slate-300 whitespace-nowrap">
                                      {displayVariantColor(si.variant_color, product)}
                                    </td>
                                    <td className="px-3.5 py-2.5 text-center align-middle font-inter text-[12px] font-semibold text-gray-700 dark:text-slate-200 whitespace-nowrap">
                                      {si.variant_size || '-'}
                                    </td>
                                    <td className="px-3.5 py-2.5 text-center align-middle">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-[12px] font-bold">
                                        +{si.qty}
                                      </span>
                                    </td>
                                    <td className="px-3.5 py-2.5 align-middle font-inter text-[12px] leading-snug text-gray-500 dark:text-slate-400">
                                      <span className="block max-w-[220px] truncate" title={si.notes || undefined}>
                                        {si.notes || '-'}
                                      </span>
                                    </td>
                                    <td className="px-3.5 py-2.5 text-center align-middle">
                                      {['batal', 'tukar_size', 'return'].includes(si.source) ? (
                                        <span
                                          className="text-[11px] font-semibold text-gray-400 dark:text-slate-500"
                                          title="Baris otomatis dari retur/pembatalan — stok sudah diterapkan, tidak dihapus dari sini"
                                        >
                                          {si.source === 'tukar_size' ? 'tukar size' : si.source === 'return' ? 'retur' : 'otomatis'}
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => handleDeleteClick(si, 'stockin')}
                                          className="w-7 h-7 inline-flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                                          title="Hapus"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <StockMovementsPanel direction="in" />
                  </>
                );
              })()}
            </motion.div>
          )}

          {/* TAB: BARANG KELUAR */}
          {activeTab === 'stockout' && (
            <motion.div
              key="stockout"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Info Box */}
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4 mb-4 flex items-start gap-3 transition-colors duration-300">
                <Info size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Informasi Barang Keluar</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Data barang keluar diambil otomatis dari transaksi penjualan, ditambah pergerakan stok dari Tukar Size/Return. Untuk menambah barang keluar penjualan, buat transaksi baru di halaman Transaksi.
                  </p>
                </div>
              </div>

              {/* Info count */}
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-3 font-inter">
                Menampilkan <span className="text-blue-600 dark:text-blue-400 font-bold">{transactions.length}</span> data barang keluar
              </p>

              {/* Table - Google Sheet Style */}
              <div className="bg-white dark:bg-[#1a1d28] rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden transition-colors duration-300">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse table-fixed min-w-[880px]">
                    <thead>
                    <tr className="bg-[#f8fafc] dark:bg-slate-800/60 border-b border-[#e2e8f0] dark:border-slate-700">
                    <th className="w-[10%] px-3.5 py-3 text-left font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em] whitespace-nowrap">
                    Tanggal
                    </th>
                    <th className="w-[15%] px-3.5 py-3 text-left font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em] whitespace-nowrap">
                    Order ID
                    </th>
                    <th className="w-[19%] px-3.5 py-3 text-left font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em]">
                    Produk
                    </th>
                    <th className="w-[12%] px-3.5 py-3 text-center font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em] whitespace-nowrap">
                    Warna
                    </th>
                    <th className="w-[22%] px-3.5 py-3 text-left font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em] whitespace-nowrap">
                    SKU
                    </th>
                    <th className="w-[7%] px-3.5 py-3 text-center font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em]">
                    Qty
                    </th>
                    <th className="w-[15%] px-3.5 py-3 text-right font-inter text-[11px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-[.06em] whitespace-nowrap">
                    Total
                    </th>
                    </tr>
                    </thead>
                    <tbody>
                    {transactions.length === 0 ? (
                    <tr>
                    <td colSpan="7" className="px-4 py-10 text-center font-inter text-sm text-gray-400 dark:text-slate-500">
                    Belum ada data barang keluar
                    </td>
                    </tr>
                    ) : (
                    transactions.map((t) => {
                    const product = products.find(p => p.id === t.product_id);
                    return (
                    <tr key={t.id} className="hover:bg-[#eff6ff] dark:hover:bg-slate-800/70 transition-colors border-b border-[#e2e8f0] dark:border-slate-800/60">
                    <td className="px-3.5 py-2.5 align-top font-inter text-[13px] leading-snug text-gray-600 dark:text-slate-300 whitespace-nowrap">
                    {format(new Date(t.date), 'dd MMM yyyy')}
                    </td>
                    <td className="px-3.5 py-2.5 align-top">
                    <div className="flex min-w-0 flex-col items-start gap-1">
                    <span className="font-inter text-[13px] font-semibold leading-snug text-gray-900 dark:text-white whitespace-nowrap">
                    {t.order_id || '-'}
                    </span>
                    {(String(t.status || '') === 'return' || String(t.status || '') === 'pending' || String(t.status || '') === 'tukar_size' || String(t.status || '') === 'retur') && (
                    <span className="inline-flex flex-wrap items-center gap-1">
                    {String(t.status || '') === 'return' && (
                    <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 text-[10px] font-bold">Batal</span>
                    )}
                    {String(t.status || '') === 'pending' && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold">Belum bayar</span>
                    )}
                    {String(t.status || '') === 'tukar_size' && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">Tukar Size</span>
                    )}
                    {String(t.status || '') === 'retur' && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold">Retur</span>
                    )}
                    </span>
                    )}
                    </div>
                    </td>
                    <td className="px-3.5 py-2.5 align-top font-inter text-[13px] font-medium leading-snug text-gray-900 dark:text-white break-words">
                    {t.product_name || product?.name || '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-center align-top font-inter text-[12px] leading-snug text-gray-600 dark:text-slate-300 whitespace-nowrap">
                    {displayVariantColor(t.variant_color, product)}
                    </td>
                    <td className="px-3.5 py-2.5 align-top font-mono text-[11px] font-semibold leading-snug text-gray-700 dark:text-slate-200 whitespace-nowrap overflow-hidden text-ellipsis">
                    {displayVariantSku(variants, product, t.product_id, t.variant_color, t.variant_size, t.sku)}
                    </td>
                    <td className="px-3.5 py-2.5 text-center align-top">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 text-[12px] font-bold">
                    -{t.qty}
                    </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right align-top font-inter text-[13px] leading-snug font-semibold whitespace-nowrap">
                    {t.is_stock_movement ? (
                    <span className="text-slate-500 dark:text-slate-400 text-[11px] font-bold">Stok keluar</span>
                    ) : product?.product_type === 'free_gift' || t.is_free_gift ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-100 dark:bg-pink-900/50 text-pink-600 dark:text-pink-400 rounded-full text-[11px] font-bold border border-pink-200 dark:border-pink-700">
                    <Gift size={11} /> Free Gift
                    </span>
                    ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">Rp {(t.total || 0).toLocaleString('id-ID')}</span>
                    )}
                    </td>
                    </tr>
                    );
                    })
                    )}
                    </tbody>
                  </table>
                </div>
              </div>
              <StockMovementsPanel direction="out" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        title={deleteType === 'product' ? "Yakin ingin menghapus produk ini?" : "Yakin ingin menghapus data barang masuk ini?"}
        itemName={productToDelete ? (deleteType === 'product' ? productToDelete.name : `${products.find(p => p.id === productToDelete.product_id)?.name || 'Produk'} (${productToDelete.qty} unit)`) : ''}
        isDeleting={deleteProductMutation.isPending || deleteStockInMutation.isPending}
      />

      <ProductDetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        product={selectedProduct}
        stockIns={stockIns}
        transactions={transactions}
        variants={variants}
      />

      <ImportProductModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />
    </div>
  );
}
