"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { formatQty, formatRupiah, todayInput } from "@/lib/produksi";
import { produksiFetch } from "@/lib/produksi-api";
import type { TargetCostLine } from "@/lib/produksi-finished";
import {
  Drawer,
  ErrorBox,
  btnPrimary,
  btnSecondary,
  cardClass,
  inputClass,
  labelClass,
} from "./ui";

const REJECT_REASONS = ["Noda", "Salah ukuran", "Jahitan tidak rapi", "Cacat kain", "Lainnya"];

type QcFieldKey = "lolos" | "rework" | "reject" | "reworkLolos" | "reworkReject";

const QC_FIELDS: { key: QcFieldKey; label: string; needsRework?: boolean }[] = [
  { key: "lolos", label: "Lolos QC (masuk stok)" },
  { key: "rework", label: "Rework (perbaiki)" },
  { key: "reject", label: "Reject (buang)" },
  { key: "reworkLolos", label: "Rework jadi Lolos", needsRework: true },
  { key: "reworkReject", label: "Rework jadi Reject", needsRework: true },
];

export type ReceiptTarget = {
  id: string;
  category: string;
  fabric_type_name: string;
  color: string;
  series: string;
  size_qtys: Record<string, number>;
  cost_lines: TargetCostLine[];
};

export type ReceiptResult = {
  target_id: string;
  size: string;
  target_qty: number;
  lolos: number;
  rework: number;
  reject: number;
};

type ItemState = {
  lolos: string;
  rework: string;
  reject: string;
  reworkLolos: string;
  reworkReject: string;
  reason: string;
  notes: string;
};

type CostState = {
  name: string;
  group_label: string;
  amount: string;
  source: "recipe" | "manual";
};

const keyOf = (targetId: string, size: string) => `${targetId}|${size}`;

const emptyItem = (): ItemState => ({
  lolos: "",
  rework: "",
  reject: "",
  reworkLolos: "",
  reworkReject: "",
  reason: "",
  notes: "",
});

export default function PenerimaanDrawer({
  open,
  scheduleId,
  targets,
  results,
  onClose,
  onSaved,
}: {
  open: boolean;
  scheduleId: string;
  targets: ReceiptTarget[];
  results: ReceiptResult[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [costs, setCosts] = useState<CostState[]>([]);
  const [costsTouched, setCostsTouched] = useState(false);
  const [date, setDate] = useState(todayInput());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const outstanding = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of results) map.set(keyOf(row.target_id, row.size), row.rework);
    return map;
  }, [results]);

  useEffect(() => {
    if (!open) return;
    setItems({});
    setCosts([]);
    setCostsTouched(false);
    setDate(todayInput());
    setNotes("");
    setError("");
  }, [open]);

  function updateItem(key: string, patch: Partial<ItemState>) {
    setItems((current) => ({ ...current, [key]: { ...(current[key] || emptyItem()), ...patch } }));
  }

  const processedRows = useMemo(() => {
    const rows: { target: ReceiptTarget; size: string; item: ItemState; processed: number }[] = [];
    for (const target of targets) {
      for (const [size, targetQty] of Object.entries(target.size_qtys || {})) {
        if (Number(targetQty) <= 0) continue;
        const key = keyOf(target.id, size);
        const item = items[key] || emptyItem();
        const processed = (Number(item.lolos) || 0) + (Number(item.rework) || 0) + (Number(item.reject) || 0);
        rows.push({ target, size, item, processed });
      }
    }
    return rows;
  }, [targets, items]);

  const suggestedCosts = useMemo(() => {
    const grouped = new Map<string, CostState>();
    for (const { target, size, item, processed } of processedRows) {
      if (processed <= 0) continue;
      for (const line of target.cost_lines || []) {
        if (line.filter_size && line.filter_size.toUpperCase() !== size.toUpperCase()) continue;
        const amount = (Number(line.real_price) || 0) * processed;
        if (amount <= 0) continue;
        const group = line.group_label || line.name;
        const groupKey = `${line.name}|${group}`;
        const existing = grouped.get(groupKey);
        if (existing) existing.amount = String(Number(existing.amount) + amount);
        else grouped.set(groupKey, { name: line.name, group_label: group, amount: String(amount), source: "recipe" });
      }
    }
    return Array.from(grouped.values());
  }, [processedRows]);

  useEffect(() => {
    if (!open || costsTouched) return;
    setCosts(suggestedCosts);
  }, [open, costsTouched, suggestedCosts]);

  const totalProcessed = processedRows.reduce((sum, row) => sum + row.processed, 0);
  const totalLolos = processedRows.reduce(
    (sum, row) => sum + (Number(row.item.lolos) || 0) + (Number(row.item.reworkLolos) || 0),
    0,
  );
  const nonMaterialTotal = costs.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  async function save() {
    if (saving) return;
    setError("");

    const payloadItems: any[] = [];
    for (const { target, size, item } of processedRows) {
      const qtyLolos = Number(item.lolos) || 0;
      const qtyRework = Number(item.rework) || 0;
      const qtyReject = Number(item.reject) || 0;
      const reworkLolos = Number(item.reworkLolos) || 0;
      const reworkReject = Number(item.reworkReject) || 0;
      if (qtyLolos + qtyRework + qtyReject + reworkLolos + reworkReject === 0) continue;

      if ((qtyReject > 0 || reworkReject > 0) && !item.reason) {
        return setError(`Alasan reject wajib dipilih untuk ${target.category} ${size}.`);
      }
      const key = keyOf(target.id, size);
      const available = outstanding.get(key) || 0;
      if (reworkLolos + reworkReject > available) {
        return setError(`Rework ${target.category} ${size} melebihi sisa (${available}).`);
      }

      payloadItems.push({
        target_id: target.id,
        size,
        qty_lolos: qtyLolos,
        qty_rework: qtyRework,
        qty_reject: qtyReject,
        rework_to_lolos: reworkLolos,
        rework_to_reject: reworkReject,
        reject_reason: item.reason || null,
        notes: item.notes || null,
      });
    }

    if (payloadItems.length === 0) return setError("Isi minimal satu hasil QC.");

    setSaving(true);
    try {
      await produksiFetch(`/api/ops/production/schedules/${scheduleId}/receipts`, {
        method: "POST",
        body: JSON.stringify({
          date,
          notes,
          items: payloadItems,
          costs: costs
            .filter((row) => row.name.trim())
            .map((row) => ({
              name: row.name.trim(),
              group_label: row.group_label.trim(),
              amount: Number(row.amount) || 0,
            })),
        }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan penerimaan.");
    } finally {
      setSaving(false);
    }
  }

  function scrollToCosts() {
    document.getElementById("biaya-non-bahan")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      wide
      title="Terima Hasil Produksi"
      subtitle="Penerimaan tidak bisa diedit. Koreksi lewat penerimaan berikutnya."
      hint="Hanya Lolos QC yang masuk stok. Rework dan Reject tidak menambah stok."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Diproses:{" "}
              <b className="font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                {formatQty(totalProcessed)} pcs
              </b>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Masuk stok: <span className="tabular-nums">{formatQty(totalLolos)} pcs</span>
            </span>
            <button
              type="button"
              onClick={scrollToCosts}
              title="Lihat rincian biaya non-bahan"
              className="font-semibold text-[#1e3a5f] underline underline-offset-2 hover:text-[#16304f] dark:text-blue-300"
            >
              Biaya non-bahan: Rp {formatRupiah(nonMaterialTotal)}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className={btnSecondary} onClick={onClose} disabled={saving}>Batal</button>
            <button className={btnPrimary} onClick={save} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {saving ? "Menyimpan…" : "Simpan Penerimaan"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <ErrorBox message={error} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tanggal terima</label>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Catatan penerimaan</label>
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" />
          </div>
        </div>

        {targets.map((target) => {
          const sizes = Object.entries(target.size_qtys || {}).filter(([, qty]) => Number(qty) > 0);
          if (sizes.length === 0) return null;
          return (
            <div key={target.id} className={`${cardClass} p-3`}>
              <div className="mb-2">
                <p className="text-xs font-black text-slate-900 dark:text-white">
                  {target.category}
                  {target.series ? ` · ${target.series}` : ""}
                  {target.color ? ` · ${target.color}` : ""}
                </p>
                <p className="text-[11px] text-slate-400">{target.fabric_type_name || "Tanpa jenis kain"}</p>
              </div>

              <div className="space-y-2">
                {sizes.map(([size, targetQty]) => {
                  const key = keyOf(target.id, size);
                  const item = items[key] || emptyItem();
                  const reworkLeft = outstanding.get(key) || 0;
                  const rejectActive = (Number(item.reject) || 0) > 0 || (Number(item.reworkReject) || 0) > 0;
                  return (
                    <div key={size} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                          Ukuran {size} <span className="font-medium text-slate-400">· target {targetQty}</span>
                        </p>
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">rework tersisa {reworkLeft}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {QC_FIELDS.map((field) => {
                          const disabled = Boolean(field.needsRework) && reworkLeft <= 0;
                          return (
                            <div
                              key={field.key}
                              title={disabled ? "Belum ada rework yang tersisa" : undefined}
                            >
                              <label
                                className={`block mb-1 text-[10px] font-bold uppercase tracking-wide leading-tight ${
                                  disabled ? "text-slate-400 dark:text-slate-500" : "text-slate-600 dark:text-slate-300"
                                }`}
                              >
                                {field.label}
                              </label>
                              <input
                                className={`${inputClass} px-2 text-right disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800/70`}
                                inputMode="numeric"
                                placeholder="0"
                                value={(item as any)[field.key]}
                                disabled={disabled}
                                title={disabled ? "Belum ada rework yang tersisa" : undefined}
                                onChange={(e) => updateItem(key, { [field.key]: e.target.value } as any)}
                              />
                            </div>
                          );
                        })}
                      </div>
                      {rejectActive ? (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Alasan reject (wajib)</label>
                            <select className={inputClass} value={item.reason} onChange={(e) => updateItem(key, { reason: e.target.value })}>
                              <option value="">— Pilih —</option>
                              {REJECT_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Catatan</label>
                            <input className={inputClass} value={item.notes} onChange={(e) => updateItem(key, { notes: e.target.value })} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div id="biaya-non-bahan" className={`${cardClass} overflow-hidden scroll-mt-2`}>
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Biaya non-bahan penerimaan</p>
              <p className="text-[11px] text-slate-400">Terisi otomatis dari resep, bisa diedit Owner.</p>
            </div>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setCostsTouched(true);
                setCosts((current) => [
                  ...current,
                  { name: "Biaya manual", group_label: "", amount: "0", source: "manual" },
                ]);
              }}
            >
              <Plus size={14} /> Biaya manual
            </button>
          </div>
          <div className="p-3 space-y-2">
            {costs.length === 0 ? (
              <p className="text-xs text-slate-400">Belum ada biaya. Isi hasil QC atau tambah biaya manual.</p>
            ) : (
              costs.map((cost, index) => (
                <div key={`${cost.name}-${index}`} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px_40px] gap-2 items-end">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nama biaya</label>
                    <input
                      className={inputClass}
                      value={cost.name}
                      onChange={(e) => {
                        setCostsTouched(true);
                        setCosts((current) => current.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)));
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Kelompok</label>
                    <input
                      className={inputClass}
                      value={cost.group_label}
                      onChange={(e) => {
                        setCostsTouched(true);
                        setCosts((current) => current.map((row, i) => (i === index ? { ...row, group_label: e.target.value } : row)));
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Jumlah Rp</label>
                    <input
                      className={`${inputClass} text-right`}
                      inputMode="decimal"
                      value={cost.amount}
                      onChange={(e) => {
                        setCostsTouched(true);
                        setCosts((current) => current.map((row, i) => (i === index ? { ...row, amount: e.target.value } : row)));
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="h-[42px] grid place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      setCostsTouched(true);
                      setCosts((current) => current.filter((_, i) => i !== index));
                    }}
                    aria-label="Hapus biaya"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
