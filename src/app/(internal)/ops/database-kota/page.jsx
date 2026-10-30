"use client";

/**
 * Menu "Database Kota" — sebaran pelanggan & pesanan per kota.
 *
 * Menggantikan tab "DATABASE PER-KOTA" di Google Sheet: angkanya dihitung langsung dari
 * pesanan yang sudah ada (pesanan website + transaksi manual), tidak ada data yang perlu
 * diisi manual. Gaya halaman mengikuti menu Leads/Pelanggan di ops.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  MapPin,
  Search,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { base44 } from "@/lib/ops-api";
import { MONTHS, formatRupiah, pad } from "@/components/ops/transaksi/transaksi-format";
import { formatTanggalID } from "@/components/ops/leads/DateFilter";
import KotaDetailDrawer from "@/components/ops/kota/KotaDetailDrawer";

const EMPTY = { items: [], totals: null, options: { provinces: [], sources: [] } };
const SLICE_COLORS = ["#18181b", "#3f3f46", "#52525b", "#71717a", "#a1a1aa", "#d4d4d8"];

const SELECT_CLASS =
  "px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function DatabaseKota() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [allTime, setAllTime] = useState(false);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [province, setProvince] = useState("all");
  const [source, setSource] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const search = useDeferredValue(searchInput).trim();
  const [sort, setSort] = useState({ key: "orders", dir: "desc" });
  const [detail, setDetail] = useState(null);

  const monthStart = `${year}-${pad(month + 1)}-01`;
  const monthEnd = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
  const usingRange = Boolean(rangeFrom || rangeTo);
  const start = usingRange ? rangeFrom : allTime ? "" : monthStart;
  const end = usingRange ? rangeTo : allTime ? "" : monthEnd;

  const { data = EMPTY, isLoading } = useQuery({
    queryKey: ["kota", start, end, province, source, search],
    queryFn: () => base44.entities.Kota.list({ start, end, province, source, q: search }),
    initialData: EMPTY,
  });

  const resetPeriod = () => {
    setAllTime(false);
    setRangeFrom("");
    setRangeTo("");
  };

  const prevMonth = () => {
    resetPeriod();
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const nextMonth = () => {
    resetPeriod();
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const filtersActive =
    Boolean(search) || province !== "all" || source !== "all" || usingRange || allTime;
  const resetFilters = () => {
    setSearchInput("");
    setProvince("all");
    setSource("all");
    resetPeriod();
  };

  const coverageLabel = usingRange
    ? `${rangeFrom ? formatTanggalID(rangeFrom) : "awal"} – ${rangeTo ? formatTanggalID(rangeTo) : "sekarang"}`
    : allTime
      ? "Semua waktu"
      : `${MONTHS[month]} ${year}`;

  /** Baris tabel mengikuti kolom yang sedang diurutkan. */
  const rows = useMemo(() => {
    const list = [...(data.items || [])];
    const direction = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sort.key === "city") return a.city.localeCompare(b.city, "id") * direction;
      if (sort.key === "province") return String(a.province).localeCompare(String(b.province), "id") * direction;
      return ((a[sort.key] || 0) - (b[sort.key] || 0)) * direction;
    });
    return list;
  }, [data.items, sort]);

  const maxOrders = Math.max(1, ...rows.map((row) => row.orders || 0));
  const topTen = rows.slice(0, 10).map((row) => ({ city: row.city, orders: row.orders }));
  const byProvince = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const key = row.province || "Provinsi belum terisi";
      const entry = map.get(key) || { province: key, orders: 0, cities: 0 };
      entry.orders += row.orders;
      entry.cities += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.orders - a.orders);
  }, [rows]);

  const totals = data.totals;
  const statCards = [
    { label: "Total Kota", value: totals?.cities ?? 0, icon: MapPin },
    { label: "Total Pesanan", value: totals?.orders ?? 0, icon: BarChart3 },
    { label: "Pelanggan Unik", value: totals?.customers ?? 0, icon: Users },
    { label: "Total Omset", value: `Rp ${formatRupiah(totals?.revenue ?? 0)}`, icon: Wallet },
    {
      label: "Kota Teratas",
      value: totals?.topCity?.city || "-",
      hint: totals?.topCity ? `${totals.topCity.orders} pesanan` : "",
      icon: Trophy,
    },
  ];

  const toggleSort = (key) =>
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "city" || key === "province" ? "asc" : "desc" },
    );

  const exportCsv = () => {
    const header = ["No", "Nama Kota", "Provinsi", "Jumlah Pesanan", "Pelanggan Unik", "Total Omset", "Rata-rata per Pesanan"];
    const lines = rows.map((row, index) =>
      [index + 1, row.city, row.province, row.orders, row.uniqueCustomers, row.revenue, row.avgOrder]
        .map((cell) => {
          const text = String(cell ?? "");
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    );
    // BOM supaya Excel membaca huruf ber-aksen dengan benar.
    const blob = new Blob([`\uFEFF${[header.join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `database-kota-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-[#1a1d28] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-200 dark:border-slate-700">
              <MapPin size={28} className="text-slate-900 dark:text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold font-heading text-slate-900 dark:text-white">Database Kota</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Sebaran pelanggan &amp; pesanan per kota</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              title="Belum aktif"
              className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 font-bold rounded-xl cursor-not-allowed"
            >
              <ClipboardPaste size={18} />
              Import Paste
              <span className="text-[9px] font-black tracking-wider opacity-70">SOON</span>
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="flex items-center gap-2 px-5 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 shadow-sm transition-all active:scale-95"
            >
              <Download size={18} />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Kartu statistik */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white dark:bg-[#1a1d28] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-shadow duration-300"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                  <Icon size={19} className="text-slate-700 dark:text-slate-200" />
                </div>
                <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 tracking-widest">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{card.label}</p>
              <p
                className="text-[clamp(0.95rem,1.3vw,1.5rem)] leading-tight font-black font-heading text-slate-900 dark:text-white mt-0.5 tracking-tight whitespace-nowrap tabular-nums"
                title={card.value}
              >
                {card.value}
              </p>
              {card.hint ? <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{card.hint}</p> : null}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 px-1 -mt-3">
        Cakupan: <span className="font-bold text-slate-900 dark:text-white">{coverageLabel}</span>
        {search ? ` · pencarian kota "${search}"` : ""}
        {totals ? " · pesanan dibatalkan tidak dihitung" : ""}
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Tabel peringkat */}
        <div className="xl:col-span-2 bg-white dark:bg-[#1a1d28] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h2 className="font-heading font-bold text-slate-900 dark:text-white">Peringkat Kota</h2>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {rows.length} kota
              </span>
            </div>

            <div className="relative ml-auto mr-2 w-full sm:w-auto sm:max-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Cari kota..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Hapus pencarian"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 rounded-xl p-1 border border-slate-200 dark:border-slate-800">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="Bulan sebelumnya">
                <ChevronLeft size={16} className="text-slate-600 dark:text-slate-300" />
              </button>
              <span className="px-3 text-sm font-bold text-slate-900 dark:text-white min-w-[130px] text-center">
                {allTime ? "Semua waktu" : `${MONTHS[month]} ${year}`}
              </span>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="Bulan berikutnya">
                <ChevronRight size={16} className="text-slate-600 dark:text-slate-300" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                resetPeriod();
                setAllTime(true);
              }}
              className={`px-3 py-2 rounded-xl border text-sm font-bold transition-all ${
                allTime
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
                  : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              Semua waktu
            </button>

            {/* Rentang tanggal */}
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900 rounded-xl p-1 border border-slate-200 dark:border-slate-800">
              <CalendarDays size={15} className="ml-2 text-slate-400" />
              <input
                type="date"
                value={rangeFrom}
                onChange={(event) => setRangeFrom(event.target.value)}
                aria-label="Tanggal mulai"
                className="bg-transparent px-1.5 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none"
              />
              <span className="text-slate-400 text-sm">–</span>
              <input
                type="date"
                value={rangeTo}
                onChange={(event) => setRangeTo(event.target.value)}
                aria-label="Tanggal selesai"
                className="bg-transparent px-1.5 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none"
              />
              {usingRange && (
                <button
                  onClick={() => {
                    setRangeFrom("");
                    setRangeTo("");
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Hapus rentang tanggal"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select value={province} onChange={(event) => setProvince(event.target.value)} className={SELECT_CLASS} aria-label="Filter provinsi">
              <option value="all">Semua provinsi</option>
              {(data.options?.provinces || []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select value={source} onChange={(event) => setSource(event.target.value)} className={SELECT_CLASS} aria-label="Filter sumber">
              <option value="all">Semua sumber</option>
              {(data.options?.sources || []).map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>

            {filtersActive && (
              <button
                onClick={resetFilters}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                Reset
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MapPin size={26} className="text-slate-400" />
              </div>
              <p className="font-bold text-slate-900 dark:text-white">Belum ada kota pada cakupan ini</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {filtersActive ? "Ubah filter atau tampilkan semua" : "Belum ada pesanan pada periode ini"}
              </p>
              {filtersActive ? (
                <button
                  onClick={resetFilters}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  <X size={16} /> Tampilkan semua
                </button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 text-left">
                    <th className="w-[5%] px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">No</th>
                    <SortHeader label="Nama Kota" sortKey="city" sort={sort} onSort={toggleSort} className="w-[18%]" />
                    <SortHeader label="Provinsi" sortKey="province" sort={sort} onSort={toggleSort} className="w-[15%]" />
                    <SortHeader label="Jumlah Pesanan" sortKey="orders" sort={sort} onSort={toggleSort} className="w-[20%]" />
                    <SortHeader label="Pelanggan Unik" sortKey="uniqueCustomers" sort={sort} onSort={toggleSort} className="w-[12%]" />
                    <SortHeader label="Total Omset" sortKey="revenue" sort={sort} onSort={toggleSort} className="w-[15%]" align="right" />
                    <SortHeader label="Rata-rata" sortKey="avgOrder" sort={sort} onSort={toggleSort} className="w-[15%]" align="right" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <motion.tr
                      key={row.city}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.02, 0.3) }}
                      onClick={() => setDetail(row)}
                      className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                    >
                      <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{index + 1}</td>
                      <td className="px-2 py-3 font-bold text-slate-900 dark:text-white truncate" title={row.city}>
                        {row.city}
                      </td>
                      <td className="px-2 py-3 text-slate-600 dark:text-slate-300 truncate" title={row.province}>
                        {row.province}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-9 text-right font-bold text-slate-900 dark:text-white">{row.orders}</span>
                          <span className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden min-w-[28px]">
                            <span
                              className="block h-full rounded-full bg-slate-900 dark:bg-white"
                              style={{ width: `${Math.max(4, Math.round((row.orders / maxOrders) * 100))}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-slate-700 dark:text-slate-200">{row.uniqueCustomers}</td>
                      <td className="px-2 py-3 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        Rp {formatRupiah(row.revenue)}
                      </td>
                      <td className="px-2 py-3 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        Rp {formatRupiah(row.avgOrder)}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Grafik */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#1a1d28] rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <h2 className="font-heading font-bold text-slate-900 dark:text-white">Top 10 Kota</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Jumlah pesanan</p>
            <div className="h-64 mt-3">
              {topTen.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada data.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topTen} layout="vertical" margin={{ left: 4, right: 12 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="city"
                      width={92}
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(24,24,27,0.05)" }}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                      formatter={(value) => [`${value} pesanan`, ""]}
                    />
                    <Bar dataKey="orders" fill="#18181b" radius={[0, 6, 6, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-[#1a1d28] rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <h2 className="font-heading font-bold text-slate-900 dark:text-white">Ringkasan per Provinsi</h2>
            <div className="flex items-center gap-4 mt-3">
              <div className="w-32 h-32 shrink-0">
                {byProvince.length === 0 ? null : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={byProvince} dataKey="orders" nameKey="province" innerRadius={34} outerRadius={58} paddingAngle={2}>
                        {byProvince.map((entry, index) => (
                          <Cell key={entry.province} fill={SLICE_COLORS[index % SLICE_COLORS.length]} stroke="#ffffff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                        formatter={(value, _name, item) => [
                          `${value} pesanan · ${item?.payload?.cities ?? 0} kota`,
                          item?.payload?.province ?? "",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {byProvince.map((entry, index) => (
                  <div key={entry.province} className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }}
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{entry.province}</span>
                    <span className="ml-auto text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">{entry.orders}</span>
                  </div>
                ))}
                {byProvince.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada data.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <KotaDetailDrawer open={!!detail} city={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function SortHeader({ label, sortKey, sort, onSort, className = "", align = "left" }) {
  const active = sort.key === sortKey;
  return (
    <th className={`px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${className} ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Urutkan berdasarkan ${label}`}
        className={`inline-flex items-center gap-1 transition-colors hover:text-slate-900 dark:hover:text-white ${
          active ? "text-slate-900 dark:text-white" : ""
        }`}
      >
        {label}
        {active ? (sort.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : null}
      </button>
    </th>
  );
}
