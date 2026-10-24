"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Copy, Download, Loader2, RefreshCw } from "lucide-react";
import { produksiFetch } from "@/lib/produksi-api";
import { CATEGORY_ORDER } from "@/lib/ops-order";
import { formatQty, formatRupiah, todayInput } from "@/lib/produksi";
import { useProduksiAccess } from "./useAccess";
import {
  AccessGate,
  Badge,
  EmptyState,
  ErrorBox,
  FilterBar,
  FilterCheck,
  FilterDateRange,
  FilterSelect,
  PageHead,
  Spinner,
  StatCard,
  btnPrimary,
  btnSecondary,
  cardClass,
  inputClass,
  labelClass,
} from "./ui";

const rp = (value: unknown) => `Rp ${formatRupiah(Number(value) || 0)}`;
const qty = (value: unknown) => formatQty(Number(value) || 0);
const pct = (value: unknown) =>
  `${(Number(value) || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
const compactRp = (value: number) => {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} M`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} jt`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)} rb`;
  return String(Math.round(n));
};

type TabKey = "ringkasan" | "kebutuhan" | "persediaan" | "hpp" | "laba" | "cek";

const TABS: { key: TabKey; label: string; ownerOnly: boolean }[] = [
  { key: "ringkasan", label: "Ringkasan", ownerOnly: true },
  { key: "kebutuhan", label: "Kebutuhan Bahan", ownerOnly: false },
  { key: "persediaan", label: "Persediaan", ownerOnly: false },
  { key: "hpp", label: "HPP & Efisiensi", ownerOnly: true },
  { key: "laba", label: "Laba Pesanan", ownerOnly: true },
  { key: "cek", label: "Cek Data", ownerOnly: true },
];

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "ALL SIZE"];

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthEnd(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

function daysAgo(days: number): string {
  const d = new Date(`${todayInput()}T00:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (value: string | number) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(esc).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${btnSecondary} !px-2.5 !py-1.5 !text-[11px]`}>
      <Download size={13} /> Export CSV
    </button>
  );
}

function TableCard({
  title,
  note,
  count,
  onCsv,
  children,
}: {
  title: string;
  note?: string;
  count?: number;
  onCsv?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-3.5 py-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
          {note ? <p className="mt-0.5 text-[11px] text-slate-400">{note}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {typeof count === "number" ? (
            <span className="text-[11px] font-semibold text-slate-400 tabular-nums">{count} baris</span>
          ) : null}
          {onCsv ? <CsvButton onClick={onCsv} /> : null}
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

const thClass =
  "bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap";
const tdClass =
  "border-b border-slate-100 dark:border-slate-800/70 px-3 py-2.5 text-[12.5px] text-slate-700 dark:text-slate-200 align-top";
const tdNum = `${tdClass} text-right tabular-nums whitespace-nowrap`;

function PeriodPicker({
  period,
  setPeriod,
  start,
  end,
  setStart,
  setEnd,
}: {
  period: string;
  setPeriod: (value: string) => void;
  start: string;
  end: string;
  setStart: (value: string) => void;
  setEnd: (value: string) => void;
}) {
  const quick: { key: string; label: string; start: string; end: string }[] = [
    { key: "hari", label: "Hari ini", start: todayInput(), end: todayInput() },
    { key: "7hari", label: "7 hari", start: daysAgo(6), end: todayInput() },
    { key: "bulan", label: "Bulan ini", start: `${todayInput().slice(0, 7)}-01`, end: todayInput() },
    {
      key: "bulanlalu",
      label: "Bulan lalu",
      start: `${shiftMonth(todayInput().slice(0, 7), -1)}-01`,
      end: monthEnd(shiftMonth(todayInput().slice(0, 7), -1)),
    },
  ];
  return (
    <FilterBar
      active={period === "rentang"}
      onReset={() => {
        setPeriod("bulan");
        setStart(`${todayInput().slice(0, 7)}-01`);
        setEnd(todayInput());
      }}
      meta={`${start} → ${end}`}
    >
      <div className="flex flex-wrap items-center gap-1">
        {quick.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setPeriod(item.key);
              setStart(item.start);
              setEnd(item.end);
            }}
            className={`h-9 rounded-lg px-3 text-[11px] font-bold transition-colors ${
              period === item.key
                ? "bg-[#1e3a5f] text-white"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPeriod("rentang")}
          className={`h-9 rounded-lg px-3 text-[11px] font-bold transition-colors ${
            period === "rentang"
              ? "bg-[#1e3a5f] text-white"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          Rentang
        </button>
      </div>
      {period === "rentang" ? (
        <FilterDateRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
      ) : null}
    </FilterBar>
  );
}

export default function LaporanView() {
  const access = useProduksiAccess();
  const isOwner = access.role === "owner";
  const [tab, setTab] = useState<TabKey>("ringkasan");
  const [period, setPeriod] = useState("bulan");
  const [start, setStart] = useState(`${todayInput().slice(0, 7)}-01`);
  const [end, setEnd] = useState(todayInput());
  const [lowOnly, setLowOnly] = useState(false);
  const [scheduleId, setScheduleId] = useState("");

  const [options, setOptions] = useState<any>({
    categories: CATEGORY_ORDER,
    fabrics: [],
    series: [],
    sizes: SIZES,
  });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [req, setReq] = useState<any>({
    category: "Thobe",
    fabric_type_id: "",
    color: "",
    series: "",
    size_qtys: Object.fromEntries(SIZES.map((size) => [size, 0])),
  });
  const [reqData, setReqData] = useState<any>(null);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [reqNotice, setReqNotice] = useState("");

  const visibleTabs = useMemo(
    () => TABS.filter((item) => isOwner || !item.ownerOnly).map((item) =>
      item.key === "persediaan" && !isOwner ? { ...item, label: "Bahan Menipis" } : item,
    ),
    [isOwner],
  );

  useEffect(() => {
    if (access.loading) return;
    setTab(isOwner ? "ringkasan" : "kebutuhan");
  }, [access.loading, isOwner]);

  useEffect(() => {
    if (!access.allowed) return;
    produksiFetch<any>("/api/ops/production/reports?tab=options")
      .then((json) => {
        setOptions((current: any) => ({ ...current, ...(json || {}) }));
        if (json?.categories?.length) {
          setReq((current: any) =>
            json.categories.includes(current.category)
              ? current
              : { ...current, category: json.categories[0] },
          );
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat pilihan filter."));
  }, [access.allowed]);

  const load = useCallback(async () => {
    if (!access.allowed || tab === "kebutuhan") return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ tab, start, end });
      if (tab === "persediaan" && isOwner && lowOnly) params.set("low_only", "1");
      if (tab === "hpp" && scheduleId) params.set("schedule_id", scheduleId);
      const json = await produksiFetch<any>(`/api/ops/production/reports?${params.toString()}`);
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Gagal memuat laporan.");
    } finally {
      setLoading(false);
    }
  }, [access.allowed, tab, start, end, lowOnly, scheduleId, isOwner]);

  useEffect(() => {
    if (tab === "kebutuhan") return;
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load, tab]);

  async function hitungKebutuhan() {
    setReqLoading(true);
    setReqError("");
    setReqNotice("");
    try {
      const json = await produksiFetch<any>("/api/ops/production/reports?tab=kebutuhan", {
        method: "POST",
        body: JSON.stringify(req),
      });
      setReqData(json);
    } catch (e) {
      setReqData(null);
      setReqError(e instanceof Error ? e.message : "Gagal menghitung kebutuhan bahan.");
    } finally {
      setReqLoading(false);
    }
  }

  async function salinDaftarBelanja() {
    const rows = (reqData?.rows || []).filter((row: any) => Number(row.shortage) > 0);
    const text = rows.length
      ? rows
          .map(
            (row: any) =>
              `${row.component_name} (${row.component_code}): kurang ${qty(row.shortage)} ${row.unit_use}`,
          )
          .join("\n")
      : "Semua bahan cukup.";
    try {
      await navigator.clipboard.writeText(text);
      setReqNotice("Daftar belanja disalin.");
    } catch {
      setReqNotice(text);
    }
    setTimeout(() => setReqNotice(""), 3000);
  }

  const tabLabel = visibleTabs.find((item) => item.key === tab)?.label || "Laporan";

  return (
    <AccessGate access={access}>
      <div className="space-y-4">
        <PageHead
          title="Laporan Produksi"
          subtitle="Baca saja: ringkasan, kebutuhan bahan, persediaan, HPP, laba pesanan, dan kelengkapan data."
          actions={
            <button
              type="button"
              className={`${btnSecondary} !px-3 !py-2 !text-[12px]`}
              onClick={() => (tab === "kebutuhan" ? hitungKebutuhan() : load())}
              disabled={loading || reqLoading}
            >
              <RefreshCw size={14} className={loading || reqLoading ? "animate-spin" : ""} /> Muat ulang
            </button>
          }
        />

        <ErrorBox message={error || reqError} />

        <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-800 dark:bg-[#1a1d28]">
          {visibleTabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key);
                setScheduleId("");
                setNotice("");
              }}
              className={`rounded-lg px-3 py-2 text-[12px] font-bold transition-colors ${
                tab === item.key
                  ? "bg-[#1e3a5f] text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {["ringkasan", "hpp", "laba"].includes(tab) ? (
          <PeriodPicker
            period={period}
            setPeriod={setPeriod}
            start={start}
            end={end}
            setStart={setStart}
            setEnd={setEnd}
          />
        ) : null}

        {tab === "kebutuhan" ? (
          <KebutuhanTab
            options={options}
            req={req}
            setReq={setReq}
            data={reqData}
            loading={reqLoading}
            notice={reqNotice}
            onHitung={hitungKebutuhan}
            onCopy={salinDaftarBelanja}
          />
        ) : loading && !data ? (
          <Spinner label={`Memuat ${tabLabel.toLowerCase()}…`} />
        ) : tab === "ringkasan" ? (
          <RingkasanTab data={data} />
        ) : tab === "persediaan" ? (
          <PersediaanTab data={data} isOwner={isOwner} lowOnly={lowOnly} setLowOnly={setLowOnly} />
        ) : tab === "hpp" ? (
          <HppTab
            data={data}
            scheduleId={scheduleId}
            setScheduleId={setScheduleId}
          />
        ) : tab === "laba" ? (
          <LabaTab data={data} />
        ) : (
          <CekDataTab data={data} />
        )}

        {notice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
            {notice}
          </div>
        ) : null}
      </div>
    </AccessGate>
  );
}

function RingkasanTab({ data }: { data: any }) {
  if (!data) return <EmptyState title="Belum ada data ringkasan." />;
  const kpi = data.kpi || {};
  const trend = data.trend || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Nilai Persediaan Komponen" value={rp(kpi.component_value)} hint="Stok × Harga Real" />
        <StatCard
          label="Nilai Persediaan Barang Jadi"
          value={rp(kpi.finished_value)}
          hint={`${kpi.finished_missing_count || 0} varian belum punya HPP`}
          tone={kpi.finished_missing_count > 0 ? "warning" : "default"}
        />
        <StatCard label="Jadwal Berjalan" value={String(kpi.running_schedules || 0)} hint="Status Berjalan" />
        <StatCard
          label="Komponen Menipis"
          value={String(kpi.low_components || 0)}
          hint="Stok ≤ minimum"
          tone={kpi.low_components > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Laba Kotor Periode"
          value={rp(kpi.gross_profit)}
          hint={`Pendapatan ${rp(kpi.revenue)}`}
          tone={kpi.gross_profit >= 0 ? "positive" : "danger"}
        />
        <StatCard label="Margin Rata-rata" value={pct(kpi.margin)} hint="Laba kotor ÷ pendapatan" />
        <StatCard
          label="Reject Periode"
          value={pct(kpi.reject_pct)}
          hint="Dari total hasil penerimaan"
          tone={kpi.reject_pct > 5 ? "danger" : "default"}
        />
        <StatCard
          label="Pesanan Terhitung"
          value={`${kpi.snapshot_orders || 0}/${kpi.orders_count || 0}`}
          hint={`${kpi.missing_snapshot_orders || 0} tanpa snapshot HPP`}
          tone={kpi.missing_snapshot_orders > 0 ? "warning" : "default"}
        />
      </div>

      <div className={`${cardClass} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Laba Kotor</p>
            <p className="text-[11px] text-slate-400">Per hari; otomatis per minggu bila rentang &gt; 45 hari.</p>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">{trend.length} titik</span>
          <CsvButton
            onClick={() =>
              downloadCsv(
                "ringkasan-laba.csv",
                ["Tanggal", "Label", "Pendapatan", "Laba Kotor"],
                trend.map((row: any) => [row.date, row.label, row.revenue, row.profit]),
              )
            }
          />
        </div>
        <div className="mt-3 h-64 w-full">
          {trend.length === 0 ? (
            <EmptyState title="Belum ada laba pada periode ini." description="Pilih periode lain atau pastikan pesanan punya snapshot HPP." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compactRp} tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={64} />
                <ChartTooltip formatter={(value: any) => rp(value)} />
                <Bar dataKey="profit" name="Laba kotor" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function KebutuhanTab({
  options,
  req,
  setReq,
  data,
  loading,
  notice,
  onHitung,
  onCopy,
}: {
  options: any;
  req: any;
  setReq: (value: any) => void;
  data: any;
  loading: boolean;
  notice: string;
  onHitung: () => void;
  onCopy: () => void;
}) {
  const rows = data?.rows || [];
  const showPrices = Boolean(data?.show_prices);
  function setSize(size: string, value: string) {
    setReq({
      ...req,
      size_qtys: { ...(req.size_qtys || {}), [size]: Math.max(0, Number(value) || 0) },
    });
  }
  return (
    <div className="space-y-4">
      <div className={`${cardClass} p-4`}>
        <p className="text-sm font-bold text-slate-900 dark:text-white">Simulasi Kebutuhan Bahan</p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Menghitung kelompok Bahan Produksi dari resep aktif, dibanding stok tersedia (stok fisik − reservasi). Tidak membuat jadwal.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className={labelClass}>Kategori</span>
            <FilterSelect value={req.category || ""} onChange={(value) => setReq({ ...req, category: value })}>
              {(options.categories || CATEGORY_ORDER).map((category: string) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </FilterSelect>
          </label>
          <label>
            <span className={labelClass}>Jenis kain</span>
            <FilterSelect value={req.fabric_type_id || ""} onChange={(value) => setReq({ ...req, fabric_type_id: value })}>
              <option value="">Semua jenis kain</option>
              {(options.fabrics || []).map((fabric: any) => (
                <option key={fabric.id} value={fabric.id}>{fabric.name}</option>
              ))}
            </FilterSelect>
          </label>
          <label>
            <span className={labelClass}>Series</span>
            <FilterSelect value={req.series || ""} onChange={(value) => setReq({ ...req, series: value })}>
              <option value="">Semua series</option>
              {(options.series || []).map((series: string) => (
                <option key={series} value={series}>{series}</option>
              ))}
            </FilterSelect>
          </label>
          <label>
            <span className={labelClass}>Warna (opsional)</span>
            <input
              className={inputClass}
              value={req.color || ""}
              onChange={(event) => setReq({ ...req, color: event.target.value })}
              placeholder="mis. Navy"
            />
          </label>
        </div>

        <div className="mt-3">
          <span className={labelClass}>Jumlah per ukuran</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {(options.sizes || SIZES).map((size: string) => (
              <label key={size} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
                <span className="block text-[10px] font-bold uppercase text-slate-400">{size}</span>
                <input
                  type="number"
                  min={0}
                  value={req.size_qtys?.[size] ?? 0}
                  onChange={(event) => setSize(size, event.target.value)}
                  className="w-full bg-transparent text-center text-sm font-black text-slate-800 outline-none dark:text-slate-100"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={btnPrimary} onClick={onHitung} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : null} Hitung Kebutuhan
          </button>
          <button type="button" className={btnSecondary} onClick={onCopy} disabled={!rows.length}>
            <Copy size={14} /> Salin daftar belanja
          </button>
          {notice ? <span className="text-[11px] font-bold text-emerald-600">{notice}</span> : null}
        </div>
        {data && !data.show_prices ? (
          <p className="mt-2 text-[11px] font-semibold text-amber-600">
            Harga dan nilai disembunyikan untuk role Leader.
          </p>
        ) : null}
      </div>

      {data?.warnings?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          {data.warnings.map((warning: string) => <p key={warning}>• {warning}</p>)}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total Target" value={`${qty(data.total_pcs)} pcs`} />
            <StatCard
              label="Komponen Kurang"
              value={String(data.totals?.shortage_count || 0)}
              tone={data.totals?.shortage_count > 0 ? "warning" : "positive"}
            />
            {showPrices ? (
              <StatCard label="Estimasi Belanja" value={rp(data.totals?.estimated_cost)} hint="Harga Real/Aman komponen" />
            ) : null}
          </div>
          <TableCard
            title="Kebutuhan Bahan"
            note="Kurang = kebutuhan − stok tersedia."
            count={rows.length}
            onCsv={() =>
              downloadCsv(
                `kebutuhan-bahan-${req.category || "produk"}.csv`,
                ["Kode", "Komponen", "Butuh", "Stok", "Direservasi", "Tersedia", "Kurang", "Status", ...(showPrices ? ["Harga", "Estimasi"] : [])],
                rows.map((row: any) => [
                  row.component_code,
                  row.component_name,
                  row.required,
                  row.stock,
                  row.reserved,
                  row.available,
                  row.shortage,
                  row.status,
                  ...(showPrices ? [row.unit_price, row.estimated_cost] : []),
                ]),
              )
            }
          >
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>Kode</th>
                  <th className={thClass}>Komponen</th>
                  <th className={`${thClass} text-right`}>Butuh</th>
                  <th className={`${thClass} text-right`}>Stok</th>
                  <th className={`${thClass} text-right`}>Reservasi</th>
                  <th className={`${thClass} text-right`}>Tersedia</th>
                  <th className={`${thClass} text-right`}>Kurang</th>
                  <th className={thClass}>Status</th>
                  {showPrices ? <th className={`${thClass} text-right`}>Estimasi</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={showPrices ? 9 : 8} className={tdClass}><EmptyState title="Belum ada kebutuhan. Isi target lalu klik Hitung." /></td></tr>
                ) : rows.map((row: any) => (
                  <tr key={row.component_id}>
                    <td className={`${tdClass} font-mono text-[11px]`}>{row.component_code}</td>
                    <td className={tdClass}>{row.component_name}<span className="ml-1 text-[11px] text-slate-400">{row.unit_use}</span></td>
                    <td className={tdNum}>{qty(row.required)}</td>
                    <td className={tdNum}>{qty(row.stock)}</td>
                    <td className={tdNum}>{qty(row.reserved)}</td>
                    <td className={tdNum}>{qty(row.available)}</td>
                    <td className={`${tdNum} ${row.shortage > 0 ? "text-red-600 font-bold" : ""}`}>{qty(row.shortage)}</td>
                    <td className={tdClass}><Badge tone={row.status === "kurang" ? "red" : "green"}>{row.status === "kurang" ? "Kurang" : "Cukup"}</Badge></td>
                    {showPrices ? <td className={tdNum}>{rp(row.estimated_cost)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      ) : (
        <EmptyState title="Belum ada simulasi." description="Pilih target dan ukuran, lalu klik Hitung Kebutuhan." />
      )}
    </div>
  );
}

function PersediaanTab({
  data,
  isOwner,
  lowOnly,
  setLowOnly,
}: {
  data: any;
  isOwner: boolean;
  lowOnly: boolean;
  setLowOnly: (value: boolean) => void;
}) {
  if (!data) return <EmptyState title="Belum ada data persediaan." />;
  const components = data.components || [];
  const finished = data.finished || [];
  const showPrices = Boolean(data.show_prices);
  return (
    <div className="space-y-4">
      {showPrices ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Nilai Persediaan Komponen" value={rp(data.totals?.component_value)} />
          <StatCard label="Nilai Persediaan Barang Jadi" value={rp(data.totals?.finished_value)} hint={`${data.totals?.finished_missing_count || 0} varian belum HPP`} />
          <StatCard label="Komponen Menipis/Habis" value={String(data.totals?.low_count || 0)} tone={data.totals?.low_count > 0 ? "warning" : "default"} />
          <StatCard label="Total Komponen Aktif" value={String(data.totals?.component_count || 0)} />
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          Menampilkan hanya bahan menipis/habis. Harga dan nilai disembunyikan untuk Leader.
        </div>
      )}

      <FilterBar active={isOwner && lowOnly} onReset={() => setLowOnly(false)} meta={`${components.length} komponen`}>
        {isOwner ? (
          <FilterCheck checked={lowOnly} onChange={setLowOnly} label="Hanya menipis/habis" />
        ) : null}
      </FilterBar>

      <TableCard
        title={showPrices ? "Persediaan Komponen" : "Bahan Menipis"}
        count={components.length}
        onCsv={() =>
          downloadCsv(
            "persediaan-komponen.csv",
            ["Kode", "Komponen", "Kategori", "Stok", "Direservasi", "Tersedia", "Minimum", "Status", ...(showPrices ? ["Harga Real", "Nilai"] : [])],
            components.map((row: any) => [
              row.code, row.name, row.category, row.stock, row.reserved, row.available, row.min_stock, row.status,
              ...(showPrices ? [row.real_price, row.value] : []),
            ]),
          )
        }
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass}>Kode</th>
              <th className={thClass}>Komponen</th>
              <th className={thClass}>Kategori</th>
              <th className={`${thClass} text-right`}>Stok</th>
              <th className={`${thClass} text-right`}>Reservasi</th>
              <th className={`${thClass} text-right`}>Tersedia</th>
              <th className={`${thClass} text-right`}>Minimum</th>
              <th className={thClass}>Status</th>
              {showPrices ? <th className={`${thClass} text-right`}>Nilai</th> : null}
            </tr>
          </thead>
          <tbody>
            {components.length === 0 ? (
              <tr><td colSpan={showPrices ? 9 : 8} className={tdClass}><EmptyState title={showPrices ? "Semua komponen aman." : "Tidak ada bahan menipis."} /></td></tr>
            ) : components.map((row: any) => (
              <tr key={row.id}>
                <td className={`${tdClass} font-mono text-[11px]`}>{row.code}</td>
                <td className={tdClass}>{row.name}<span className="ml-1 text-[11px] text-slate-400">{row.unit_use}</span></td>
                <td className={`${tdClass} text-[11px] text-slate-400`}>{row.category}</td>
                <td className={tdNum}>{qty(row.stock)}</td>
                <td className={tdNum}>{qty(row.reserved)}</td>
                <td className={tdNum}>{qty(row.available)}</td>
                <td className={tdNum}>{qty(row.min_stock)}</td>
                <td className={tdClass}>
                  <Badge tone={row.status === "habis" ? "red" : row.status === "menipis" ? "amber" : "green"}>
                    {row.status === "habis" ? "Habis" : row.status === "menipis" ? "Menipis" : "Aman"}
                  </Badge>
                </td>
                {showPrices ? <td className={tdNum}>{rp(row.value)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {showPrices ? (
        <TableCard
          title="Persediaan Barang Jadi"
          note="HPP memakai rata-rata produksi per varian. Varian tanpa HPP ditandai."
          count={finished.length}
          onCsv={() =>
            downloadCsv(
              "persediaan-barang-jadi.csv",
              ["Produk", "Series", "Warna", "Ukuran", "Stok", "HPP Rata-rata", "Nilai", "Status HPP"],
              finished.map((row: any) => [
                row.product_name, row.series, row.color, row.size, row.stock, row.hpp_avg, row.value,
                row.missing_hpp ? "Belum ada HPP" : "Ada",
              ]),
            )
          }
        >
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Produk</th>
                <th className={thClass}>Series</th>
                <th className={thClass}>Warna / Ukuran</th>
                <th className={`${thClass} text-right`}>Stok</th>
                <th className={`${thClass} text-right`}>HPP Rata-rata</th>
                <th className={`${thClass} text-right`}>Nilai</th>
                <th className={thClass}>HPP</th>
              </tr>
            </thead>
            <tbody>
              {finished.length === 0 ? (
                <tr><td colSpan={7} className={tdClass}><EmptyState title="Belum ada barang jadi berstok." /></td></tr>
              ) : finished.map((row: any) => (
                <tr key={`${row.product_id}|${row.color}|${row.size}`}>
                  <td className={tdClass}>{row.product_name}</td>
                  <td className={`${tdClass} text-[11px] text-slate-400`}>{row.series}</td>
                  <td className={tdClass}>{row.color} · {row.size}</td>
                  <td className={tdNum}>{qty(row.stock)}</td>
                  <td className={tdNum}>{row.missing_hpp ? "-" : rp(row.hpp_avg)}</td>
                  <td className={tdNum}>{row.missing_hpp ? "-" : rp(row.value)}</td>
                  <td className={tdClass}><Badge tone={row.missing_hpp ? "amber" : "green"}>{row.missing_hpp ? "Belum ada HPP" : "Ada"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      ) : null}
    </div>
  );
}

function HppTab({ data, scheduleId, setScheduleId }: { data: any; scheduleId: string; setScheduleId: (value: string) => void }) {
  if (!data) return <EmptyState title="Belum ada data HPP." />;
  const variants = data.variants || [];
  const history = data.history || [];
  const usage = data.material_usage || [];
  const yieldData = data.yield || {};
  return (
    <div className="space-y-4">
      <FilterBar active={Boolean(scheduleId)} onReset={() => setScheduleId("")} meta={`${variants.length} varian`}>
        <FilterSelect value={scheduleId} onChange={setScheduleId} ariaLabel="Filter jadwal">
          <option value="">Semua jadwal (periode)</option>
          {(data.schedules || []).map((schedule: any) => (
            <option key={schedule.id} value={schedule.id}>{schedule.schedule_number} · {schedule.date}</option>
          ))}
        </FilterSelect>
      </FilterBar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Yield Lolos" value={pct(yieldData.totals?.yield_pct)} hint={`${qty(yieldData.totals?.lolos)} pcs`} tone="positive" />
        <StatCard label="Rework" value={pct(yieldData.totals?.rework_pct)} hint={`${qty(yieldData.totals?.rework)} pcs`} tone="warning" />
        <StatCard label="Reject" value={pct(yieldData.totals?.reject_pct)} hint={`${qty(yieldData.totals?.reject)} pcs`} tone="danger" />
        <StatCard label="Total Diproses" value={`${qty(yieldData.totals?.produced)} pcs`} />
      </div>

      <TableCard
        title="HPP Standar vs Aktual"
        note="Standar = HPP Aman dari resep aktif; aktual = rata-rata produksi."
        count={variants.length}
        onCsv={() => downloadCsv(
          "hpp-standar-aktual.csv",
          ["Produk", "Series", "Warna", "Ukuran", "Qty", "Aktual", "Standar", "Selisih", "Selisih %", "Catatan"],
          variants.map((row: any) => [row.product_name, row.series, row.color, row.size, row.qty_received, row.actual, row.standard ?? "", row.diff ?? "", row.pct ?? "", row.warning || ""]),
        )}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass}>Produk</th>
              <th className={thClass}>Series</th>
              <th className={thClass}>Varian</th>
              <th className={`${thClass} text-right`}>Qty</th>
              <th className={`${thClass} text-right`}>Aktual</th>
              <th className={`${thClass} text-right`}>Standar</th>
              <th className={`${thClass} text-right`}>Selisih</th>
              <th className={`${thClass} text-right`}>%</th>
              <th className={thClass}>Catatan</th>
            </tr>
          </thead>
          <tbody>
            {variants.length === 0 ? (
              <tr><td colSpan={9} className={tdClass}><EmptyState title="Belum ada HPP produksi." /></td></tr>
            ) : variants.map((row: any) => (
              <tr key={`${row.product_id}|${row.color}|${row.size}`}>
                <td className={tdClass}>{row.product_name}</td>
                <td className={`${tdClass} text-[11px] text-slate-400`}>{row.series}</td>
                <td className={tdClass}>{row.color} · {row.size}</td>
                <td className={tdNum}>{qty(row.qty_received)}</td>
                <td className={tdNum}>{rp(row.actual)}</td>
                <td className={tdNum}>{row.standard == null ? "-" : rp(row.standard)}</td>
                <td className={`${tdNum} ${Number(row.diff) > 0 ? "text-red-600" : "text-emerald-600"}`}>{row.diff == null ? "-" : rp(row.diff)}</td>
                <td className={tdNum}>{row.pct == null ? "-" : pct(row.pct)}</td>
                <td className={`${tdClass} text-[11px] text-amber-600`}>{row.warning || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <TableCard title="Riwayat HPP Aktual" note="Nilai HPP per kontribusi produksi." count={history.length}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass}>Tanggal</th>
              <th className={thClass}>Produk</th>
              <th className={thClass}>Varian</th>
              <th className={`${thClass} text-right`}>Qty</th>
              <th className={`${thClass} text-right`}>HPP</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={5} className={tdClass}><EmptyState title="Belum ada riwayat HPP pada periode ini." /></td></tr>
            ) : history.slice(0, 200).map((row: any, index: number) => (
              <tr key={`${row.date}-${row.product_id}-${row.color}-${row.size}-${index}`}>
                <td className={tdClass}>{row.date}</td>
                <td className={tdClass}>{row.product_name}<span className="ml-1 text-[11px] text-slate-400">{row.series}</span></td>
                <td className={tdClass}>{row.color} · {row.size}</td>
                <td className={tdNum}>{qty(row.qty)}</td>
                <td className={tdNum}>{rp(row.hpp_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <TableCard title="Pemakaian Bahan Aktual vs Standar" note="Dari jadwal Selesai: aktual = keluar produksi − retur sisa." count={usage.length}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass}>Komponen</th>
              <th className={`${thClass} text-right`}>Standar</th>
              <th className={`${thClass} text-right`}>Aktual</th>
              <th className={`${thClass} text-right`}>Selisih</th>
              <th className={`${thClass} text-right`}>%</th>
              <th className={thClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {usage.length === 0 ? (
              <tr><td colSpan={6} className={tdClass}><EmptyState title="Belum ada jadwal Selesai pada periode ini." /></td></tr>
            ) : usage.map((row: any) => (
              <tr key={row.component_id}>
                <td className={tdClass}>{row.component_code} · {row.component_name}<span className="ml-1 text-[11px] text-slate-400">{row.unit_use}</span></td>
                <td className={tdNum}>{qty(row.standard)}</td>
                <td className={tdNum}>{qty(row.actual)}</td>
                <td className={`${tdNum} ${row.status === "boros" ? "text-red-600" : row.status === "hemat" ? "text-emerald-600" : ""}`}>{row.diff > 0 ? "+" : ""}{qty(row.diff)}</td>
                <td className={tdNum}>{row.pct == null ? "-" : pct(row.pct)}</td>
                <td className={tdClass}><Badge tone={row.status === "boros" ? "red" : row.status === "hemat" ? "green" : "slate"}>{row.status === "boros" ? "Boros" : row.status === "hemat" ? "Hemat" : "Pas"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <TableCard title="Yield per Jadwal" count={yieldData.per_schedule?.length || 0}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass}>Jadwal</th>
              <th className={thClass}>Tanggal</th>
              <th className={`${thClass} text-right`}>Lolos</th>
              <th className={`${thClass} text-right`}>Rework</th>
              <th className={`${thClass} text-right`}>Reject</th>
              <th className={`${thClass} text-right`}>Yield</th>
              <th className={`${thClass} text-right`}>Reject %</th>
            </tr>
          </thead>
          <tbody>
            {(yieldData.per_schedule || []).length === 0 ? (
              <tr><td colSpan={7} className={tdClass}><EmptyState title="Belum ada penerimaan hasil pada periode ini." /></td></tr>
            ) : (yieldData.per_schedule || []).map((row: any) => (
              <tr key={row.schedule_id}>
                <td className={tdClass}>{row.schedule_number}</td>
                <td className={tdClass}>{row.date}</td>
                <td className={tdNum}>{row.lolos}</td>
                <td className={tdNum}>{row.rework}</td>
                <td className={tdNum}>{row.reject}</td>
                <td className={tdNum}>{pct(row.yield_pct)}</td>
                <td className={tdNum}>{pct(row.reject_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <TableCard title="Alasan Reject Terbanyak" count={yieldData.reject_reasons?.length || 0}>
        <table className="w-full border-collapse">
          <thead><tr><th className={thClass}>Alasan</th><th className={`${thClass} text-right`}>Jumlah</th></tr></thead>
          <tbody>
            {(yieldData.reject_reasons || []).length === 0 ? (
              <tr><td colSpan={2} className={tdClass}><EmptyState title="Tidak ada reject." /></td></tr>
            ) : (yieldData.reject_reasons || []).map((row: any) => (
              <tr key={row.reason}><td className={tdClass}>{row.reason}</td><td className={tdNum}>{qty(row.count)}</td></tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}

function LabaTab({ data }: { data: any }) {
  if (!data) return <EmptyState title="Belum ada data laba pesanan." />;
  const summary = data.summary || {};
  const byProduct = data.by_product || [];
  const bySeries = data.by_series || [];
  const byPlatform = data.by_platform || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pendapatan Barang" value={rp(summary.revenue)} hint="Setelah diskon, tanpa ongkir" />
        <StatCard label="HPP Barang" value={rp(summary.hpp_goods)} />
        <StatCard label="HPP Kemasan" value={rp(summary.packaging)} />
        <StatCard label="Laba Kotor" value={rp(summary.gross_profit)} hint={`Margin ${pct(summary.margin)}`} tone={summary.gross_profit >= 0 ? "positive" : "danger"} />
        <StatCard label="Pesanan Terhitung" value={`${summary.snapshot_orders || 0}/${summary.orders || 0}`} />
        <StatCard label="Tanpa Snapshot HPP" value={String(summary.missing_snapshot || 0)} tone={summary.missing_snapshot > 0 ? "warning" : "default"} />
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[12px] leading-relaxed text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
        Ini <b>laba kotor</b> sebelum fee marketplace, ongkir, dan iklan. Pesanan tanpa snapshot HPP tidak dihitung.
      </div>

      <TableCard title="Laba per Produk" note="HPP per produk belum termasuk biaya kemasan (biaya order-level)." count={byProduct.length} onCsv={() => downloadCsv(
        "laba-per-produk.csv",
        ["Produk", "Series", "Qty", "Pendapatan", "HPP", "Laba Kotor", "Margin %"],
        byProduct.map((row: any) => [row.name, row.series, row.qty, row.revenue, row.hpp, row.profit, row.margin]),
      )}>
        <table className="w-full border-collapse">
          <thead><tr><th className={thClass}>Produk</th><th className={thClass}>Series</th><th className={`${thClass} text-right`}>Qty</th><th className={`${thClass} text-right`}>Pendapatan</th><th className={`${thClass} text-right`}>HPP</th><th className={`${thClass} text-right`}>Laba</th><th className={`${thClass} text-right`}>Margin</th></tr></thead>
          <tbody>
            {byProduct.length === 0 ? (
              <tr><td colSpan={7} className={tdClass}><EmptyState title="Belum ada pesanan dengan snapshot HPP." /></td></tr>
            ) : byProduct.map((row: any) => (
              <tr key={row.key}>
                <td className={tdClass}>{row.name}</td>
                <td className={`${tdClass} text-[11px] text-slate-400`}>{row.series}</td>
                <td className={tdNum}>{qty(row.qty)}</td>
                <td className={tdNum}>{rp(row.revenue)}</td>
                <td className={tdNum}>{rp(row.hpp)}</td>
                <td className={`${tdNum} ${row.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{rp(row.profit)}</td>
                <td className={tdNum}>{pct(row.margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableCard title="Laba per Series" count={bySeries.length}>
          <table className="w-full border-collapse">
            <thead><tr><th className={thClass}>Series</th><th className={`${thClass} text-right`}>Qty</th><th className={`${thClass} text-right`}>Laba</th><th className={`${thClass} text-right`}>Margin</th></tr></thead>
            <tbody>{bySeries.map((row: any) => <tr key={row.key}><td className={tdClass}>{row.label}</td><td className={tdNum}>{qty(row.qty)}</td><td className={tdNum}>{rp(row.profit)}</td><td className={tdNum}>{pct(row.margin)}</td></tr>)}</tbody>
          </table>
        </TableCard>
        <TableCard title="Laba per Platform" count={byPlatform.length}>
          <table className="w-full border-collapse">
            <thead><tr><th className={thClass}>Platform</th><th className={`${thClass} text-right`}>Pesanan</th><th className={`${thClass} text-right`}>Laba</th><th className={`${thClass} text-right`}>Margin</th></tr></thead>
            <tbody>{byPlatform.map((row: any) => <tr key={row.key}><td className={tdClass}>{row.label}</td><td className={tdNum}>{row.orders}</td><td className={tdNum}>{rp(row.profit)}</td><td className={tdNum}>{pct(row.margin)}</td></tr>)}</tbody>
          </table>
        </TableCard>
      </div>

      <TableCard title="Margin Paling Tipis" note="Produk dengan margin terendah pada periode ini." count={data.thin_margin?.length || 0}>
        <table className="w-full border-collapse">
          <thead><tr><th className={thClass}>Produk</th><th className={thClass}>Series</th><th className={`${thClass} text-right`}>Pendapatan</th><th className={`${thClass} text-right`}>Laba</th><th className={`${thClass} text-right`}>Margin</th></tr></thead>
          <tbody>{(data.thin_margin || []).map((row: any) => <tr key={row.key}><td className={tdClass}>{row.name}</td><td className={`${tdClass} text-[11px] text-slate-400`}>{row.series}</td><td className={tdNum}>{rp(row.revenue)}</td><td className={`${tdNum} ${row.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{rp(row.profit)}</td><td className={tdNum}>{pct(row.margin)}</td></tr>)}</tbody>
        </table>
      </TableCard>

      {(data.missing_orders || []).length > 0 ? (
        <TableCard title="Pesanan Belum Ada HPP" note="Tidak dihitung di laba. Lengkapi snapshot lewat alur transaksi/produksi." count={data.missing_orders.length}>
          <table className="w-full border-collapse">
            <thead><tr><th className={thClass}>No. Pesanan</th><th className={thClass}>Tanggal</th><th className={thClass}>Status</th><th className={`${thClass} text-right`}>Total</th></tr></thead>
            <tbody>{data.missing_orders.map((row: any) => <tr key={row.order_number}><td className={tdClass}>{row.order_number}</td><td className={tdClass}>{String(row.created_at).slice(0, 10)}</td><td className={tdClass}>{row.status}</td><td className={tdNum}>{rp(row.total)}</td></tr>)}</tbody>
          </table>
        </TableCard>
      ) : null}
    </div>
  );
}

function CekDataTab({ data }: { data: any }) {
  if (!data) return <EmptyState title="Belum ada hasil pemeriksaan." />;
  const groups = data.groups || [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total Temuan" value={String(data.total || 0)} tone={data.total > 0 ? "warning" : "positive"} />
          <StatCard label="Pesanan Tanpa Snapshot" value={String(data.missing_snapshot_orders || 0)} />
          <StatCard label="Produk Tanpa HPP" value={String(data.products_without_hpp || 0)} />
        </div>
        <CsvButton
          onClick={() =>
            downloadCsv(
              "cek-data-produksi.csv",
              ["Kategori", "Item", "Keterangan", "Tautan"],
              groups.flatMap((group: any) =>
                group.items.map((row: any) => [group.label, row.title, row.detail, row.link]),
              ),
            )
          }
        />
      </div>
      {groups.filter((group: any) => group.count > 0).length === 0 ? (
        <EmptyState title="Data produksi lengkap." description="Tidak ada masalah kelengkapan yang terdeteksi." />
      ) : groups.filter((group: any) => group.count > 0).map((group: any) => (
        <TableCard key={group.key} title={group.label} count={group.count}>
          <table className="w-full border-collapse">
            <thead><tr><th className={thClass}>Item</th><th className={thClass}>Keterangan</th><th className={thClass}>Tautan</th></tr></thead>
            <tbody>{group.items.map((row: any, index: number) => (
              <tr key={`${group.key}-${index}`}>
                <td className={tdClass}>{row.title}</td>
                <td className={`${tdClass} text-[12px]`}>{row.detail}</td>
                <td className={tdClass}><Link href={row.link} className="text-[12px] font-bold text-[#1e3a5f] underline dark:text-blue-300">Buka</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </TableCard>
      ))}
    </div>
  );
}
