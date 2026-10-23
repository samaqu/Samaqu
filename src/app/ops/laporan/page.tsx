"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import * as LucideIcons from "lucide-react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { statusLabel, orderSourceLabel } from "@/lib/transaksi";
import GlassCard from "@/components/ops/GlassCard";
import BestSellerSection from "@/components/ops/BestSellerSection";

/**
 * Sebagian ikon lucide ada di runtime tapi belum masuk definisi tipe versi ini —
 * pola namespace yang sama dengan Dashboard ops (`src/app/ops/dashboard/page.tsx`).
 */
const IconReport: any = (LucideIcons as any).BarChart3 ?? (LucideIcons as any).ChartColumn ?? (LucideIcons as any).ChartLine;
const IconWallet: any =
  (LucideIcons as any).Wallet ?? (LucideIcons as any).WalletMinimal ?? (LucideIcons as any).Banknote;
const IconPackage: any = (LucideIcons as any).Package;
const IconReceipt: any = (LucideIcons as any).Receipt ?? (LucideIcons as any).FileText;
const IconReturn: any = (LucideIcons as any).Undo2 ?? (LucideIcons as any).RotateCcw ?? (LucideIcons as any).Receipt;
const IconProfit: any = (LucideIcons as any).TrendingUp ?? (LucideIcons as any).LineChart;

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
  hppReversal: boolean;
  biayaNote: string;
  hppStatus: HppStatus;
  hppNote: string;
  hppCoverage: { totalQty: number; knownQty: number; missingQty: number; missingOrders: number };
  biayaAvailable: boolean;
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
  tables: {
    sales: any[];
    returns: any[];
    exchanges: any[];
  };
};

type Preset = "today" | "7d" | "30d" | "month" | "lastMonth" | "custom";
type Tab = "returns" | "exchanges" | "sales";

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

const dateOnly = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
};

function todayKey() {
  return new Date(Date.now() + BIZ_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

function monthStart(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function presetRange(preset: Preset, currentFrom: string, currentTo: string) {
  const today = todayKey();
  if (preset === "today") return { from: today, to: today };
  if (preset === "7d") return { from: addDays(today, -6), to: today };
  if (preset === "30d") return { from: addDays(today, -29), to: today };
  if (preset === "month") return { from: monthStart(today), to: today };
  if (preset === "lastMonth") {
    const last = addDays(monthStart(today), -1);
    return { from: monthStart(last), to: last };
  }
  return { from: currentFrom, to: currentTo };
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

async function fetchReport(from: string, to: string): Promise<ReportData> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const params = new URLSearchParams({ from, to });
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
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState(() => addDays(todayKey(), -29));
  const [to, setTo] = useState(() => todayKey());
  const [tab, setTab] = useState<Tab>("returns");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "created_at", dir: "desc" });
  const [selected, setSelected] = useState<{ kind: Tab; row: any } | null>(null);
  const [series, setSeries] = useState({ gross: true, net: true, profit: false });
  const tableRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<ReportData>({
    queryKey: ["ops-laporan", from, to],
    queryFn: () => fetchReport(from, to),
    staleTime: 30_000,
  });

  useEffect(() => {
    setPage(1);
    setStatusFilter("all");
    setSort({ key: "created_at", dir: "desc" });
  }, [tab, search, from, to]);

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

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next === "custom") return;
    const range = presetRange(next, from, to);
    setFrom(range.from);
    setTo(range.to);
  };

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
  const profitTone =
    s.profitStatus === "valid" ? (profitPositive ? "text-emerald-600" : "text-red-600") : "text-slate-400";
  const seriesOptions = [
    { key: "gross", label: "Penjualan", color: "#94A3B8" },
    { key: "net", label: "Setelah Retur", color: "#2563EB" },
    ...(s.profitStatus === "valid" ? [{ key: "profit", label: "Estimasi Laba", color: "#10B981" }] : []),
  ];

  return (
    <div className="space-y-5 bg-[#F9FAFB]">
      {/* HEADER + KPI */}
      <section className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200 shrink-0">
              <IconReport size={26} className="text-slate-900" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Laporan Keuangan</h1>
              <p className="text-slate-500 font-medium mt-1">
                Pantau penjualan, retur, biaya, dan estimasi laba SAMAQU.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isFetching ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500">
                <RefreshCw size={12} className="animate-spin" /> Memperbarui…
              </span>
            ) : null}
            <Link
              href="/ops"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <ChevronLeft size={16} /> Dashboard
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {[
            { key: "today", label: "Hari ini" },
            { key: "7d", label: "7 hari" },
            { key: "30d", label: "30 hari" },
            { key: "month", label: "Bulan ini" },
            { key: "lastMonth", label: "Bulan lalu" },
            { key: "custom", label: "Custom" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => applyPreset(item.key as Preset)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                preset === item.key
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-slate-700">{data.period.label}</span>
          <span>·</span>
          <span>{data.period.days} hari</span>
          <span>·</span>
          <span>dibanding {data.period.previous.label}</span>
          {preset === "custom" ? (
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(event) => {
                  setPreset("custom");
                  setFrom(event.target.value);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
              />
              <span>–</span>
              <input
                type="date"
                value={to}
                min={from}
                max={todayKey()}
                onChange={(event) => {
                  setPreset("custom");
                  setTo(event.target.value);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
              />
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <GlassCard
            icon={IconWallet}
            label="Total Penjualan"
            value={rp(s.gross)}
            caption="Nilai transaksi diakui, bukan uang masuk."
          />
          <GlassCard
            icon={IconReturn}
            label="Retur"
            value={`− ${rp(s.refunds)}`}
            tone="negative"
            caption="Retur/refund yang sudah diselesaikan."
          />
          <GlassCard
            icon={IconReport}
            label="Penjualan Setelah Retur"
            value={rp(s.net)}
            caption="Setelah retur & penyesuaian tukar size."
          />
          <GlassCard
            icon={IconPackage}
            label="Modal Barang Terjual"
            value={s.hppStatus === "complete" ? rp(s.hpp) : "—"}
            tone={s.hppStatus === "complete" ? "default" : "muted"}
            caption={s.hppStatus === "complete" ? "Modal dari barang yang terjual." : s.hppNote}
          />
          <GlassCard
            icon={IconReceipt}
            label="Biaya Operasional"
            value={s.biayaAvailable ? rp(s.biaya) : "—"}
            tone={s.biayaAvailable ? "default" : "muted"}
            caption={s.biayaAvailable ? "Biaya operasional tercatat." : "Data biaya operasional belum tersedia."}
          />
          <div
            className="relative bg-white border border-slate-200 rounded-2xl p-5 flex flex-col"
            title={s.profitNote || undefined}
          >
            <span
              className={`absolute top-3 right-3 px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider border ${profitBadge.cls}`}
            >
              {profitBadge.label}
            </span>
            <div className="flex items-center gap-2 text-slate-500 min-h-[20px] pr-24">
              <IconProfit size={16} className="shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wider truncate">Estimasi Laba</span>
            </div>
            <p
              className={`font-black mt-3 whitespace-nowrap leading-tight text-[clamp(1.05rem,1.5vw,1.75rem)] ${profitTone}`}
            >
              {s.profit !== null ? rp(s.profit) : "—"}
            </p>
            <p className="text-slate-500 text-xs mt-auto pt-1.5">
              {s.profitStatus === "valid"
                ? "Penjualan setelah retur − modal − biaya."
                : s.profitStatus === "partial"
                  ? "Belum termasuk biaya operasional."
                  : "Belum dapat dihitung."}
            </p>
          </div>
        </div>

        {s.profitStatus !== "valid" ? (
          <p
            className={`mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold ${
              s.profitStatus === "partial" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
            }`}
          >
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {s.profitNote}
          </p>
        ) : null}

        <p className="mt-2 text-[11px] font-semibold text-slate-400">
          Angka penjualan adalah nilai transaksi yang diakui (diproses/dikirim/selesai), bukan uang yang sudah
          diterima. Pesanan COD atau yang belum dibayar tetap tercatat sebagai penjualan.
        </p>

        <p className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold text-slate-400">
          <span>
            Penjualan Setelah Retur <b className="text-slate-700">{rp(s.net)}</b>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className={data.deltas.net !== null && data.deltas.net < 0 ? "text-red-600" : "text-emerald-600"}>
              {data.deltas.net === null
                ? "Baru"
                : `${data.deltas.net >= 0 ? "+" : "−"}${Math.abs(data.deltas.net).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
            </span>
            <span className="text-slate-400">vs periode sebelumnya</span>
          </span>
          <span>· {s.transactions} transaksi</span>
          <span>· rata-rata {rp(s.aov)}/transaksi</span>
          <span>· margin {s.margin !== null ? `${s.margin}%` : "—"}</span>
        </p>
      </section>

      {/* PERHITUNGAN LABA */}
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-sm md:p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Perhitungan Laba</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Dari penjualan sampai estimasi laba.</p>
          <div className="mt-3 divide-y divide-[#E5E7EB]">
            <BreakdownRow
              label="Total Penjualan"
              value={rp(s.gross)}
              hint="Nilai transaksi yang diakui pada periode ini — bukan uang yang sudah diterima."
              onClick={() => goToTab("sales")}
            />
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
              tone={s.exchange >= 0 ? "green" : "blue"}
              hint="Selisih harga Tukar Size yang sudah settled (+ customer bayar, − refund)."
              onClick={() => goToTab("exchanges")}
            />
            <BreakdownRow
              label="Penjualan Setelah Retur"
              value={rp(s.net)}
              emphasis
              hint="Total Penjualan − Retur + Penyesuaian Tukar Size."
            />
            <BreakdownRow
              label="Modal Barang Terjual"
              value={s.hppStatus === "complete" || s.hppStatus === "partial" ? `− ${rp(s.hpp)}` : "Belum tersedia"}
              tone={s.hppStatus === "complete" ? "red" : "muted"}
              hint="Harga pokok (HPP) barang yang masuk perhitungan penjualan."
              caption={s.hppStatus === "complete" ? undefined : s.hppNote}
            />
            <BreakdownRow
              label="Biaya Operasional"
              value={s.biayaAvailable ? `− ${rp(s.biaya)}` : "Belum tersedia"}
              tone={s.biayaAvailable ? "red" : "muted"}
              hint="Biaya operasional yang tercatat di sistem."
              caption={s.biayaAvailable ? undefined : "Data biaya operasional belum tersedia."}
            />
            <BreakdownRow
              label="Estimasi Laba"
              value={s.profit !== null ? rp(s.profit) : "Belum dapat dihitung"}
              tone={s.profitStatus === "valid" ? (profitPositive ? "green" : "red") : "muted"}
              emphasis
              hint="Penjualan Setelah Retur − Modal Barang Terjual − Biaya Operasional."
              caption={s.profitStatus === "valid" ? undefined : s.profitNote}
            />
          </div>
          <p
            className={`mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold ${
              s.profitStatus === "partial" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
            }`}
          >
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {s.profitStatus === "valid"
              ? "Laba adalah estimasi dari penjualan setelah retur − modal − biaya; komponen di luar pencatatan sistem belum termasuk."
              : s.profitNote}
          </p>
      </section>

      {/* PENDING */}
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-sm md:p-6">
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
              <p className="mt-1 text-xl font-black text-[#374151] tabular-nums">{rp(s.refundsPending)}</p>
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
                {rpSigned(s.exchangePending)}
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
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black tracking-tight text-[#374151]">Tren Keuangan</h2>
            <p className="text-xs font-medium text-slate-500">
              Penjualan, penjualan setelah retur, dan estimasi laba mengikuti periode.
            </p>
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

        <div className="mt-4 h-72 w-full">
          {data.trend.points.every((point) => !point.gross && !point.net && !point.profit) ? (
            <div className="grid h-full place-items-center rounded-2xl bg-[#F9FAFB] text-center">
              <div>
                <p className="text-sm font-bold text-slate-700">Belum ada data di periode ini</p>
                <p className="mt-1 text-xs text-slate-500">Coba rentang tanggal lain.</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={54} />
                <ChartTooltip content={<TrendTooltip />} />
                {series.gross ? <Line type="monotone" dataKey="gross" name="Penjualan" stroke="#94A3B8" strokeWidth={2} dot={false} /> : null}
                {series.net ? <Line type="monotone" dataKey="net" name="Penjualan Setelah Retur" stroke="#2563EB" strokeWidth={2.5} dot={false} /> : null}
                {s.profitStatus === "valid" && series.profit ? (
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="Estimasi Laba"
                    stroke="#10B981"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                ) : null}
              </LineChart>
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

      {/* METODE PEMBAYARAN */}
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#F3F4F6] text-slate-700">
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
            <div className="mt-5 grid place-items-center rounded-2xl bg-[#F9FAFB] px-4 py-8 text-center">
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
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]">
                    <div
                      className={`h-full rounded-full ${PAYMENT_BAR[index] || "bg-slate-300"}`}
                      style={{ width: `${Math.max(2, row.share)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 whitespace-nowrap text-xs font-black text-slate-700 tabular-nums">{rp(row.amount)}</p>
                </div>
              ))}
            </div>
          )}
      </section>

      {/* TABLES */}
      <section ref={tableRef} id="report-tables" className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { key: "returns", label: "Retur", count: data.tables.returns.length },
              { key: "exchanges", label: "Tukar Size", count: data.tables.exchanges.length },
              { key: "sales", label: "Penjualan", count: data.tables.sales.length },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key as Tab)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  tab === item.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"
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
              {tab === "sales"
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
          rows={tab === "returns" ? data.tables.returns : tab === "exchanges" ? data.tables.exchanges : data.tables.sales}
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

function BreakdownRow({
  label,
  value,
  caption,
  tone,
  emphasis,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "red" | "green" | "blue" | "muted";
  emphasis?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  const toneClass =
    tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-emerald-600"
        : tone === "blue"
          ? "text-blue-600"
          : tone === "muted"
            ? "text-slate-400"
            : "text-slate-800";
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button", onClick } : {})}
      className={`flex w-full items-start justify-between gap-3 py-2.5 text-left ${onClick ? "hover:opacity-80" : ""}`}
    >
      <span>
        <span className={`block text-xs font-bold ${emphasis ? "text-slate-900" : "text-slate-500"}`} title={hint}>
          {label}
        </span>
        {caption ? <span className="mt-0.5 block text-[10px] font-semibold text-amber-600">{caption}</span> : null}
      </span>
      <span className={`shrink-0 font-black tabular-nums ${emphasis ? "text-base" : "text-sm"} ${emphasis ? toneClass : toneClass}`}>
        {value}
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
        if (statusFilter !== "all" && status !== statusFilter) return false;
        if (!needle) return true;
        const haystack =
          tab === "sales"
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
      <div className="mt-4 rounded-2xl bg-[#F9FAFB] py-12 text-center">
        <p className="text-sm font-bold text-slate-700">Tidak ada data</p>
        <p className="mt-1 text-xs text-slate-500">Coba ubah periode, pencarian, atau filter status.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#E5E7EB]">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-[#F9FAFB]">
            <tr>
              {tab === "sales" ? (
                <>
                  {header("order_number", "No. Pesanan")}
                  {header("customer_name", "Pelanggan", "hidden md:table-cell")}
                  {header("created_at", "Tanggal", "hidden sm:table-cell")}
                  {header("total", "Penjualan", "text-right")}
                  {header("status", "Status")}
                  {header("source", "Sumber", "hidden lg:table-cell")}
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
                {tab === "sales" ? (
                  <>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-800">{row.order_number}</td>
                    <td className="hidden px-3 py-3 text-xs font-semibold text-slate-600 md:table-cell">{row.customer_name || "-"}</td>
                    <td className="hidden px-3 py-3 text-xs text-slate-500 sm:table-cell">{dateOnly(row.created_at)}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-800">{rp(row.total)}</td>
                    <td className="px-3 py-3">
                      <Badge tone={row.status === "dibatalkan" ? "red" : row.status === "pending" ? "amber" : "green"}>
                        {statusLabel(row.status)}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-3 text-xs text-slate-500 lg:table-cell">{orderSourceLabel(row)}</td>
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
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-label="Tutup detail" />
      <aside className="relative h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Detail</p>
            <h2 className="mt-1 text-lg font-black text-slate-900">
              {selected.kind === "sales" ? row.order_number : row.return_number}
            </h2>
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

          {selected.kind === "sales" ? (
            <div className="rounded-2xl border border-[#E5E7EB] p-3.5">
              <div className="flex justify-between"><span className="text-slate-500">Penjualan</span><span className="font-black tabular-nums">{rp(row.total)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Status</span><Badge tone={row.status === "dibatalkan" ? "red" : row.status === "pending" ? "amber" : "green"}>{statusLabel(row.status)}</Badge></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Tanggal</span><span className="text-xs font-semibold">{dateTime(row.created_at)}</span></div>
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
                  <div>
                    <p className="font-bold text-slate-800">{item.product_name}</p>
                    <p className="text-slate-500">
                      {[item.color && item.color !== "default" ? item.color : null, item.size, item.replacement_size ? `→ ${item.replacement_size}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
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
      <div className="h-40 animate-pulse rounded-3xl border border-[#E5E7EB] bg-white" />
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="h-64 animate-pulse rounded-3xl border border-[#E5E7EB] bg-white" />
        <div className="h-64 animate-pulse rounded-3xl border border-[#E5E7EB] bg-white" />
      </div>
      <div className="h-44 animate-pulse rounded-3xl border border-[#E5E7EB] bg-white" />
      <div className="h-80 animate-pulse rounded-3xl border border-[#E5E7EB] bg-white" />
    </div>
  );
}
