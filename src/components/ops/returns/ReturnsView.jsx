"use client";

/**
 * Menu Return — dipakai DUA dashboard:
 *   - /ops/retur       → variant="ops"   (aksen hitam/slate)
 *   - /panel-admin/retur → variant="panel" (aksen pink/rose)
 *
 * Dua tab: Tukar Size & Return. Logikanya satu; yang berbeda hanya warna aksen.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  Clipboard,
  Clock,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { base44 } from "@/lib/ops-api";
import { resolveColorName } from "@/lib/sku";
import { formatRupiah, formatTanggalJamID, formatTanggalSingkatID } from "@/components/ops/transaksi/transaksi-format";

/** Warna ops: warna asli, atau turunan dari nama produk (tanpa teks "default"). */
const titleCaseColor = (value) =>
  String(value || "").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

function displayColor(color, group) {
  const raw = String(color || "").trim();
  if (raw && raw.toLowerCase() !== "default") return raw;
  const derived = resolveColorName({
    color: "",
    productName: group?.name,
    category: group?.category,
    series: group?.series,
  });
  return derived ? titleCaseColor(derived) : "-";
}

/**
 * Tanggal ringkas untuk kolom tabel. `created_at` berbentuk timestamp ISO (bukan tanggal
 * polos), jadi `formatTanggalSingkatID` mengembalikannya mentah — panjang dan tidak
 * sejajar. Di sini tanggalnya diambil dulu dalam WIB, baru diformat ("28 Okt 2026").
 */
function tanggalRingkas(value) {
  if (!value) return "-";
  const iso = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatTanggalSingkatID(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

const TYPE_LABEL = { tukar_size: "Tukar Size", return: "Return" };

/**
 * Nomor pesanan itu pendek dan tidak berspasi (SMQ-…, CYO-…, atau nomor marketplace).
 * Kolom ini memang juga bisa dipakai mencari NAMA / no. HP, jadi yang dianggap salah hanya
 * teks panjang atau teks yang memuat tanda baca alamat (":", koma, baris baru) — pola tipikal
 * blok identitas yang ditempel. Pencarian nama biasa tetap lolos tanpa peringatan.
 */
const looksLikeIdentityBlock = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/[:\n]/.test(text)) return true;
  return text.length > 40;
};

const STATUS = {
  diajukan: { label: "Diajukan", badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900" },
  disetujui: { label: "Disetujui", badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-900" },
  barang_diterima: { label: "Barang Diterima", badge: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-900" },
  pengganti_dikirim: { label: "Pengganti Dikirim", badge: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-900" },
  selesai: { label: "Selesai", badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900" },
  ditolak: { label: "Ditolak", badge: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
  dibatalkan: { label: "Dibatalkan", badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900" },
};

const inputClass =
  "w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 dark:focus:ring-white/20";
const labelClass = "block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1";

function SummaryCard({ icon: Icon, label, value, caption, soft }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#1a1d28]">
      <div className="flex items-start gap-2.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${soft}`}>
          <Icon size={16} />
        </span>
        {/* Judul boleh membungkus 2 baris: dipotong "…" (PERLU TINDAK…, SELISIH TUKAR…) lebih
            buruk daripada tinggi kartu sedikit bertambah. Garis dasar tetap sejajar karena
            tinggi minimum area judul dipatok 2 baris. */}
        <span
          className="min-w-0 flex-1 text-[11px] font-bold uppercase leading-[1.25] tracking-wider text-slate-500 dark:text-slate-400"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            minHeight: "27px",
          }}
          title={label}
        >
          {label}
        </span>
      </div>
      <p className="mt-3 text-2xl font-black leading-none text-slate-900 tabular-nums dark:text-white">{value}</p>
      <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">{caption}</p>
    </div>
  );
}

function Badge({ status }) {
  const meta = STATUS[status] || STATUS.diajukan;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

function itemSummary(items, type) {
  if (!items?.length) return "-";
  const first = items[0];
  const from = `${first.product_name} · ${first.size}`;
  const suffix = type === "tukar_size" && first.replacement_size ? ` → ${first.replacement_size}` : "";
  return `${from}${suffix}${items.length > 1 ? ` +${items.length - 1}` : ""}`;
}

export default function ReturnsView({ variant = "ops" }) {
  const isPanel = variant === "panel";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("tukar_size");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const accent = isPanel
    ? "bg-[#c2255c] hover:bg-[#9d174d] text-white"
    : "bg-slate-900 hover:bg-slate-800 text-white";
  const accentSoft = isPanel
    ? "border-[#f3c7d6] text-[#c2255c] hover:bg-[#fdf3f7] dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-900/20"
    : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";
  const tabActive = isPanel ? "bg-[#c2255c] text-white" : "bg-slate-900 text-white";

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ["returns"],
    queryFn: () => base44.entities.Return.list({ limit: 500 }),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ["productVariants"],
    queryFn: () => base44.entities.ProductVariant.list(),
  });

  const counts = useMemo(
    () => ({
      tukar_size: returns.filter((row) => row.type === "tukar_size").length,
      return: returns.filter((row) => row.type === "return").length,
    }),
    [returns],
  );

  const summary = useMemo(() => {
    const openStatus = (row) => ["diajukan", "disetujui"].includes(row.status);
    return {
      tukar_size: returns.filter((row) => row.type === "tukar_size").length,
      tukar_open: returns.filter((row) => row.type === "tukar_size" && openStatus(row)).length,
      return: returns.filter((row) => row.type === "return").length,
      return_open: returns.filter((row) => row.type === "return" && openStatus(row)).length,
      action: returns.filter(openStatus).length,
      done: returns.filter((row) => row.status === "selesai").length,
    };
  }, [returns]);

  const differenceSummary = useMemo(() => {
    const rows = returns.filter((row) => Number(row.price_difference_total || 0) !== 0);
    const open = rows.filter((row) => row.price_difference_status !== "settled");
    return {
      openCount: open.length,
      openTotal: open.reduce((sum, row) => sum + Number(row.price_difference_total || 0), 0),
    };
  }, [returns]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return returns
      .filter((row) => row.type === tab)
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) =>
        query
          ? [row.return_number, row.order_number, row.customer_name, row.customer_whatsapp]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(query))
          : true,
      );
  }, [returns, tab, statusFilter, q]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["returns"] });

  useEffect(() => {
    const locked = createOpen || Boolean(detail);
    if (!locked) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [createOpen, detail]);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Return</h1>
          <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
            Tukar size & retur barang — stok masuk/keluar tercatat otomatis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${accent}`}
        >
          <Plus size={16} /> Ajukan Retur
        </button>
      </div>

      {/* Kartu informasi: ringkasan retur tanpa harus membaca tabel. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard
          icon={ArrowRightLeft}
          label="Tukar Size"
          value={summary.tukar_size}
          caption={`${summary.tukar_open} perlu diproses`}
          soft="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
        />
        <SummaryCard
          icon={RotateCcw}
          label="Return"
          value={summary.return}
          caption={`${summary.return_open} perlu diproses`}
          soft="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
        />
        <SummaryCard
          icon={Clock}
          label="Perlu Tindakan"
          value={summary.action}
          caption="Diajukan + disetujui"
          soft={
            isPanel
              ? "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300"
              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          }
        />
        <SummaryCard
          icon={Check}
          label="Selesai"
          value={summary.done}
          caption="Total retur selesai"
          soft="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
        />
        <SummaryCard
          icon={Wallet}
          label="Selisih Tukar Size"
          value={
            differenceSummary.openCount === 0
              ? "Rp 0"
              : `${differenceSummary.openTotal > 0 ? "+" : "−"}Rp ${formatRupiah(Math.abs(differenceSummary.openTotal))}`
          }
          caption={
            differenceSummary.openCount === 0
              ? "Tidak ada yang belum selesai"
              : `${differenceSummary.openTotal > 0 ? "Customer bayar" : "Refund"} · ${differenceSummary.openCount} belum selesai`
          }
          soft="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
        />
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#1a1d28]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {[
              { key: "tukar_size", label: "Tukar Size", icon: ArrowRightLeft },
              { key: "return", label: "Return", icon: RotateCcw },
            ].map((option) => {
              const Icon = option.icon;
              const active = tab === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setTab(option.key)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                    active ? tabActive : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  <Icon size={15} />
                  {option.label}
                  <span className={`rounded-full px-1.5 text-[10px] font-black ${active ? "bg-white/20" : "bg-slate-200 dark:bg-slate-700"}`}>
                    {counts[option.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Cari no. retur / pesanan / pelanggan"
                className={`${inputClass} w-64 pl-9`}
                aria-label="Cari retur"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`${inputClass} w-40`}
              aria-label="Filter status"
            >
              <option value="all">Semua status</option>
              {Object.entries(STATUS).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 w-full">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="w-[23%] px-2 py-2.5 align-middle">No. Retur</th>
                <th className="w-[28%] px-2 py-2.5 align-middle">Pelanggan</th>
                <th className="hidden w-[26%] px-2 py-2.5 align-middle md:table-cell">Produk</th>
                <th className="w-[20%] px-2 py-2.5 align-middle md:w-[15%]">Status</th>
                <th className="hidden w-[12%] px-2 py-2.5 align-middle xl:table-cell">Resi</th>
                <th className="w-[2%] pr-2 py-2.5 align-middle" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm font-semibold text-slate-500">
                    Memuat retur…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                    Belum ada retur di tab ini.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setDetail(row)}
                    className="cursor-pointer border-b border-slate-100 align-top transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-2 py-3.5 align-top">
                      <span className={`block truncate font-bold tabular-nums ${isPanel ? "text-[#c2255c]" : "text-slate-900 dark:text-white"}`} title={row.return_number}>
                        {row.return_number}
                      </span>
                      <span className="block text-[11px] font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                        {tanggalRingkas(row.created_at)}
                      </span>
                      {Number(row.price_difference_total || 0) !== 0 ? (
                        <span
                          className={`mt-1 inline-flex max-w-full items-center truncate rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                            row.price_difference_status === "settled"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                          }`}
                        >
                          {Number(row.price_difference_total) > 0
                            ? `+Rp ${formatRupiah(row.price_difference_total)}`
                            : `-Rp ${formatRupiah(Math.abs(Number(row.price_difference_total)))}`}
                          {row.price_difference_status === "settled" ? " · selesai" : " · belum"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-3.5 align-top">
                      <span className="block truncate font-bold text-slate-900 dark:text-white" title={row.customer_name}>
                        {row.customer_name}
                      </span>
                      <span className="block truncate text-[11px] font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                        {row.customer_whatsapp || "-"}
                      </span>
                      {/* Kolom Pesanan/Produk/Resi disembunyikan di layar sempit — ringkasannya
                          tetap terbaca di sini supaya tidak ada informasi yang hilang. */}
                      <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400 lg:hidden" title={itemSummary(row.items, row.type)}>
                        {itemSummary(row.items, row.type)}
                      </span>
                    </td>
                    <td className="hidden px-2 py-3.5 align-top md:table-cell">
                      <span className="block truncate font-semibold text-slate-800 dark:text-slate-100" title={itemSummary(row.items, row.type)}>
                        {itemSummary(row.items, row.type)}
                      </span>
                      <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {row.items?.reduce((sum, item) => sum + (Number(item.qty) || 0), 0) || 0} pcs
                      </span>
                    </td>
                    <td className="px-2 py-3.5 align-top"><Badge status={row.status} /></td>
                    <td className="hidden px-2 py-3.5 align-top xl:table-cell">
                      <span className="block truncate font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200" title={row.shipping_out_awb || row.shipping_in_awb || "-"}>
                        {row.shipping_out_awb || row.shipping_in_awb || "-"}
                      </span>
                    </td>
                    <td className="px-1 py-3.5 text-right align-top text-slate-400">›</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen ? (
        <CreateReturnDrawer
          type={tab}
          isPanel={isPanel}
          accent={accent}
          accentSoft={accentSoft}
          variants={variants}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false);
            refresh();
            setDetail(created);
          }}
        />
      ) : null}

      {detail ? (
        <ReturnDetailDrawer
          record={detail}
          isPanel={isPanel}
          accent={accent}
          accentSoft={accentSoft}
          onClose={() => setDetail(null)}
          onChanged={(updated) => {
            setDetail(updated);
            refresh();
          }}
          onDeleted={() => {
            setDetail(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/* ───────────────────────── Create drawer ───────────────────────── */

function CreateReturnDrawer({ type, isPanel, accent, accentSoft, variants, onClose, onCreated }) {
  const isExchange = type === "tukar_size";
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [shippingIn, setShippingIn] = useState("");
  const [shippingOut, setShippingOut] = useState("");
  const [shippingPaid, setShippingPaid] = useState("unpaid");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [notFound, setNotFound] = useState("");
  const [manual, setManual] = useState(false);
  const [manualCustomer, setManualCustomer] = useState("");
  const [manualWhatsapp, setManualWhatsapp] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualKecamatan, setManualKecamatan] = useState("");
  const [manualPostal, setManualPostal] = useState("");
  const [manualItems, setManualItems] = useState([]);

  const stockMapOf = (productId, color) => {
    const entry = (variants || []).find(
      (variant) => variant.product_id === productId && (variant.color || "default") === (color || "default"),
    );
    return entry?.stock_efektif || entry?.stock || {};
  };

  const priceOf = (productId, color, size) => {
    const entry = (variants || []).find(
      (variant) => variant.product_id === productId && (variant.color || "default") === (color || "default"),
    );
    return Number(entry?.prices?.[size]) || Number(entry?.price) || 0;
  };

  const variantOf = (variantId) => (variants || []).find((variant) => variant.id === variantId) || null;

  const sizesOf = (variant) => Object.keys(variant?.stock_efektif || variant?.stock || {}).sort();

  const productGroups = useMemo(() => {
    const groups = new Map();
    for (const variant of variants || []) {
      const productId = String(variant.product_id || "");
      if (!productId) continue;
      if (!groups.has(productId)) {
        groups.set(productId, {
          product_id: productId,
          name: variant.product_name || productId,
          category: variant.category || "",
          kain: variant.jenis_kain_name || "",
          series: variant.series_name || "",
          colors: [],
          stockTotal: 0,
        });
      }
      const group = groups.get(productId);
      group.colors.push(variant);
      const stockMap = variant.stock_efektif || variant.stock || {};
      group.stockTotal += Object.values(stockMap).reduce((sum, value) => sum + (Number(value) || 0), 0);
    }
    for (const group of groups.values()) {
      group.colors.sort((a, b) => String(a.color || "").localeCompare(String(b.color || "")));
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [variants]);

  const chooseProduct = (itemKey, group) => {
    const only = group.colors.length === 1 ? group.colors[0] : null;
    updateManualItem(itemKey, {
      product_id: group.product_id,
      product_search: "",
      variant_id: only?.id || "",
      size: "",
      replacement_size: "",
      price: "",
      replacement_price: "",
    });
  };

  const chooseColor = (itemKey, variantId) => {
    updateManualItem(itemKey, {
      variant_id: variantId,
      size: "",
      replacement_size: "",
      price: "",
      replacement_price: "",
    });
  };

  const blankManualItem = () => ({
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    product_id: "",
    product_search: "",
    variant_id: "",
    size: "",
    qty: 1,
    condition: "sellable",
    replacement_size: "",
    price: "",
    replacement_price: "",
  });

  const updateManualItem = (key, patch) => {
    setManualItems((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const removeManualItem = (key) => {
    setManualItems((items) => items.filter((item) => item.key !== key));
  };

  const addManualItem = () => {
    setManualItems((items) => [...items, blankManualItem()]);
  };

  useEffect(() => {
    let cancelled = false;
    setOrdersBusy(true);
    base44.entities.Transaction.recentOrders(60)
      .then((rows) => {
        if (!cancelled) setOrders(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setOrdersBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = orders.filter((row) => row.status !== "dibatalkan");
    const matched = needle
      ? list.filter((row) =>
          [row.order_number, row.customer_name, row.customer_whatsapp]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle)),
        )
      : list;
    return matched.slice(0, 8);
  }, [orders, query]);

  const startManual = (orderNo = "") => {
    setManual(true);
    setOrder(null);
    setSelected({});
    setPickerOpen(false);
    setNotFound("");
    setError("");
    if (orderNo) setQuery(orderNo);
    setManualItems((items) => (items.length > 0 ? items : [blankManualItem()]));
  };

  const selectOrder = (found) => {
    setManual(false);
    setOrder(found);
    setQuery(found.order_number || "");
    setPickerOpen(false);
    setNotFound("");
    setError("");
    const items = found.order_items || [];
    const autoSelect = items.length === 1;
    const next = {};
    for (const item of items) {
      next[item.id] = {
        checked: autoSelect,
        qty: Number(item.quantity) || 1,
        replacement_size: "",
        replacement_price: "",
        condition: "sellable",
      };
    }
    setSelected(next);
  };

  const loadOrder = async () => {
    const value = query.trim();
    if (!value) return;

    const local = orders.find(
      (row) => String(row.order_number || "").toLowerCase() === value.toLowerCase() && row.status !== "dibatalkan",
    );
    if (local) {
      selectOrder(local);
      return;
    }

    setOrderBusy(true);
    setError("");
    setNotFound("");
    try {
      const found = await base44.entities.Transaction.getOrder(value);
      if (found) {
        selectOrder(found);
      } else {
        setOrder(null);
        setPickerOpen(false);
        setNotFound(value);
      }
    } catch {
      setOrder(null);
      setPickerOpen(false);
      setNotFound(value);
    } finally {
      setOrderBusy(false);
    }
  };

  const updateItem = (id, patch) => {
    setSelected((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const selectedItems = (order?.order_items || []).filter((item) => selected[item.id]?.checked);

  const manualReady =
    manual &&
    Boolean(manualCustomer.trim()) &&
    manualItems.length > 0 &&
    manualItems.every((item) => {
      const variant = variantOf(item.variant_id);
      if (!variant || !item.size) return false;
      if (!isExchange) return true;
      const stock = Number((variant.stock_efektif || {})[item.replacement_size]) || 0;
      return Boolean(item.replacement_size) && item.replacement_size !== item.size && stock >= Number(item.qty);
    });

  const canSubmit = manual
    ? manualReady
    : Boolean(order) &&
      selectedItems.length > 0 &&
      selectedItems.every((item) => {
        const value = selected[item.id];
        if (!value) return false;
        if (isExchange) {
          const stock = Number(stockMapOf(item.product_id, item.color)[value.replacement_size]) || 0;
          return Boolean(value.replacement_size) && stock >= Number(value.qty);
        }
        return true;
      });

  const orderDifference = selectedItems.reduce((sum, item) => {
    const value = selected[item.id];
    if (!value?.replacement_size) return sum;
    const original = Number(item.price) || 0;
    const catalogReplacement = priceOf(item.product_id, item.color, value.replacement_size);
    const manualReplacement = Number(String(value.replacement_price || "").replace(/\D/g, "")) || 0;
    const replacement = manualReplacement > 0 ? manualReplacement : catalogReplacement;
    return sum + (replacement - original) * (Number(value.qty) || 1);
  }, 0);

  const manualDifference = manualItems.reduce((sum, item) => {
    const variant = variantOf(item.variant_id);
    if (!variant || !item.size || !item.replacement_size) return sum;
    const manualOriginal = Number(String(item.price || "").replace(/\D/g, "")) || 0;
    const manualReplacement = Number(String(item.replacement_price || "").replace(/\D/g, "")) || 0;
    const catalogOriginal = Number(variant.prices?.[item.size]) || Number(variant.price) || 0;
    const catalogReplacement = Number(variant.prices?.[item.replacement_size]) || Number(variant.price) || 0;
    const original = manualOriginal > 0 ? manualOriginal : catalogOriginal;
    const replacement = manualReplacement > 0 ? manualReplacement : catalogReplacement;
    return sum + (replacement - original) * (Number(item.qty) || 1);
  }, 0);

  const differenceTotal = manual ? manualDifference : orderDifference;

  const submit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError("");
    try {
      const created = await base44.entities.Return.create(
        manual
          ? {
              type,
              manual: true,
              order_number: query.trim(),
              customer_name: manualCustomer.trim(),
              customer_whatsapp: manualWhatsapp.trim(),
              shipping_address: manualAddress.trim(),
              shipping_city: manualCity.trim(),
              shipping_kecamatan: manualKecamatan.trim(),
              shipping_postal_code: manualPostal.trim(),
              reason: reason.trim(),
              notes: notes.trim(),
              shipping_in_cost: Number(String(shippingIn).replace(/\D/g, "")) || 0,
              shipping_out_cost: Number(String(shippingOut).replace(/\D/g, "")) || 0,
              shipping_payment_status: shippingPaid,
              refund_amount: type === "return" ? Number(String(refundAmount).replace(/\D/g, "")) || 0 : 0,
              refund_method: type === "return" ? refundMethod.trim() : null,
              items: manualItems.map((item) => {
                const [productId, color] = String(item.variant_id).split("||");
                return {
                  product_id: productId,
                  color: color || "default",
                  size: item.size,
                  qty: Number(item.qty) || 1,
                  condition: item.condition === "damaged" ? "damaged" : "sellable",
                  replacement_size: isExchange ? item.replacement_size : null,
                  price: Number(String(item.price || "").replace(/\D/g, "")) || 0,
                  replacement_price: Number(String(item.replacement_price || "").replace(/\D/g, "")) || 0,
                };
              }),
            }
          : {
              type,
              order_number: order.order_number,
              reason: reason.trim(),
              notes: notes.trim(),
              shipping_in_cost: Number(String(shippingIn).replace(/\D/g, "")) || 0,
              shipping_out_cost: Number(String(shippingOut).replace(/\D/g, "")) || 0,
              shipping_payment_status: shippingPaid,
              refund_amount: type === "return" ? Number(String(refundAmount).replace(/\D/g, "")) || 0 : 0,
              refund_method: type === "return" ? refundMethod.trim() : null,
              items: selectedItems.map((item) => ({
                order_item_id: item.id,
                qty: Number(selected[item.id]?.qty) || 1,
                condition: selected[item.id]?.condition === "damaged" ? "damaged" : "sellable",
                replacement_size: isExchange ? selected[item.id]?.replacement_size : null,
                replacement_price: isExchange
                  ? Number(String(selected[item.id]?.replacement_price || "").replace(/\D/g, "")) || 0
                  : 0,
              })),
            },
      );
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat retur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      title={`Ajukan ${TYPE_LABEL[type]}`}
      subtitle="Cari pesanan, pilih produk, lalu simpan."
      onClose={onClose}
      isPanel={isPanel}
    >
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 p-3.5 dark:border-slate-800">
          <label className={labelClass}>No. Pesanan</label>

          {manual ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-200 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Pesanan manual
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setManual(false);
                    setOrder(null);
                    setQuery("");
                    setNotFound("");
                    setPickerOpen(true);
                  }}
                  className={`text-[11px] font-bold ${isPanel ? "text-[#c2255c]" : "text-slate-700 underline dark:text-slate-200"}`}
                >
                  Cari pesanan
                </button>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={40}
                placeholder="No. pesanan / referensi (maks. 40 karakter)"
                className={`${inputClass} mt-2`}
              />
              <p className={`mt-1 text-[11px] font-semibold ${looksLikeIdentityBlock(query) ? "text-amber-700 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
                {looksLikeIdentityBlock(query)
                  ? "Isi nomor pesanan saja (mis. SMQ-20261028-1234). Nama & alamat punya kolomnya sendiri di bawah."
                  : "Boleh nomor marketplace/IG sebagai referensi. Kosong = otomatis RTS-YYYYMMDD-NNNN."}
              </p>
            </>
          ) : order ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-bold text-slate-800 dark:text-slate-100">{order.order_number}</p>
                <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {order.customer_name} · {order.customer_whatsapp || "-"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOrder(null);
                  setSelected({});
                  setQuery("");
                  setPickerOpen(true);
                }}
                className={`shrink-0 text-[11px] font-bold ${isPanel ? "text-[#c2255c]" : "text-slate-700 underline dark:text-slate-200"}`}
              >
                Ganti
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPickerOpen(true);
                    setNotFound("");
                  }}
                  onPaste={(event) => {
                    // Tempel blok identitas (nama + alamat + WA) sangat mudah terjadi; bantu
                    // ambil nomor pesanannya saja kalau polanya dikenali.
                    const text = event.clipboardData?.getData("text") || "";
                    const found = text.match(/\b(?:SMQ|CYO)-\d{8}-\d+\b/i);
                    if (found) {
                      event.preventDefault();
                      setQuery(found[0].toUpperCase());
                      setPickerOpen(true);
                      setNotFound("");
                    }
                  }}
                  onFocus={() => setPickerOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      loadOrder();
                    }
                    if (event.key === "Escape") setPickerOpen(false);
                  }}
                  placeholder="Cari no. pesanan / nama / no. HP"
                  className={`${inputClass} pl-9`}
                />
                {looksLikeIdentityBlock(query) ? (
                  <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    Itu bukan nomor pesanan. Isi dengan nomor pesanan saja (mis. SMQ-20261028-1234) — nama dan alamat terisi otomatis.
                  </p>
                ) : null}
                {orderBusy ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400">Mencari…</span>
                ) : null}
              </div>

              {pickerOpen ? (
                <div className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {query.trim() ? "Hasil pencarian" : "Pesanan terbaru"}
                    </p>
                    <button type="button" onClick={() => setPickerOpen(false)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">
                      Tutup
                    </button>
                  </div>

                  {ordersBusy ? <p className="px-3 pb-2 text-xs font-semibold text-slate-500">Memuat pesanan…</p> : null}

                  {!ordersBusy && filteredOrders.length === 0 ? (
                    <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Pesanan tidak ditemukan.</p>
                      <button type="button" onClick={() => startManual(query.trim())} className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-bold ${accent}`}>
                        + Input pesanan manual
                      </button>
                    </div>
                  ) : null}

                  {filteredOrders.map((row) => (
                    <button
                      key={row.order_number}
                      type="button"
                      onClick={() => selectOrder(row)}
                      className="flex w-full items-start justify-between gap-2 border-t border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs font-bold text-slate-800 dark:text-slate-100">{row.order_number}</span>
                        <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {row.customer_name} · {row.customer_whatsapp || "-"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold text-slate-400">{formatTanggalSingkatID(row.created_at)}</span>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => startManual(query.trim())}
                    className={`flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-2.5 text-left text-xs font-bold dark:border-slate-800 ${
                      isPanel ? "text-[#c2255c]" : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <Plus size={13} /> Pesanan belum tercatat — input manual
                  </button>
                </div>
              ) : null}

              {notFound ? (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-900/20">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    Pesanan <span className="font-mono">{notFound}</span> tidak ditemukan.
                  </p>
                  <button type="button" onClick={() => startManual(notFound)} className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">
                    Input manual
                  </button>
                </div>
              ) : null}
            </>
          )}

          {error ? <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-400">{error}</p> : null}
        </section>

        {manual ? (
          <>
            <section className="space-y-2 rounded-2xl border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Pelanggan (pesanan manual)
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setManual(false);
                    setOrder(null);
                    setQuery("");
                    setNotFound("");
                    setPickerOpen(true);
                  }}
                  className={`text-[11px] font-bold ${isPanel ? "text-[#c2255c]" : "text-slate-700 underline dark:text-slate-200"}`}
                >
                  Cari pesanan
                </button>
              </div>
              <input value={manualCustomer} onChange={(event) => setManualCustomer(event.target.value)} placeholder="Nama penerima *" className={inputClass} />
              <input value={manualWhatsapp} onChange={(event) => setManualWhatsapp(event.target.value)} placeholder="No. WhatsApp" className={inputClass} />
              <input value={manualAddress} onChange={(event) => setManualAddress(event.target.value)} placeholder="Alamat lengkap (opsional)" className={inputClass} />
              <div className="grid grid-cols-3 gap-2">
                <input value={manualCity} onChange={(event) => setManualCity(event.target.value)} placeholder="Kota" className={inputClass} />
                <input value={manualKecamatan} onChange={(event) => setManualKecamatan(event.target.value)} placeholder="Kecamatan" className={inputClass} />
                <input
                  value={manualPostal}
                  onChange={(event) => setManualPostal(event.target.value.replace(/\D/g, "").slice(0, 5))}
                  inputMode="numeric"
                  placeholder="Kode pos"
                  className={inputClass}
                />
              </div>
              {isExchange && (!manualAddress.trim() || !manualCity.trim() || !manualKecamatan.trim() || !manualPostal.trim()) ? (
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  Alamat lengkap dianjurkan agar resi pengganti bisa dibuat nanti.
                </p>
              ) : null}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pilih produk</p>
                <button
                  type="button"
                  onClick={addManualItem}
                  className={`inline-flex items-center gap-1 text-[11px] font-bold ${isPanel ? "text-[#c2255c]" : "text-slate-700 dark:text-slate-200"}`}
                >
                  <Plus size={13} /> Tambah produk
                </button>
              </div>
              {manualItems.map((item) => {
                const group = item.product_id
                  ? productGroups.find((option) => option.product_id === item.product_id)
                  : null;
                const variant = variantOf(item.variant_id);
                const sizes = variant ? sizesOf(variant) : [];
                const stock = variant?.stock_efektif || variant?.stock || {};
                const needle = String(item.product_search || "").trim().toLowerCase();
                const visibleGroups = productGroups
                  .filter(
                    (option) =>
                      !needle ||
                      [option.name, option.kain, option.category, option.series, ...option.colors.map((color) => color.color)]
                        .filter(Boolean)
                        .some((value) => String(value).toLowerCase().includes(needle)),
                  )
                  .slice(0, 6);
                return (
                  <div key={item.key} className="space-y-2 rounded-2xl border border-slate-200 p-3.5 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Produk
                      </span>
                      {manualItems.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeManualItem(item.key)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                          aria-label="Hapus produk"
                        >
                          <X size={15} />
                        </button>
                      ) : null}
                    </div>

                    {/* 1 · Cari produk — pola sama dengan form transaksi */}
                    {!group ? (
                      <div className="space-y-1.5">
                        <input
                          value={item.product_search || ""}
                          onChange={(event) => updateManualItem(item.key, { product_search: event.target.value })}
                          placeholder="Cari produk… (mis. super, grey, b-01)"
                          aria-label="Cari produk"
                          className={inputClass}
                        />
                        <div className="max-h-[214px] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                          {productGroups.length === 0 ? (
                            <p className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              Memuat daftar produk…
                            </p>
                          ) : visibleGroups.length === 0 ? (
                            <p className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              Produk tidak ditemukan. Coba kata lain (mis. “super”, “grey”, “b-01”).
                            </p>
                          ) : (
                            visibleGroups.map((option) => (
                              <button
                                key={option.product_id}
                                type="button"
                                onClick={() => chooseProduct(item.key, option)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">
                                    {option.name}
                                  </span>
                                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                                    {[
                                      option.kain ? `Kain ${option.kain}` : "",
                                      option.category,
                                      option.series,
                                      option.colors.length > 1 ? `${option.colors.length} warna` : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </span>
                                <span
                                  className={`shrink-0 text-[11px] font-bold ${
                                    option.stockTotal > 0
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-slate-400 dark:text-slate-500"
                                  }`}
                                >
                                  {option.stockTotal > 0 ? `sisa ${option.stockTotal}` : "habis"}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                          <span className="min-w-0 truncate text-sm font-bold text-slate-900 dark:text-white">
                            {group.name}
                            {group.kain ? (
                              <span className="font-semibold text-slate-500 dark:text-slate-400"> · Kain {group.kain}</span>
                            ) : null}
                            {group.series ? (
                              <span className="font-semibold text-slate-500 dark:text-slate-400"> · {group.series}</span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateManualItem(item.key, {
                                product_id: "",
                                product_search: "",
                                variant_id: "",
                                size: "",
                                replacement_size: "",
                              })
                            }
                            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          >
                            Ganti
                          </button>
                        </div>

                        {/* 2 · Warna */}
                        {group.colors.length > 1 ? (
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Warna
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {group.colors.map((colorVariant) => {
                                const active = item.variant_id === colorVariant.id;
                                return (
                                  <button
                                    key={colorVariant.id}
                                    type="button"
                                    onClick={() => chooseColor(item.key, colorVariant.id)}
                                    className={`rounded-xl border-2 px-2 py-2 text-sm font-bold transition-colors ${
                                      active
                                        ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                                        : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                    }`}
                                  >
                                    {displayColor(colorVariant.color, group)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {variant ? (
                          <>
                            {/* 3 · Ukuran asal — stok 0 tetap bisa dipilih (barang sudah terjual) */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Ukuran asal
                                </p>
                                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                                  stok 0 tetap bisa dipilih
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                                {sizes.map((size) => {
                                  const active = item.size === size;
                                  const soldOut = (Number(stock[size]) || 0) <= 0;
                                  return (
                                    <button
                                      key={size}
                                      type="button"
                                      onClick={() =>
                                        updateManualItem(item.key, {
                                          size,
                                          price: "",
                                          replacement_size: "",
                                          replacement_price: "",
                                        })
                                      }
                                      className={`rounded-xl border-2 px-2 py-2 text-center transition-colors ${
                                        active
                                          ? "border-slate-900 bg-slate-900 dark:border-white dark:bg-white"
                                          : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                                      }`}
                                    >
                                      <span
                                        className={`block text-sm font-bold ${
                                          active ? "text-white dark:text-slate-900" : "text-slate-900 dark:text-white"
                                        }`}
                                      >
                                        {size}
                                      </span>
                                      <span
                                        className={`block text-[10px] font-bold ${
                                          active
                                            ? "text-white/80 dark:text-slate-700"
                                            : soldOut
                                              ? "text-slate-400 dark:text-slate-500"
                                              : "text-slate-500 dark:text-slate-400"
                                        }`}
                                      >
                                        {soldOut ? "habis" : `sisa ${Number(stock[size]) || 0}`}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 4 · Qty + kondisi */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className={labelClass}>Qty</label>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateManualItem(item.key, { qty: Math.max(1, Number(item.qty) - 1) })
                                    }
                                    disabled={Number(item.qty) <= 1}
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-slate-200 text-lg font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                    aria-label="Kurangi jumlah"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={item.qty}
                                    onChange={(event) =>
                                      updateManualItem(item.key, {
                                        qty: Math.max(1, Math.min(999, Number(String(event.target.value).replace(/\D/g, "")) || 1)),
                                      })
                                    }
                                    aria-label="Jumlah"
                                    className={`${inputClass} w-16 text-center`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateManualItem(item.key, { qty: Math.min(999, Number(item.qty) + 1) })
                                    }
                                    disabled={Number(item.qty) >= 999}
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-slate-200 text-lg font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                    aria-label="Tambah jumlah"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                              <div>
                                <label className={labelClass}>Kondisi</label>
                                <select
                                  value={item.condition}
                                  onChange={(event) => updateManualItem(item.key, { condition: event.target.value })}
                                  className={inputClass}
                                >
                                  <option value="sellable">Layak jual</option>
                                  <option value="damaged">Rusak / tidak layak</option>
                                </select>
                              </div>
                            </div>

                            {/* 5 · Ukuran pengganti */}
                            {isExchange ? (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    Ukuran pengganti
                                  </p>
                                  {!item.size ? (
                                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                                      pilih ukuran asal dulu
                                    </span>
                                  ) : null}
                                </div>
                                {item.size ? (
                                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                                    {sizes
                                      .filter((size) => size !== item.size)
                                      .map((size) => {
                                        const active = item.replacement_size === size;
                                        const sisa = Number(stock[size]) || 0;
                                        const insufficient = sisa < Number(item.qty);
                                        return (
                                          <button
                                            key={size}
                                            type="button"
                                            disabled={insufficient}
                                            onClick={() =>
                                              updateManualItem(item.key, {
                                                replacement_size: size,
                                                replacement_price: "",
                                              })
                                            }
                                            className={`rounded-xl border-2 px-2 py-2 text-center transition-colors ${
                                              active
                                                ? "border-slate-900 bg-slate-900 dark:border-white dark:bg-white"
                                                : insufficient
                                                  ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60 dark:border-slate-700 dark:bg-slate-900"
                                                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                                            }`}
                                          >
                                            <span
                                              className={`block text-sm font-bold ${
                                                active
                                                  ? "text-white dark:text-slate-900"
                                                  : insufficient
                                                    ? "text-slate-400 dark:text-slate-500"
                                                    : "text-slate-900 dark:text-white"
                                              }`}
                                            >
                                              {size}
                                            </span>
                                            <span
                                              className={`block text-[10px] font-bold ${
                                                active
                                                  ? "text-white/80 dark:text-slate-700"
                                                  : insufficient
                                                    ? "text-slate-400 dark:text-slate-500"
                                                    : "text-slate-500 dark:text-slate-400"
                                              }`}
                                            >
                                              {insufficient ? "stok kurang" : `sisa ${sisa}`}
                                            </span>
                                          </button>
                                        );
                                      })}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {isExchange && item.size && item.replacement_size ? (() => {
                              const catalogOriginal = Number(variant.prices?.[item.size]) || Number(variant.price) || 0;
                              const catalogReplacement =
                                Number(variant.prices?.[item.replacement_size]) || Number(variant.price) || 0;
                              const manualOriginal = Number(String(item.price || "").replace(/\D/g, "")) || 0;
                              const manualReplacement =
                                Number(String(item.replacement_price || "").replace(/\D/g, "")) || 0;
                              const original = manualOriginal > 0 ? manualOriginal : catalogOriginal;
                              const replacement = manualReplacement > 0 ? manualReplacement : catalogReplacement;
                              const diff = (replacement - original) * (Number(item.qty) || 1);
                              return (
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className={labelClass}>Harga asal</label>
                                      <input
                                        value={item.price}
                                        onChange={(event) =>
                                          updateManualItem(item.key, {
                                            price: String(event.target.value).replace(/\D/g, ""),
                                          })
                                        }
                                        inputMode="numeric"
                                        placeholder={`Katalog: Rp ${formatRupiah(catalogOriginal)}`}
                                        className={inputClass}
                                      />
                                    </div>
                                    <div>
                                      <label className={labelClass}>Harga pengganti</label>
                                      <input
                                        value={item.replacement_price}
                                        onChange={(event) =>
                                          updateManualItem(item.key, {
                                            replacement_price: String(event.target.value).replace(/\D/g, ""),
                                          })
                                        }
                                        inputMode="numeric"
                                        placeholder={`Katalog: Rp ${formatRupiah(catalogReplacement)}`}
                                        className={inputClass}
                                      />
                                    </div>
                                  </div>
                                  <p className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                                    Kosongkan untuk harga katalog. Isi manual kalau harga CYP/custom berbeda.
                                  </p>
                                  <p
                                    className={`text-[11px] font-bold ${
                                      diff > 0
                                        ? "text-amber-600 dark:text-amber-400"
                                        : diff < 0
                                          ? "text-blue-600 dark:text-blue-400"
                                          : "text-slate-500 dark:text-slate-400"
                                    }`}
                                  >
                                    Harga {item.size} Rp {formatRupiah(original)} → {item.replacement_size} Rp{" "}
                                    {formatRupiah(replacement)}
                                    {" · "}
                                    {diff === 0
                                      ? "harga sama"
                                      : diff > 0
                                        ? `customer bayar +Rp ${formatRupiah(diff)}`
                                        : `refund -Rp ${formatRupiah(Math.abs(diff))}`}
                                  </p>
                                </div>
                              );
                            })() : null}

                            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              Harga katalog: Rp {formatRupiah(variant.price || 0)}
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            Pilih warna dulu untuk melihat ukuran.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </>
        ) : order ? (
          <>
            <section className="rounded-2xl border border-slate-200 p-3.5 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pelanggan</p>
              <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{order.customer_name}</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{order.customer_whatsapp || "-"}</p>
              <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {order.shipping_address}
                {order.shipping_city ? `, ${order.shipping_city}` : ""}
              </p>
            </section>

            <section className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pilih produk</p>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Centang produk yang mau ditukar. Setelah dicentang, isi qty, kondisi, dan ukuran pengganti.
              </p>
              {(order.order_items || []).map((item) => {
                const value = selected[item.id];
                if (!value) return null;
                const stock = stockMapOf(item.product_id, item.color);
                const sizes = Object.entries(stock)
                  .filter(([size]) => size.toUpperCase() !== String(item.size || "").toUpperCase())
                  .sort(([a], [b]) => String(a).localeCompare(String(b)));
                return (
                  <div key={item.id} className={`rounded-2xl border p-3.5 ${value.checked ? "border-slate-900 dark:border-white" : "border-slate-200 dark:border-slate-800"}`}>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={value.checked}
                        onChange={(event) => updateItem(item.id, { checked: event.target.checked })}
                        className="mt-1 h-4 w-4 shrink-0 accent-slate-900 dark:accent-white"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{item.product_name}</p>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {[item.kain, item.series, item.color && item.color !== "default" ? item.color : null, item.size]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                        Rp {formatRupiah(item.price)}
                      </span>
                    </label>

                    {!value.checked ? (
                      <p className="mt-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                        Centang produk ini untuk mengisi qty dan ukuran pengganti.
                      </p>
                    ) : null}

                    {value.checked ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelClass}>Qty (maks {item.quantity})</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={value.qty}
                            onChange={(event) => {
                              const qty = Math.max(1, Math.min(item.quantity, Number(String(event.target.value).replace(/\D/g, "")) || 1));
                              updateItem(item.id, { qty });
                            }}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Kondisi</label>
                          <select
                            value={value.condition}
                            onChange={(event) => updateItem(item.id, { condition: event.target.value })}
                            className={inputClass}
                          >
                            <option value="sellable">Layak jual</option>
                            <option value="damaged">Rusak / tidak layak</option>
                          </select>
                        </div>
                        {isExchange ? (
                          <div className="col-span-2">
                            <label className={labelClass}>Ukuran pengganti</label>
                            <select
                              value={value.replacement_size}
                              onChange={(event) =>
                                updateItem(item.id, { replacement_size: event.target.value, replacement_price: "" })
                              }
                              className={inputClass}
                            >
                              <option value="">Pilih ukuran…</option>
                              {sizes.map(([size, valueStock]) => (
                                <option key={size} value={size} disabled={Number(valueStock) < Number(value.qty)}>
                                  {size} — sisa {Number(valueStock) || 0}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              Stok asal {item.size}: {Number(stock[item.size] || 0)}
                              {value.replacement_size
                                ? ` → ${value.replacement_size}: ${Number(stock[value.replacement_size] || 0)}`
                                : ""}
                            </p>
                            {value.replacement_size ? (() => {
                              const original = Number(item.price) || 0;
                              const catalogReplacement = priceOf(item.product_id, item.color, value.replacement_size);
                              const manualReplacement =
                                Number(String(value.replacement_price || "").replace(/\D/g, "")) || 0;
                              const replacement = manualReplacement > 0 ? manualReplacement : catalogReplacement;
                              const diff = (replacement - original) * (Number(value.qty) || 1);
                              return (
                                <div className="mt-2 space-y-1">
                                  <label className={labelClass}>Harga pengganti</label>
                                  <input
                                    value={value.replacement_price}
                                    onChange={(event) =>
                                      updateItem(item.id, {
                                        replacement_price: String(event.target.value).replace(/\D/g, ""),
                                      })
                                    }
                                    inputMode="numeric"
                                    placeholder={`Katalog: Rp ${formatRupiah(catalogReplacement)}`}
                                    className={inputClass}
                                  />
                                  <p className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                                    Kosongkan untuk harga katalog. Isi manual kalau harga CYP/custom berbeda.
                                  </p>
                                  <p
                                    className={`text-[11px] font-bold ${
                                      diff > 0
                                        ? "text-amber-600 dark:text-amber-400"
                                        : diff < 0
                                          ? "text-blue-600 dark:text-blue-400"
                                          : "text-slate-500 dark:text-slate-400"
                                    }`}
                                  >
                                    Harga {item.size} Rp {formatRupiah(original)} → {value.replacement_size} Rp{" "}
                                    {formatRupiah(replacement)}
                                    {" · "}
                                    {diff === 0
                                      ? "harga sama"
                                      : diff > 0
                                        ? `customer bayar +Rp ${formatRupiah(diff)}`
                                        : `refund -Rp ${formatRupiah(Math.abs(diff))}`}
                                  </p>
                                </div>
                              );
                            })() : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          </>
        ) : null}

        {order || manual ? (
          <>
            <section className="rounded-2xl border border-slate-200 p-3.5 dark:border-slate-800">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Ongkir balik</label>
                  <input value={shippingIn} onChange={(event) => setShippingIn(event.target.value)} inputMode="numeric" placeholder="0" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Ongkir pengganti</label>
                  <input value={shippingOut} onChange={(event) => setShippingOut(event.target.value)} inputMode="numeric" placeholder="0" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Ongkir dibayar customer?</label>
                  <select value={shippingPaid} onChange={(event) => setShippingPaid(event.target.value)} className={inputClass}>
                    <option value="unpaid">Belum dibayar</option>
                    <option value="paid">Sudah dibayar</option>
                  </select>
                </div>
                {type === "return" ? (
                  <>
                    <div>
                      <label className={labelClass}>Refund</label>
                      <input value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} inputMode="numeric" placeholder="0" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Metode refund</label>
                      <input value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)} placeholder="Transfer / Mayar" className={inputClass} />
                    </div>
                  </>
                ) : null}
              </div>
            </section>

            <section className="space-y-2">
              <div>
                <label className={labelClass}>Alasan</label>
                <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="mis. ukuran kekecilan" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Catatan</label>
                <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
              </div>
            </section>

            <div className={`rounded-2xl border p-3.5 ${isPanel ? "border-[#f3c7d6] bg-[#fdf3f7]" : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"}`}>
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                <AlertCircle size={14} /> Stok baru berubah setelah barang lama diterima.
              </p>
              {isExchange && selectedItems.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {selectedItems.map((item) => {
                    const value = selected[item.id];
                    const stock = stockMapOf(item.product_id, item.color);
                    if (!value?.replacement_size) return null;
                    return (
                      <p key={item.id} className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {item.size} +{value.qty} (jadi {Number(stock[item.size] || 0) + Number(value.qty)}) ·{" "}
                        {value.replacement_size} −{value.qty} (jadi {Number(stock[value.replacement_size] || 0) - Number(value.qty)})
                      </p>
                    );
                  })}
                </div>
              ) : null}
              {isExchange && manual ? (
                <div className="mt-2 space-y-1">
                  {manualItems.map((item) => {
                    const variant = variantOf(item.variant_id);
                    if (!variant || !item.size || !item.replacement_size) return null;
                    const stock = variant.stock_efektif || variant.stock || {};
                    return (
                      <p key={item.key} className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {item.size} +{item.qty} (jadi {Number(stock[item.size] || 0) + Number(item.qty)}) ·{" "}
                        {item.replacement_size} −{item.qty} (jadi {Number(stock[item.replacement_size] || 0) - Number(item.qty)})
                      </p>
                    );
                  })}
                </div>
              ) : null}
              {isExchange && differenceTotal !== 0 ? (
                <p
                  className={`mt-2 border-t pt-2 text-xs font-black ${
                    isPanel
                      ? "border-[#f3c7d6] text-[#c2255c]"
                      : differenceTotal > 0
                        ? "border-slate-200 text-amber-700 dark:border-slate-700 dark:text-amber-300"
                        : "border-slate-200 text-blue-700 dark:border-slate-700 dark:text-blue-300"
                  }`}
                >
                  Selisih harga:{" "}
                  {differenceTotal > 0
                    ? `+Rp ${formatRupiah(differenceTotal)} (customer bayar)`
                    : `-Rp ${formatRupiah(Math.abs(differenceTotal))} (refund ke customer)`}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="sticky bottom-0 -mx-5 mt-auto flex items-center gap-2 border-t border-slate-200 bg-white px-5 pb-1 pt-4 dark:border-slate-800 dark:bg-[#1a1d28]">
        <button type="button" onClick={onClose} className="rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Batal
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || saving}
          className={`ml-auto rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${accent}`}
        >
          {saving ? "Menyimpan…" : "Ajukan Retur"}
        </button>
      </div>
    </DrawerShell>
  );
}

/* ───────────────────────── Detail drawer ───────────────────────── */

function ReturnDetailDrawer({ record, isPanel, accent, accentSoft, onClose, onChanged, onDeleted }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [editing, setEditing] = useState(false);
  const [shippingIn, setShippingIn] = useState(String(record.shipping_in_cost || ""));
  const [shippingOut, setShippingOut] = useState(String(record.shipping_out_cost || ""));
  const [shippingPaid, setShippingPaid] = useState(record.shipping_payment_status || "unpaid");
  const [inAwb, setInAwb] = useState(record.shipping_in_awb || "");
  const [refundAmount, setRefundAmount] = useState(String(record.refund_amount || ""));
  const [refundMethod, setRefundMethod] = useState(record.refund_method || "");
  const [refundStatus, setRefundStatus] = useState(record.refund_status || "");
  const [addr, setAddr] = useState(record.shipping_address || "");
  const [city, setCity] = useState(record.shipping_city || "");
  const [kec, setKec] = useState(record.shipping_kecamatan || "");
  const [postal, setPostal] = useState(record.shipping_postal_code || "");

  const isExchange = record.type === "tukar_size";
  const final = ["selesai", "ditolak", "dibatalkan"].includes(record.status);

  const run = async (action, label) => {
    setBusy(action);
    setError("");
    try {
      const updated = await base44.entities.Return.update(record.return_number, action);
      onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Gagal ${label}`);
    } finally {
      setBusy("");
    }
  };

  const settleDifference = async () => {
    setBusy("settle");
    setError("");
    try {
      const updated = await base44.entities.Return.update(record.return_number, "settle_difference", {
        method: "manual",
      });
      onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan selisih harga");
    } finally {
      setBusy("");
    }
  };

  const deleteReturn = async () => {
    const ok = window.confirm(
      "Hapus permanen retur ini?\n\nStok yang sudah diterapkan akan dibalik dulu. Tindakan ini tidak bisa dibatalkan.",
    );
    if (!ok) return;
    setBusy("delete");
    setError("");
    try {
      await base44.entities.Return.remove(record.return_number);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus retur");
    } finally {
      setBusy("");
    }
  };

  const settleRefund = async () => {
    setBusy("refund");
    setError("");
    try {
      const updated = await base44.entities.Return.update(record.return_number, "settle_refund");
      onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menandai refund");
    } finally {
      setBusy("");
    }
  };

  const saveSettings = async () => {
    setBusy("update");
    setError("");
    try {
      const updated = await base44.entities.Return.update(record.return_number, "update", {
        shipping_in_cost: Number(String(shippingIn).replace(/\D/g, "")) || 0,
        shipping_out_cost: Number(String(shippingOut).replace(/\D/g, "")) || 0,
        shipping_payment_status: shippingPaid,
        shipping_in_awb: inAwb,
        refund_amount: Number(String(refundAmount).replace(/\D/g, "")) || 0,
        refund_method: refundMethod,
        refund_status: refundStatus,
        ...(!record.order_id && (addr || city || kec || postal)
          ? {
              shipping_address: addr,
              shipping_city: city,
              shipping_kecamatan: kec,
              shipping_postal_code: postal,
            }
          : {}),
      });
      onChanged(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setBusy("");
    }
  };

  const createResi = async () => {
    setBusy("resi");
    setError("");
    try {
      const result = await base44.entities.Return.createResi(record.return_number);
      onChanged(result.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat resi");
    } finally {
      setBusy("");
    }
  };

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(""), 1400);
    } catch {
      /* abaikan */
    }
  };

  const openLabel = () => {
    if (!record.shipping_out_awb) return;
    const labelBase = window.location.pathname.startsWith("/panel-admin") ? "/panel-admin/label" : "/admin/label";
    window.open(`${labelBase}/${encodeURIComponent(record.return_number)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <DrawerShell
      title={`Retur ${record.return_number}`}
      subtitle={`${TYPE_LABEL[record.type]} · ${formatTanggalJamID(record.created_at)}`}
      onClose={onClose}
      isPanel={isPanel}
    >
      <div className="space-y-4">
        {/* Ringkasan: status + asal retur, tanpa mengulang nomor retur (sudah di judul). */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={record.status} />
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {TYPE_LABEL[record.type]}
            </span>
            {!record.order_id ? (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                Tanpa pesanan asal
              </span>
            ) : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">No. Pesanan</dt>
              <dd className="mt-0.5 truncate font-mono text-xs font-bold text-slate-800 dark:text-slate-100" title={record.order_number}>
                {!record.order_id ? "—" : record.order_number}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Resi</dt>
              <dd className="mt-0.5 truncate font-mono text-xs font-bold text-slate-800 tabular-nums dark:text-slate-100" title={record.shipping_out_awb || record.shipping_in_awb || "—"}>
                {record.shipping_out_awb || record.shipping_in_awb || "—"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Diajukan</dt>
              <dd className="mt-0.5 text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                {formatTanggalJamID(record.created_at)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Jumlah item</dt>
              <dd className="mt-0.5 text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                {(record.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0)} pcs
              </dd>
            </div>
          </dl>
        </div>

        {error ? (
          <p className="flex items-start gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
            <AlertCircle size={14} className="mt-px shrink-0" /> {error}
          </p>
        ) : null}

        <section className="rounded-2xl border border-slate-200 p-3.5 dark:border-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pelanggan</p>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="min-w-0 truncate text-sm font-bold text-slate-900 dark:text-white">{record.customer_name}</p>
            <p className="shrink-0 text-xs font-semibold text-slate-500 tabular-nums dark:text-slate-400">{record.customer_whatsapp || "-"}</p>
          </div>
          {record.shipping_address ? (
            <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
              {record.shipping_address}
              {record.shipping_city ? `, ${record.shipping_city}` : ""}
              {record.shipping_kecamatan ? `, ${record.shipping_kecamatan}` : ""}
              {record.shipping_postal_code ? ` ${record.shipping_postal_code}` : ""}
            </p>
          ) : null}
          {record.reason ? <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Alasan: {record.reason}</p> : null}
          {record.notes ? <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{record.notes}</p> : null}
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Produk</p>
          {(record.items || []).map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white" title={item.product_name}>
                    {item.product_name}
                  </p>
                  <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {[item.color && item.color !== "default" ? item.color : null, item.size, item.condition === "damaged" ? "rusak" : "layak jual"]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900 tabular-nums dark:text-white">×{item.qty}</p>
                  {isExchange && item.replacement_size ? (
                    <p className={`text-[11px] font-bold ${isPanel ? "text-[#c2255c]" : "text-slate-700 dark:text-slate-200"}`}>
                      → {item.replacement_size}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </section>

        {isExchange && Number(record.price_difference_total || 0) !== 0 ? (
          <section className="rounded-2xl border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Selisih Harga
              </p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  record.price_difference_status === "settled"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300"
                    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300"
                }`}
              >
                {record.price_difference_status === "settled" ? "Selesai" : "Belum selesai"}
              </span>
            </div>

            <p
              className={`mt-1 text-lg font-black ${
                Number(record.price_difference_total) > 0
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-blue-700 dark:text-blue-300"
              }`}
            >
              {Number(record.price_difference_total) > 0
                ? `+Rp ${formatRupiah(record.price_difference_total)}`
                : `-Rp ${formatRupiah(Math.abs(Number(record.price_difference_total)))}`}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {Number(record.price_difference_total) > 0 ? "Customer bayar tambahan" : "Refund ke customer"}
              {record.price_difference_method ? ` · ${record.price_difference_method}` : ""}
            </p>

            <div className="mt-2 space-y-1">
              {(record.items || [])
                .filter((item) => Number(item.price_difference) !== 0)
                .map((item) => (
                  <p key={item.id} className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {item.product_name} · {item.size} → {item.replacement_size}: Rp {formatRupiah(item.price)} → Rp{" "}
                    {formatRupiah(item.replacement_price)} ·{" "}
                    <span className={Number(item.price_difference) > 0 ? "text-amber-700 dark:text-amber-300" : "text-blue-700 dark:text-blue-300"}>
                      {Number(item.price_difference) > 0
                        ? `+Rp ${formatRupiah(item.price_difference)}`
                        : `-Rp ${formatRupiah(Math.abs(Number(item.price_difference)))}`}
                    </span>
                  </p>
                ))}
            </div>

            {record.price_difference_status !== "settled" &&
            record.status !== "dibatalkan" &&
            record.status !== "ditolak" ? (
              <button
                type="button"
                onClick={settleDifference}
                disabled={Boolean(busy)}
                className={`mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${accent}`}
              >
                {busy === "settle"
                  ? "Menyimpan…"
                  : Number(record.price_difference_total) > 0
                    ? "Tandai Sudah Dibayar"
                    : "Tandai Sudah Direfund"}
              </button>
            ) : null}
            {record.price_difference_status === "settled" && record.price_difference_settled_at ? (
              <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Diselesaikan {formatTanggalJamID(record.price_difference_settled_at)}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 p-3.5 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pengiriman & Refund</p>
            {!final ? (
              <button type="button" onClick={() => setEditing((v) => !v)} className={`text-[11px] font-bold ${isPanel ? "text-[#c2255c]" : "text-slate-700 underline dark:text-slate-200"}`}>
                {editing ? "Tutup" : "Ubah"}
              </button>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Ongkir balik</label>
                <input value={shippingIn} onChange={(event) => setShippingIn(event.target.value)} inputMode="numeric" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Ongkir pengganti</label>
                <input value={shippingOut} onChange={(event) => setShippingOut(event.target.value)} inputMode="numeric" className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Status bayar ongkir</label>
                <select value={shippingPaid} onChange={(event) => setShippingPaid(event.target.value)} className={inputClass}>
                  <option value="unpaid">Belum dibayar</option>
                  <option value="paid">Sudah dibayar</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelClass}>AWB barang balik (dari customer)</label>
                <input value={inAwb} onChange={(event) => setInAwb(event.target.value)} className={inputClass} />
              </div>
              {!record.order_id ? (
                <>
                  <div className="col-span-2">
                    <label className={labelClass}>Alamat pengganti</label>
                    <input value={addr} onChange={(event) => setAddr(event.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Kota</label>
                    <input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Kecamatan</label>
                    <input value={kec} onChange={(event) => setKec(event.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Kode pos</label>
                    <input value={postal} onChange={(event) => setPostal(event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" className={inputClass} />
                  </div>
                </>
              ) : null}
              {record.type === "return" ? (
                <>
                  <div>
                    <label className={labelClass}>Refund</label>
                    <input value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} inputMode="numeric" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Metode</label>
                    <input value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Status refund</label>
                    <input value={refundStatus} onChange={(event) => setRefundStatus(event.target.value)} placeholder="mis. diproses / selesai" className={inputClass} />
                  </div>
                </>
              ) : null}
              <button
                type="button"
                onClick={saveSettings}
                disabled={busy === "update"}
                className={`col-span-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${accent}`}
              >
                {busy === "update" ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          ) : (
            <div className="mt-2 space-y-1.5 text-sm">
              <Row label="Ongkir balik" value={`Rp ${formatRupiah(record.shipping_in_cost || 0)}`} />
              <Row label="Ongkir pengganti" value={`Rp ${formatRupiah(record.shipping_out_cost || 0)}`} />
              <Row label="Ongkir dibayar" value={record.shipping_payment_status === "paid" ? "Sudah" : "Belum"} />
              <Row label="AWB balik" value={record.shipping_in_awb || "-"} />
              {isExchange ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">AWB pengganti</span>
                  <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {record.shipping_out_awb || "-"}
                    {record.shipping_out_awb ? (
                      <button type="button" onClick={() => copy(record.shipping_out_awb, "out")} className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" aria-label="Salin resi">
                        {copied === "out" ? <Check size={12} /> : <Clipboard size={12} />}
                      </button>
                    ) : null}
                  </span>
                </div>
              ) : null}
              {record.type === "return" ? (
                <>
                  <Row label="Refund" value={`Rp ${formatRupiah(record.refund_amount || 0)}`} />
                  <Row label="Metode refund" value={record.refund_method || "-"} />
                  <Row
                    label="Status refund"
                    value={record.refund_settled_at ? "Sudah dibayar" : "Belum ditandai selesai"}
                  />
                  {record.refund_settled_at ? (
                    <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Refund selesai {formatTanggalJamID(record.refund_settled_at)}
                    </p>
                  ) : null}
                  {!record.refund_settled_at &&
                  Number(record.refund_amount) > 0 &&
                  record.status !== "dibatalkan" &&
                  record.status !== "ditolak" ? (
                    <button
                      type="button"
                      onClick={settleRefund}
                      disabled={Boolean(busy)}
                      className={`mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${accent}`}
                    >
                      {busy === "refund" ? "Menyimpan…" : "Tandai Refund Selesai"}
                    </button>
                  ) : null}
                </>
              ) : null}
              {!record.order_id && isExchange && !record.shipping_address ? (
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  Isi alamat lewat tombol Ubah agar resi pengganti bisa dibuat.
                </p>
              ) : null}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 p-3.5 dark:border-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Riwayat</p>
          <div className="mt-2 space-y-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <p>Diajukan: {formatTanggalJamID(record.created_at)}</p>
            {record.approved_at ? <p>Disetujui: {formatTanggalJamID(record.approved_at)}</p> : null}
            {record.received_at ? <p>Barang diterima: {formatTanggalJamID(record.received_at)}</p> : null}
            {record.completed_at ? <p>Selesai: {formatTanggalJamID(record.completed_at)}</p> : null}
            {record.cancelled_at ? <p>Dibatalkan: {formatTanggalJamID(record.cancelled_at)}</p> : null}
            <p>Pergerakan stok: {record.stock_applied_at ? "sudah diterapkan" : "belum"}</p>
          </div>
        </section>

        {!final ? (
          <div className="space-y-2">
            {record.status === "diajukan" ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => run("reject", "menolak")} disabled={Boolean(busy)} className="rounded-xl border-2 border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/20">
                  Tolak
                </button>
                <button type="button" onClick={() => run("approve", "menyetujui")} disabled={Boolean(busy)} className={`ml-auto rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${accent}`}>
                  {busy === "approve" ? "Menyetujui…" : "Setujui"}
                </button>
              </div>
            ) : null}

            {record.status === "disetujui" ? (
              <button type="button" onClick={() => run("receive", "menerima barang")} disabled={Boolean(busy)} className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${accent}`}>
                {busy === "receive" ? "Memproses stok…" : "Barang Diterima & Terapkan Stok"}
              </button>
            ) : null}

            {record.status === "barang_diterima" && isExchange && !record.shipping_out_awb ? (
              <button type="button" onClick={createResi} disabled={Boolean(busy)} className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${accent}`}>
                <Truck size={15} className="mr-1.5 inline" /> {busy === "resi" ? "Membuat resi…" : "Buat Resi Pengganti"}
              </button>
            ) : null}

            {isExchange && record.shipping_out_awb ? (
              <button
                type="button"
                onClick={openLabel}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Printer size={15} /> Cetak Resi Pengganti
              </button>
            ) : null}

            {["barang_diterima", "pengganti_dikirim"].includes(record.status) ? (
              <button type="button" onClick={() => run("complete", "menyelesaikan")} disabled={Boolean(busy) || (isExchange && !record.shipping_out_awb)} className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 ${accent}`}>
                {busy === "complete" ? "Menyelesaikan…" : "Selesaikan"}
              </button>
            ) : null}

            <button type="button" onClick={() => run("cancel", "membatalkan")} disabled={Boolean(busy)} className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              {busy === "cancel" ? "Membatalkan…" : "Batalkan Retur"}
            </button>
          </div>
        ) : null}

        <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={deleteReturn}
            disabled={Boolean(busy)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/20"
          >
            <Trash2 size={15} /> {busy === "delete" ? "Menghapus…" : "Hapus Data Retur"}
          </button>
          <p className="mt-1 text-center text-[10px] font-semibold text-slate-400">
            Khusus koreksi/data uji — stok dibalik otomatis.
          </p>
        </div>
      </div>
    </DrawerShell>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-semibold text-slate-900 dark:text-white">{value}</span>
    </div>
  );
}

function DrawerShell({ title, subtitle, onClose, isPanel, children }) {
  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full flex-col bg-white shadow-2xl dark:bg-[#1a1d28] sm:max-w-[560px]">
        <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Tutup">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
