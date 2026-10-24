"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { produksiFetch } from "@/lib/produksi-api";
import {
  SCHEDULE_STATUS_OPTIONS,
  formatScheduleDate,
  scheduleStatusMeta,
  type ScheduleStatus,
} from "@/lib/produksi-jadwal";
import { useProduksiAccess } from "./useAccess";
import JadwalFormDrawer from "./JadwalFormDrawer";
import {
  AccessGate,
  Badge,
  EmptyState,
  ErrorBox,
  FilterBar,
  FilterDateRange,
  FilterSelect,
  PageHead,
  Spinner,
  StatCard,
  btnPrimary,
  cardClass,
} from "./ui";

type ScheduleItem = {
  id: string;
  schedule_number: string;
  status: ScheduleStatus;
  start_date: string;
  target_date: string | null;
  tailor: string;
  total_pcs: number;
  target_summary: string;
  target_count: number;
  sufficient: boolean;
  shortage_count: number;
  created_at: string;
};

export default function JadwalView() {
  const access = useProduksiAccess();
  const router = useRouter();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      const json = await produksiFetch<{ items: ScheduleItem[] }>(
        `/api/ops/production/schedules?${params.toString()}`,
      );
      setItems(json.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat jadwal.");
    } finally {
      setLoading(false);
    }
  }, [status, start, end]);

  useEffect(() => {
    if (access.role === "owner") load();
  }, [load, access.role]);

  const summary = useMemo(() => {
    const active = items.filter((item) => item.status !== "batal");
    return {
      total: items.length,
      draft: items.filter((item) => item.status === "draft").length,
      berjalan: items.filter((item) => item.status === "berjalan").length,
      kurang: active.filter((item) => !item.sufficient).length,
    };
  }, [items]);

  return (
    <AccessGate access={access} ownerOnly>
      <div className="space-y-4">
        <PageHead
          title="Jadwal Produksi"
          subtitle="Rencana produksi, kebutuhan bahan, dan reservasi stok komponen."
          actions={
            <button className={btnPrimary} onClick={() => setFormOpen(true)}>
              <Plus size={16} /> Jadwal
            </button>
          }
        />

        <ErrorBox message={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total jadwal" value={String(summary.total)} hint="Sesuai filter" />
          <StatCard label="Draft" value={String(summary.draft)} hint="Belum disetujui" />
          <StatCard label="Berjalan" value={String(summary.berjalan)} hint="Bahan sudah keluar" tone="warning" />
          <StatCard label="Bahan kurang" value={String(summary.kurang)} hint="Jadwal aktif" tone="danger" />
        </div>

        <FilterBar
          active={Boolean(status || start || end)}
          onReset={() => { setStatus(""); setStart(""); setEnd(""); }}
        >
          <FilterSelect value={status} onChange={setStatus} ariaLabel="Filter status" minWidthClass="sm:min-w-[150px]">
            <option value="">Semua status</option>
            {SCHEDULE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </FilterSelect>
          <FilterDateRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
        </FilterBar>

        <div className={`${cardClass} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Daftar jadwal</p>
            <p className="text-[11px] font-semibold text-slate-400 tabular-nums">{items.length} jadwal</p>
          </div>
          <div className="hidden md:block">
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[28%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[3%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {[
                  { label: "Nomor", align: "text-left" },
                  { label: "Produk", align: "text-left" },
                  { label: "Pcs", align: "text-right" },
                  { label: "Mulai", align: "text-left" },
                  { label: "Target", align: "text-left" },
                  { label: "Status", align: "text-left" },
                  { label: "Bahan", align: "text-left" },
                ].map((head) => (
                  <th key={head.label} className={`px-3 py-3 ${head.align} text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-tight`}>
                    {head.label}
                  </th>
                ))}
                <th className="px-1 py-3" aria-label="Detail" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {loading ? (
                <tr><td colSpan={8}><Spinner /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8}><EmptyState title="Belum ada jadwal" description="Buat jadwal produksi pertama lewat tombol di atas." /></td></tr>
              ) : (
                items.map((item) => {
                  const meta = scheduleStatusMeta(item.status);
                  const active = item.status !== "batal";
                  return (
                    <tr
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/ops/produksi/jadwal/${item.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/ops/produksi/jadwal/${item.id}`);
                        }
                      }}
                      className="bg-white dark:bg-[#16171d] hover:bg-blue-50/60 dark:hover:bg-slate-800/60 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    >
                      <td className="px-3 py-3.5 align-middle text-[12px] font-black text-slate-900 dark:text-white whitespace-nowrap">{item.schedule_number}</td>
                      <td className="px-3 py-3.5 align-middle text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate" title={item.target_summary}>{item.target_summary}</td>
                      <td className="px-3 py-3.5 align-middle text-right text-[13px] font-bold text-slate-900 dark:text-white whitespace-nowrap tabular-nums">{item.total_pcs}</td>
                      <td className="px-3 py-3.5 align-middle text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatScheduleDate(item.start_date)}</td>
                      <td className="px-3 py-3.5 align-middle text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatScheduleDate(item.target_date)}</td>
                      <td className="px-3 py-3.5 align-middle"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      <td className="px-3 py-3.5 align-middle">
                        {active ? <Badge tone={item.sufficient ? "green" : "red"}>{item.sufficient ? "Cukup" : "Kurang"}</Badge> : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-1 py-3.5 align-middle text-center text-slate-300 dark:text-slate-600"><ChevronRight size={15} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>

          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/70">
            {loading ? (
              <Spinner />
            ) : items.length === 0 ? (
              <EmptyState title="Belum ada jadwal" description="Buat jadwal produksi pertama lewat tombol di atas." />
            ) : (
              items.map((item) => {
                const meta = scheduleStatusMeta(item.status);
                const active = item.status !== "batal";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => router.push(`/ops/produksi/jadwal/${item.id}`)}
                    className="w-full text-left p-3.5 hover:bg-blue-50/60 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[12px] font-black text-slate-900 dark:text-white">{item.schedule_number}</p>
                        <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 truncate">{item.target_summary}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {active ? <Badge tone={item.sufficient ? "green" : "red"}>{item.sufficient ? "Cukup" : "Kurang"}</Badge> : null}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <div><span className="block text-slate-400">Target</span><b className="text-slate-800 dark:text-slate-100">{item.total_pcs} pcs</b></div>
                      <div><span className="block text-slate-400">Mulai</span><b className="text-slate-800 dark:text-slate-100">{formatScheduleDate(item.start_date)}</b></div>
                      <div><span className="block text-slate-400">Selesai</span><b className="text-slate-800 dark:text-slate-100">{formatScheduleDate(item.target_date)}</b></div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <JadwalFormDrawer
          open={formOpen}
          initial={null}
          onClose={() => setFormOpen(false)}
          onSaved={(id) => {
            setFormOpen(false);
            router.push(`/ops/produksi/jadwal/${id}`);
          }}
        />
      </div>
    </AccessGate>
  );
}
