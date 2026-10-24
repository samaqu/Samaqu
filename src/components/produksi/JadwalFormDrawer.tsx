"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { CATEGORY_ORDER } from "@/lib/ops-order";
import { formatQty, todayInput } from "@/lib/produksi";
import { produksiFetch } from "@/lib/produksi-api";
import {
  Drawer,
  ErrorBox,
  btnPrimary,
  btnSecondary,
  cardClass,
  inputClass,
  labelClass,
} from "./ui";

export type JadwalTargetInitial = {
  category: string;
  fabric_type_id?: string | null;
  color?: string | null;
  series?: string | null;
  size_qtys: Record<string, number>;
};

export type JadwalInitial = {
  id: string;
  status: string;
  start_date: string;
  target_date?: string | null;
  tailor?: string | null;
  notes?: string | null;
  targets: JadwalTargetInitial[];
};

type Options = {
  categories: string[];
  series: string[];
  sizes: string[];
  colors: string[];
  fabrics: { id: string; name: string }[];
};

type TargetRow = {
  category: string;
  fabric_type_id: string;
  color: string;
  series: string;
  size_qtys: Record<string, string>;
};

function addDays(date: string, days: number): string {
  const [year, month, day] = String(date).split("-").map(Number);
  const d = new Date(year, (month || 1) - 1, day || 1);
  d.setDate(d.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const emptyRow = (): TargetRow => ({
  category: "",
  fabric_type_id: "",
  color: "",
  series: "",
  size_qtys: {},
});

const rowTotal = (row: TargetRow) =>
  Object.values(row.size_qtys).reduce((sum, value) => sum + (Number(value) || 0), 0);

export default function JadwalFormDrawer({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: JadwalInitial | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState({
    start_date: todayInput(),
    target_date: addDays(todayInput(), 7),
    tailor: "",
    notes: "",
  });
  const [rows, setRows] = useState<TargetRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    produksiFetch<Options>("/api/ops/production/recipes/options")
      .then((json) => {
        if (!cancelled) setOptions(json);
      })
      .catch(() => {
        if (!cancelled) setOptions(null);
      });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (initial) {
      setForm({
        start_date: String(initial.start_date || todayInput()).slice(0, 10),
        target_date: String(initial.target_date || addDays(String(initial.start_date || todayInput()).slice(0, 10), 7)).slice(0, 10),
        tailor: initial.tailor || "",
        notes: initial.notes || "",
      });
      setRows(
        initial.targets.length > 0
          ? initial.targets.map((target) => ({
              category: target.category || "",
              fabric_type_id: target.fabric_type_id || "",
              color: target.color || "",
              series: target.series || "",
              size_qtys: Object.fromEntries(
                Object.entries(target.size_qtys || {}).map(([size, qty]) => [size, String(qty)]),
              ),
            }))
          : [emptyRow()],
      );
    } else {
      const start = todayInput();
      setForm({ start_date: start, target_date: addDays(start, 7), tailor: "", notes: "" });
      setRows([emptyRow()]);
    }
  }, [open, initial]);

  const sizes = options?.sizes?.length ? options.sizes : ["XS", "S", "M", "L", "XL", "XXL"];
  const totalPcs = useMemo(() => rows.reduce((sum, row) => sum + rowTotal(row), 0), [rows]);
  const isReopen = initial?.status === "disetujui";

  const updateRow = (index: number, patch: Partial<TargetRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  function save() {
    setError("");
    if (!form.start_date) return setError("Tanggal mulai wajib diisi.");
    if (form.target_date && form.target_date < form.start_date) {
      return setError("Target selesai tidak boleh sebelum tanggal mulai.");
    }
    const meaningful = rows.filter((row) => rowTotal(row) > 0 || row.category);
    if (meaningful.length === 0) return setError("Minimal satu baris target.");
    for (let i = 0; i < meaningful.length; i++) {
      const row = meaningful[i];
      if (!row.category) return setError(`Baris ${i + 1}: pilih kategori produk.`);
      if (!row.fabric_type_id) return setError(`Baris ${i + 1}: pilih jenis kain.`);
      if (rowTotal(row) <= 0) return setError(`Baris ${i + 1}: isi jumlah target per ukuran.`);
    }

    setSaving(true);
    produksiFetch<{ item: { id: string } }>("/api/ops/production/schedules", {
      method: "POST",
      body: JSON.stringify({
        ...(initial?.id ? { id: initial.id } : {}),
        start_date: form.start_date,
        target_date: form.target_date,
        tailor: form.tailor,
        notes: form.notes,
        targets: meaningful.map((row) => ({
          category: row.category,
          fabric_type_id: row.fabric_type_id || null,
          color: row.color || null,
          series: row.series || null,
          size_qtys: Object.fromEntries(
            Object.entries(row.size_qtys)
              .map(([size, qty]) => [size, Number(qty) || 0] as const)
              .filter(([, qty]) => qty > 0),
          ),
        })),
      }),
    })
      .then((json) => onSaved(json.item.id))
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal menyimpan jadwal."))
      .finally(() => setSaving(false));
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      wide
      title={initial ? "Ubah Jadwal Produksi" : "Buat Jadwal Produksi"}
      subtitle={isReopen ? "Menyimpan perubahan mengembalikan jadwal ke Draft dan melepas reservasi." : "Nomor jadwal dibuat otomatis."}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total target</p>
            <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums">{formatQty(totalPcs)} pcs</p>
          </div>
          <div className="flex items-center gap-2">
            <button className={btnSecondary} onClick={onClose} disabled={saving}>Batal</button>
            <button className={btnPrimary} onClick={save} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {saving ? "Menyimpan…" : initial ? "Simpan Perubahan" : "Buat Jadwal"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <ErrorBox message={error} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tanggal mulai</label>
            <input type="date" className={inputClass} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Target selesai</label>
            <input type="date" className={inputClass} value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Penjahit / maklon</label>
            <input className={inputClass} value={form.tailor} onChange={(e) => setForm({ ...form, tailor: e.target.value })} placeholder="Nama penjahit atau maklon" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Target produksi</p>
              <p className="text-[11px] text-slate-400">Pilih kategori, jenis kain, warna, series, lalu isi jumlah per ukuran.</p>
            </div>
            <button type="button" className={btnSecondary} onClick={() => setRows((current) => [...current, emptyRow()])}>
              <Plus size={15} /> Baris
            </button>
          </div>

          {rows.map((row, index) => (
            <div key={index} className={`${cardClass} p-3 space-y-3`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Baris {index + 1}</p>
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  onClick={() => setRows((current) => (current.length === 1 ? [emptyRow()] : current.filter((_, i) => i !== index)))}
                  aria-label="Hapus baris target"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className={labelClass}>Kategori</label>
                  <select className={inputClass} value={row.category} onChange={(e) => updateRow(index, { category: e.target.value })}>
                    <option value="">— Pilih —</option>
                    {(options?.categories || CATEGORY_ORDER).map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Jenis kain</label>
                  <select className={inputClass} value={row.fabric_type_id} onChange={(e) => updateRow(index, { fabric_type_id: e.target.value })}>
                    <option value="">— Pilih —</option>
                    {(options?.fabrics || []).map((fabric) => (
                      <option key={fabric.id} value={fabric.id}>{fabric.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Warna</label>
                  <select className={inputClass} value={row.color} onChange={(e) => updateRow(index, { color: e.target.value })}>
                    <option value="">Semua</option>
                    {(options?.colors || []).map((color) => <option key={color} value={color}>{color}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Series</label>
                  <select className={inputClass} value={row.series} onChange={(e) => updateRow(index, { series: e.target.value })}>
                    <option value="">Tanpa series</option>
                    {(options?.series || []).map((series) => <option key={series} value={series}>{series}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Jumlah target per ukuran (pcs)</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {sizes.map((size) => (
                    <div key={size}>
                      <span className="block text-[10px] font-bold text-slate-400 mb-0.5">{size}</span>
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        value={row.size_qtys[size] || ""}
                        onChange={(e) => updateRow(index, { size_qtys: { ...row.size_qtys, [size]: e.target.value } })}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] font-semibold text-slate-400">Subtotal baris: {formatQty(rowTotal(row))} pcs</p>
            </div>
          ))}
        </div>

        <div>
          <label className={labelClass}>Catatan</label>
          <textarea className={`${inputClass} min-h-[80px]`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
    </Drawer>
  );
}
