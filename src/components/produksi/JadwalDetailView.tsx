"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Loader2, Pencil, Play, X } from "lucide-react";
import { formatQty, formatRupiah } from "@/lib/produksi";
import { produksiFetch } from "@/lib/produksi-api";
import {
  formatScheduleDate,
  scheduleStatusMeta,
  type ScheduleStatus,
} from "@/lib/produksi-jadwal";
import { useProduksiAccess } from "./useAccess";
import JadwalFormDrawer, { type JadwalInitial } from "./JadwalFormDrawer";
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
  total_pcs: number;
  can_edit: boolean;
  can_approve: boolean;
  can_start: boolean;
  can_cancel: boolean;
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
  const [startItems, setStartItems] = useState<Record<string, string>>({});
  const [cancelItems, setCancelItems] = useState<Record<string, string>>({});
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
                  {data.can_cancel ? (
                    <button className={btnSecondary} onClick={() => setCancelOpen(true)}>
                      <X size={15} /> Batal
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled
                    title="Selesai akan aktif di Fase 4 (QC & barang jadi)."
                    className={`${btnSecondary} opacity-50 cursor-not-allowed`}
                  >
                    Selesai · Segera
                  </button>
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
          </>
        )}
      </div>
    </AccessGate>
  );
}
