"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  OPNAME_REASONS,
  formatDate,
  formatQty,
  formatRupiah,
  todayInput,
} from "@/lib/produksi";
import { produksiFetch } from "@/lib/produksi-api";
import { useProduksiAccess } from "./useAccess";
import {
  AccessGate,
  EmptyState,
  ErrorBox,
  PageHead,
  Spinner,
  StatCard,
  btnPrimary,
  cardClass,
  inputClass,
  labelClass,
} from "./ui";

type ComponentOption = {
  id: string;
  code: string;
  name: string;
  unit_use: string;
  stock: number;
  real_price?: number;
};

type OpnameRow = {
  id: string;
  component_code: string;
  component_name: string;
  unit_use: string;
  movement_date: string;
  qty: number;
  unit_price?: number;
  actor: string;
  notes: string;
  created_at: string;
};

export default function OpnameView() {
  const access = useProduksiAccess();
  const [components, setComponents] = useState<ComponentOption[]>([]);
  const [history, setHistory] = useState<OpnameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [componentId, setComponentId] = useState("");
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayInput());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [componentJson, historyJson] = await Promise.all([
        produksiFetch<{ items: ComponentOption[] }>("/api/ops/production/components"),
        produksiFetch<{ items: OpnameRow[] }>("/api/ops/production/opname?limit=100"),
      ]);
      setComponents(componentJson.items || []);
      setHistory(historyJson.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data opname.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.role === "owner") load();
  }, [load, access.role]);

  const selected = useMemo(
    () => components.find((c) => c.id === componentId) || null,
    [components, componentId],
  );

  const countedNumber = counted === "" ? null : Number(counted);
  const diff = countedNumber === null || !selected ? null : countedNumber - Number(selected.stock);
  const requiresReason = diff !== null && Math.abs(diff) > 0.000001;

  async function save() {
    if (saving) return;
    setFormError("");
    setSuccess("");
    if (!componentId) return setFormError("Pilih komponen.");
    if (countedNumber === null || !Number.isFinite(countedNumber) || countedNumber < 0) {
      return setFormError("Hitungan fisik tidak valid.");
    }
    if (requiresReason && !reason) return setFormError("Alasan selisih wajib diisi.");
    if (requiresReason && reason === "Lainnya" && !notes.trim()) {
      return setFormError('Alasan "Lainnya" wajib diberi catatan singkat.');
    }

    setSaving(true);
    try {
      const json = await produksiFetch<{
        result: { changed: boolean; delta: number; previous_stock: number; counted_stock: number };
      }>("/api/ops/production/opname", {
        method: "POST",
        body: JSON.stringify({
          component_id: componentId,
          counted_stock: countedNumber,
          reason: requiresReason ? reason : null,
          notes,
          date,
        }),
      });

      if (json.result?.changed) {
        setSuccess(
          `Opname tersimpan: stok ${formatQty(json.result.previous_stock)} → ${formatQty(json.result.counted_stock)} (${json.result.delta > 0 ? "+" : "−"}${formatQty(Math.abs(json.result.delta))} ${selected?.unit_use || ""}).`,
        );
      } else {
        setSuccess("Hitungan fisik sama dengan stok sistem — tidak ada penyesuaian.");
      }

      setCounted("");
      setReason("");
      setNotes("");
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal menyimpan opname.");
    } finally {
      setSaving(false);
    }
  }

  const totalAdjustment = useMemo(
    () => history.reduce((sum, row) => sum + Number(row.qty) * (Number(row.unit_price) || 0), 0),
    [history],
  );

  return (
    <AccessGate access={access} ownerOnly>
      <div className="space-y-4">
        <PageHead
          title="Stok Opname"
          subtitle="Cocokkan hitungan fisik dengan stok sistem. Selisih disimpan sebagai penyesuaian di buku stok."
        />

        <ErrorBox message={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Opname tercatat" value={String(history.length)} hint="100 terakhir" />
          <StatCard label="Penyesuaian" value={String(history.filter((row) => row.qty > 0).length)} hint="Stok bertambah" tone="positive" />
          <StatCard label="Penyesuaian turun" value={String(history.filter((row) => row.qty < 0).length)} hint="Stok berkurang" tone="danger" />
          <StatCard label="Nilai penyesuaian" value={`Rp ${formatRupiah(totalAdjustment)}`} hint="Qty × Harga Real saat itu" />
        </div>

        <div className={`${cardClass} p-4 space-y-4`}>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Opname komponen</p>
            <p className="text-[11px] text-slate-400">Stok sistem dihitung otomatis dari seluruh buku stok.</p>
          </div>

          <ErrorBox message={formError} />
          {success ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
              {success}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Komponen</label>
              <select
                className={inputClass}
                value={componentId}
                onChange={(e) => { setComponentId(e.target.value); setCounted(""); setReason(""); setNotes(""); setSuccess(""); }}
              >
                <option value="">— Pilih komponen —</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tanggal</label>
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {selected ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stok sistem</p>
                  <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                    {formatQty(selected.stock)} <span className="text-xs font-semibold text-slate-400">{selected.unit_use}</span>
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Hitungan fisik ({selected.unit_use})</label>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className={`rounded-xl p-3 ${diff === null ? "bg-slate-50 dark:bg-slate-800/60" : diff < 0 ? "bg-red-50 dark:bg-red-900/20" : diff > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-emerald-50 dark:bg-emerald-900/20"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selisih</p>
                  <p className={`mt-1 text-xl font-black ${diff === null ? "text-slate-400" : diff < 0 ? "text-red-600" : diff > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {diff === null ? "—" : `${diff > 0 ? "+" : ""}${formatQty(diff)} ${selected.unit_use}`}
                  </p>
                </div>
              </div>

              {requiresReason ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Alasan selisih (wajib)</label>
                    <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                      <option value="">— Pilih alasan —</option>
                      {OPNAME_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Catatan{reason === "Lainnya" ? " (wajib)" : " (opsional)"}</label>
                    <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Keterangan singkat" />
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end">
                <button className={btnPrimary} onClick={save} disabled={saving || counted === ""}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                  {saving ? "Menyimpan…" : "Simpan Opname"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">Pilih komponen untuk melihat stok sistem dan mengisi hitungan fisik.</p>
          )}
        </div>

        <div className={`${cardClass} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Riwayat opname</p>
            <p className="text-[11px] text-slate-400">Append-only</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-[#1e3a5f]">
                  {["Tanggal", "Komponen", "Selisih", "Harga satuan", "User", "Catatan"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6}><Spinner /></td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState title="Belum ada opname" description="Hasil opname akan muncul di sini setelah disimpan." /></td></tr>
                ) : (
                  history.map((row, index) => (
                    <tr key={row.id} className={`${index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-blue-50/30 dark:bg-[#1a1d28]"} border-b border-gray-100 dark:border-slate-800/50`}>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDate(row.movement_date)}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{row.component_code} · {row.component_name}</td>
                      <td className={`px-3 py-2.5 text-xs font-black whitespace-nowrap ${row.qty > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {row.qty > 0 ? "+" : "−"}{formatQty(Math.abs(row.qty))} {row.unit_use}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">Rp {formatRupiah(row.unit_price)}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.actor || "—"}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 min-w-[220px]">{row.notes || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Opname tidak pernah mengubah angka lama. Selisih dicatat sebagai transaksi penyesuaian baru supaya jejaknya tetap ada.
        </p>
      </div>
    </AccessGate>
  );
}
