"use client";

import { useState, useMemo, useDeferredValue, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/lib/ops-api";
import DateFilter, { formatTanggalID } from "@/components/ops/leads/DateFilter";
import { motion } from "framer-motion";
import {
  Users,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  Target,
  Wallet,
  UserPlus,
  Database,
  Repeat,
  ClipboardPaste,
  Search,
  X
} from "lucide-react";
import { useToast } from "@/components/ops/ui/use-toast";
import LeadFormModal from "@/components/ops/leads/LeadFormModal";
import PasteImportModal from "@/components/ops/leads/PasteImportModal";
import ConfirmDeleteModal from "@/components/ops/ConfirmDeleteModal";
import LeadDetailDrawer from "@/components/ops/leads/LeadDetailDrawer";
import { normalizeLeadPhone } from "@/lib/ops-lead-sync";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const SUMBER_STYLES = {
  "Website": "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  "IG": "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300",
  "WA": "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
  "Meta ads": "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
};

const formatRupiah = (value) => (value || 0).toLocaleString('id-ID');

const pad = (n) => String(n).padStart(2, '0');
const formatDateID = (d) => {
  if (!d) return '-';
  const parts = String(d).split('-');
  if (parts.length < 3) return d;
  const [y, m, day] = parts;
  return `${parseInt(day, 10)} ${MONTHS[parseInt(m, 10) - 1] || m} ${y}`;
};

/**
 * Tanggal HARI INI menurut WIB (YYYY-MM-DD).
 *
 * Dulu form baru memakai `${year}-${pad(month + 1)}-${pad(now.getDate())}` — `year` dan
 * `month` berasal dari BULAN YANG SEDANG DIBUKA di daftar, bukan bulan hari ini. Akibatnya
 * lead yang diinput saat daftar sedang di Mei tersimpan sebagai tanggal 5 Mei, bukan 5 Nov.
 * Sekarang tanggalnya dihitung utuh dari jam WIB, jadi tidak bergantung pada bulan tampilan
 * maupun zona waktu komputer admin.
 */
const todayWib = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/** Lencana kecil di samping kontak: customer sudah transaksi sah >= 2 kali. */
function RepeatBadge({ count }) {
  return (
    <span
      className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      title={`${count} transaksi sah`}
    >
      <Repeat size={10} aria-hidden="true" /> Repeat ×{count}
    </span>
  );
}

const REPEAT_FILTERS = [
  { key: 'semua', label: 'Semua' },
  { key: 'repeat', label: 'Repeat' },
  { key: 'belum', label: 'Belum repeat' },
];

export default function Leads({ variant = "ops" }) {
  const isPanel = variant === "panel";
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const start = `${year}-${pad(month + 1)}-01`;
  const end = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;

  const [searchInput, setSearchInput] = useState('');
  const search = useDeferredValue(searchInput).trim();

  // Filter TANGGAL (satu hari, WIB). Disimpan di URL (?tanggal=YYYY-MM-DD) supaya bertahan
  // saat dimuat ulang; memuat halaman dengan parameter itu langsung memakai tanggalnya.
  const [selectedDate, setSelectedDate] = useState("");
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tanggal") || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(param)) {
      setSelectedDate(param);
      setYear(Number(param.slice(0, 4)));
      setMonth(Number(param.slice(5, 7)) - 1);
    }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedDate) params.set("tanggal", selectedDate);
    else params.delete("tanggal");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [selectedDate]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', start, end, search],
    queryFn: async () => {
      const query = { tanggal: { $gte: start, $lte: end } };
      if (search) query.kontak = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      const page = await base44.entities.Lead.filter(query, { sort: 'tanggal', limit: 1000 });
      // Urut pasti: yang terbaru di atas, dalam satu tanggal jam paling akhir dulu
      return (page.items || []).sort((a, b) =>
        (b.tanggal || '').localeCompare(a.tanggal || '') || (b.jam || '').localeCompare(a.jam || '')
      );
    },
  });

  // Info customer repeat + riwayat order (read-only). Query terpisah dari daftar: kalau gagal,
  // tabel tetap tampil apa adanya. Key diawali 'leads' supaya ikut menyegar saat lead diubah.
  const { data: repeatData } = useQuery({
    queryKey: ['leads', 'repeat', start, end],
    queryFn: () => base44.entities.Lead.repeat(start, end),
    staleTime: 60_000,
    retry: false,
  });
  const histories = useMemo(() => repeatData?.histories || {}, [repeatData]);
  const [repeatFilter, setRepeatFilter] = useState('semua');

  // Hasil pencarian (dari server) + filter tanggal.
  const dateLeads = useMemo(
    () => (selectedDate ? leads.filter((l) => l.tanggal === selectedDate) : leads),
    [leads, selectedDate]
  );
  const repeatCount = useMemo(() => dateLeads.filter((l) => histories[l.id]?.repeat).length, [dateLeads, histories]);
  // Yang tampil = di atas + filter repeat; kartu ringkasan ikut semuanya.
  const visibleLeads = useMemo(() => {
    if (repeatFilter === 'repeat') return dateLeads.filter((l) => histories[l.id]?.repeat);
    if (repeatFilter === 'belum') return dateLeads.filter((l) => !histories[l.id]?.repeat);
    return dateLeads;
  }, [dateLeads, repeatFilter, histories]);

  // Omzet repeat: transaksi sah SESUDAH transaksi pertama sebuah nomor (nomor dengan >= 2 transaksi
  // yang ada di tabel leads), pada rentang yang sedang dilihat (bulan, atau satu tanggal).
  const repeatSummary = useMemo(() => {
    const list = repeatData?.repeat_orders;
    if (!list || list.length === 0) return null;
    const phones = search ? new Set(dateLeads.map((l) => normalizeLeadPhone(l.kontak))) : null;
    const rows = list.filter((o) => (!selectedDate || o.date === selectedDate) && (!phones || phones.has(o.phone)));
    if (rows.length === 0) return null;
    return { orders: rows.length, omzet: rows.reduce((sum, o) => sum + (o.total || 0), 0) };
  }, [repeatData, selectedDate, search, dateLeads]);

  const stats = useMemo(() => {
    const closing = visibleLeads.filter((l) => l.status === 'closing');
    return {
      total: visibleLeads.length,
      closing: closing.length,
      belum: visibleLeads.length - closing.length,
      rate: visibleLeads.length ? (closing.length / visibleLeads.length) * 100 : 0,
      nominal: closing.reduce((s, l) => s + (l.nominal || 0), 0),
    };
  }, [visibleLeads]);

  /** Tanggal yang punya leads di bulan ini — untuk titik penanda di kalender. */
  const markedDates = useMemo(
    () => [...new Set(leads.map((l) => l.tanggal).filter(Boolean))],
    [leads]
  );

  /** Keterangan cakupan kartu ringkasan. */
  const coverageLabel = selectedDate ? formatTanggalID(selectedDate) : `${MONTHS[month]} ${year}`;

  const [formOpen, setFormOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailLead, setDetailLead] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const prevMonth = () => {
    setSelectedDate("");
    if (month === 0) { setMonth(11); setYear(year - 1); } else { setMonth(month - 1); }
  };
  const nextMonth = () => {
    setSelectedDate("");
    if (month === 11) { setMonth(0); setYear(year + 1); } else { setMonth(month + 1); }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await base44.entities.Lead.delete(deleteTarget.id);
    setIsDeleting(false);
    setDeleteTarget(null);
    queryClient.invalidateQueries(['leads']);
    toast({ title: "✅ Lead dihapus", variant: "success" });
  };

  // Kartu ringkasan: palet netral (putih + border slate), sama seperti dashboard admin.
  const statCards = [
    { label: "Total Leads", value: stats.total, icon: Users },
    { label: "Closing", value: stats.closing, icon: CheckCircle2 },
    { label: "Belum Closing", value: stats.belum, icon: Clock },
    { label: "Konversi", value: `${stats.rate.toFixed(1)}%`, icon: Target },
    {
      label: "Nominal Closing",
      value: `Rp ${formatRupiah(stats.nominal)}`,
      icon: Wallet,
      sub: repeatSummary ? { main: `+ Repeat Rp ${formatRupiah(repeatSummary.omzet)}`, extra: `${repeatSummary.orders} order` } : null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header — palet netral seperti dashboard admin */}
      <div className="bg-white dark:bg-[#1a1d28] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center border border-slate-200 dark:border-slate-700">
              <Users size={28} className="text-slate-900 dark:text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold font-heading text-slate-900 dark:text-white">Database Leads</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Catat leads masuk & pantau closing</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPasteOpen(true)}
              className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              <ClipboardPaste size={18} />
              Import Paste
            </button>
            <button
              onClick={() => { setEditing(null); setFormOpen(true); }}
              className="flex items-center gap-2 px-5 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 shadow-sm transition-all active:scale-95"
            >
              <Plus size={18} />
              Tambah Lead
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {statCards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white dark:bg-[#1a1d28] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-shadow duration-300">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                  <Icon size={19} className="text-slate-700 dark:text-slate-200" />
                </div>
                <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 tracking-widest">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{c.label}</p>
              {/* Ukuran nilai ikut lebar layar + tidak boleh membungkus, supaya "Rp" dan nominalnya
                  selalu sebaris (dulu `text-2xl` tetap sehingga "Rp 8.343.000" pindah baris). */}
              <p className="text-[clamp(1rem,1.35vw,1.5rem)] font-black font-heading text-slate-900 dark:text-white mt-0.5 tracking-tight whitespace-nowrap">{c.value}</p>
              {c.sub ? (
                // Boleh turun baris saat kartu sempit (menu samping terbuka) — tidak dipotong "…".
                <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[11px] font-bold leading-snug text-emerald-700 dark:text-emerald-400" title={`${c.sub.main} · ${c.sub.extra}`}>
                  <span className="whitespace-nowrap">{c.sub.main}</span>
                  <span className="whitespace-nowrap font-semibold text-slate-500 dark:text-slate-400">{c.sub.extra}</span>
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Cakupan kartu ringkasan (ikut filter tanggal + pencarian) */}
      <p className="text-xs text-slate-500 dark:text-slate-400 px-1 -mt-3">
        Cakupan: <span className="font-bold text-slate-900 dark:text-white">{coverageLabel}</span>
        {search ? ` · pencarian "${search}"` : ""}
        {repeatFilter === 'repeat' ? " · hanya customer repeat" : repeatFilter === 'belum' ? " · tanpa repeat" : ""}
      </p>

      {/* Table */}
      <div className="bg-white dark:bg-[#1a1d28] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h2 className="font-heading font-bold text-slate-900 dark:text-white">Daftar Leads</h2>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              {visibleLeads.length} leads
            </span>
          </div>
          {/* Pencarian kontak */}
          <div className="relative ml-auto mr-2 w-full sm:w-auto sm:max-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nomor / kontak..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
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
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800" aria-label="Bulan berikutnya">
              <ChevronRight size={16} className="text-slate-600 dark:text-slate-300" />
            </button>
          </div>
          {/* Filter satu tanggal (jamak dengan pencarian & pemilih bulan) */}
          <DateFilter
            value={selectedDate}
            onChange={setSelectedDate}
            month={month}
            year={year}
            onMonthChange={(y, m) => { setYear(y); setMonth(m); }}
            markedDates={markedDates}
          />
        </div>

        {repeatData && (repeatCount > 0 || repeatFilter !== 'semua') ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2.5 dark:border-slate-800">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Customer</span>
            {REPEAT_FILTERS.map((f) => {
              const active = repeatFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setRepeatFilter(f.key)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {f.key === 'repeat' ? <Repeat size={11} aria-hidden="true" /> : null}
                  {f.label}
                  {f.key === 'repeat' ? <span className="opacity-70">{repeatCount}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {isLoading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : visibleLeads.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              {selectedDate ? (
                <CalendarDays size={26} className="text-slate-400" />
              ) : search ? (
                <Search size={26} className="text-slate-400" />
              ) : (
                <Database size={26} className="text-slate-400" />
              )}
            </div>
            {selectedDate ? (
              <>
                <p className="font-bold text-slate-900 dark:text-white">
                  Tidak ada leads pada {formatTanggalID(selectedDate)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {search ? `Pencarian "${search}" tidak menemukan hasil di tanggal ini` : "Coba pilih tanggal lain"}
                </p>
                <button
                  onClick={() => setSelectedDate("")}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                >
                  <CalendarDays size={16} />
                  Tampilkan semua tanggal
                </button>
              </>
            ) : search ? (
              <>
                <p className="font-bold text-slate-900 dark:text-white">Tidak ada hasil</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Nomor {search} tidak ditemukan di bulan ini</p>
              </>
            ) : (
              <p className="font-bold text-slate-900 dark:text-white">Belum ada leads bulan ini</p>
            )}
            {!selectedDate && (
              <>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Klik "Tambah Lead" untuk mulai mencatat leads masuk</p>
                <button
                  onClick={() => { setEditing(null); setFormOpen(true); }}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all"
                >
                  <UserPlus size={16} />
                  Tambah Lead
                </button>
              </>
            )}
          </div>
        ) : (
          <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 text-left">
                  <th className="w-[18%] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tanggal</th>
                  <th className="w-[8%] px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Jam</th>
                  <th className="w-[16%] px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Kontak</th>
                  <th className="w-[12%] px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sumber</th>
                  <th className="w-[12%] px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">PIC</th>
                  <th className="w-[16%] px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Keterangan</th>
                  <th className="w-[16%] px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Nominal</th>
                  <th className="w-[12%] px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((lead, idx) => (
                  <motion.tr
                    key={lead.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                    className="cursor-pointer border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                    onClick={() => setDetailLead(lead)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setDetailLead(lead); }}
                    tabIndex={0}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap truncate">{formatDateID(lead.tanggal)}</td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{lead.jam || '-'}</td>
                    <td className="px-3 py-3 font-bold text-slate-900 dark:text-white">
                      <span className="block truncate">{lead.kontak}</span>
                      {histories[lead.id]?.repeat ? <RepeatBadge count={histories[lead.id].count} /> : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${SUMBER_STYLES[lead.sumber] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                        {lead.sumber}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span
                        className="block truncate text-xs font-semibold text-slate-600 dark:text-slate-300"
                        title={lead.pic || undefined}
                      >
                        {lead.pic || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {lead.status === 'closing' ? (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                          <CheckCircle2 size={12} className="shrink-0" /> Closing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                          <Clock size={12} className="shrink-0" /> Belum Closing
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {lead.status === 'closing' && lead.nominal ? `Rp ${formatRupiah(lead.nominal)}` : '-'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditing(lead); setFormOpen(true); }}
                          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          aria-label="Edit lead"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(lead); }}
                          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          aria-label="Hapus lead"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: kartu per lead, bukan tabel sempit. Desktop tetap tabel di atas. */}
          <div className="space-y-2.5 bg-slate-50/70 p-3 dark:bg-slate-950/20 md:hidden">
            {visibleLeads.map((lead, idx) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_8px_20px_-18px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-[#1a1d28]"
                onClick={() => setDetailLead(lead)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {formatDateID(lead.tanggal)} · {lead.jam || "-"}
                    </p>
                    <p className="mt-0.5 truncate text-base font-extrabold text-slate-900 dark:text-white">
                      {lead.kontak}
                    </p>
                    {histories[lead.id]?.repeat ? <RepeatBadge count={histories[lead.id].count} /> : null}
                  </div>
                  <span className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold ${SUMBER_STYLES[lead.sumber] || "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                    {lead.sumber}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    PIC: {lead.pic || "-"}
                  </span>
                  <span className="shrink-0 text-sm font-extrabold text-slate-900 dark:text-white">
                    {lead.status === "closing" && lead.nominal ? `Rp ${formatRupiah(lead.nominal)}` : "—"}
                  </span>
                </div>

                <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditing(lead); setFormOpen(true); }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Pencil size={14} /> Ubah
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(lead); }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Trash2 size={14} /> Hapus
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
          </>
        )}
      </div>

      <LeadDetailDrawer
        open={!!detailLead}
        lead={detailLead}
        history={detailLead ? histories[detailLead.id] : null}
        tema={isPanel ? 'warna' : 'mono'}
        onClose={() => setDetailLead(null)}
        onEdit={(l) => { setDetailLead(null); setEditing(l); setFormOpen(true); }}
      />

      <PasteImportModal
        isOpen={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSuccess={async (_count, latestDate) => {
          setSearchInput('');
          if (latestDate) {
            const [savedYear, savedMonth] = latestDate.split('-').map(Number);
            setYear(savedYear);
            setMonth(savedMonth - 1);
          }
          await queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
      />

      <LeadFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        initialData={editing}
        defaultDate={todayWib()}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Yakin ingin menghapus lead ini?"
        itemName={deleteTarget ? `${deleteTarget.kontak} (${formatDateID(deleteTarget.tanggal)})` : undefined}
        isDeleting={isDeleting}
      />
    </div>
  );
}