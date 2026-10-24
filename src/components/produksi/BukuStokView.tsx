"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Plus, X } from "lucide-react";
import {
  MOVEMENT_TYPES,
  formatDate,
  formatDateTime,
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

  const [detail, setDetail] = useState<Movement | null>(null);

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

  // Hitung transaksi, bukan menjumlahkan qty lintas satuan (yard + pcs tidak bisa dijumlah).
  const totals = useMemo(() => {
    let masuk = 0;
    let keluar = 0;
    for (const row of items) {
      if (row.qty > 0) masuk += 1;
      else keluar += 1;
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
          <StatCard label="Transaksi masuk" value={String(totals.masuk)} hint="Baris buku stok" tone="positive" />
          <StatCard label="Transaksi keluar" value={String(totals.keluar)} hint="Baris buku stok" tone="danger" />
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
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Riwayat pergerakan</p>
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
              {items.length} baris · {totals.masuk} masuk · {totals.keluar} keluar
            </p>
          </div>
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              {access.role === "owner" ? (
                <>
                  <col className="w-[12%]" />
                  <col className="w-[29%]" />
                  <col className="w-[15%]" />
                  <col className="w-[14%]" />
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                  <col className="w-[5%]" />
                </>
              ) : (
                <>
                  <col className="w-[14%]" />
                  <col className="w-[45%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[5%]" />
                </>
              )}
            </colgroup>
            <thead>
              <tr className="bg-[#1e3a5f]">
                <th className="px-2.5 py-2.5 text-left text-[10px] font-bold text-white uppercase tracking-wider leading-tight">Tanggal</th>
                <th className="px-2.5 py-2.5 text-left text-[10px] font-bold text-white uppercase tracking-wider leading-tight">Komponen</th>
                <th className="px-2.5 py-2.5 text-left text-[10px] font-bold text-white uppercase tracking-wider leading-tight">Jenis</th>
                <th className="px-2.5 py-2.5 text-right text-[10px] font-bold text-white uppercase tracking-wider leading-tight">Jumlah</th>
                {access.role === "owner" ? (
                  <>
                    <th className="px-2.5 py-2.5 text-right text-[10px] font-bold text-white uppercase tracking-wider leading-tight">Harga satuan</th>
                    <th className="px-2.5 py-2.5 text-right text-[10px] font-bold text-white uppercase tracking-wider leading-tight">Nilai</th>
                  </>
                ) : null}
                <th className="px-1 py-2.5" aria-label="Detail" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {loading ? (
                <tr><td colSpan={access.role === "owner" ? 7 : 5}><Spinner /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={access.role === "owner" ? 7 : 5}><EmptyState title="Belum ada pergerakan" description="Stok awal atau pembelian akan muncul di sini." /></td></tr>
              ) : (
                items.map((row, index) => (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Detail ${movementLabel(row.type)} ${row.component_name}`}
                    onClick={() => setDetail(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDetail(row);
                      }
                    }}
                    className={`${index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-slate-50/60 dark:bg-[#1a1d28]"} hover:bg-blue-50/50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500`}
                  >
                    <td className="px-2.5 py-2.5 align-middle text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                      {formatDate(row.movement_date)}
                    </td>
                    <td className="px-2.5 py-2.5 align-middle min-w-0">
                      <span className="block text-[10px] font-mono font-semibold tracking-wide text-slate-400 dark:text-slate-500 truncate">
                        {row.component_code}
                      </span>
                      <span className="block text-xs font-bold text-slate-900 dark:text-white truncate" title={row.component_name}>
                        {row.component_name}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 align-middle">
                      <Badge tone={row.type === "opname" || row.type === "penyesuaian" ? "blue" : row.qty > 0 ? "green" : "red"}>
                        {movementLabel(row.type)}
                      </Badge>
                    </td>
                    <td className="px-2.5 py-2.5 align-middle text-right whitespace-nowrap tabular-nums">
                      <span className={`text-xs font-bold ${row.qty > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {row.qty > 0 ? "+" : "−"}{formatQty(Math.abs(row.qty))}
                      </span>
                      <span className="ml-1 text-[10px] font-semibold text-slate-400">{row.unit_use}</span>
                    </td>
                    {access.role === "owner" ? (
                      <>
                        <td className="px-2.5 py-2.5 align-middle text-right whitespace-nowrap tabular-nums">
                          <span className="text-[10px] text-slate-400">Rp</span>{" "}
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{formatRupiah(row.unit_price)}</span>
                        </td>
                        <td className="px-2.5 py-2.5 align-middle text-right text-xs font-black text-slate-900 dark:text-white whitespace-nowrap tabular-nums">
                          Rp {formatRupiah(row.value)}
                        </td>
                      </>
                    ) : null}
                    <td className="px-1 py-2.5 align-middle text-center text-slate-300 dark:text-slate-600">
                      <ChevronRight size={15} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Drawer
          open={Boolean(detail)}
          onClose={() => setDetail(null)}
          title="Detail Pergerakan Stok"
          subtitle={detail ? `${detail.component_code} · ${detail.component_name}` : ""}
          footer={
            <div className="flex justify-end">
              <button className={btnSecondary} onClick={() => setDetail(null)}>Tutup</button>
            </div>
          }
        >
          {detail ? (
            <div className="space-y-4">
              <div className={`${cardClass} p-4 flex items-start justify-between gap-4`}>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jenis transaksi</p>
                  <div className="mt-1.5">
                    <Badge tone={detail.type === "opname" || detail.type === "penyesuaian" ? "blue" : detail.qty > 0 ? "green" : "red"}>
                      {movementLabel(detail.type)}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-900 dark:text-white break-words">{detail.component_name}</p>
                  <p className="text-[11px] font-mono text-slate-400">{detail.component_code}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jumlah</p>
                  <p className={`mt-1 text-2xl font-black whitespace-nowrap tabular-nums ${detail.qty > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {detail.qty > 0 ? "+" : "−"}{formatQty(Math.abs(detail.qty))}
                    <span className="ml-1 text-xs font-semibold text-slate-400">{detail.unit_use}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">{formatDate(detail.movement_date)}</p>
                </div>
              </div>

              <div className={`${cardClass} p-4 grid grid-cols-2 gap-x-4 gap-y-3`}>
                <DetailField label="Tanggal" value={formatDate(detail.movement_date)} />
                <DetailField label="Dicatat" value={formatDateTime(detail.created_at)} />
                {access.role === "owner" ? (
                  <>
                    <DetailField label={`Harga satuan / ${detail.unit_use}`} value={`Rp ${formatRupiah(detail.unit_price)}`} />
                    <DetailField label="Nilai" value={`Rp ${formatRupiah(detail.value)}`} />
                  </>
                ) : null}
                <DetailField label="Referensi" value={referenceLabel(detail.ref_type)} />
                <DetailField label="User" value={detail.actor || "—"} />
              </div>

              <div className={`${cardClass} p-4`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Catatan</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200 break-words">
                  {detail.notes || "—"}
                </p>
              </div>
            </div>
          ) : null}
        </Drawer>

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

function referenceLabel(ref?: string | null): string {
  const key = String(ref || "").trim();
  if (key === "purchase") return "Pembelian Bahan";
  if (key === "stok_awal") return "Stok Awal";
  if (key === "opname") return "Stok Opname";
  if (key === "rusak_hilang") return "Rusak / Hilang";
  if (key === "penyesuaian") return "Penyesuaian";
  return key || "—";
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-slate-100 break-words">{value}</p>
    </div>
  );
}
