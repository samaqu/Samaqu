"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import { formatDate, formatQty, formatRupiah, parseNumber, todayInput } from "@/lib/produksi";
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

type ComponentOption = {
  id: string;
  code: string;
  name: string;
  unit_use: string;
  unit_buy: string;
  conversion: number;
  stock: number;
  real_price?: number;
};

type Movement = {
  id: string;
  component_code: string;
  component_name: string;
  unit_use: string;
  movement_date: string;
  qty: number;
  unit_price?: number;
  value?: number;
  actor: string;
  notes: string;
};

const emptyRow = () => ({ component_id: "", qty: "", unit_price: "" });

export default function StokAwalView() {
  const access = useProduksiAccess();
  const [components, setComponents] = useState<ComponentOption[]>([]);
  const [items, setItems] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [date, setDate] = useState(todayInput());
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [pasteOpen, setPasteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [componentJson, movementJson] = await Promise.all([
        produksiFetch<{ items: ComponentOption[] }>("/api/ops/production/components"),
        produksiFetch<{ items: Movement[] }>("/api/ops/production/movements?type=stok_awal&limit=200"),
      ]);
      setComponents(componentJson.items || []);
      setItems(movementJson.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat stok awal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.role === "owner") load();
  }, [load, access.role]);

  const componentById = useMemo(() => {
    const map = new Map<string, ComponentOption>();
    for (const c of components) map.set(c.id, c);
    return map;
  }, [components]);

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.qty) || 0) * (Number(row.unit_price) || 0), 0),
    [rows],
  );

  async function save() {
    if (saving) return;
    setFormError("");

    const payload = rows
      .filter((row) => row.component_id)
      .map((row, index) => ({
        component_id: row.component_id,
        qty: Number(row.qty),
        unit_price: Number(row.unit_price) || 0,
        index,
      }));

    if (payload.length === 0) return setFormError("Tambahkan minimal satu komponen.");
    const invalid = payload.find((row) => !Number.isFinite(row.qty) || row.qty <= 0);
    if (invalid) return setFormError(`Baris ${invalid.index + 1}: jumlah harus lebih dari 0.`);

    setSaving(true);
    try {
      await produksiFetch("/api/ops/production/movements", {
        method: "POST",
        body: JSON.stringify({
          action: "stok_awal",
          date,
          items: payload.map(({ component_id, qty, unit_price }) => ({ component_id, qty, unit_price })),
        }),
      });
      setRows([emptyRow()]);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal menyimpan stok awal.");
    } finally {
      setSaving(false);
    }
  }

  const historyValue = useMemo(
    () => items.reduce((sum, row) => sum + (Number(row.value) || 0), 0),
    [items],
  );

  return (
    <AccessGate access={access} ownerOnly>
      <div className="space-y-4">
        <PageHead
          title="Stok Awal"
          subtitle="Isi jumlah dan harga per satuan pakai. Masuk buku stok sebagai Stok Awal dan membentuk Harga Real awal."
          actions={
            <button className={btnSecondary} onClick={() => setPasteOpen(true)}>
              <ClipboardList size={15} /> Import Paste
            </button>
          }
        />

        <ErrorBox message={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Riwayat stok awal" value={String(items.length)} hint="Transaksi" />
          <StatCard label="Nilai stok awal" value={`Rp ${formatRupiah(historyValue)}`} hint="200 transaksi terakhir" />
          <StatCard label="Komponen" value={String(components.length)} hint="Aktif" />
          <StatCard label="Harga Real" value="Otomatis" hint="Rata-rata tertimbang" tone="muted" />
        </div>

        <div className={`${cardClass} p-4 space-y-3`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Input stok awal</p>
              <p className="text-[11px] text-slate-400">Gunakan sekali saat mulai memakai sistem, atau saat menambah komponen lama.</p>
            </div>
            <div>
              <label className={labelClass}>Tanggal</label>
              <input type="date" className={`${inputClass} w-auto`} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <ErrorBox message={formError} />

          <div className="space-y-2">
            {rows.map((row, index) => {
              const component = componentById.get(row.component_id);
              return (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_130px_150px_44px] gap-2 items-end">
                  <div>
                    {index === 0 ? <label className={labelClass}>Komponen</label> : null}
                    <select className={inputClass} value={row.component_id} onChange={(e) => setRows((current) => current.map((r, i) => i === index ? { ...r, component_id: e.target.value } : r))}>
                      <option value="">— Pilih komponen —</option>
                      {components.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {index === 0 ? <label className={labelClass}>Jumlah ({component?.unit_use || "pakai"})</label> : null}
                    <input className={inputClass} inputMode="decimal" value={row.qty} onChange={(e) => setRows((current) => current.map((r, i) => i === index ? { ...r, qty: e.target.value } : r))} placeholder="0" />
                  </div>
                  <div>
                    {index === 0 ? <label className={labelClass}>Harga / {component?.unit_use || "satuan"}</label> : null}
                    <input className={inputClass} inputMode="decimal" value={row.unit_price} onChange={(e) => setRows((current) => current.map((r, i) => i === index ? { ...r, unit_price: e.target.value } : r))} placeholder="0" />
                  </div>
                  <button
                    type="button"
                    className="h-[42px] grid place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                    onClick={() => setRows((current) => (current.length === 1 ? [emptyRow()] : current.filter((_, i) => i !== index)))}
                    aria-label="Hapus baris"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className={btnSecondary} onClick={() => setRows((current) => [...current, emptyRow()])}>
              <Plus size={15} /> Tambah baris
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-500">Total: <b className="text-slate-900 dark:text-white">Rp {formatRupiah(total)}</b></span>
              <button className={btnPrimary} onClick={save} disabled={saving}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? "Menyimpan…" : "Simpan Stok Awal"}
              </button>
            </div>
          </div>
        </div>

        <div className={`${cardClass} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Riwayat stok awal</p>
          </div>
          <div>
            <table className="w-full border-collapse table-fixed">
              <colgroup>
                <col className="w-[13%]" />
                <col className="w-[25%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="bg-[#1e3a5f]">
                  {["Tanggal", "Komponen", "Jumlah", "Harga satuan", "Nilai", "Catatan"].map((h) => (
                    <th key={h} className="px-2 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wide leading-tight">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6}><Spinner /></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState title="Belum ada stok awal" description="Isi formulir di atas untuk mencatat stok awal pertama." /></td></tr>
                ) : (
                  items.map((row, index) => (
                    <tr key={row.id} className={`${index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-blue-50/30 dark:bg-[#1a1d28]"} border-b border-gray-100 dark:border-slate-800/50`}>
                      <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDate(row.movement_date)}</td>
                      <td className="px-2 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">{row.component_code} · {row.component_name}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap"><Badge tone="green">+{formatQty(row.qty)} {row.unit_use}</Badge></td>
                      <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">Rp {formatRupiah(row.unit_price)}</td>
                      <td className="px-2 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">Rp {formatRupiah(row.value)}</td>
                      <td className="px-2 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 leading-snug break-words">{row.notes || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ImportStokAwalDrawer
          open={pasteOpen}
          onClose={() => setPasteOpen(false)}
          components={components}
          onImported={load}
        />
      </div>
    </AccessGate>
  );
}

function ImportStokAwalDrawer({
  open,
  onClose,
  components,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  components: ComponentOption[];
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<{ key: string; qty: number; price: number; componentId: string; label: string; error: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!open) {
      setText("");
      setRows([]);
      setError("");
      setResult("");
    }
  }, [open]);

  useEffect(() => {
    const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      setRows([]);
      return;
    }
    const first = lines[0].toLowerCase();
    const skipHeader = first.includes("kode") || first.includes("nama") || first.includes("komponen");
    const parsed = (skipHeader ? lines.slice(1) : lines).map((line) => {
      const cells = (line.includes("\t") ? line.split("\t") : line.includes(";") ? line.split(";") : line.split(",")).map((c) => c.trim());
      const key = cells[0] || "";
      const qty = parseNumber(cells[1]);
      const price = parseNumber(cells[2]);
      const match = components.find(
        (c) => c.code.toLowerCase() === key.toLowerCase() || c.name.toLowerCase() === key.toLowerCase(),
      );
      const rowError = !match
        ? `Komponen "${key}" tidak ditemukan`
        : !Number.isFinite(qty) || qty <= 0
          ? "Jumlah tidak valid"
          : !Number.isFinite(price) || price < 0
            ? "Harga tidak valid"
            : "";
      return {
        key,
        qty: Number.isFinite(qty) ? qty : 0,
        price: Number.isFinite(price) ? price : 0,
        componentId: match?.id || "",
        label: match ? `${match.code} · ${match.name}` : key,
        error: rowError,
      };
    });
    setRows(parsed);
    setResult("");
  }, [text, components]);

  const valid = rows.filter((row) => !row.error);

  async function save() {
    if (busy || valid.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await produksiFetch("/api/ops/production/movements", {
        method: "POST",
        body: JSON.stringify({
          action: "stok_awal",
          date: todayInput(),
          items: valid.map((row) => ({ component_id: row.componentId, qty: row.qty, unit_price: row.price })),
        }),
      });
      setResult(`${valid.length} baris stok awal tersimpan.`);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan stok awal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      wide
      title="Import Paste Stok Awal"
      subtitle="Kolom: kode/nama komponen · jumlah · harga per satuan pakai."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{rows.length} baris · {valid.length} siap</p>
          <div className="flex items-center gap-2">
            <button className={btnSecondary} onClick={onClose} disabled={busy}>Tutup</button>
            <button className={btnPrimary} onClick={save} disabled={busy || valid.length === 0}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {busy ? "Menyimpan…" : `Simpan ${valid.length} baris`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <ErrorBox message={error} />
        {result ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
            {result}
          </div>
        ) : null}

        <textarea
          className={`${inputClass} min-h-[150px] font-mono text-xs`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"KAIN-001\t40\t25000\nKOMP-001\t100\t150"}
        />

        {rows.length > 0 ? (
          <div className={`${cardClass} overflow-hidden`}>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#1e3a5f]">
                  {["Komponen", "Jumlah", "Harga", "Status"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] font-bold text-white uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.key}-${index}`} className={`border-b border-slate-100 dark:border-slate-800 ${row.error ? "bg-red-50/70 dark:bg-red-900/10" : ""}`}>
                    <td className="px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100">{row.label}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{formatQty(row.qty)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{formatRupiah(row.price)}</td>
                    <td className="px-3 py-2 text-[11px] font-bold">
                      {row.error ? <span className="text-red-600 dark:text-red-300">{row.error}</span> : <span className="text-emerald-600">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
