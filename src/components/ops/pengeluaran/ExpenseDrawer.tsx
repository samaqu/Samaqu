"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Package, X } from "lucide-react";
import { useToast } from "@/components/ops/ui/use-toast";
import { Field, inputClass, textareaClass } from "./fields";
import {
  KATEGORI_OPERASIONAL,
  METODE_BAYAR,
  angka,
  pesanError,
  pengeluaranFetch,
  rupiah,
  todayWibKey,
} from "./helpers";
import type { ExpenseItem, ExpenseRow, PengeluaranTipe } from "./types";

/**
 * Drawer tambah/ubah pengeluaran.
 * Packing: pilih barang dari master, qty × harga satuan → total dihitung server.
 * Operasional: kategori + jumlah rupiah.
 */
export default function ExpenseDrawer({
  open,
  tipe,
  row,
  items,
  onClose,
  onSaved,
  onManageItems,
}: {
  open: boolean;
  tipe: PengeluaranTipe;
  row: ExpenseRow | null;
  items: ExpenseItem[];
  onClose: () => void;
  onSaved: () => void;
  onManageItems: () => void;
}) {
  const { toast } = useToast();
  const [tanggal, setTanggal] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [hargaSatuan, setHargaSatuan] = useState("");
  const [kategori, setKategori] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [metodeBayar, setMetodeBayar] = useState("");
  const [catatan, setCatatan] = useState("");
  const [requestId, setRequestId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTanggal(row?.tanggal ? String(row.tanggal).slice(0, 10) : todayWibKey());
    setItemId(row?.item_id || "");
    setQty(row?.qty ? String(row.qty) : "");
    setHargaSatuan(row?.harga_satuan ? String(row.harga_satuan) : "");
    setKategori(row?.kategori || "");
    setDeskripsi(row?.deskripsi || "");
    setJumlah(tipe === "operasional" && row?.jumlah ? String(row.jumlah) : "");
    setMetodeBayar(row?.metode_bayar || "");
    setCatatan(row?.catatan || "");
    setError("");
    setSaving(false);
    setRequestId(`exp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  }, [open, row?.id, tipe]);

  const totalPacking = useMemo(
    () => (Number(qty) || 0) * (Number(hargaSatuan) || 0),
    [qty, hargaSatuan],
  );

  const pilihanBarang = useMemo(
    () => items.filter((item) => item.aktif || item.id === itemId),
    [items, itemId],
  );

  const judul = tipe === "packing" ? "Pengeluaran Packing" : "Pengeluaran Operasional";

  async function submit() {
    if (saving) return;

    if (!tanggal) {
      setError("Tanggal wajib diisi.");
      return;
    }

    let payload: Record<string, unknown>;
    if (tipe === "packing") {
      if (!itemId) {
        setError("Pilih barang packing dulu.");
        return;
      }
      if (!qty || Number(qty) <= 0) {
        setError("Qty harus lebih dari 0.");
        return;
      }
      if (hargaSatuan === "" || Number(hargaSatuan) < 0) {
        setError("Harga satuan wajib diisi.");
        return;
      }
      if (totalPacking <= 0) {
        setError("Total pengeluaran harus lebih dari 0.");
        return;
      }
      payload = {
        tanggal,
        item_id: itemId,
        qty: Number(qty),
        harga_satuan: Number(hargaSatuan),
        catatan: catatan.trim() || null,
      };
    } else {
      if (!kategori.trim()) {
        setError("Kategori wajib diisi.");
        return;
      }
      if (!jumlah || Number(jumlah) <= 0) {
        setError("Jumlah harus lebih dari 0.");
        return;
      }
      payload = {
        tanggal,
        kategori: kategori.trim(),
        deskripsi: deskripsi.trim() || null,
        jumlah: Number(jumlah),
        metode_bayar: metodeBayar.trim() || null,
        catatan: catatan.trim() || null,
      };
    }

    setSaving(true);
    setError("");
    try {
      if (row) {
        await pengeluaranFetch("/api/ops/pengeluaran", {
          method: "PATCH",
          body: JSON.stringify({ id: row.id, ...payload }),
        });
        toast({ title: "Pengeluaran diperbarui", description: "Perubahan sudah tersimpan.", variant: "success" });
      } else {
        await pengeluaranFetch("/api/ops/pengeluaran", {
          method: "POST",
          body: JSON.stringify({ tipe, request_id: requestId, ...payload }),
        });
        toast({ title: "Pengeluaran tersimpan", description: "Data pengeluaran sudah dicatat.", variant: "success" });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(pesanError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] bg-black/45"
          onClick={() => {
            if (!saving) onClose();
          }}
        >
          <motion.aside
            initial={{ x: 40, opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            onClick={(event) => event.stopPropagation()}
            className="absolute bottom-0 right-0 top-0 flex w-full flex-col bg-white shadow-2xl sm:w-[460px]"
            role="dialog"
            aria-modal="true"
            aria-label={judul}
          >
            <div className="shrink-0 border-b border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{judul}</p>
                  <h2 className="mt-1 text-lg font-extrabold text-slate-900">
                    {row ? "Ubah Pengeluaran" : "Tambah Pengeluaran"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!saving) onClose();
                  }}
                  className="rounded-lg p-2 hover:bg-slate-100"
                  aria-label="Tutup"
                >
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
            </div>

            <div className="drawer-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <Field label="Tanggal">
                <input
                  type="date"
                  value={tanggal}
                  onChange={(event) => setTanggal(event.target.value)}
                  className={inputClass}
                />
              </Field>

              {tipe === "packing" ? (
                <>
                  <Field label="Barang" hint="Hanya barang aktif yang tampil di sini.">
                    <select
                      value={itemId}
                      onChange={(event) => setItemId(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Pilih barang packing…</option>
                      {pilihanBarang.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nama}
                          {item.satuan ? ` (${item.satuan})` : ""}
                          {item.aktif ? "" : " · nonaktif"}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <button
                    type="button"
                    onClick={onManageItems}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 underline underline-offset-2 hover:text-black"
                  >
                    <Package size={14} /> Barang belum ada? Kelola Barang
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Qty">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={qty}
                        onChange={(event) => setQty(event.target.value.replace(/[^\d]/g, ""))}
                        placeholder="0"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Harga Satuan">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={hargaSatuan}
                        onChange={(event) => setHargaSatuan(event.target.value.replace(/[^\d]/g, ""))}
                        placeholder="0"
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total</span>
                      <span className="text-lg font-black tabular-nums text-slate-900">{rupiah(totalPacking)}</span>
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-slate-400">
                      {angka(Number(qty) || 0)} × {rupiah(Number(hargaSatuan) || 0)} · dihitung otomatis
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Kategori" hint="Boleh pilih saran atau ketik sendiri.">
                    <input
                      type="text"
                      list="pengeluaran-kategori"
                      value={kategori}
                      onChange={(event) => setKategori(event.target.value)}
                      placeholder="Contoh: Gaji"
                      className={inputClass}
                    />
                    <datalist id="pengeluaran-kategori">
                      {KATEGORI_OPERASIONAL.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </Field>

                  <Field label="Deskripsi">
                    <textarea
                      rows={2}
                      value={deskripsi}
                      onChange={(event) => setDeskripsi(event.target.value)}
                      placeholder="Contoh: Gaji packing November"
                      className={textareaClass}
                    />
                  </Field>

                  <Field label="Jumlah">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={jumlah}
                      onChange={(event) => setJumlah(event.target.value.replace(/[^\d]/g, ""))}
                      placeholder="0"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Metode Bayar">
                    <input
                      type="text"
                      list="pengeluaran-metode"
                      value={metodeBayar}
                      onChange={(event) => setMetodeBayar(event.target.value)}
                      placeholder="Transfer Bank / Cash / …"
                      className={inputClass}
                    />
                    <datalist id="pengeluaran-metode">
                      {METODE_BAYAR.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </Field>
                </>
              )}

              <Field label="Catatan">
                <textarea
                  rows={2}
                  value={catatan}
                  onChange={(event) => setCatatan(event.target.value)}
                  placeholder="Catatan tambahan (opsional)"
                  className={textareaClass}
                />
              </Field>

              {tipe === "operasional" && jumlah ? (
                <p className="text-xs font-bold text-slate-500">
                  Jumlah tercatat: <span className="text-slate-900">{rupiah(Number(jumlah) || 0)}</span>
                </p>
              ) : null}

              {error ? (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-600">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  if (!saving) onClose();
                }}
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#18181b] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {row ? "Simpan Perubahan" : "Simpan"}
              </button>
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
