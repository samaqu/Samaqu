"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import {
  MOVEMENT_TYPES,
  formatDate,
  formatQty,
  formatRupiah,
  movementLabel,
  todayInput,
} from "@/lib/produksi";
import { produksiFetch } from "@/lib/produksi-api";
import { useProduksiAccess } from "./useAccess";
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

type Movement = {
  id: string;
  component_id: string;
  component_code: string;
  component_name: string;
  unit_use: string;
  movement_date: string;
  type: string;
  qty: number;
  unit_price?: number;
  value?: number;
  ref_type: string;
  notes: string;
  actor: string;
  created_at: string;
};

type ComponentOption = {
  id: string;
  code: string;
  name: string;
  unit_use: string;
  stock: number;
};

export default function BukuStokView() {
  const access = useProduksiAccess();
  const [items, setItems] = useState<Movement[]>([]);
  const [components, setComponents] = useState<ComponentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [componentId, setComponentId] = useState("");
  const [type, setType] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    component_id: "",
    qty: "",
    date: todayInput(),
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (componentId) params.set("component_id", componentId);
      if (type) params.set("type", type);
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      const json = await produksiFetch<{ items: Movement[] }>(
        `/api/ops/production/movements?${params.toString()}`,
      );
      setItems(json.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat buku stok.");
    } finally {
      setLoading(false);
    }
  }, [componentId, type, start, end]);

  useEffect(() => {
    if (!access.allowed) return;
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load, access.allowed]);

  useEffect(() => {
    if (!access.allowed) return;
    produksiFetch<{ items: ComponentOption[] }>("/api/ops/production/components")
      .then((json) => setComponents(json.items || []))
      .catch(() => setComponents([]));
  }, [access.allowed]);

  const totals = useMemo(() => {
    let masuk = 0;
    let keluar = 0;
    for (const row of items) {
      if (row.qty > 0) masuk += row.qty;
      else keluar += Math.abs(row.qty);
    }
    return { masuk, keluar };
  }, [items]);

  const selectedComponent = components.find((c) => c.id === form.component_id);

  async function save() {
    if (saving) return;
    setFormError("");
    if (!form.component_id) return setFormError("Pilih komponen.");
    const qty = Number(form.qty);
    if (!Number.isFinite(qty) || qty <= 0) return setFormError("Jumlah harus lebih dari 0.");
    if (!form.notes.trim()) return setFormError("Catatan wajib diisi (contoh: rusak saat produksi).");

    setSaving(true);
    try {
      await produksiFetch("/api/ops/production/movements", {
        method: "POST",
        body: JSON.stringify({
          action: "rusak_hilang",
          component_id: form.component_id,
          qty,
          date: form.date,
          notes: form.notes,
        }),
      });
      setOpen(false);
      setForm({ component_id: "", qty: "", date: todayInput(), notes: "" });
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal menyimpan transaksi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccessGate access={access}>
      <div className="space-y-4">
        <PageHead
          title="Buku Stok Komponen"
          subtitle="Semua pergerakan stok tercatat permanen. Tidak ada edit/hapus — koreksi lewat transaksi baru."
          actions={
            access.canWrite ? (
              <button className={btnPrimary} onClick={() => setOpen(true)}>
                <Plus size={16} /> Catat Rusak/Hilang
              </button>
            ) : null
          }
        />

        <ErrorBox message={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Pergerakan" value={String(items.length)} hint="Sesuai filter" />
          <StatCard label="Total masuk" value={formatQty(totals.masuk)} hint="Satuan pakai" tone="positive" />
          <StatCard label="Total keluar" value={formatQty(totals.keluar)} hint="Satuan pakai" tone="danger" />
          {access.role === "owner" ? (
            <StatCard
              label="Nilai keluar"
              value={`Rp ${formatRupiah(items.filter((m) => m.qty < 0).reduce((sum, m) => sum + Math.abs(Number(m.value) || 0), 0))}`}
              hint="Harga Real saat transaksi"
            />
          ) : (
            <StatCard label="Mode" value="Lihat saja" hint="Leader tidak dapat mengubah stok" tone="muted" />
          )}
        </div>

        <div className={`${cardClass} p-3 flex flex-wrap items-center gap-2`}>
          <select className={`${inputClass} w-auto min-w-[200px]`} value={componentId} onChange={(e) => setComponentId(e.target.value)}>
            <option value="">Semua komponen</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
            ))}
          </select>
          <select className={`${inputClass} w-auto min-w-[160px]`} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Semua jenis</option>
            {Object.entries(MOVEMENT_TYPES)
              .filter(([key]) => ["stok_awal", "pembelian", "opname", "rusak_hilang", "penyesuaian"].includes(key))
              .map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
          </select>
          <input type="date" className={`${inputClass} w-auto`} value={start} onChange={(e) => setStart(e.target.value)} />
          <span className="text-xs font-bold text-slate-400">s/d</span>
          <input type="date" className={`${inputClass} w-auto`} value={end} onChange={(e) => setEnd(e.target.value)} />
          {(componentId || type || start || end) && (
            <button
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => { setComponentId(""); setType(""); setStart(""); setEnd(""); }}
              aria-label="Reset filter"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className={`w-full border-collapse ${access.role === "owner" ? "min-w-[1080px]" : "min-w-[820px]"}`}>
              <thead>
                <tr className="bg-[#1e3a5f]">
                  {[
                    "Tanggal", "Komponen", "Jenis", "Masuk", "Keluar",
                    ...(access.role === "owner" ? ["Harga satuan", "Nilai"] : []),
                    "Referensi", "User", "Catatan",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-bold text-white uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10}><Spinner /></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={10}><EmptyState title="Belum ada pergerakan" description="Stok awal atau pembelian akan muncul di sini." /></td></tr>
                ) : (
                  items.map((row, index) => (
                    <tr key={row.id} className={`${index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-blue-50/30 dark:bg-[#1a1d28]"} border-b border-gray-100 dark:border-slate-800/50`}>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDate(row.movement_date)}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        {row.component_code} · {row.component_name}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Badge tone={row.type === "opname" || row.type === "penyesuaian" ? "blue" : row.qty > 0 ? "green" : "red"}>
                          {movementLabel(row.type)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold text-emerald-600 whitespace-nowrap">
                        {row.qty > 0 ? `+${formatQty(row.qty)} ${row.unit_use}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold text-red-600 whitespace-nowrap">
                        {row.qty < 0 ? `−${formatQty(Math.abs(row.qty))} ${row.unit_use}` : "—"}
                      </td>
                      {access.role === "owner" ? (
                        <>
                          <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">Rp {formatRupiah(row.unit_price)}</td>
                          <td className="px-3 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">Rp {formatRupiah(row.value)}</td>
                        </>
                      ) : null}
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.ref_type || "—"}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.actor || "—"}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 min-w-[220px]">{row.notes || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="Catat Rusak / Hilang"
          subtitle="Stok berkurang lewat buku stok. Tidak bisa diedit setelah disimpan."
          footer={
            <div className="flex items-center justify-end gap-2">
              <button className={btnSecondary} onClick={() => setOpen(false)} disabled={saving}>Batal</button>
              <button className={btnPrimary} onClick={save} disabled={saving}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <ErrorBox message={formError} />

            <div>
              <label className={labelClass}>Komponen</label>
              <select
                className={inputClass}
                value={form.component_id}
                onChange={(e) => setForm({ ...form, component_id: e.target.value })}
              >
                <option value="">— Pilih komponen —</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name} (stok {formatQty(c.stock)} {c.unit_use})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Jumlah ({selectedComponent?.unit_use || "satuan pakai"})</label>
                <input className={inputClass} inputMode="decimal" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className={labelClass}>Tanggal</label>
                <input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Catatan (wajib)</label>
              <textarea
                className={`${inputClass} min-h-[90px]`}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Contoh: kain sobek saat produksi / kancing hilang"
              />
            </div>
          </div>
        </Drawer>
      </div>
    </AccessGate>
  );
}
