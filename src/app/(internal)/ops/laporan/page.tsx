"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import * as LucideIcons from "lucide-react";
import PanelDetailPesanan, { PanelDetailShell } from "@/components/ops/transaksi/PanelDetailPesanan";

/** Gambar kosong 1x1 untuk item tanpa foto (drawer butuh atribut src). */
const BLANK_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  RefreshCw,
  Search,
  Store,
  X,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { statusLabel, orderSourceLabel } from "@/lib/transaksi";
import CountUp from "@/components/admin/CountUp";
import BestSellerSection from "@/components/ops/BestSellerSection";
import BreakdownPengeluaran, { type BreakdownData } from "@/components/ops/laporan/BreakdownPengeluaran";
import RincianFreeGift, { type FreeGiftData } from "@/components/ops/laporan/RincianFreeGift";

/**
 * Sebagian ikon lucide ada di runtime tapi belum masuk definisi tipe versi ini —
 * pola namespace yang sama dengan Dashboard ops (`src/app/ops/dashboard/page.tsx`).
 */
const IconReport: any = (LucideIcons as any).BarChart3 ?? (LucideIcons as any).ChartColumn ?? (LucideIcons as any).ChartLine;
const IconWallet: any =
  (LucideIcons as any).Wallet ?? (LucideIcons as any).WalletMinimal ?? (LucideIcons as any).Banknote;
const IconPackage: any = (LucideIcons as any).Package;
const IconOmset: any = (LucideIcons as any).DollarSign ?? (LucideIcons as any).Coins ?? (LucideIcons as any).Banknote;
const IconProfit: any = (LucideIcons as any).TrendingUp ?? (LucideIcons as any).LineChart;
const IconLayers: any = (LucideIcons as any).Layers ?? (LucideIcons as any).Receipt;

/* ───────────────────────── types ───────────────────────── */

type Period = {
  from: string;
  to: string;
  days: number;
  label: string;
  previous: { from: string; to: string; label: string };
};

type Summary = {
  gross: number;
  refunds: number;
  refundsPending: number;
  refundsPendingCount: number;
  exchange: number;
  exchangePending: number;
  exchangePendingCount: number;
  net: number;
  hpp: number;
  biaya: number;
  /** null = laba belum dapat dihitung (modal/biaya belum lengkap). */
  profit: number | null;
  /** null = margin belum dapat dihitung secara valid. */
  margin: number | null;
  transactions: number;
  aov: number;
  /**
   * Rekap promosi cover hanger pada periode ini (nilai yang digratiskan).
   * Bukan pengurang omzet — omzet sudah memakai `total` setelah diskon.
   * Opsional: respons lama tanpa field ini tetap tampil normal.
   */
  promoTotal?: number;
  promoOrders?: number;
  promoCoverQty?: number;
  /**
   * Rincian HPP barang yang dibagikan gratis (free gift/promosi) pada periode ini.
   * Opsional: respons lama tanpa field ini tetap tampil normal (kartu kosong).
   */
  freeGift?: FreeGiftData;
  hppReversal: boolean;
  biayaNote: string;
  hppStatus: HppStatus;
  hppNote: string;
  hppCoverage: { totalQty: number; knownQty: number; missingQty: number; missingOrders: number };
  biayaAvailable: boolean;
  /**
   * Biaya transaksi Mayar (potongan gateway + layanan) untuk transaksi yang sudah CAIR.
   * Opsional: respons lama tanpa field ini tetap tampil normal.
   */
  mayarFee?: number;
  /** Jumlah transaksi Mayar yang sudah dibayar tapi belum cair (biayanya belum terpotong). */
  mayarPendingCount?: number;
  biayaOperasional?: number;
  biayaPacking?: number;
  /** false = tabel pengeluaran belum ada / belum terbaca. */
  expensesAvailable?: boolean;
  profitStatus: ProfitStatus;
  profitNote: string;
};

type HppStatus = "complete" | "partial" | "missing";
type ProfitStatus = "valid" | "partial" | "unavailable";

type TrendPoint = {
  key: string;
  label: string;
  gross: number;
  net: number;
  /** null = modal belum lengkap, garis laba tidak ditampilkan. */
  profit: number | null;
};

/** Sebaran omzet per metode pembayaran (dihitung di server). */
type PaymentBreakdownRow = {
  key: string;
  label: string;
  count: number;
  amount: number;
  /** Porsi nominal omzet (0–100), bukan porsi jumlah transaksi. */
  share: number;
};

/** Sebaran omzet per SUMBER pesanan (Website, Reseller, Open Order, …). */
type SourceBreakdownRow = PaymentBreakdownRow;

type ReportData = {
  period: Period;
  summary: Summary;
  previous: {
    gross: number;
    refunds: number;
    exchange: number;
    net: number;
    hpp: number;
    profit: number | null;
  };
  deltas: { gross: number | null; net: number | null; profit: number | null };
  trend: { type: "day" | "week" | "month"; points: TrendPoint[] };
  payments: PaymentBreakdownRow[];
  /** Opsional: laporan lama/response tanpa field ini tetap tampil normal. */
  sources?: SourceBreakdownRow[];
  /** Rincian biaya per produk/kanal/pengeluaran — opsional (respons lama tanpa ini tetap tampil). */
  breakdown?: BreakdownData;
  tables: {
    sales: any[];
    returns: any[];
    exchanges: any[];
    /** Biaya Mayar yang sudah cair — `fee`/`net` angka pasti dari Mayar. */
    mayarSettled?: any[];
    /** Pesanan Mayar yang belum cair — biaya belum tersedia (tidak ditebak). */
    mayarPending?: any[];
  };
};

type Tab = "returns" | "exchanges" | "sales" | "mayar-settled" | "mayar-pending";

/* ───────────────────────── helpers ───────────────────────── */

const BIZ_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

const nfmt = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });

/** Urutan warna bar metode pembayaran — semakin gelap, semakin besar porsinya. */
const PAYMENT_BAR = ["bg-slate-900", "bg-slate-700", "bg-slate-500", "bg-slate-400", "bg-slate-300"];

const rp = (v: number | null | undefined) => `Rp ${nfmt(v)}`;

const rpSigned = (v: number | null | undefined) => {
  const n = Number(v) || 0;
  if (n === 0) return "Rp 0";
  return `${n > 0 ? "+" : "−"}Rp ${nfmt(Math.abs(n))}`;
};

const compact = (v: number | null | undefined) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}M`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000).toLocaleString("id-ID")}rb`;
  return nfmt(n);
};

const dateTime = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
};

/**
 * Nilai gratis cover hanger pada satu pesanan: cover berharga 0 atau diskon yang menempel.
 *
 * Semua varian cover dihitung (Cover Thobe + Hanger, Cover Koko + Hanger, dan varian lama
 * "Set Hanger + Cover"); cover Rp0 (promo website) dihitung penuh, diskon pesanan dibatasi nilai
 * kotor baris cover — sama dengan `promoValueOf()` di `/api/ops/laporan`, supaya kolom tabel dan
 * kartu Promosi tidak bisa beda.
 */
const fchDiscountOf = (row: any): number => {
  const items = Array.isArray(row?.items) ? row.items : [];
  const coverLines = items.filter((item: any) => {
    const id = String(item?.product_id || "");
    return id === "cover-hanger" || id === "addon-cover-hanger";
  });
  if (!coverLines.length) return 0;
  // `coverGross` = nilai cover yang benar-benar dibayar; hanya bagian itu yang boleh ditutup
  // diskon pesanan. Cover Rp0 (promo website) tetap bernilai penuh walau nilai kotornya nol.
  const coverGross = coverLines.reduce(
    (sum: number, item: any) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 1),
    0,
  );
  const coverValue = coverLines.reduce(
    (sum: number, item: any) =>
      sum + Math.max(0, 35000 - (Number(item?.price) || 0)) * (Number(item?.quantity) || 1),
    0,
  );
  return coverValue + Math.min(Number(row?.discount) || 0, coverGross);
};

const dateOnly = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
};

function todayKey() {
  return new Date(Date.now() + BIZ_OFFSET_MS).toISOString().slice(0, 10);
}

function currentMonthKey() {
  return todayKey().slice(0, 7);
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const RETURN_STATUS: Record<string, { label: string; tone: string }> = {
  diajukan: { label: "Diajukan", tone: "amber" },
  disetujui: { label: "Disetujui", tone: "blue" },
  barang_diterima: { label: "Barang Diterima", tone: "indigo" },
  pengganti_dikirim: { label: "Pengganti Dikirim", tone: "violet" },
  selesai: { label: "Selesai", tone: "green" },
  ditolak: { label: "Ditolak", tone: "gray" },
  dibatalkan: { label: "Dibatalkan", tone: "red" },
};

const TONE: Record<string, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300",
  blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-900/20 dark:text-blue-300",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-900/20 dark:text-indigo-300",
  violet: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-900/20 dark:text-violet-300",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300",
  gray: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300",
};

function Badge({ tone = "gray", children }: { tone?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${TONE[tone] || TONE.gray}`}>
      {children}
    </span>
  );
}

/**
 * Kartu ringkasan biaya Mayar.
 *
 * Dua kartu pertama bisa diklik → membuka tabel rinciannya di bawah (selection sendiri,
 * terpisah dari Retur/Tukar Size/Penjualan). Kartu ketiga hanya informasi total.
 * Gaya mengikuti kartu "Metode Pembayaran" di halaman yang sama: label kecil, angka besar,
 * bar tipis, keterangan di bawah — supaya bahasanya seragam.
 */
function MayarSummaryCard({
  label,
  value,
  format = (n) => String(Math.round(n)),
  caption,
  bar,
  tone,
  active,
  onClick,
}: {
  label: string;
  /** Angka mentah — dihitung naik oleh `CountUp`. */
  value: number;
  format?: (n: number) => string;
  caption: string;
  /** 0–100; kosong = tanpa bar (kartu informasi). */
  bar?: number;
  tone: "emerald" | "amber" | "slate";
  active?: boolean;
  onClick?: () => void;
}) {
  const palette = {
    emerald: { text: "text-emerald-600", barBg: "bg-emerald-500", ring: "border-emerald-300" },
    amber: { text: "text-amber-600", barBg: "bg-amber-500", ring: "border-amber-300" },
    slate: { text: "text-slate-900", barBg: "bg-slate-400", ring: "border-slate-300" },
  }[tone];

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`flex w-full flex-col rounded-2xl border p-4 text-left transition-all duration-300 ${
        active ? `${palette.ring} bg-white ring-2 ring-slate-900/5` : "border-[#E5E7EB] bg-white"
      } ${
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_26px_-22px_rgba(16,24,40,0.55)]"
          : "hover:shadow-[0_14px_26px_-24px_rgba(16,24,40,0.45)]"
      }`}
    >
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className={`mt-1 text-xl font-black tabular-nums ${palette.text}`}>
        <CountUp value={value} format={format} />
      </span>
      {typeof bar === "number" ? (
        <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-[#E4E4E7]">
          <span
            className={`lpr-bar block h-full rounded-full ${palette.barBg}`}
            style={{ width: `${Math.max(2, Math.min(100, bar))}%` }}
          />
        </span>
      ) : null}
      <span className="mt-2 text-[11px] font-semibold text-slate-500">{caption}</span>
    </Wrapper>
  );
}

/**
 * Tile metrik kartu Laporan Keuangan — label uppercase, nilai besar, keterangan, ikon bulat
 * di kanan; permukaan terang di dalam kartu abu `#EFEFF1`. Angka tetap dari API laporan
 * (satu sumber hitungan).
 */
function ReportMetric({
  icon: Icon,
  label,
  value,
  format,
  caption,
  title,
  badge,
  muted,
  delay = 0,
}: {
  icon: any;
  label: string;
  /** Angka mentah kartu — dihitung naik oleh `CountUp`, bukan string jadi. */
  value: number | null;
  /** Pemformat angka per frame animasi (rupiah / jumlah). */
  format: (n: number) => string;
  caption: string;
  title?: string;
  badge?: { label: string; cls: string };
  muted?: boolean;
  /** Jeda animasi masuk (ms) supaya keempat tile muncul berurutan. */
  delay?: number;
}) {
  return (
    <div
      className={`lpr-rise group relative flex flex-col overflow-hidden rounded-2xl border border-[#E4E4E7] bg-[#FAFAFA] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_16px_30px_-24px_rgba(16,24,40,0.5)] ${
        muted ? "opacity-95" : ""
      }`}
      style={{ animationDelay: `${delay}ms` }}
      title={title}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
      />
      <span className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">{label}</span>
      <p
        className={`mt-2 whitespace-nowrap text-[clamp(1.05rem,1.6vw,1.45rem)] font-black leading-tight tabular-nums ${
          muted ? "text-zinc-400" : "text-zinc-900"
        }`}
      >
        {value === null ? "—" : <CountUp value={value} format={format} />}
      </p>
      <div className="mt-1 flex min-h-[30px] flex-wrap items-center gap-1.5 pr-9">
        {badge ? (
          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black tracking-wider ${badge.cls}`}>
            {badge.label}
          </span>
        ) : null}
        <span className="text-[11px] font-semibold leading-snug text-zinc-500">{caption}</span>
      </div>
      <span className="absolute bottom-4 right-4 grid h-8 w-8 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-400 transition-colors duration-300 group-hover:border-zinc-900 group-hover:bg-zinc-900 group-hover:text-white">
        <Icon size={15} strokeWidth={1.8} />
      </span>
    </div>
  );
}

async function fetchReport(month: string): Promise<ReportData> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const params = new URLSearchParams({ month });
  const res = await fetch(`/api/ops/laporan?${params.toString()}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Gagal memuat laporan (${res.status})`);
  return json as ReportData;
}

/* ───────────────────────── page ───────────────────────── */

export default function LaporanKeuanganPage() {
  const thisMonth = currentMonthKey();
  const [month, setMonth] = useState(thisMonth);
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => shiftMonth(thisMonth, -index)),
    [thisMonth],
  );
  const [tab, setTab] = useState<Tab>("returns");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "created_at", dir: "desc" });
  const [selected, setSelected] = useState<{ kind: Tab; row: any } | null>(null);
  const [series, setSeries] = useState({ gross: true, net: true, profit: false });
  const tableRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<ReportData>({
    queryKey: ["ops-laporan", month],
    queryFn: () => fetchReport(month),
    staleTime: 30_000,
  });

  useEffect(() => {
    setPage(1);
    setStatusFilter("all");
    setSort({ key: "created_at", dir: "desc" });
  }, [tab, search, month]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (!selected) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected]);

  const goToTab = (next: Tab) => {
    setTab(next);
    setStatusFilter("all");
    setSearch("");
    requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  if (isLoading) return <ReportSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto text-red-500" size={28} />
        <h1 className="mt-3 text-lg font-black text-slate-900">Laporan gagal dimuat</h1>
        <p className="mt-1 text-sm text-slate-500">{error instanceof Error ? error.message : "Coba lagi."}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <RefreshCw size={15} /> Coba lagi
        </button>
      </div>
    );
  }

  const s = data.summary;
  const payments = data.payments || [];
  const sources = data.sources || [];

  /* ── Ringkasan Biaya Mayar (kartu) ── */
  const mayarSettledRows = data.tables.mayarSettled || [];
  const mayarPendingRows = data.tables.mayarPending || [];
  /** Total biaya transaksi yang sudah cair — angka final dari Mayar. */
  const mayarSettledTotal = mayarSettledRows.reduce((sum, row) => sum + (Number(row.fee) || 0), 0);
  /** Total nominal yang dibayar customer tetapi dananya belum cair. */
  const mayarPendingTotal = mayarPendingRows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  /** Jumlah transaksi Mayar bulan ini = yang sudah cair + yang menunggu cair. */
  const mayarAllCount = mayarSettledRows.length + mayarPendingRows.length;
  /** Porsi transaksi yang sudah cair (untuk bar di kartu). */
  const mayarSettledShare =
    mayarAllCount > 0 ? Math.round((mayarSettledRows.length / mayarAllCount) * 100) : 0;

  const profitPositive = (s.profit ?? 0) >= 0;
  const pendingEmpty = s.refundsPendingCount === 0 && s.exchangePendingCount === 0;
  const profitBadge =
    s.profitStatus === "valid"
      ? profitPositive
        ? { label: "PROFIT", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" }
        : { label: "RUGI", cls: "bg-red-50 text-red-700 border-red-100" }
      : s.profitStatus === "partial"
        ? { label: "BELUM FINAL", cls: "bg-amber-50 text-amber-700 border-amber-100" }
        : { label: "BELUM TERSEDIA", cls: "bg-slate-50 text-slate-500 border-slate-200" };
  const seriesOptions = [
    { key: "gross", label: "Penjualan", color: "#A1A1AA" },
    { key: "net", label: "Setelah Retur", color: "#18181B" },
    ...(s.profitStatus === "valid" ? [{ key: "profit", label: "Estimasi Laba", color: "#52525B" }] : []),
  ];

  /* ── Komposisi "uang pergi ke mana" — porsi dari Penjualan Setelah Retur ── */
  const statusDot =
    s.profitStatus === "valid" ? "bg-emerald-500" : s.profitStatus === "partial" ? "bg-amber-400" : "bg-zinc-300";
  const compositionBase = Math.max(0, s.net);
  const compositionParts: { key: string; label: string; value: number; color: string }[] = [];
  if (s.hppStatus !== "missing") {
    compositionParts.push({ key: "hpp", label: "Modal", value: Math.max(0, s.hpp), color: "#18181B" });
  }
  if (s.expensesAvailable !== false) {
    compositionParts.push({
      key: "biaya",
      label: "Operasional",
      value: Math.max(0, (s.biayaOperasional || 0) + (s.biayaPacking || 0)),
      color: "#6B6B75",
    });
  }
  compositionParts.push({ key: "mayar", label: "Mayar", value: Math.max(0, s.mayarFee || 0), color: "#A1A1AA" });
  if (s.profit !== null && s.profit > 0) {
    compositionParts.push({ key: "laba", label: "Laba", value: s.profit, color: "#34D399" });
  }
  const compositionVisible = compositionParts.filter((part) => part.value > 0);
  const compositionKnown = compositionVisible.reduce((sum, part) => sum + part.value, 0);
  const compositionUnknown = Math.max(0, compositionBase - compositionKnown);
  const compositionPct = (value: number) =>
    compositionBase > 0 ? Math.round((value / compositionBase) * 1000) / 10 : 0;
  const showComposition = compositionBase > 0 && (s.profit === null || s.profit >= 0);

  return (
    <div className="-m-4 space-y-5 bg-white p-4 md:-m-6 md:p-6 lg:-m-8 lg:p-8">
      {/* HEADER + KPI — satu kartu laporan, palet monokrom SAMAQU */}
      <section className="lpr-rise relative overflow-hidden rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_24px_48px_-40px_rgba(16,24,40,0.45)] md:p-7">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-zinc-900 text-white shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)]">
              <IconReport size={24} />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900 md:text-[28px]">Laporan Keuangan</h1>
              <p className="mt-1 text-sm font-medium text-zinc-500">Analisis performa bisnis secara mendalam</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isFetching ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-bold text-zinc-500">
                <RefreshCw size={12} className="animate-spin" /> Memperbarui…
              </span>
            ) : null}
            <Link
              href="/ops"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
            >
              <ChevronLeft size={15} /> Dashboard
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-black"
            >
              <Download size={14} /> Export PDF
            </button>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              aria-label="Pilih bulan laporan"
              className="rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 outline-none transition-colors hover:bg-zinc-50"
            >
              {monthOptions.map((value) => (
                <option key={value} value={value}>
                  {monthLabel(value)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {[
            { key: thisMonth, label: "Bulan Ini" },
            { key: shiftMonth(thisMonth, -1), label: "Bulan Lalu" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMonth(item.key)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                month === item.key
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReportMetric
            icon={IconOmset}
            label="Total Omset"
            value={s.gross}
            format={rp}
            caption="Pendapatan kotor · tanpa ongkir"
            title="Nilai transaksi yang diakui (diproses/dikirim/selesai) di luar ongkir."
          />
          <ReportMetric
            icon={IconPackage}
            label="Total HPP"
            value={s.hppStatus === "missing" ? null : s.hpp}
            format={rp}
            caption={s.hppStatus === "complete" ? "Modal produk terjual" : s.hppNote || "Modal belum lengkap"}
            muted={s.hppStatus !== "complete"}
            title={s.hppNote || undefined}
            delay={70}
          />
          <ReportMetric
            icon={IconWallet}
            label="Total Biaya"
            value={s.expensesAvailable === false ? null : s.biaya}
            format={rp}
            caption={
              s.expensesAvailable === false
                ? "Tabel pengeluaran belum tersedia"
                : s.mayarPendingCount
                  ? "Operasional, packing & Mayar (sebagian)"
                  : "Operasional, packing & Mayar"
            }
            muted={!s.biayaAvailable}
            title={`Operasional ${rp(s.biayaOperasional || 0)} · Packing ${rp(
              s.biayaPacking || 0,
            )} · Mayar ${rp(s.mayarFee || 0)}`}
            delay={140}
          />
          <ReportMetric
            icon={IconProfit}
            label="Laba Bersih"
            value={s.profit}
            format={rp}
            caption={
              s.profitStatus === "valid"
                ? "Keuntungan bersih"
                : s.profitStatus === "partial"
                  ? "Belum termasuk seluruh biaya"
                  : "Belum dapat dihitung"
            }
            badge={profitBadge}
            muted={s.profitStatus !== "valid"}
            title={s.profitNote || undefined}
            delay={210}
          />
        </div>

        {s.profitStatus !== "valid" ? (
          <p
            className={`mt-3 flex items-start gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold ${
              s.profitStatus === "partial"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-zinc-200 bg-white text-zinc-600"
            }`}
          >
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {s.profitNote}
          </p>
        ) : null}
      </section>

      {/* PERHITUNGAN LABA */}
      <section className="lpr-rise overflow-hidden rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] shadow-sm">
        <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5 md:px-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <IconProfit size={18} strokeWidth={1.9} />
            </span>
            <div>
              <h2 className="text-sm font-black tracking-tight text-zinc-900">Perhitungan Laba</h2>
              <p className="mt-0.5 text-xs font-medium text-zinc-500">Dari penjualan sampai estimasi laba.</p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#E4E4E7] bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
            {s.profitStatus === "valid" ? "Lengkap" : s.profitStatus === "partial" ? "Sebagian" : "Belum lengkap"}
          </span>
        </div>

        <div className="space-y-2.5 px-5 pb-5 md:px-6">
          {/* 01 — PENJUALAN */}
          <div className="overflow-hidden rounded-2xl border border-[#E4E4E7] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <StageHeader index="01" title="Penjualan" caption={`${nfmt(s.transactions)} transaksi`} />
            <div className="px-2 py-1">
              <BreakdownRow
                label="Total Penjualan"
                value={rp(s.gross)}
                hint="Nilai transaksi yang diakui pada periode ini — bukan uang yang sudah diterima."
                onClick={() => goToTab("sales")}
              />
              {/* Rekap promosi cover hanger: INFO, bukan pengurang — omzet di atas sudah
                  memakai `total` setelah diskon. Nilainya dari diskon 35rb per cover di form
                  Tambah Transaksi (dan cover berharga Rp0 dari promo website). */}
              {s.promoTotal ? (
                <BreakdownRow
                  label={`Promosi Cover Hanger (${nfmt(s.promoCoverQty)} cover)`}
                  value={rp(s.promoTotal)}
                  tone="muted"
                  hint="Nilai cover hanger yang digratiskan pada periode ini (diskon Rp35.000 per cover di form Tambah Transaksi, atau cover berharga Rp0 dari promo website). Sudah termasuk di Total Penjualan, jadi tidak mengurangi omzet atau laba lagi."
                />
              ) : null}
              <BreakdownRow
                label="Retur"
                value={`− ${rp(s.refunds)}`}
                tone="red"
                hint="Retur/refund yang sudah diselesaikan (uang benar-benar keluar)."
                onClick={() => goToTab("returns")}
              />
              <BreakdownRow
                label="Penyesuaian Tukar Size"
                value={rpSigned(s.exchange)}
                tone={s.exchange >= 0 ? "green" : "red"}
                hint="Selisih harga Tukar Size yang sudah settled (+ customer bayar, − refund)."
                onClick={() => goToTab("exchanges")}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-dashed border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3">
              <span className="text-xs font-black tracking-tight text-zinc-900">Penjualan Setelah Retur</span>
              <span className="text-[15px] font-black tabular-nums text-zinc-900">{rp(s.net)}</span>
            </div>
          </div>

          <div aria-hidden className="flex justify-center">
            <span className="h-2.5 w-px bg-gradient-to-b from-[#C9C9CE] to-[#E4E4E7]" />
          </div>

          {/* 02 — PENGURANG */}
          <div className="overflow-hidden rounded-2xl border border-[#E4E4E7] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <StageHeader index="02" title="Pengurang" caption="Modal & biaya" />
            <div className="px-2 py-1">
              <BreakdownRow
                label="Modal Barang Terjual"
                value={s.hppStatus === "complete" || s.hppStatus === "partial" ? `− ${rp(s.hpp)}` : "Belum tersedia"}
                tone={s.hppStatus === "complete" ? "red" : "muted"}
                hint="Harga pokok (HPP) barang yang masuk perhitungan penjualan."
                caption={s.hppStatus === "complete" ? undefined : s.hppNote}
              />
              <BreakdownRow
                label="Biaya Operasional & Packing"
                value={
                  s.expensesAvailable === false
                    ? "Belum tersedia"
                    : `− ${rp((s.biayaOperasional || 0) + (s.biayaPacking || 0))}`
                }
                tone={s.expensesAvailable === false ? "muted" : "red"}
                hint={`Pengeluaran operasional ${rp(s.biayaOperasional || 0)} dan packing ${rp(
                  s.biayaPacking || 0,
                )} yang tercatat di menu Pengeluaran.`}
                caption={s.expensesAvailable === false ? "Tabel pengeluaran belum tersedia." : undefined}
              />
              {/* Biaya Mayar dipisah: ini biaya transaksi nyata dari penyedia pembayaran. */}
              <BreakdownRow
                label="Biaya Transaksi Mayar"
                value={s.mayarFee ? `− ${rp(s.mayarFee)}` : "Rp 0"}
                tone={s.mayarFee ? "red" : "muted"}
                hint="Potongan Mayar (biaya gateway + layanan) dari transaksi yang sudah cair."
                caption={
                  s.mayarPendingCount
                    ? `${s.mayarPendingCount} transaksi belum cair — biayanya belum ikut terpotong.`
                    : undefined
                }
              />
            </div>
          </div>

          <div aria-hidden className="flex justify-center">
            <span className="h-2.5 w-px bg-gradient-to-b from-[#C9C9CE] to-[#E4E4E7]" />
          </div>

          {/* 03 — HASIL */}
          <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#111113_0%,#1B1B20_55%,#2D2D33_100%)] px-4 pb-4 pt-3.5 text-white shadow-[0_18px_38px_-26px_rgba(0,0,0,0.85)]">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-white/[0.07] blur-2xl"
            />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-md bg-white/15 text-[9px] font-black tabular-nums text-white">
                  03
                </span>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">Hasil</p>
              </div>
              {s.margin !== null ? (
                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-black tabular-nums tracking-[0.06em] text-white/80">
                  Margin {s.margin}%
                </span>
              ) : null}
            </div>

            <div className="relative mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white/55">Estimasi Laba</p>
                <p
                  className={`mt-1 text-[26px] font-black leading-none tracking-tight tabular-nums md:text-[30px] ${
                    s.profitStatus === "valid"
                      ? profitPositive
                        ? "text-white"
                        : "text-red-300"
                      : "text-white/45"
                  }`}
                >
                  {s.profit !== null ? (
                    <CountUp value={s.profit} format={rp} duration={900} />
                  ) : (
                    <span className="text-base font-bold">Belum dapat dihitung</span>
                  )}
                </p>
              </div>
              <p className="text-[10px] font-semibold leading-snug text-white/45">
                Penjualan setelah retur
                <br />− modal − biaya
              </p>
            </div>

            {showComposition ? (
              <div className="relative mt-4">
                <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">
                  {compositionVisible.map((part) => (
                    <span
                      key={part.key}
                      className="h-full min-w-[3px] rounded-full"
                      style={{ flexGrow: part.value, flexBasis: 0, backgroundColor: part.color }}
                    />
                  ))}
                  {compositionUnknown > 0 ? <span className="h-full flex-1 rounded-full bg-white/15" /> : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {compositionVisible.map((part) => (
                    <span key={part.key} className="flex items-center gap-1.5 text-[10px] font-semibold text-white/50">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: part.color }} />
                      {part.label}
                      <span className="tabular-nums text-white/80">{compositionPct(part.value)}%</span>
                    </span>
                  ))}
                  {compositionUnknown > 0 ? (
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold text-white/45">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                      Belum terhitung
                      <span className="tabular-nums text-white/70">{compositionPct(compositionUnknown)}%</span>
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {s.profitStatus !== "valid" ? (
              <p
                className={`relative mt-3 flex items-start gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold leading-relaxed ${
                  s.profitStatus === "partial"
                    ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
                    : "border-white/10 bg-white/[0.06] text-white/65"
                }`}
              >
                <AlertTriangle size={13} className="mt-px shrink-0" />
                {s.profitNote}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* RINCIAN BIAYA FREE GIFT — HPP barang yang dibagikan gratis di periode ini */}
      <RincianFreeGift data={s.freeGift} />

      {/* BREAKDOWN PENGELUARAN — rincian tiap komponen biaya (buka/tutup) */}
      <section className="lpr-rise rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-sm md:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <IconLayers size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h2 className="text-sm font-black tracking-tight text-zinc-900">Breakdown Pengeluaran</h2>
            <p className="mt-0.5 text-xs font-medium text-zinc-500">
              Klik kartu untuk melihat rincian tiap komponen biaya.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <BreakdownPengeluaran
            data={data.breakdown ?? { cogs: [], fees: [], packing: [], operasional: [] }}
            hppTotal={s.hpp}
            feeTotal={s.mayarFee ?? 0}
            packingTotal={s.biayaPacking ?? 0}
            operasionalTotal={s.biayaOperasional ?? 0}
            hppComplete={s.hppStatus === "complete"}
          />
        </div>
      </section>

      {/* PENDING */}
      <section className="lpr-rise rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Perlu Diselesaikan</p>
            <p className="mt-0.5 text-sm font-medium text-slate-500">Kasus yang masih membutuhkan tindakan.</p>
          </div>
          {pendingEmpty ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
              <CheckCircle size={13} /> Tidak ada pending
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => goToTab("returns")}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <div>
              <p className="text-xs font-bold text-slate-500">Retur pending</p>
              <p className="mt-1 text-xl font-black text-[#374151] tabular-nums">
                <CountUp value={s.refundsPending} format={rp} />
              </p>
              <p className="text-[11px] font-semibold text-slate-400">{s.refundsPendingCount} kasus · belum mengurangi neto</p>
            </div>
            <ChevronRight size={18} className="text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => goToTab("exchanges")}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <div>
              <p className="text-xs font-bold text-slate-500">Selisih Tukar Size pending</p>
              <p className={`mt-1 text-xl font-black tabular-nums ${s.exchangePending >= 0 ? "text-amber-600" : "text-blue-600"}`}>
                <CountUp value={s.exchangePending} format={rpSigned} />
              </p>
              <p className="text-[11px] font-semibold text-slate-400">
                {s.exchangePendingCount} kasus · {s.exchangePending >= 0 ? "customer bayar" : "refund"}
              </p>
            </div>
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        </div>
      </section>

      {/* CHART */}
      <section className="lpr-rise rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-slate-700">
              <IconReport size={18} strokeWidth={1.9} />
            </span>
            <div>
              <h2 className="text-lg font-black tracking-tight text-[#374151]">Tren Keuangan</h2>
              <p className="text-xs font-medium text-slate-500">
                Penjualan, penjualan setelah retur, dan estimasi laba mengikuti periode.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {seriesOptions.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSeries((current) => ({ ...current, [item.key]: !current[item.key as keyof typeof current] }))}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  series[item.key as keyof typeof series]
                    ? "border-[#E5E7EB] bg-white text-slate-700"
                    : "border-transparent bg-slate-100 text-slate-400"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 h-72 w-full rounded-2xl border border-[#E4E4E7] bg-white p-2 md:p-3">
          {data.trend.points.every((point) => !point.gross && !point.net && !point.profit) ? (
            <div className="grid h-full place-items-center rounded-2xl bg-white text-center">
              <div>
                <p className="text-sm font-bold text-slate-700">Belum ada data di periode ini</p>
                <p className="mt-1 text-xs text-slate-500">Coba rentang tanggal lain.</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.trend.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="laporan-net-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#18181B" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="#18181B" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#EDEDF0" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={54} />
                <ChartTooltip content={<TrendTooltip />} cursor={{ stroke: "#D4D4D8", strokeDasharray: "4 4" }} />
                {series.gross ? (
                  <Line type="monotone" dataKey="gross" name="Penjualan" stroke="#A1A1AA" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                ) : null}
                {series.net ? (
                  <Area
                    type="monotone"
                    dataKey="net"
                    name="Penjualan Setelah Retur"
                    stroke="#18181B"
                    strokeWidth={2.5}
                    fill="url(#laporan-net-fill)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ) : null}
                {s.profitStatus === "valid" && series.profit ? (
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Estimasi Laba"
                    stroke="#52525B"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        {s.profitStatus !== "valid" ? (
          <p className="mt-2 text-[11px] font-semibold text-slate-400">
            Garis estimasi laba tidak ditampilkan. {s.profitNote}
          </p>
        ) : null}
      </section>

      {/* PRODUK TERLARIS — periode sendiri + pembanding bulan lalu */}
      <BestSellerSection />

      {/* SUMBER PESANAN — memisahkan Reseller dari penjualan lain */}
      {sources.length > 0 ? (
        <section className="lpr-rise rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-slate-700">
                <Store size={18} strokeWidth={1.9} />
              </span>
              <div>
                <h2 className="text-lg font-black tracking-tight text-[#374151]">Sumber Pesanan</h2>
                <p className="text-xs font-medium text-slate-500">
                  Omzet per sumber. Pesanan reseller dihitung dari harga beli reseller + ongkir.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {sources.map((row, index) => (
              <div key={row.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-bold text-[#374151]" title={row.label}>
                    {row.label}
                  </p>
                  <p className="shrink-0 whitespace-nowrap text-[11px] font-bold text-slate-500 tabular-nums">
                    {row.count} trx · {row.share.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E4E4E7]">
                  <div
                    className={`lpr-bar h-full rounded-full ${PAYMENT_BAR[index] || "bg-slate-300"}`}
                    style={{ width: `${Math.max(2, row.share)}%`, animationDelay: `${index * 70}ms` }}
                  />
                </div>
                <p className="mt-1.5 whitespace-nowrap text-xs font-black text-slate-700 tabular-nums">{rp(row.amount)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* METODE PEMBAYARAN */}
      <section className="lpr-rise rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-slate-700">
                <CreditCard size={18} strokeWidth={1.9} />
              </span>
              <div>
                <h2 className="text-lg font-black tracking-tight text-[#374151]">Metode Pembayaran</h2>
                <p className="text-xs font-medium text-slate-500">Metode pembayaran paling sering digunakan.</p>
              </div>
            </div>
            <span className="rounded-full bg-[#F9FAFB] px-3 py-1.5 text-[11px] font-bold text-slate-500">
              {s.transactions} transaksi
            </span>
          </div>

          {payments.length === 0 ? (
            <div className="mt-5 grid place-items-center rounded-2xl bg-white px-4 py-8 text-center">
              <p className="text-sm font-bold text-slate-700">Belum ada transaksi di periode ini</p>
              <p className="mt-1 text-xs text-slate-500">Coba rentang tanggal lain.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {payments.map((row, index) => (
                <div key={row.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-bold text-[#374151]" title={row.label}>
                      {row.label}
                    </p>
                    <p className="shrink-0 whitespace-nowrap text-[11px] font-bold text-slate-500 tabular-nums">
                      {row.count} trx · {row.share.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E4E4E7]">
                    <div
                      className={`lpr-bar h-full rounded-full ${PAYMENT_BAR[index] || "bg-slate-300"}`}
                      style={{ width: `${Math.max(2, row.share)}%`, animationDelay: `${index * 70}ms` }}
                    />
                  </div>
                  <p className="mt-1.5 whitespace-nowrap text-xs font-black text-slate-700 tabular-nums">{rp(row.amount)}</p>
                </div>
              ))}
            </div>
          )}
      </section>

      {/* TABLES */}
      <section ref={tableRef} id="report-tables" className="lpr-rise rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-sm md:p-6">
        {/*
          ── Ringkasan Biaya Transaksi Mayar ──
          Dua kartu (cair / belum cair) + satu kartu total transaksi bulan ini.
          Klik kartu cair/belum cair untuk membuka tabel rinciannya di bawah —
          "selection" sendiri, tanpa mencampurnya dengan Retur/Tukar Size/Penjualan.
        */}
        <div className="mb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-black tracking-tight text-[#374151]">Biaya Transaksi Mayar</h2>
            <p className="text-[11px] font-medium text-slate-500">Semua nominal berasal dari API Mayar.</p>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <MayarSummaryCard
              active={tab === "mayar-settled"}
              onClick={() => setTab("mayar-settled")}
              label="Sudah Cair"
              value={mayarSettledTotal}
              format={rp}
              caption={
                mayarSettledRows.length > 0
                  ? `${mayarSettledRows.length} transaksi · biaya final`
                  : "Belum ada transaksi cair"
              }
              bar={mayarSettledShare}
              tone="emerald"
            />
            <MayarSummaryCard
              active={tab === "mayar-pending"}
              onClick={() => setTab("mayar-pending")}
              label="Belum Cair"
              value={mayarPendingTotal}
              format={rp}
              caption={
                mayarPendingRows.length > 0
                  ? `${mayarPendingRows.length} transaksi menunggu cair`
                  : "Semua transaksi sudah cair"
              }
              bar={100 - mayarSettledShare}
              tone="amber"
            />
            <MayarSummaryCard
              active={false}
              label="Total Transaksi"
              value={mayarAllCount}
              caption={`${
                mayarSettledRows.length + mayarPendingRows.length > 0
                  ? `${mayarSettledRows.length} cair · ${mayarPendingRows.length} belum`
                  : "Transaksi Mayar bulan ini"
              }`}
              tone="slate"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1">
            {[
              { key: "returns", label: "Retur", count: data.tables.returns.length },
              { key: "exchanges", label: "Tukar Size", count: data.tables.exchanges.length },
              { key: "sales", label: "Penjualan", count: data.tables.sales.length },
              /* Biaya Mayar dipisah: "Cair" = angka pasti, "Belum Cair" = biaya belum ada. */
              { key: "mayar-settled", label: "Biaya Mayar · Cair", count: (data.tables.mayarSettled || []).length },
              { key: "mayar-pending", label: "Biaya Mayar · Belum Cair", count: (data.tables.mayarPending || []).length },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key as Tab)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  tab === item.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-[#EFEFF1]"
                }`}
              >
                {item.label}
                <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${tab === item.key ? "bg-white/20" : "bg-slate-200"}`}>
                  {item.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nomor / pelanggan / produk"
                className="w-64 rounded-xl border border-[#E5E7EB] bg-white py-2 pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <option value="all">Semua status</option>
              {tab === "mayar-settled" || tab === "mayar-pending"
                ? /* Tabel biaya Mayar tidak punya status pesanan — filternya tidak relevan. */
                  null
                : tab === "sales"
                  ? ["diproses", "dikirim", "selesai", "pending", "dibatalkan"].map((value) => (
                      <option key={value} value={value}>{statusLabel(value)}</option>
                    ))
                  : tab === "exchanges"
                    ? [
                        <option key="settled" value="settled">Selesai</option>,
                        <option key="unpaid" value="unpaid">Belum</option>,
                      ]
                    : Object.entries(RETURN_STATUS).map(([value, meta]) => (
                        <option key={value} value={value}>{meta.label}</option>
                      ))}
            </select>
          </div>
        </div>

        <TableBody
          tab={tab}
          rows={
            tab === "returns"
              ? data.tables.returns
              : tab === "exchanges"
                ? data.tables.exchanges
                : tab === "mayar-settled"
                  ? data.tables.mayarSettled || []
                  : tab === "mayar-pending"
                    ? data.tables.mayarPending || []
                    : data.tables.sales
          }
          search={search}
          statusFilter={statusFilter}
          sort={sort}
          onSort={(key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }))}
          page={page}
          onPage={setPage}
          onRow={(row) => setSelected({ kind: tab, row })}
        />

        <p className="mt-3 text-[11px] font-medium text-slate-400">
          {tab === "sales"
            ? "Tabel menampilkan semua pesanan di periode. Angka penjualan hanya menghitung status diproses/dikirim/selesai — bukan status pembayaran."
            : tab === "mayar-settled"
              ? "Biaya & dana bersih dari Mayar untuk transaksi yang sudah CAIR. Angka ini pasti, bukan perkiraan."
              : tab === "mayar-pending"
                ? "Pesanan sudah dibayar tetapi dana belum cair (biasanya ±3 hari). Biaya belum tersedia karena Mayar baru memotong saat dana cair — sengaja tidak ditaksir."
                : tab === "returns"
                  ? "Termasuk retur yang dibuat di periode dan retur lama yang refund-nya selesai di periode ini."
                  : "Selisih positif = customer bayar; negatif = refund. Pending tidak mengurangi Penjualan Setelah Retur."}
        </p>
      </section>

      {selected ? <DetailDrawer selected={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

/** Judul tahap di kartu alur laba (01 Penjualan → 02 Pengurang → 03 Hasil). */
function StageHeader({ index, title, caption }: { index: string; title: string; caption?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#F1F1F3] px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-zinc-900 text-[9px] font-black tabular-nums text-white">
          {index}
        </span>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      </div>
      {caption ? (
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-400">{caption}</p>
      ) : null}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  caption,
  tone,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "red" | "green" | "blue" | "muted";
  hint?: string;
  onClick?: () => void;
}) {
  const toneClass =
    tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-emerald-600"
        : tone === "blue"
          ? "text-zinc-700"
          : tone === "muted"
            ? "text-zinc-400"
            : "text-zinc-900";
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button", onClick } : {})}
      className={`group flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${
        onClick ? "hover:bg-[#F7F7F8]" : ""
      }`}
    >
      <span className="flex min-w-0 items-start gap-2">
        <span
          className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
            onClick ? "bg-zinc-300 group-hover:bg-zinc-500" : "bg-zinc-200"
          }`}
        />
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-zinc-600" title={hint}>
            {label}
          </span>
          {caption ? (
            <span className="mt-0.5 block text-[10px] font-semibold leading-relaxed text-amber-600">{caption}</span>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className={`text-[13px] font-black tabular-nums ${toneClass}`}>{value}</span>
        {onClick ? (
          <ChevronRight
            size={13}
            className="text-zinc-300 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-500"
          />
        ) : null}
      </span>
    </Wrapper>
  );
}

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 shadow-lg">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((item: any) => (
          <p key={item.dataKey} className="flex items-center justify-between gap-4 text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-black tabular-nums">{rp(item.value)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function TableBody({
  tab,
  rows,
  search,
  statusFilter,
  sort,
  onSort,
  page,
  onPage,
  onRow,
}: {
  tab: Tab;
  rows: any[];
  search: string;
  statusFilter: string;
  sort: { key: string; dir: "asc" | "desc" };
  onSort: (key: string) => void;
  page: number;
  onPage: (page: number) => void;
  onRow: (row: any) => void;
}) {
  const pageSize = 10;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows
      .filter((row) => {
        const status = tab === "exchanges" ? String(row.price_difference_status || "") : String(row.status || "");
        // Tabel biaya Mayar tidak punya status pesanan → filter status dilewati.
        const isMayarTab = tab === "mayar-settled" || tab === "mayar-pending";
        if (!isMayarTab && statusFilter !== "all" && status !== statusFilter) return false;
        if (!needle) return true;
        const haystack =
          isMayarTab
            ? [row.order_number, row.customer_name, row.channel]
            : tab === "sales"
              ? [row.order_number, row.customer_name, row.customer_whatsapp, row.source]
              : tab === "returns"
                ? [row.return_number, row.order_number, row.customer_name, row.customer_whatsapp]
                : [
                  row.return_number,
                  row.order_number,
                  row.customer_name,
                  ...(row.items || []).map((item: any) => `${item.product_name} ${item.size} ${item.replacement_size}`),
                ];
        return haystack.filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const key = sort.key;
        const av = tab === "exchanges" && key === "difference" ? Number(a.price_difference_total) || 0 : a[key];
        const bv = tab === "exchanges" && key === "difference" ? Number(b.price_difference_total) || 0 : b[key];
        const an = Number(av);
        const bn = Number(bv);
        const cmp = Number.isFinite(an) && Number.isFinite(bn) && String(av ?? "").match(/^\d+$/)
          ? an - bn
          : String(av ?? "").localeCompare(String(bv ?? ""));
        return sort.dir === "asc" ? cmp : -cmp;
      });
  }, [rows, tab, search, statusFilter, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const header = (key: string, label: string, className = "") => (
    <th className={`px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 ${className}`}>
      <button type="button" onClick={() => onSort(key)} className="inline-flex items-center gap-1 hover:text-slate-700">
        {label}
        {sort.key === key ? <span className="text-[9px]">{sort.dir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  );

  if (filtered.length === 0) {
    return (
      <div className="mt-4 rounded-2xl bg-white py-12 text-center">
        <p className="text-sm font-bold text-slate-700">Tidak ada data</p>
        <p className="mt-1 text-xs text-slate-500">Coba ubah periode, pencarian, atau filter status.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-[#F9FAFB]">
            <tr>
              {tab === "sales" || tab === "mayar-settled" ? (
                <>
                  {header("order_number", "No. Pesanan")}
                  {header("customer_name", "Pelanggan", "hidden md:table-cell")}
                  {header("created_at", "Tanggal", "hidden sm:table-cell")}
                  {header("total", "Penjualan", "text-right")}
                  {/* Diskon FCH hanya relevan untuk tabel Penjualan; baris biaya Mayar tidak membawanya. */}
                  {tab === "sales" ? header("discount", "Diskon FCH", "text-right") : null}
                  {header("channel", "Metode Mayar", "hidden md:table-cell")}
                  {header("fee", "Biaya", "text-right")}
                  {header("net", "Diterima Bersih", "text-right")}
                </>
              ) : tab === "mayar-pending" ? (
                <>
                  {header("order_number", "No. Pesanan")}
                  {header("customer_name", "Pelanggan", "hidden md:table-cell")}
                  {header("created_at", "Tanggal", "hidden sm:table-cell")}
                  {header("total", "Dibayar", "text-right")}
                  {header("channel", "Metode Mayar", "hidden md:table-cell")}
                  {header("mayar_status", "Status Mayar")}
                </>
              ) : tab === "returns" ? (
                <>
                  {header("return_number", "No. Retur")}
                  {header("order_number", "No. Order", "hidden md:table-cell")}
                  {header("customer_name", "Pelanggan", "hidden lg:table-cell")}
                  {header("refund_amount", "Refund", "text-right")}
                  {header("status", "Status Retur")}
                  {header("refund_settled_at", "Status Refund", "hidden md:table-cell")}
                </>
              ) : (
                <>
                  {header("return_number", "No. Retur")}
                  {header("product", "Produk")}
                  {header("size", "Ukuran", "hidden sm:table-cell")}
                  {header("difference", "Selisih", "text-right")}
                  {header("price_difference_status", "Status")}
                  {header("created_at", "Tanggal", "hidden md:table-cell")}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr
                key={`${tab}-${row.id || row.order_number || index}`}
                onClick={() => onRow(row)}
                className="cursor-pointer border-t border-[#E5E7EB] hover:bg-slate-50"
              >
                {tab === "sales" || tab === "mayar-settled" ? (
                  <>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-800">{row.order_number}</td>
                    <td className="hidden px-3 py-3 text-xs font-semibold text-slate-600 md:table-cell">{row.customer_name || "-"}</td>
                    <td className="hidden px-3 py-3 text-xs text-slate-500 sm:table-cell">{dateOnly(row.created_at)}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-800">{rp(row.total)}</td>
                    {tab === "sales" ? (
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-emerald-600">
                        {fchDiscountOf(row) > 0 ? `-${rp(fchDiscountOf(row))}` : "-"}
                      </td>
                    ) : null}
                    <td className="hidden px-3 py-3 text-xs text-slate-500 md:table-cell">{row.channel || "-"}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-red-600">{rp(row.fee)}</td>
                    <td className="px-3 py-3 text-right font-black tabular-nums text-slate-900">{rp(row.net)}</td>
                  </>
                ) : tab === "mayar-pending" ? (
                  <>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-800">{row.order_number}</td>
                    <td className="hidden px-3 py-3 text-xs font-semibold text-slate-600 md:table-cell">{row.customer_name || "-"}</td>
                    <td className="hidden px-3 py-3 text-xs text-slate-500 sm:table-cell">{dateOnly(row.created_at)}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-800">{rp(row.total)}</td>
                    <td className="hidden px-3 py-3 text-xs text-slate-500 md:table-cell">{row.channel || "-"}</td>
                    <td className="px-3 py-3">
                      <Badge tone={row.mayar_status === "paid" ? "amber" : "gray"}>
                        {row.mayar_status === "paid" ? "Dibayar · belum cair" : row.mayar_status === "unpaid" ? "Belum dibayar" : "Belum tercatat"}
                      </Badge>
                    </td>
                  </>
                ) : tab === "returns" ? (
                  <>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-800">{row.return_number}</td>
                    <td className="hidden px-3 py-3 font-mono text-xs text-slate-600 md:table-cell">{row.order_number || "-"}</td>
                    <td className="hidden px-3 py-3 text-xs text-slate-600 lg:table-cell">{row.customer_name || "-"}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-red-600">{rp(row.refund_amount)}</td>
                    <td className="px-3 py-3"><Badge tone={RETURN_STATUS[row.status]?.tone}>{RETURN_STATUS[row.status]?.label || row.status}</Badge></td>
                    <td className="hidden px-3 py-3 text-xs text-slate-500 md:table-cell">
                      <Badge tone={row.refund_settled_at ? "green" : "amber"}>
                        {row.refund_settled_at ? "Sudah" : "Belum"}
                      </Badge>
                      {row.refund_settled_at ? (
                        <span className="ml-1.5 text-[10px] font-semibold text-slate-400">{dateOnly(row.refund_settled_at)}</span>
                      ) : null}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-800">{row.return_number}</td>
                    <td className="px-3 py-3 text-xs font-semibold text-slate-700">{exchangeSummary(row)}</td>
                    <td className="hidden px-3 py-3 text-xs text-slate-600 sm:table-cell">{exchangeSizes(row)}</td>
                    <td className={`px-3 py-3 text-right font-bold tabular-nums ${Number(row.price_difference_total) >= 0 ? "text-amber-600" : "text-blue-600"}`}>
                      {rpSigned(row.price_difference_total)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={row.price_difference_status === "settled" ? "green" : "amber"}>
                        {row.price_difference_status === "settled" ? "Selesai" : "Belum"}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-3 text-xs text-slate-500 md:table-cell">{dateOnly(row.created_at)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
        <p>{filtered.length} baris · halaman {current} dari {pages}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(Math.max(1, current - 1))}
            disabled={current <= 1}
            className="rounded-lg border border-[#E5E7EB] p-1.5 disabled:opacity-40"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => onPage(Math.min(pages, current + 1))}
            disabled={current >= pages}
            className="rounded-lg border border-[#E5E7EB] p-1.5 disabled:opacity-40"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </>
  );
}

function exchangeSummary(row: any) {
  const item = row.items?.[0];
  if (!item) return "Tukar Size";
  return `${item.product_name}${item.color && item.color !== "default" ? ` · ${item.color}` : ""}${row.items.length > 1 ? ` +${row.items.length - 1}` : ""}`;
}

function exchangeSizes(row: any) {
  const items = row.items || [];
  if (!items.length) return "-";
  return items.map((item: any) => `${item.size} → ${item.replacement_size}`).join(", ");
}

function DetailDrawer({ selected, onClose }: { selected: { kind: Tab; row: any }; onClose: () => void }) {
  const row = selected.row;
  const kind: string = selected.kind;

  // Penjualan & biaya Mayar memakai drawer detail pesanan yang sama dengan panel admin
  // (stepper, info kirim, alamat, produk). Tanpa tombol aksi — halaman ini read-only.
  if (kind === "sales" || kind === "mayar-settled" || kind === "mayar-pending") {
    const tahap =
      row.status === "pending"
        ? "belum_bayar"
        : row.status === "dikirim"
          ? "dikirim"
          : row.status === "selesai"
            ? "selesai"
            : row.status === "dibatalkan"
              ? "dibatalkan"
              : row.awb_no
                ? "sudah_dipacking"
                : "belum_dipacking";
    const itemList = (Array.isArray(row.items) ? row.items : []).map((item: any, index: number) => ({
      key: String(item.id || index),
      nama: item.product_name || "-",
      chips: [
        item.kain ? { teks: `Kain ${item.kain}`, jenis: "kain" as const } : null,
        item.series ? { teks: String(item.series), jenis: "netral" as const } : null,
        item.color && item.color !== "default" ? { teks: String(item.color), jenis: "netral" as const } : null,
        item.size || item.replacement_size
          ? {
              teks: [item.size, item.replacement_size ? `→ ${item.replacement_size}` : null].filter(Boolean).join(" "),
              jenis: "netral" as const,
            }
          : null,
      ].filter(Boolean) as { teks: string; jenis: "kain" | "netral" }[],
      harga: rp((Number(item.price) || 0) * (Number(item.quantity) || 1)),
      foto: item.image || BLANK_PIXEL,
    }));
    const alamat = [
      row.shipping_address,
      row.shipping_kecamatan ? `Kec. ${row.shipping_kecamatan}` : "",
      row.shipping_city,
      row.shipping_province,
      row.shipping_postal_code,
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <PanelDetailShell open onClose={onClose} tema="warna">
        <PanelDetailPesanan
        tema="warna"
        sumber={row.source || "Website"}
        tahap={tahap}
        createdAt={row.created_at}
        nama={row.customer_name || "-"}
        telepon={row.customer_whatsapp || "-"}
        alamat={alamat || "-"}
        kurir="J&T"
        layanan={row.shipping_method || "-"}
        resi={row.awb_no || ""}
        resiKosong="Resi belum dibuat"
        onLacak={() => undefined}
        onSalinResi={() => undefined}
        resiTersalin={false}
        berat={row.weight ? `${Number(row.weight).toLocaleString("id-ID")} g` : "-"}
        statusKirim={row.tracking_status_text || (row.shipping_status ? String(row.shipping_status) : "")}
        statusKirimMeta={[row.tracking_city, row.tracking_updated_at ? dateTime(row.tracking_updated_at) : ""]
          .filter(Boolean)
          .join(" · ")}
        items={itemList}
        subtotal={Number(row.subtotal) || 0}
        ongkir={Number(row.shipping_cost) || 0}
        diskon={Number(row.discount) || 0}
        total={Number(row.total) || 0}
        metodeBayar={row.payment_method_label || row.channel || "-"}
        waktuPesan={dateTime(row.created_at)}
        waktuBayar={row.paid_at ? dateTime(row.paid_at) : null}
        nomorPesanan={row.order_number || "-"}
        onSalinNomor={() => undefined}
        nomorTersalin={false}
        onChat={() => undefined}
        onClose={onClose}
      />
      </PanelDetailShell>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-label="Tutup detail" />
      <aside className="relative h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Detail</p>
            <p className="mt-1 text-lg font-black text-slate-900">
              {kind === "mayar-settled" || kind === "mayar-pending"
                ? row.order_number
                : kind === "sales"
                  ? row.order_number
                  : row.return_number}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-[#E5E7EB] p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Tutup">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-2xl border border-[#E5E7EB] p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pelanggan</p>
            <p className="mt-1 font-bold text-slate-800">{row.customer_name || "-"}</p>
            <p className="text-xs text-slate-500">{row.customer_whatsapp || "-"}</p>
          </div>

          {kind === "sales" ? (
            <div className="rounded-2xl border border-[#E5E7EB] p-3.5">
              <div className="flex justify-between"><span className="text-slate-500">Penjualan</span><span className="font-black tabular-nums">{rp(row.total)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Metode Mayar</span><span className="text-xs font-semibold">{row.channel || "-"}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Biaya Mayar</span><span className="font-bold tabular-nums text-red-600">{rp(row.fee)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Diterima bersih</span><span className="font-black tabular-nums">{rp(row.net)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Tanggal</span><span className="text-xs font-semibold">{dateTime(row.created_at)}</span></div>
            </div>
          ) : kind === "mayar-pending" ? (
            <div className="rounded-2xl border border-[#E5E7EB] p-3.5">
              <div className="flex justify-between"><span className="text-slate-500">Dibayar</span><span className="font-black tabular-nums">{rp(row.total)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Metode Mayar</span><span className="text-xs font-semibold">{row.channel || "-"}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Status</span><Badge tone={row.mayar_status === "paid" ? "amber" : "gray"}>{row.mayar_status === "paid" ? "Dibayar · belum cair" : row.mayar_status === "unpaid" ? "Belum dibayar" : "Belum tercatat"}</Badge></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Biaya Mayar</span><span className="text-xs font-semibold text-slate-500">Belum tersedia</span></div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Dana belum cair, jadi biaya belum dipotong Mayar. Angkanya muncul di tab
                “Biaya Mayar · Cair” setelah dana masuk (±3 hari).
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E5E7EB] p-3.5">
              <div className="flex justify-between"><span className="text-slate-500">Order</span><span className="font-mono text-xs font-bold">{row.order_number || "-"}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Status</span><Badge tone={RETURN_STATUS[row.status]?.tone}>{RETURN_STATUS[row.status]?.label || row.status}</Badge></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Refund</span><span className="font-bold tabular-nums">{rp(row.refund_amount)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Refund selesai</span><span className="text-xs font-semibold">{row.refund_settled_at ? dateOnly(row.refund_settled_at) : "Belum"}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Selisih Tukar</span><span className="font-bold tabular-nums">{rpSigned(row.price_difference_total)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Tanggal</span><span className="text-xs font-semibold">{dateTime(row.created_at)}</span></div>
            </div>
          )}

          <div className="rounded-2xl border border-[#E5E7EB] p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Produk</p>
            <div className="mt-2 space-y-2">
              {(row.items || []).map((item: any, index: number) => (
                <div key={`${item.id || index}`} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800">{item.product_name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.kain ? (
                        <span className="rounded-full bg-[#e8f3fb] px-2 py-0.5 text-[10px] font-bold text-[#2f6f9e]">Kain {item.kain}</span>
                      ) : null}
                      {item.series ? (
                        <span className="rounded-full bg-[#eef1f4] px-2 py-0.5 text-[10px] font-bold text-[#5b6f7c]">{item.series}</span>
                      ) : null}
                      {item.color && item.color !== "default" ? (
                        <span className="rounded-full bg-[#e8f3fb] px-2 py-0.5 text-[10px] font-bold text-[#2f6f9e]">{item.color}</span>
                      ) : null}
                      {item.size || item.replacement_size ? (
                        <span className="rounded-full bg-[#f2f4f6] px-2 py-0.5 text-[10px] font-bold text-[#62717c]">
                          {[item.size, item.replacement_size ? `→ ${item.replacement_size}` : null].filter(Boolean).join(" ")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="shrink-0 font-bold text-slate-700">×{item.quantity ?? item.qty}</span>
                </div>
              ))}
              {!(row.items || []).length ? <p className="text-xs text-slate-400">Tidak ada item.</p> : null}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-40 animate-pulse rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1]" />
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="h-64 animate-pulse rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1]" />
        <div className="h-64 animate-pulse rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1]" />
      </div>
      <div className="h-44 animate-pulse rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1]" />
      <div className="h-80 animate-pulse rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1]" />
    </div>
  );
}
