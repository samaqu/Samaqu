"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Clock,
  Loader2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { IconCalendarClock, IconCheckCircle } from "@/components/ops/icons";
import { useToast } from "@/components/ops/ui/use-toast";
import { OUTCOMES, STATUS_LABEL, taskState, waLink, fmtWibDateTime } from "@/lib/ops-followup";
import ResultDrawer from "@/components/ops/followup/ResultDrawer";

type Tab = "unscheduled" | "today" | "overdue" | "history";

type TaskLead = {
  id: string;
  kontak: string;
  produk?: string | null;
  sumber?: string | null;
  pic?: string | null;
  outcome?: string | null;
  note?: string | null;
  nominal?: number | null;
  lastContactAt?: string | null;
  nextFollowupAt?: string | null;
};

type ActivityItem = {
  id: string;
  leadId: string;
  kontak: string;
  produk?: string | null;
  sumber?: string | null;
  pic?: string | null;
  actor?: string | null;
  action: string;
  outcome?: string | null;
  note?: string | null;
  createdAt: string;
  nextSchedule?: string | null;
};

const TABS: { key: Tab; label: string }[] = [
  { key: "unscheduled", label: "Perlu Dijadwalkan" },
  { key: "today", label: "Hari Ini" },
  { key: "overdue", label: "Terlambat" },
  { key: "history", label: "Riwayat" },
];

const ACTION_LABEL: Record<string, string> = {
  open_wa: "Buka WhatsApp",
  result: "Hasil dicatat",
  schedule: "Jadwal diubah",
  set_pic: "PIC diubah",
  created: "Lead dibuat",
};

async function opsFetch(path: string, init?: RequestInit) {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Request gagal (${res.status})`);
  return json;
}

function StatusBadge({ lead }: { lead: TaskLead }) {
  if (!lead.nextFollowupAt)
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200"><Clock size={11} /> Belum dijadwalkan</span>;
  const state = taskState({ next_followup_at: lead.nextFollowupAt, followup_status: "dijadwalkan", do_not_contact: false });
  if (state === "terlambat")
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-red-50 text-red-700 border border-red-200"><AlertTriangle size={11} /> Terlambat</span>;
  if (state === "hari_ini")
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"><Clock size={11} /> Hari ini</span>;
  return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200"><IconCalendarClock size={11} /> Dijadwalkan</span>;
}

export default function FollowUpPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("today");
  const [search, setSearch] = useState("");
  const [pic, setPic] = useState("");
  const [sumber, setSumber] = useState("");
  const [drawerLead, setDrawerLead] = useState<TaskLead | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [autoPicked, setAutoPicked] = useState(false);
  const view = tab;

  const query = useQuery({
    queryKey: ["followups", view, search, pic, sumber],
    queryFn: async () => {
      const params = new URLSearchParams({ view });
      if (search.trim()) params.set("search", search.trim());
      if (pic) params.set("pic", pic);
      if (sumber) params.set("sumber", sumber);
      return opsFetch(`/api/ops/followups?${params.toString()}`);
    },
  });

  const items: TaskLead[] = view === "history" ? [] : query.data?.items || [];
  const activities: ActivityItem[] = view === "history" ? query.data?.items || [] : [];
  const stats = query.data?.stats || { today: 0, overdue: 0, noReply: 0, unscheduled: 0 };
  const options = query.data?.options || { pics: [], sumbers: [] };

  // Kalau belum ada tugas terjadwal tapi masih ada lead aktif tanpa jadwal,
  // halaman langsung membuka antrean "Perlu Dijadwalkan" supaya tidak terlihat kosong.
  useEffect(() => {
    if (autoPicked || query.isLoading || !query.data) return;
    const s = query.data.stats || {};
    if ((s.today || 0) === 0 && (s.overdue || 0) === 0 && (s.unscheduled || 0) > 0) setTab("unscheduled");
    setAutoPicked(true);
  }, [autoPicked, query.isLoading, query.data]);

  const cards = useMemo(
    () => [
      { key: "noReply", label: "Belum Membalas", hint: "Belum ada balasan", value: stats.noReply, icon: Users, tone: "text-blue-700 bg-blue-50 border-blue-200", onClick: () => setTab("unscheduled") },
      { key: "unscheduled", label: "Perlu Dijadwalkan", hint: "Belum punya jadwal", value: stats.unscheduled, icon: IconCalendarClock, tone: "text-indigo-700 bg-indigo-50 border-indigo-200", onClick: () => setTab("unscheduled") },
      { key: "today", label: "Perlu Ditindaklanjuti", hint: "Jadwal jatuh tempo hari ini", value: stats.today, icon: Clock, tone: "text-amber-700 bg-amber-50 border-amber-200", onClick: () => setTab("today") },
      { key: "overdue", label: "Terlambat", hint: "Sudah lewat jadwal", value: stats.overdue, icon: AlertTriangle, tone: "text-red-700 bg-red-50 border-red-200", onClick: () => setTab("overdue") },
    ],
    [stats],
  );

  /** Aksi cepat: jadwalkan follow-up besok 10.00 WIB (SOP H+1). */
  async function quickSchedule(lead: TaskLead) {
    const wib = new Date(Date.now() + 7 * 3600 * 1000 + 86400000);
    const nextIso = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate(), 3, 0, 0)).toISOString();
    setSchedulingId(lead.id);
    try {
      await opsFetch("/api/ops/followups", {
        method: "POST",
        body: JSON.stringify({ action: "schedule", leadId: lead.id, nextSchedule: nextIso, requestId: `sch-${lead.id}-${Date.now()}` }),
      });
      toast({ title: "Jadwal dibuat", description: `${lead.kontak} dijadwalkan besok 10.00 WIB.`, variant: "success" });
      qc.invalidateQueries({ queryKey: ["followups"] });
    } catch (e) {
      toast({ title: "Gagal menjadwalkan", description: e instanceof Error ? e.message : "Coba lagi.", variant: "destructive" });
    } finally {
      setSchedulingId(null);
    }
  }

  async function openWa(lead: TaskLead) {
    const link = waLink(lead.kontak);
    if (!link) {
      toast({ title: "Nomor tidak valid", description: `Kontak "${lead.kontak}" bukan nomor WhatsApp yang bisa dipakai.`, variant: "destructive" });
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
    // Catat sebagai percobaan kontak (bukan klaim pesan terkirim)
    try {
      await opsFetch("/api/ops/followups", {
        method: "POST",
        body: JSON.stringify({ action: "open_wa", leadId: lead.id, requestId: `wa-${lead.id}-${Date.now()}` }),
      });
      qc.invalidateQueries({ queryKey: ["followups"] });
    } catch {
      /* pencatatan gagal tidak menghalangi admin menghubungi pelanggan */
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <header className="bg-white dark:bg-[#141821] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Follow-up Center</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
              Kelola tindak lanjut calon pelanggan dan pastikan tidak ada peluang yang terlewat.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["followups"] })}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {query.isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
            <select
              value={pic}
              onChange={(e) => setPic(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200"
              aria-label="Filter PIC"
            >
              <option value="">Semua PIC</option>
              {options.pics.map((p: string) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={sumber}
              onChange={(e) => setSumber(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200"
              aria-label="Filter sumber"
            >
              <option value="">Semua Sumber</option>
              {options.sumbers.map((s: string) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* ── Ringkasan ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={c.onClick}
              className="text-left bg-white dark:bg-[#141821] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${c.tone}`}>
                  <Icon size={18} />
                </div>
                <span className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  {Number(c.value || 0).toLocaleString("id-ID")}
                </span>
              </div>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{c.label}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{c.hint}</p>
            </button>
          );
        })}
      </div>

      {/* ── Tabs + pencarian ── */}
      <div className="bg-white dark:bg-[#141821] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]/40 dark:focus-visible:ring-white/60 ${
                  view === t.key
                    ? "bg-[#18181b] text-white shadow-sm dark:bg-white dark:text-[#18181b]"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                aria-current={view === t.key}
              >
                {t.label}
                {t.key === "unscheduled" && stats.unscheduled > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-black ${view === t.key ? "bg-white/25 text-white" : "bg-indigo-500/15 text-indigo-700"}`}>{stats.unscheduled}</span>
                )}
                {t.key === "overdue" && stats.overdue > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-black ${view === t.key ? "bg-white/25 text-white" : "bg-red-500/15 text-red-700"}`}>{stats.overdue}</span>
                )}
                {t.key === "today" && stats.today > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-black ${view === t.key ? "bg-white/25 text-white" : "bg-amber-500/15 text-amber-700"}`}>{stats.today}</span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px] ml-auto max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / nomor pelanggan…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>

        {/* ── Isi ── */}
        {query.isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
          </div>
        ) : query.isError ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 grid place-items-center mx-auto mb-3">
              <AlertTriangle size={24} />
            </div>
            <p className="font-bold text-slate-900 dark:text-white">Data belum berhasil dimuat.</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Periksa koneksi lalu coba lagi.</p>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["followups"] })}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold"
            >
              <RefreshCw size={14} /> Coba Lagi
            </button>
          </div>
        ) : view === "history" ? (
          activities.length === 0 ? (
            <EmptyState title="Belum ada riwayat." desc="Aktivitas follow-up akan tercatat di sini." />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {activities.map((a) => (
                <div key={a.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">{a.kontak}</span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{ACTION_LABEL[a.action] || a.action}</span>
                  {a.outcome && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {OUTCOMES.find((o) => o.code === a.outcome)?.label || a.outcome}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500 ml-auto">{fmtWibDateTime(a.createdAt)} WIB · {a.actor || "admin"}</span>
                  {a.note && <p className="w-full text-xs text-slate-500 dark:text-slate-400">{a.note}</p>}
                </div>
              ))}
            </div>
          )
        ) : items.length === 0 ? (
          <EmptyState
            title={
              view === "unscheduled"
                ? "Semua lead aktif sudah punya jadwal."
                : view === "overdue"
                ? "Tidak ada tugas yang terlambat."
                : "Tidak ada tugas untuk hari ini."
            }
            desc={
              view === "unscheduled"
                ? "Antrean ini berisi lead aktif yang belum dijadwalkan follow-up."
                : "Semua follow-up untuk filter ini sudah beres."
            }
            action={
              view === "overdue"
                ? { label: "Lihat tugas hari ini", onClick: () => setTab("today") }
                : view === "today" && stats.unscheduled > 0
                ? { label: `Lihat ${stats.unscheduled} lead belum dijadwalkan`, onClick: () => setTab("unscheduled") }
                : undefined
            }
          />
        ) : (
          <>
            {/* Desktop: tabel */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 text-left">
                    {["Pelanggan", "Produk", "Sumber", "PIC", "Kontak terakhir", "Jadwal berikutnya", "Status", "Aksi"].map((h) => (
                      <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((lead) => (
                    <motion.tr
                      key={lead.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-900/40"
                    >
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">{lead.kontak}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{lead.produk || "-"}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{lead.sumber || "-"}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{lead.pic || "-"}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtWibDateTime(lead.lastContactAt)}</td>
                      <td className="px-4 py-3 text-slate-900 dark:text-white font-semibold whitespace-nowrap">{fmtWibDateTime(lead.nextFollowupAt)}</td>
                      <td className="px-4 py-3"><StatusBadge lead={lead} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => openWa(lead)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <MessageCircle size={13} className="text-[#25D366]" /> Buka WhatsApp
                          </button>
                          {!lead.nextFollowupAt && (
                            <button
                              onClick={() => quickSchedule(lead)}
                              disabled={schedulingId === lead.id}
                              title="Jadwalkan follow-up besok 10.00 WIB"
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                            >
                              {schedulingId === lead.id ? <Loader2 size={13} className="animate-spin" /> : <IconCalendarClock size={13} />} Jadwalkan
                            </button>
                          )}
                          <button
                            onClick={() => setDrawerLead(lead)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700"
                          >
                            <Pencil size={13} /> Catat Hasil
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: kartu */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((lead) => (
                <div key={lead.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white truncate">{lead.kontak}</p>
                      <p className="text-xs text-slate-500 truncate">{lead.produk || "-"} · {lead.sumber || "-"} · PIC {lead.pic || "-"}</p>
                    </div>
                    <StatusBadge lead={lead} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span>Kontak terakhir: {fmtWibDateTime(lead.lastContactAt)}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Jadwal: {fmtWibDateTime(lead.nextFollowupAt)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openWa(lead)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
                    >
                      <MessageCircle size={14} className="text-[#25D366]" /> Buka WhatsApp
                    </button>
                    <button
                      onClick={() => setDrawerLead(lead)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"
                    >
                      <Pencil size={14} /> Catat Hasil
                    </button>
                    {!lead.nextFollowupAt && (
                      <button
                        onClick={() => quickSchedule(lead)}
                        disabled={schedulingId === lead.id}
                        className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700 disabled:opacity-50"
                      >
                        {schedulingId === lead.id ? <Loader2 size={14} className="animate-spin" /> : <IconCalendarClock size={14} />} Jadwalkan besok 10.00 WIB
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ResultDrawer
        open={!!drawerLead}
        lead={drawerLead}
        picOptions={options.pics}
        onClose={() => setDrawerLead(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["followups"] })}
      />
    </div>
  );
}

function EmptyState({ title, desc, action }: { title: string; desc: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center mx-auto mb-3">
        <IconCheckCircle size={26} />
      </div>
      <p className="font-bold text-slate-900 dark:text-white">{title}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{desc}</p>
      {action && (
        <button onClick={action.onClick} className="mt-4 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200">
          {action.label}
        </button>
      )}
    </div>
  );
}
