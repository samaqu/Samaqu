"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Plus, Trash2, X } from "lucide-react";
import { formatDate, formatQty, formatRupiah, todayInput } from "@/lib/produksi";
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
};

type PurchaseItem = {
  id: string;
  component_code: string;
  component_name: string;
  qty_buy: number;
  unit_buy: string;
  unit_use?: string;
  price_buy: number;
  conversion?: number;
  qty_use: number;
  line_value: number;
  allocated_cost: number;
  final_unit_price: number;
  real_price_before?: number;
  real_price_after?: number;
};

type Purchase = {
  id: string;
  purchase_number: string;
  purchase_date: string;
  supplier: string;
  additional_cost: number;
  items_value: number;
  total_value: number;
  notes: string;
  actor: string;
  items: PurchaseItem[];
};

const emptyRow = () => ({ component_id: "", qty_buy: "", price_buy: "" });

const moneyDigits = (value: string) => value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
const moneyInputValue = (value: string) => (value ? formatRupiah(value) : "");

export default function PembelianView() {
  const access = useProduksiAccess();
  const [items, setItems] = useState<Purchase[]>([]);
  const [components, setComponents] = useState<ComponentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [supplier, setSupplier] = useState("");

  const [detail, setDetail] = useState<Purchase | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    purchase_date: todayInput(),
    supplier: "",
    additional_cost: "",
    notes: "",
  });
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (supplier.trim()) params.set("supplier", supplier.trim());
      const json = await produksiFetch<{ items: Purchase[] }>(
        `/api/ops/production/purchases?${params.toString()}`,
      );
      setItems(json.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat pembelian.");
    } finally {
      setLoading(false);
    }
  }, [start, end, supplier]);

  useEffect(() => {
    if (access.role !== "owner") return;
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load, access.role]);

  useEffect(() => {
    if (access.role !== "owner") return;
    produksiFetch<{ items: ComponentOption[] }>("/api/ops/production/components")
      .then((json) => setComponents(json.items || []))
      .catch(() => setComponents([]));
  }, [access.role]);

  const componentById = useMemo(() => {
    const map = new Map<string, ComponentOption>();
    for (const c of components) map.set(c.id, c);
    return map;
  }, [components]);

  const closeDrawer = () => {
    setOpen(false);
    setFormError("");
    setRows([emptyRow()]);
    setForm({ purchase_date: todayInput(), supplier: "", additional_cost: "", notes: "" });
  };

  const updateRow = (index: number, patch: Partial<ReturnType<typeof emptyRow>>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const computed = useMemo(() => {
    const lines = rows.map((row) => {
      const component = componentById.get(row.component_id);
      const qty = Number(row.qty_buy) || 0;
      const price = Number(row.price_buy) || 0;
      const conversion = Number(component?.conversion) || 1;
      const qtyUse = qty * conversion;
      const lineValue = qty * price;
      return { row, component, qty, price, conversion, qtyUse, lineValue };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.lineValue, 0);
    const additional = Number(form.additional_cost) || 0;
    let allocated = 0;
    const withAllocation = lines.map((line, index) => {
      let allocation = 0;
      if (additional > 0) {
        if (index === lines.length - 1) {
          allocation = Math.round((additional - allocated) * 100) / 100;
        } else if (subtotal > 0) {
          allocation = Math.round((additional * line.lineValue) / subtotal * 100) / 100;
        } else {
          allocation = Math.round((additional / lines.length) * 100) / 100;
        }
        allocated += allocation;
      }
      const finalUnit = line.qtyUse > 0 ? (line.lineValue + allocation) / line.qtyUse : 0;
      return { ...line, allocation, finalUnit };
    });
    return { lines: withAllocation, subtotal, additional, total: subtotal + additional };
  }, [rows, componentById, form.additional_cost]);

  const monthTotal = useMemo(() => {
    const month = todayInput().slice(0, 7);
    return items
      .filter((p) => String(p.purchase_date).slice(0, 7) === month)
      .reduce((sum, p) => sum + (Number(p.total_value) || 0), 0);
  }, [items]);

  async function save() {
    if (saving) return;
    setFormError("");

    const payloadRows = computed.lines
      .filter((line) => line.row.component_id)
      .map((line) => ({ component_id: line.row.component_id, qty_buy: line.qty, price_buy: line.price }));

    if (payloadRows.length === 0) return setFormError("Tambahkan minimal satu baris pembelian.");
    if (payloadRows.some((row) => row.qty_buy <= 0)) return setFormError("Jumlah beli harus lebih dari 0.");
    if (!form.purchase_date) return setFormError("Tanggal wajib diisi.");

    setSaving(true);
    try {
      await produksiFetch("/api/ops/production/purchases", {
        method: "POST",
        body: JSON.stringify({
          purchase_date: form.purchase_date,
          supplier: form.supplier,
          additional_cost: Number(form.additional_cost) || 0,
          notes: form.notes,
          items: payloadRows,
        }),
      });
      closeDrawer();
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal menyimpan pembelian.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccessGate access={access} ownerOnly>
      <div className="space-y-4">
        <PageHead
          title="Pembelian Bahan"
          subtitle="Ongkir/biaya tambahan dibagi proporsional ke tiap baris, lalu masuk ke harga per satuan pakai."
          actions={
            <button className={btnPrimary} onClick={() => setOpen(true)}>
              <Plus size={16} /> Catat Pembelian
            </button>
          }
        />

        <ErrorBox message={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Pembelian tercatat" value={String(items.length)} hint="Sesuai filter" />
          <StatCard label="Total bulan ini" value={`Rp ${formatRupiah(monthTotal)}`} hint="Termasuk ongkir" />
          <StatCard label="Supplier" value={String(new Set(items.map((p) => p.supplier).filter(Boolean)).size)} hint="Sesuai filter" />
          <StatCard label="Harga Real" value="Otomatis" hint="Rata-rata tertimbang semua barang masuk" tone="muted" />
        </div>

        <div className={`${cardClass} p-3 flex flex-wrap items-center gap-2`}>
          <input type="date" className={`${inputClass} w-auto`} value={start} onChange={(e) => setStart(e.target.value)} />
          <span className="text-xs font-bold text-slate-400">s/d</span>
          <input type="date" className={`${inputClass} w-auto`} value={end} onChange={(e) => setEnd(e.target.value)} />
          <input
            className={`${inputClass} w-auto min-w-[180px] flex-1`}
            placeholder="Cari supplier…"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          />
          {(start || end || supplier) && (
            <button
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => { setStart(""); setEnd(""); setSupplier(""); }}
              aria-label="Reset filter"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className={`${cardClass} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Riwayat pembelian</p>
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
              {loading ? "Memuat…" : `${items.length} pembelian`}
            </p>
          </div>
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[16%]" />
              <col className="w-[25%]" />
              <col className="w-[10%]" />
              <col className="w-[32%]" />
              <col className="w-[5%]" />
            </colgroup>
            <thead>
              <tr className="bg-[#1e3a5f]">
                {[
                  { label: "Tanggal", align: "text-left" },
                  { label: "No. Pembelian", align: "text-left" },
                  { label: "Supplier", align: "text-left" },
                  { label: "Item", align: "text-right" },
                  { label: "Total", align: "text-right" },
                ].map((head) => (
                  <th key={head.label} className={`px-3 py-3 ${head.align} text-[11px] font-bold text-white uppercase tracking-wider leading-tight`}>
                    {head.label}
                  </th>
                ))}
                <th className="px-1 py-3" aria-label="Detail" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {loading ? (
                <tr><td colSpan={6}><Spinner /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="Belum ada pembelian" description="Catat pembelian pertama lewat tombol di atas." /></td></tr>
              ) : (
                items.map((purchase, index) => (
                  <tr
                    key={purchase.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Detail pembelian ${purchase.purchase_number}`}
                    onClick={() => setDetail(purchase)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDetail(purchase);
                      }
                    }}
                    className={`${index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-slate-50/60 dark:bg-[#1a1d28]"} hover:bg-blue-50/50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500`}
                  >
                    <td className="px-3 py-3 align-middle text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                      {formatDate(purchase.purchase_date)}
                    </td>
                    <td className="px-3 py-3 align-middle text-[13px] font-black text-slate-900 dark:text-white whitespace-nowrap">
                      {purchase.purchase_number}
                    </td>
                    <td className="px-3 py-3 align-middle text-xs font-semibold text-slate-700 dark:text-slate-200 truncate" title={purchase.supplier}>
                      {purchase.supplier || "Tanpa supplier"}
                    </td>
                    <td className="px-3 py-3 align-middle text-right text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                      {purchase.items.length}
                    </td>
                    <td className="px-3 py-3 align-middle text-right whitespace-nowrap tabular-nums">
                      <span className="text-[13px] font-black text-slate-900 dark:text-white">Rp {formatRupiah(purchase.total_value)}</span>
                      <span className="block text-[11px] text-slate-400">
                        Barang Rp {formatRupiah(purchase.items_value)} + ongkir Rp {formatRupiah(purchase.additional_cost)}
                      </span>
                    </td>
                    <td className="px-1 py-3 align-middle text-center text-slate-300 dark:text-slate-600">
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
          wide
          title="Detail Pembelian"
          subtitle={detail ? `${detail.purchase_number} · ${formatDate(detail.purchase_date)}` : ""}
          footer={
            <div className="flex justify-end">
              <button className={btnPrimary} onClick={() => setDetail(null)}>Tutup</button>
            </div>
          }
        >
          {detail ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total pembelian</p>
                    <p className="mt-1 text-3xl font-black text-slate-900 dark:text-white whitespace-nowrap tabular-nums">
                      Rp {formatRupiah(detail.total_value)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Barang Rp {formatRupiah(detail.items_value)} + ongkir/biaya Rp {formatRupiah(detail.additional_cost)}
                    </p>
                  </div>
                  <Badge tone="blue">{detail.items.length} item</Badge>
                </div>
              </div>

              <div className={`${cardClass} p-4 grid grid-cols-2 gap-3`}>
                <DetailField label="Tanggal" value={formatDate(detail.purchase_date)} />
                <DetailField label="Supplier" value={detail.supplier || "Tanpa supplier"} />
                <DetailField label="Dicatat oleh" value={detail.actor || "—"} />
                <DetailField label="Jumlah item" value={`${detail.items.length} baris`} />
              </div>

              {detail.notes ? (
                <div className={`${cardClass} p-4`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Catatan</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200 break-words">{detail.notes}</p>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-sm font-bold text-slate-900 dark:text-white">Rincian barang</p>
                <div className="space-y-3">
                  {detail.items.map((item) => (
                    <div key={item.id} className={`${cardClass} p-4`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-mono font-semibold text-slate-400 truncate">{item.component_code}</p>
                          <p className="text-[13px] font-black text-slate-900 dark:text-white break-words">{item.component_name}</p>
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {formatQty(item.qty_buy)} {item.unit_buy}
                            <span className="mx-1 text-slate-300">→</span>
                            {formatQty(item.qty_use)} {item.unit_use || ""}
                            {item.conversion && item.conversion !== 1 ? (
                              <span className="ml-1 text-slate-400">(1 {item.unit_buy} = {formatQty(item.conversion)} {item.unit_use || ""})</span>
                            ) : null}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Harga akhir</p>
                          <p className="mt-0.5 text-[13px] font-black text-slate-900 dark:text-white whitespace-nowrap tabular-nums">
                            Rp {formatRupiah(item.final_unit_price)}
                          </p>
                          <p className="text-[10px] text-slate-400">/ {item.unit_use || "satuan pakai"}</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <MiniStat label={`Harga beli / ${item.unit_buy}`} value={`Rp ${formatRupiah(item.price_buy)}`} />
                        <MiniStat label="Ongkir alokasi" value={`Rp ${formatRupiah(item.allocated_cost)}`} />
                        <MiniStat label="Nilai baris" value={`Rp ${formatRupiah(item.line_value)}`} />
                        <MiniStat label="Harga Real setelah" value={`Rp ${formatRupiah(item.real_price_after)}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </Drawer>

        <Drawer
          open={open}
          onClose={closeDrawer}
          wide
          title="Catat Pembelian"
          subtitle="Konversi ke satuan pakai memakai data komponen. Ongkir dibagi sesuai nilai baris."
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">Rp {formatRupiah(computed.total)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className={btnSecondary} onClick={closeDrawer} disabled={saving}>Batal</button>
                <button className={btnPrimary} onClick={save} disabled={saving}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                  {saving ? "Menyimpan…" : "Simpan Pembelian"}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <ErrorBox message={formError} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Tanggal</label>
                <input type="date" className={inputClass} value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Supplier</label>
                <input className={inputClass} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Nama supplier" />
              </div>
            </div>

            <div>
              <label className={labelClass}>Ongkir / biaya tambahan (total pembelian)</label>
              <input
                className={`${inputClass} text-right tabular-nums`}
                inputMode="numeric"
                value={moneyInputValue(form.additional_cost)}
                onChange={(e) => setForm({ ...form, additional_cost: moneyDigits(e.target.value) })}
                placeholder="0"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Dibagi proporsional ke semua baris, lalu ditambahkan ke harga per satuan pakai.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Barang yang dibeli</label>
                <span className="text-[11px] text-slate-400">{rows.length} baris</span>
              </div>

              {rows.map((row, index) => {
                const line = computed.lines[index];
                const component = line?.component;
                return (
                  <div key={index} className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <select
                        className={inputClass}
                        value={row.component_id}
                        onChange={(e) => updateRow(index, { component_id: e.target.value })}
                      >
                        <option value="">— Pilih komponen —</option>
                        {components.map((c) => (
                          <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                        onClick={() => setRows((current) => (current.length === 1 ? [emptyRow()] : current.filter((_, i) => i !== index)))}
                        aria-label="Hapus baris"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelClass}>Jumlah beli ({component?.unit_buy || "satuan beli"})</label>
                        <input className={inputClass} inputMode="decimal" value={row.qty_buy} onChange={(e) => updateRow(index, { qty_buy: e.target.value })} placeholder="0" />
                      </div>
                      <div>
                        <label className={labelClass}>Harga per {component?.unit_buy || "satuan beli"}</label>
                        <input
                          className={`${inputClass} text-right tabular-nums`}
                          inputMode="numeric"
                          value={moneyInputValue(row.price_buy)}
                          onChange={(e) => updateRow(index, { price_buy: moneyDigits(e.target.value) })}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {component ? (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>1 {component.unit_buy} = {formatQty(component.conversion)} {component.unit_use}</span>
                        <span>Qty pakai: <b>{formatQty(line?.qtyUse)} {component.unit_use}</b></span>
                        <span>Nilai: <b>Rp {formatRupiah(line?.lineValue)}</b></span>
                        <span>Ongkir: <b>Rp {formatRupiah(line?.allocation)}</b></span>
                        <span>Harga akhir: <b>Rp {formatRupiah(line?.finalUnit)} / {component.unit_use}</b></span>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              <button
                type="button"
                className={`${btnSecondary} w-full`}
                onClick={() => setRows((current) => [...current, emptyRow()])}
              >
                <Plus size={15} /> Tambah baris
              </button>
            </div>

            <div>
              <label className={labelClass}>Catatan</label>
              <textarea className={`${inputClass} min-h-[70px]`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Nilai barang</span><b>Rp {formatRupiah(computed.subtotal)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Ongkir/biaya tambahan</span><b>Rp {formatRupiah(computed.additional)}</b></div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1"><span className="font-bold">Total</span><b>Rp {formatRupiah(computed.total)}</b></div>
            </div>
          </div>
        </Drawer>
      </div>
    </AccessGate>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-slate-100 break-words">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-2 min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-tight">{label}</p>
      <p className="mt-0.5 text-[11px] font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap tabular-nums">{value}</p>
    </div>
  );
}
