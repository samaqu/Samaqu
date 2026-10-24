"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Loader2, Pencil, Play, Plus, X } from "lucide-react";
import { formatQty, formatRupiah } from "@/lib/produksi";
import { produksiFetch } from "@/lib/produksi-api";
import {
  formatScheduleDate,
  scheduleStatusMeta,
  type ScheduleStatus,
} from "@/lib/produksi-jadwal";
import type { TargetCostLine } from "@/lib/produksi-finished";
import { useProduksiAccess } from "./useAccess";
import JadwalFormDrawer, { type JadwalInitial } from "./JadwalFormDrawer";
import PenerimaanDrawer, { type ReceiptResult, type ReceiptTarget } from "./PenerimaanDrawer";
import {
  AccessGate,
  Badge,
  Drawer,
  EmptyState,
  ErrorBox,
  PageHead,
  Spinner,
  StatCard,
  btnPrimary,
  btnSecondary,
  cardClass,
  inputClass,
  labelClass,
} from "./ui";

type Schedule = {
  id: string;
  schedule_number: string;
  status: ScheduleStatus;
  start_date: string;
  target_date: string | null;
  tailor: string;
  notes: string;
  total_pcs: number;
  approved_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  closing_notes?: string | null;
  estimated_hpp?: number | null;
  final_hpp?: number | null;
  final_material_cost?: number | null;
  final_non_material_cost?: number | null;
  final_total_cost?: number | null;
  final_lolos?: number | null;
  cancelled_at?: string | null;
};

type Target = {
  id: string;
  category: string;
  fabric_type_id: string;
  fabric_type_name: string;
  color: string;
  series: string;
  size_qtys: Record<string, number>;
  total_pcs: number;
  cost_lines: TargetCostLine[];
};

type ReceiptItem = {
  id: string;
  target_id: string;
  size: string;
  qty_lolos: number;
  qty_rework: number;
  qty_reject: number;
  rework_to_lolos: number;
  rework_to_reject: number;
  reject_reason?: string | null;
  notes?: string | null;
};

type Receipt = {
  id: string;
  receipt_number: string;
  received_date: string;
  notes?: string | null;
  total_lolos: number;
  total_rework: number;
  total_reject: number;
  rework_to_lolos: number;
  rework_to_reject: number;
  material_cost: number;
  non_material_cost: number;
  total_cost: number;
  hpp_per_pcs: number;
  hpp_standard: number;
  items: ReceiptItem[];
  costs: { id: string; name: string; group_label?: string | null; amount: number }[];
};

type UsageRow = {
  component_id: string;
  component_code: string;
  component_name: string;
  unit_use: string;
  issued_qty: number;
  returned_qty: number;
  standard_qty: number;
  default_return_qty: number;
  actual_qty: number;
  difference: number;
  unit_price: number;
};

type Summary = {
  target_pcs: number;
  lolos: number;
  rework: number;
  reject: number;
  percent_lolos: number;
  percent_reject: number;
  material_cost: number;
  non_material_cost: number;
  total_cost: number;
  hpp_actual: number;
  hpp_estimated: number;
  hpp_final: number | null;
  hpp_standard: number;
  hpp_difference: number;
  standard_cost: number;
};

type FinishedHppRow = {
  product_id: string;
  product_name: string;
  color: string;
  size: string;
  qty: number;
  hpp_schedule: number;
  hpp_avg: number;
  qty_received: number;
  is_final: boolean;
};

type Requirement = {
  component_id: string;
  component_code: string;
  component_name: string;
  unit_use: string;
  required_qty: number;
  stock: number;
  reserved: number;
  available: number;
  difference: number;
  sufficient: boolean;
  real_price: number;
  value: number;
};

type DetailResponse = {
  item: Schedule;
  targets: Target[];
  requirements: Requirement[];
  warnings: string[];
  cost_estimate: { material: number; non_material: number; total: number };
  recipes_used: { recipe_id: string; version: number; category: string }[];
  receipts: Receipt[];
  finished_hpp: FinishedHppRow[];
  results: ReceiptResult[];
  outstanding_rework: number;
  usage: UsageRow[];
  summary: Summary;
  total_pcs: number;
  can_edit: boolean;
  can_approve: boolean;
  can_start: boolean;
  can_cancel: boolean;
  can_receive: boolean;
  can_issue: boolean;
  can_complete: boolean;
};

export default function JadwalDetailView({ id }: { id: string }) {
  const access = useProduksiAccess();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [startItems, setStartItems] = useState<Record<string, string>>({});
  const [cancelItems, setCancelItems] = useState<Record<string, string>>({});
  const [issueComponentId, setIssueComponentId] = useState("");
  const [issueQty, setIssueQty] = useState("");
  const [completeItems, setCompleteItems] = useState<Record<string, string>>({});
  const [completeNotes, setCompleteNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await produksiFetch<DetailResponse>(`/api/ops/production/schedules/${id}`);
      setData(json);
      setNotes(json.item.notes || "");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat jadwal.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (access.role === "owner") load();
  }, [load, access.role]);

  useEffect(() => {
    if (!startOpen || !data) return;
    setStartItems(
      Object.fromEntries(data.requirements.map((row) => [row.component_id, String(row.required_qty)])),
    );
  }, [startOpen, data]);

  useEffect(() => {
    if (!cancelOpen || !data) return;
    setCancelItems(Object.fromEntries(data.requirements.map((row) => [row.component_id, ""])));
  }, [cancelOpen, data]);

  useEffect(() => {
    if (!issueOpen || !data) return;
    setIssueComponentId((current) => current || data.requirements[0]?.component_id || "");
    setIssueQty("");
  }, [issueOpen, data]);

  useEffect(() => {
    if (!completeOpen || !data) return;
    setCompleteItems(
      Object.fromEntries(data.usage.map((row) => [row.component_id, String(row.default_return_qty || 0)])),
    );
    setCompleteNotes(data.item.closing_notes || "");
  }, [completeOpen, data]);

  const shortage = useMemo(
    () => (data?.requirements || []).filter((row) => !row.sufficient),
    [data],
  );
  const enough = data ? data.requirements.length > 0 && shortage.length === 0 : false;

  async function runAction(action: string, body: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      await produksiFetch(`/api/ops/production/schedules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, ...body }),
      });
      setApproveOpen(false);
      setStartOpen(false);
      setCancelOpen(false);
      setIssueOpen(false);
      setCompleteOpen(false);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Gagal memproses jadwal.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (savingNotes) return;
    setSavingNotes(true);
    try {
      await runAction("notes", { notes });
    } finally {
      setSavingNotes(false);
    }
  }

  function copyShortage() {
    const text = shortage
      .map((row) =>
        `${row.component_code} · ${row.component_name}: kurang ${formatQty(Math.abs(row.difference))} ${row.unit_use} (butuh ${formatQty(row.required_qty)}, tersedia ${formatQty(row.available)})`,
      )
      .join("\n");
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const startRows = (data?.requirements || []).map((row) => ({
    ...row,
    qty: Number(startItems[row.component_id]) || 0,
  }));
  const startInsufficient = startRows.filter((row) => row.qty > row.stock + 0.0001);
  const startValid = startRows.some((row) => row.qty > 0) && startInsufficient.length === 0;

  const targetById = new Map((data?.targets || []).map((target) => [target.id, target]));
  const issueRow = data?.requirements.find((row) => row.component_id === issueComponentId);
  const issueInvalid = !issueRow || (Number(issueQty) || 0) <= 0 || (Number(issueQty) || 0) > issueRow.stock + 0.0001;
  const completeRows = (data?.usage || []).map((row) => ({
    ...row,
    qty: Number(completeItems[row.component_id]) || 0,
  }));
  const completeInvalid = completeRows.some((row) => row.qty < 0 || row.qty > row.issued_qty + 0.0001);

  async function submitIssue() {
    if (!issueRow || issueInvalid) return;
    await runAction("issue", {
      items: [{ component_id: issueRow.component_id, qty: Number(issueQty) }],
    });
  }

  async function submitComplete() {
    if (completeInvalid) return;
    await runAction("complete", {
      items: completeRows
        .filter((row) => row.qty > 0)
        .map((row) => ({ component_id: row.component_id, qty: row.qty })),
      notes: completeNotes,
    });
  }

  const initialForm: JadwalInitial | null = data
    ? {
        id: data.item.id,
        status: data.item.status,
        start_date: data.item.start_date,
        target_date: data.item.target_date,
        tailor: data.item.tailor,
        notes: data.item.notes,
        targets: data.targets.map((target) => ({
          category: target.category,
          fabric_type_id: target.fabric_type_id,
          color: target.color,
          series: target.series,
          size_qtys: target.size_qtys,
        })),
      }
    : null;

  return (
    <AccessGate access={access} ownerOnly>
      <div className="space-y-4 min-w-0">
        <Link href="/ops/produksi/jadwal" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft size={14} /> Kembali ke Jadwal Produksi
        </Link>

        <ErrorBox message={error} />
        {loading ? (
          <div className={cardClass}><Spinner /></div>
        ) : !data ? (
          <div className={cardClass}><EmptyState title="Jadwal tidak ditemukan" /></div>
        ) : (
          <>
            <PageHead
              title={data.item.schedule_number}
              subtitle={`${formatScheduleDate(data.item.start_date)} → ${formatScheduleDate(data.item.target_date)}${data.item.tailor ? ` · ${data.item.tailor}` : ""}`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={scheduleStatusMeta(data.item.status).tone}>{scheduleStatusMeta(data.item.status).label}</Badge>
                  {data.can_edit ? (
                    <button className={btnSecondary} onClick={() => setFormOpen(true)}>
                      <Pencil size={15} /> Edit
                    </button>
                  ) : null}
                  {data.can_approve ? (
                    <button className={btnPrimary} onClick={() => setApproveOpen(true)}>
                      <Check size={15} /> Setujui
                    </button>
                  ) : null}
                  {data.can_start ? (
                    <button className={btnPrimary} onClick={() => setStartOpen(true)}>
                      <Play size={15} /> Mulai Produksi
                    </button>
                  ) : null}
                  {data.can_receive ? (
                    <button className={btnPrimary} onClick={() => setReceiptOpen(true)}>
                      <Plus size={15} /> Terima Hasil
                    </button>
                  ) : null}
                  {data.can_issue ? (
                    <button className={btnSecondary} onClick={() => setIssueOpen(true)}>
                      <Plus size={15} /> Bahan Tambahan
                    </button>
                  ) : null}
                  {data.item.status === "berjalan" ? (
                    <button
                      className={data.can_complete ? btnPrimary : btnSecondary}
                      disabled={!data.can_complete}
                      title={
                        data.can_complete
                          ? "Tutup produksi dan retur sisa bahan."
                          : `Selesaikan ${data.outstanding_rework} pcs rework terlebih dahulu.`
                      }
                      onClick={() => setCompleteOpen(true)}
                    >
                      <Check size={15} /> Selesai
                    </button>
                  ) : null}
                  {data.can_cancel ? (
                    <button className={btnSecondary} onClick={() => setCancelOpen(true)}>
                      <X size={15} /> Batal
                    </button>
                  ) : null}
                </div>
              }
            />

            <ErrorBox message={actionError} />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Total target" value={`${formatQty(data.total_pcs)} pcs`} hint={`${data.targets.length} baris target`} />
              <StatCard label="Komponen" value={String(data.requirements.length)} hint="Kebutuhan bahan" />
              <StatCard
                label="Kecukupan bahan"
                value={enough ? "Cukup" : "Kurang"}
                hint={enough ? "Semua kebutuhan tersedia" : `${shortage.length} komponen kurang`}
                tone={enough ? "positive" : "danger"}
              />
              <StatCard
                label="Estimasi biaya"
                value={`Rp ${formatRupiah(data.cost_estimate.total)}`}
                hint="Harga komponen saat ini"
              />
            </div>

            {["berjalan", "selesai"].includes(data.item.status) ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                  label="Lolos QC"
                  value={`${formatQty(data.summary.lolos)} pcs`}
                  hint={`${data.summary.percent_lolos}% dari hasil`}
                  tone="positive"
                />
                <StatCard
                  label="Rework tersisa"
                  value={`${formatQty(data.summary.rework)} pcs`}
                  hint={data.summary.rework > 0 ? "Belum masuk stok" : "Semua rework selesai"}
                  tone={data.summary.rework > 0 ? "warning" : "muted"}
                />
                <StatCard
                  label="Reject"
                  value={`${formatQty(data.summary.reject)} pcs`}
                  hint={`${data.summary.percent_reject}% dari hasil`}
                  tone={data.summary.reject > 0 ? "danger" : "muted"}
                />
                <StatCard
                  label={data.item.status === "selesai" ? "HPP final" : "HPP estimasi"}
                  value={
                    data.summary.lolos > 0
                      ? `Rp ${formatRupiah(data.summary.hpp_final ?? data.summary.hpp_actual)}`
                      : "—"
                  }
                  hint={
                    data.summary.lolos > 0
                      ? data.item.status === "selesai"
                        ? `Estimasi Rp ${formatRupiah(data.summary.hpp_estimated)} · Standar Rp ${formatRupiah(data.summary.hpp_standard)}`
                        : `Standar Rp ${formatRupiah(data.summary.hpp_standard)} · ${data.summary.hpp_difference > 0 ? "+" : ""}Rp ${formatRupiah(data.summary.hpp_difference)}`
                      : "Belum ada lolos QC"
                  }
                />
              </div>
            ) : null}

            {data.warnings.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/20">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Perhatian</p>
                <ul className="mt-1 space-y-0.5 text-xs text-amber-700 dark:text-amber-200/80">
                  {data.warnings.map((warning, index) => <li key={index}>• {warning}</li>)}
                </ul>
              </div>
            ) : null}

            <div className={`${cardClass} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Target produksi</p>
                <p className="text-[11px] text-slate-400">
                  Resep dipakai: {data.recipes_used.map((r) => `${r.category ? `${r.category} ` : ""}v${r.version}`).join(" · ") || "—"}
                </p>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {data.targets.map((target) => (
                  <div key={target.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-slate-900 dark:text-white">
                        {target.category}
                        {target.series ? ` · ${target.series}` : ""}
                        {target.color ? ` · ${target.color}` : ""}
                      </p>
                      <p className="text-[11px] text-slate-400">{target.fabric_type_name || "Tanpa jenis kain"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {Object.entries(target.size_qtys || {}).filter(([, qty]) => Number(qty) > 0).map(([size, qty]) => (
                        <span key={size} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          {size} <span className="text-slate-400">{qty}</span>
                        </span>
                      ))}
                      <span className="ml-1 text-xs font-black text-slate-900 dark:text-white tabular-nums">{target.total_pcs} pcs</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {data.results.length > 0 ? (
              <div className={`${cardClass} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Target vs hasil QC</p>
                  <p className="text-[11px] text-slate-400">Rework yang masih berjalan belum masuk stok.</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {data.results.map((row) => {
                    const target = targetById.get(row.target_id);
                    return (
                      <div key={`${row.target_id}-${row.size}`} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {target?.category || row.target_id}
                            {target?.series ? ` · ${target.series}` : ""}
                            {target?.color ? ` · ${target.color}` : ""}
                            <span className="ml-1.5 text-slate-400">· {row.size}</span>
                          </p>
                          <p className="text-[10px] text-slate-400">Target {formatQty(row.target_qty)} pcs</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold tabular-nums">
                          <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">L {formatQty(row.lolos)}</span>
                          <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">R {formatQty(row.rework)}</span>
                          <span className="rounded-lg bg-red-50 px-2 py-1 text-red-700 dark:bg-red-900/30 dark:text-red-300">J {formatQty(row.reject)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {data.receipts.length > 0 ? (
              <div className={`${cardClass} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Riwayat penerimaan</p>
                  <p className="text-[11px] text-slate-400">Append-only. Koreksi dilakukan lewat penerimaan berikutnya.</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {data.receipts.map((receipt) => (
                    <div key={receipt.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 dark:text-white">{receipt.receipt_number}</p>
                          <p className="text-[10px] text-slate-400">
                            {formatScheduleDate(receipt.received_date)}
                            {receipt.notes ? ` · ${receipt.notes}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold tabular-nums">
                          <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">L {formatQty(receipt.total_lolos)}</span>
                          <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">R {formatQty(receipt.total_rework)}</span>
                          <span className="rounded-lg bg-red-50 px-2 py-1 text-red-700 dark:bg-red-900/30 dark:text-red-300">J {formatQty(receipt.total_reject)}</span>
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">HPP Rp {formatRupiah(receipt.hpp_per_pcs)}</span>
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Std Rp {formatRupiah(receipt.hpp_standard)}</span>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {receipt.items.map((item) => {
                          const target = targetById.get(item.target_id);
                          return (
                            <div key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[10.5px]">
                              <span className="text-slate-500 dark:text-slate-400">
                                {target?.category || item.target_id}
                                {target?.series ? ` · ${target.series}` : ""}
                                {target?.color ? ` · ${target.color}` : ""} · {item.size}
                              </span>
                              <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                                L {item.qty_lolos} · R {item.qty_rework} · J {item.qty_reject}
                                {item.rework_to_lolos > 0 ? ` · R→L ${item.rework_to_lolos}` : ""}
                                {item.rework_to_reject > 0 ? ` · R→J ${item.rework_to_reject}` : ""}
                                {item.reject_reason ? ` · ${item.reject_reason}` : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {data.finished_hpp.length > 0 ? (
              <div className={`${cardClass} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">HPP rata-rata produksi per varian</p>
                  <p className="text-[11px] text-slate-400">
                    Rata-rata dari seluruh produksi. Kontribusi jadwal memakai {data.item.status === "selesai" ? "HPP final" : "HPP estimasi"}.
                  </p>
                </div>

                <div className="hidden md:block">
                  <table className="w-full border-collapse table-fixed">
                    <colgroup>
                      <col className="w-[34%]" />
                      <col className="w-[10%]" />
                      <col className="w-[10%]" />
                      <col className="w-[23%]" />
                      <col className="w-[23%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                        {["Produk", "Ukuran", "Qty", "HPP rata-rata produksi", "Kontribusi jadwal"].map((head, index) => (
                          <th key={head} className={`px-3 py-2.5 ${index > 0 ? "text-right" : "text-left"} text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400`}>{head}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {data.finished_hpp.map((row) => (
                        <tr key={`${row.product_id}|${row.color}|${row.size}`}>
                          <td className="px-3 py-2.5 min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{row.product_name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{row.color !== "default" ? row.color : "—"}</p>
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-slate-600 dark:text-slate-300">{row.size}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold text-slate-900 dark:text-white tabular-nums">{formatQty(row.qty)}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-black text-slate-900 dark:text-white tabular-nums">Rp {formatRupiah(row.hpp_avg)}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">Rp {formatRupiah(row.hpp_schedule)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/70">
                  {data.finished_hpp.map((row) => (
                    <div key={`${row.product_id}|${row.color}|${row.size}`} className="p-3">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{row.product_name}</p>
                      <p className="text-[10px] text-slate-400">{row.color !== "default" ? `${row.color} · ` : ""}{row.size} · {formatQty(row.qty)} pcs</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                        <span className="text-slate-400">HPP rata-rata produksi</span>
                        <span className="text-right font-bold text-slate-800 dark:text-slate-100">Rp {formatRupiah(row.hpp_avg)}</span>
                        <span className="text-slate-400">Kontribusi jadwal</span>
                        <span className="text-right font-bold text-slate-700 dark:text-slate-200">Rp {formatRupiah(row.hpp_schedule)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={`${cardClass} overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Kebutuhan bahan</p>
                  <p className="text-[11px] text-slate-400">Bahan produksi saja (kain + bahan). Packaging & tambahan opsional tidak dihitung.</p>
                </div>
                {shortage.length > 0 ? (
                  <button type="button" className={btnSecondary} onClick={copyShortage}>
                    <Copy size={14} /> {copied ? "Tersalin" : "Salin daftar kekurangan"}
                  </button>
                ) : null}
              </div>

              {data.requirements.length === 0 ? (
                <EmptyState title="Belum ada kebutuhan bahan" description="Lengkapi resep aktif atau target produksi." />
              ) : (
                <>
                  <div className="hidden md:block">
                    <table className="w-full border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[24%]" />
                        <col className="w-[12%]" />
                        <col className="w-[12%]" />
                        <col className="w-[13%]" />
                        <col className="w-[12%]" />
                        <col className="w-[12%]" />
                        <col className="w-[15%]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                          {["Komponen", "Kebutuhan", "Stok fisik", "Dicadangkan lain", "Tersedia", "Selisih", "Status"].map((head, index) => (
                            <th key={head} className={`px-3 py-2.5 ${index >= 1 && index <= 5 ? "text-right" : "text-left"} text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400`}>{head}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {data.requirements.map((row) => (
                          <tr key={row.component_id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60">
                            <td className="px-3 py-2.5 min-w-0">
                              <p className="text-[11px] font-mono text-slate-400 truncate">{row.component_code}</p>
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{row.component_name}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap tabular-nums">{formatQty(row.required_qty)} <span className="text-[10px] font-medium text-slate-400">{row.unit_use}</span></td>
                            <td className="px-3 py-2.5 text-right text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">{formatQty(row.stock)}</td>
                            <td className="px-3 py-2.5 text-right text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">{formatQty(row.reserved)}</td>
                            <td className="px-3 py-2.5 text-right text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">{formatQty(row.available)}</td>
                            <td className={`px-3 py-2.5 text-right text-xs font-bold whitespace-nowrap tabular-nums ${row.difference < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {row.difference < 0 ? "−" : "+"}{formatQty(Math.abs(row.difference))}
                            </td>
                            <td className="px-3 py-2.5"><Badge tone={row.sufficient ? "green" : "red"}>{row.sufficient ? "Cukup" : "Kurang"}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/70">
                    {data.requirements.map((row) => (
                      <div key={row.component_id} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-mono text-slate-400 truncate">{row.component_code}</p>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{row.component_name}</p>
                          </div>
                          <Badge tone={row.sufficient ? "green" : "red"}>{row.sufficient ? "Cukup" : "Kurang"}</Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <span className="text-slate-400">Kebutuhan</span>
                          <span className="text-right font-bold text-slate-800 dark:text-slate-100">{formatQty(row.required_qty)} {row.unit_use}</span>
                          <span className="text-slate-400">Stok fisik</span>
                          <span className="text-right text-slate-700 dark:text-slate-200">{formatQty(row.stock)}</span>
                          <span className="text-slate-400">Dicadangkan lain</span>
                          <span className="text-right text-slate-700 dark:text-slate-200">{formatQty(row.reserved)}</span>
                          <span className="text-slate-400">Tersedia</span>
                          <span className="text-right text-slate-700 dark:text-slate-200">{formatQty(row.available)}</span>
                          <span className="text-slate-400">Selisih</span>
                          <span className={`text-right font-bold ${row.difference < 0 ? "text-red-600" : "text-emerald-600"}`}>{row.difference < 0 ? "−" : "+"}{formatQty(Math.abs(row.difference))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {data.usage.length > 0 ? (
              <div className={`${cardClass} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Pemakaian bahan aktual vs standar</p>
                  <p className="text-[11px] text-slate-400">
                    {data.item.status === "selesai"
                      ? "Aktual = dikeluarkan − retur sisa bahan."
                      : "Aktual sementara = bahan yang sudah dikeluarkan; retur dihitung saat Selesai."}
                  </p>
                </div>

                <div className="hidden md:block">
                  <table className="w-full border-collapse table-fixed">
                    <colgroup>
                      <col className="w-[32%]" />
                      <col className="w-[17%]" />
                      <col className="w-[17%]" />
                      <col className="w-[17%]" />
                      <col className="w-[17%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                        {["Komponen", "Dikeluarkan", "Standar", "Aktual", "Selisih"].map((head, index) => (
                          <th key={head} className={`px-3 py-2.5 ${index > 0 ? "text-right" : "text-left"} text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400`}>{head}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {data.usage.map((row) => (
                        <tr key={row.component_id}>
                          <td className="px-3 py-2.5 min-w-0">
                            <p className="text-[11px] font-mono text-slate-400 truncate">{row.component_code}</p>
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{row.component_name}</p>
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">{formatQty(row.issued_qty)} <span className="text-[10px] text-slate-400">{row.unit_use}</span></td>
                          <td className="px-3 py-2.5 text-right text-xs text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">{formatQty(row.standard_qty)}</td>
                          <td className="px-3 py-2.5 text-right text-xs font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">{formatQty(row.actual_qty)}</td>
                          <td className={`px-3 py-2.5 text-right text-xs font-bold tabular-nums whitespace-nowrap ${row.difference > 0.0001 ? "text-red-600 dark:text-red-400" : row.difference < -0.0001 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                            {row.difference > 0 ? "Boros " : row.difference < 0 ? "Hemat " : ""}
                            {formatQty(Math.abs(row.difference))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/70">
                  {data.usage.map((row) => (
                    <div key={row.component_id} className="p-3">
                      <p className="text-[11px] font-mono text-slate-400 truncate">{row.component_code}</p>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{row.component_name}</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                        <span className="text-slate-400">Dikeluarkan</span>
                        <span className="text-right text-slate-700 dark:text-slate-200">{formatQty(row.issued_qty)} {row.unit_use}</span>
                        <span className="text-slate-400">Standar</span>
                        <span className="text-right text-slate-700 dark:text-slate-200">{formatQty(row.standard_qty)}</span>
                        <span className="text-slate-400">Aktual</span>
                        <span className="text-right font-bold text-slate-800 dark:text-slate-100">{formatQty(row.actual_qty)}</span>
                        <span className="text-slate-400">Selisih</span>
                        <span className={`text-right font-bold ${row.difference > 0.0001 ? "text-red-600" : row.difference < -0.0001 ? "text-emerald-600" : "text-slate-400"}`}>
                          {row.difference > 0 ? "Boros " : row.difference < 0 ? "Hemat " : ""}
                          {formatQty(Math.abs(row.difference))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={`${cardClass} p-4`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Estimasi biaya produksi</p>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Harga saat ini</span>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bahan</p>
                  <p className="mt-1 text-lg font-black text-slate-900 dark:text-white tabular-nums">Rp {formatRupiah(data.cost_estimate.material)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Biaya non-bahan</p>
                  <p className="mt-1 text-lg font-black text-slate-900 dark:text-white tabular-nums">Rp {formatRupiah(data.cost_estimate.non_material)}</p>
                </div>
                <div className="rounded-xl bg-[#1e3a5f] p-3 text-white">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Total</p>
                  <p className="mt-1 text-lg font-black tabular-nums">Rp {formatRupiah(data.cost_estimate.total)}</p>
                </div>
              </div>
            </div>

            {data.receipts.length > 0 ? (
              <div className={`${cardClass} p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Biaya aktual produksi</p>
                    <p className="text-[11px] text-slate-400">Packaging Pesanan & Tambahan Opsional tidak dihitung.</p>
                  </div>
                  <Badge tone={data.summary.hpp_difference > 0 ? "red" : "green"}>
                    {data.summary.hpp_difference > 0 ? "Di atas standar" : data.summary.hpp_difference < 0 ? "Di bawah standar" : "Sesuai standar"}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bahan aktual</p>
                    <p className="mt-1 text-base font-black text-slate-900 dark:text-white tabular-nums">Rp {formatRupiah(data.summary.material_cost)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Non-bahan</p>
                    <p className="mt-1 text-base font-black text-slate-900 dark:text-white tabular-nums">Rp {formatRupiah(data.summary.non_material_cost)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total biaya</p>
                    <p className="mt-1 text-base font-black text-slate-900 dark:text-white tabular-nums">Rp {formatRupiah(data.summary.total_cost)}</p>
                  </div>
                  <div className="rounded-xl bg-[#1e3a5f] p-3 text-white">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                      {data.item.status === "selesai" ? "HPP final / pcs" : "HPP estimasi / pcs"}
                    </p>
                    <p className="mt-1 text-base font-black tabular-nums">
                      Rp {formatRupiah(data.summary.hpp_final ?? data.summary.hpp_actual)}
                    </p>
                    <p className="text-[10px] text-white/70">
                      {data.item.status === "selesai"
                        ? `Estimasi Rp ${formatRupiah(data.summary.hpp_estimated)}`
                        : `Standar Rp ${formatRupiah(data.summary.hpp_standard)}`}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className={`${cardClass} p-4`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Catatan</p>
                {data.item.status === "berjalan" ? (
                  <button className={btnSecondary} onClick={saveNotes} disabled={savingNotes}>
                    {savingNotes ? <Loader2 size={14} className="animate-spin" /> : null} Simpan catatan
                  </button>
                ) : null}
              </div>
              {data.item.status === "berjalan" ? (
                <textarea className={`${inputClass} mt-2 min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
              ) : (
                <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200 break-words">{data.item.notes || "—"}</p>
              )}
            </div>

            <JadwalFormDrawer
              open={formOpen}
              initial={initialForm}
              onClose={() => setFormOpen(false)}
              onSaved={async () => { setFormOpen(false); await load(); }}
            />

            <Drawer
              open={approveOpen}
              onClose={() => setApproveOpen(false)}
              title="Setujui Jadwal"
              subtitle="Kebutuhan bahan disimpan sebagai snapshot dan stok dicadangkan."
              footer={
                <div className="flex justify-end gap-2">
                  <button className={btnSecondary} onClick={() => setApproveOpen(false)} disabled={busy}>Batal</button>
                  <button className={btnPrimary} onClick={() => runAction("approve")} disabled={busy}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Setujui
                  </button>
                </div>
              }
            >
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <p>Stok fisik tidak berubah. Stok tersedia akan berkurang karena dicadangkan untuk jadwal ini.</p>
                {shortage.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                    Ada {shortage.length} komponen yang belum cukup. Jadwal tetap boleh disetujui, tetapi bahan perlu dibeli/dicukupi sebelum mulai produksi.
                  </div>
                ) : null}
              </div>
            </Drawer>

            <Drawer
              open={startOpen}
              onClose={() => setStartOpen(false)}
              wide
              title="Mulai Produksi"
              subtitle="Stok fisik akan berkurang lewat buku stok. Reservasi dilepas."
              footer={
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-400">
                    {startInsufficient.length > 0 ? `${startInsufficient.length} komponen melebihi stok fisik.` : "Jumlah bisa diubah sebelum dikeluarkan."}
                  </p>
                  <div className="flex items-center gap-2">
                    <button className={btnSecondary} onClick={() => setStartOpen(false)} disabled={busy}>Batal</button>
                    <button
                      className={btnPrimary}
                      disabled={busy || !startValid}
                      onClick={() => runAction("start", { items: startRows.filter((row) => row.qty > 0).map((row) => ({ component_id: row.component_id, qty: row.qty })) })}
                    >
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Keluarkan Bahan
                    </button>
                  </div>
                </div>
              }
            >
              <div className="space-y-2">
                {startRows.map((row) => {
                  const invalid = row.qty > row.stock + 0.0001;
                  return (
                    <div key={row.component_id} className={`${cardClass} p-3`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-mono text-slate-400 truncate">{row.component_code}</p>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{row.component_name}</p>
                        </div>
                        <div className="text-right">
                          <label className={labelClass}>Keluarkan ({row.unit_use})</label>
                          <input
                            className={`${inputClass} w-28 text-right ${invalid ? "border-red-400" : ""}`}
                            inputMode="decimal"
                            value={startItems[row.component_id] ?? ""}
                            onChange={(e) => setStartItems((current) => ({ ...current, [row.component_id]: e.target.value }))}
                          />
                          <p className={`mt-1 text-[10px] ${invalid ? "text-red-600" : "text-slate-400"}`}>
                            stok fisik {formatQty(row.stock)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Drawer>

            <Drawer
              open={cancelOpen}
              onClose={() => setCancelOpen(false)}
              wide={data.item.status === "berjalan"}
              title={data.item.status === "berjalan" ? "Batalkan & Retur Sisa Bahan" : "Batalkan Jadwal"}
              subtitle={data.item.status === "berjalan" ? "Isi jumlah bahan yang dikembalikan (boleh 0)." : "Reservasi bahan akan dilepas."}
              footer={
                <div className="flex justify-end gap-2">
                  <button className={btnSecondary} onClick={() => setCancelOpen(false)} disabled={busy}>Tutup</button>
                  <button
                    className={btnPrimary}
                    disabled={busy}
                    onClick={() =>
                      runAction("cancel", {
                        ...(data.item.status === "berjalan"
                          ? {
                              items: (data.requirements || [])
                                .map((row) => ({ component_id: row.component_id, qty: Number(cancelItems[row.component_id]) || 0 }))
                                .filter((row) => row.qty > 0),
                            }
                          : {}),
                      })
                    }
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />} Batalkan
                  </button>
                </div>
              }
            >
              {data.item.status === "berjalan" ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Bahan yang sudah keluar bisa dikembalikan sebagian. Pergerakan retur dicatat di buku stok.
                  </p>
                  {data.requirements.map((row) => (
                    <div key={row.component_id} className={`${cardClass} p-3 flex items-center justify-between gap-3`}>
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono text-slate-400 truncate">{row.component_code}</p>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{row.component_name}</p>
                      </div>
                      <div className="text-right">
                        <label className={labelClass}>Retur ({row.unit_use})</label>
                        <input
                          className={`${inputClass} w-28 text-right`}
                          inputMode="decimal"
                          placeholder="0"
                          value={cancelItems[row.component_id] ?? ""}
                          onChange={(e) => setCancelItems((current) => ({ ...current, [row.component_id]: e.target.value }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Jadwal akan dibatalkan. Jika status Disetujui, reservasi bahan otomatis dilepas. Stok fisik tidak berubah.
                </p>
              )}
            </Drawer>

            <PenerimaanDrawer
              open={receiptOpen}
              scheduleId={data.item.id}
              targets={data.targets}
              results={data.results}
              onClose={() => setReceiptOpen(false)}
              onSaved={async () => {
                setReceiptOpen(false);
                await load();
              }}
            />

            <Drawer
              open={issueOpen}
              onClose={() => setIssueOpen(false)}
              title="Keluarkan Bahan Tambahan"
              subtitle="Dicatat sebagai Keluar ke Produksi dengan nomor WO. Stok tidak boleh minus."
              footer={
                <div className="flex justify-end gap-2">
                  <button className={btnSecondary} onClick={() => setIssueOpen(false)} disabled={busy}>Batal</button>
                  <button className={btnPrimary} onClick={submitIssue} disabled={busy || issueInvalid}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Keluarkan
                  </button>
                </div>
              }
            >
              <div className="space-y-3">
                <ErrorBox message={actionError} />
                <div>
                  <label className={labelClass}>Komponen</label>
                  <select
                    className={inputClass}
                    value={issueComponentId}
                    onChange={(e) => setIssueComponentId(e.target.value)}
                  >
                    <option value="">— Pilih komponen kebutuhan —</option>
                    {data.requirements.map((row) => (
                      <option key={row.component_id} value={row.component_id}>
                        {row.component_code} · {row.component_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Jumlah {issueRow?.unit_use ? `(${issueRow.unit_use})` : ""}</label>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={issueQty}
                    onChange={(e) => setIssueQty(e.target.value)}
                    placeholder="0"
                  />
                  {issueRow ? (
                    <p className={`mt-1 text-[11px] font-semibold ${issueInvalid && issueQty ? "text-red-600" : "text-slate-400"}`}>
                      Stok fisik {formatQty(issueRow.stock)} {issueRow.unit_use} · kebutuhan jadwal {formatQty(issueRow.required_qty)}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Bahan tambahan tidak mengubah kebutuhan standar. Pemakaian aktual tetap dihitung saat menutup jadwal.
                </p>
              </div>
            </Drawer>

            <Drawer
              open={completeOpen}
              onClose={() => setCompleteOpen(false)}
              wide
              title="Selesaikan Produksi"
              subtitle="Isi bahan yang dikembalikan. Pemakaian aktual = dikeluarkan − retur."
              footer={
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-400">
                    {data.outstanding_rework > 0
                      ? `${data.outstanding_rework} pcs rework belum selesai.`
                      : "Jadwal akan terkunci setelah Selesai."}
                  </p>
                  <div className="flex items-center gap-2">
                    <button className={btnSecondary} onClick={() => setCompleteOpen(false)} disabled={busy}>Batal</button>
                    <button
                      className={btnPrimary}
                      onClick={submitComplete}
                      disabled={busy || completeInvalid || data.outstanding_rework > 0}
                    >
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Selesai & Kunci
                    </button>
                  </div>
                </div>
              }
            >
              <div className="space-y-3">
                <ErrorBox message={actionError} />
                {data.outstanding_rework > 0 ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200">
                    Masih ada {data.outstanding_rework} pcs rework. Selesaikan menjadi Lolos atau Reject lewat Terima Hasil sebelum menutup jadwal.
                  </div>
                ) : null}

                <div className="space-y-2">
                  {data.usage
                    .filter((row) => row.issued_qty > 0 || row.standard_qty > 0)
                    .map((row) => {
                      const qty = Number(completeItems[row.component_id]) || 0;
                      const actual = Math.max(0, row.issued_qty - qty);
                      const difference = actual - row.standard_qty;
                      return (
                        <div key={row.component_id} className={`${cardClass} p-3`}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-mono text-slate-400 truncate">{row.component_code}</p>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">{row.component_name}</p>
                              <p className="mt-0.5 text-[10px] text-slate-400">
                                Dikeluarkan {formatQty(row.issued_qty)} {row.unit_use} · standar {formatQty(row.standard_qty)}
                              </p>
                            </div>
                            <div className="w-32">
                              <label className={labelClass}>Retur ({row.unit_use})</label>
                              <input
                                className={`${inputClass} text-right`}
                                inputMode="decimal"
                                value={completeItems[row.component_id] ?? ""}
                                onChange={(e) =>
                                  setCompleteItems((current) => ({ ...current, [row.component_id]: e.target.value }))
                                }
                              />
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px]">
                            <span className="text-slate-400">Default retur <b className="text-slate-700 dark:text-slate-200">{formatQty(row.default_return_qty)}</b></span>
                            <span className="text-slate-400">Aktual <b className="text-slate-700 dark:text-slate-200">{formatQty(actual)}</b></span>
                            <span className={difference > 0.0001 ? "font-bold text-red-600" : difference < -0.0001 ? "font-bold text-emerald-600" : "text-slate-400"}>
                              {difference > 0 ? "Boros " : difference < 0 ? "Hemat " : "Sesuai "}
                              {formatQty(Math.abs(difference))}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div>
                  <label className={labelClass}>Catatan penutupan</label>
                  <textarea
                    className={`${inputClass} min-h-[72px]`}
                    value={completeNotes}
                    onChange={(e) => setCompleteNotes(e.target.value)}
                    placeholder="Opsional"
                  />
                </div>
              </div>
            </Drawer>
          </>
        )}
      </div>
    </AccessGate>
  );
}
