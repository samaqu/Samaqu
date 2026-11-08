"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { useToast } from "@/components/ops/ui/use-toast";
import { Field, inputClass } from "./fields";
import { pesanError, pengeluaranFetch } from "./helpers";
import type { ExpenseItem } from "./types";

/**
 * Drawer master barang packing.
 * Barang yang sudah pernah dipakai tidak dihapus — cukup dinonaktifkan supaya
 * riwayat pengeluaran tetap utuh.
 */
export default function BarangDrawer({
  open,
  items,
  loading,
  errorMessage,
  onClose,
  onChanged,
}: {
  open: boolean;
  items: ExpenseItem[];
  loading?: boolean;
  /** Error saat memuat daftar barang (mis. tabel belum dibuat). */
  errorMessage?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [nama, setNama] = useState("");
  const [satuan, setSatuan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState("");
  const [editNama, setEditNama] = useState("");
  const [editSatuan, setEditSatuan] = useState("");
  const [savingId, setSavingId] = useState("");

  async function tambah() {
    if (saving) return;
    if (!nama.trim()) {
      setError("Nama barang wajib diisi.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await pengeluaranFetch("/api/ops/pengeluaran/barang", {
        method: "POST",
        body: JSON.stringify({ nama: nama.trim(), satuan: satuan.trim() || null }),
      });
      toast({ title: "Barang ditambahkan", description: nama.trim(), variant: "success" });
      setNama("");
      setSatuan("");
      onChanged();
    } catch (e) {
      setError(pesanError(e));
    } finally {
      setSaving(false);
    }
  }

  function mulaiEdit(item: ExpenseItem) {
    setEditingId(item.id);
    setEditNama(item.nama);
    setEditSatuan(item.satuan || "");
    setError("");
  }

  async function simpanEdit(item: ExpenseItem) {
    if (savingId) return;
    if (!editNama.trim()) {
      setError("Nama barang wajib diisi.");
      return;
    }
    setSavingId(item.id);
    setError("");
    try {
      await pengeluaranFetch("/api/ops/pengeluaran/barang", {
        method: "PATCH",
        body: JSON.stringify({ id: item.id, nama: editNama.trim(), satuan: editSatuan.trim() || null }),
      });
      toast({ title: "Barang diperbarui", description: editNama.trim(), variant: "success" });
      setEditingId("");
      onChanged();
    } catch (e) {
      setError(pesanError(e));
    } finally {
      setSavingId("");
    }
  }

  async function toggleAktif(item: ExpenseItem) {
    if (savingId) return;
    setSavingId(item.id);
    setError("");
    try {
      await pengeluaranFetch("/api/ops/pengeluaran/barang", {
        method: "PATCH",
        body: JSON.stringify({ id: item.id, aktif: !item.aktif }),
      });
      toast({
        title: item.aktif ? "Barang dinonaktifkan" : "Barang diaktifkan",
        description: item.nama,
        variant: "success",
      });
      onChanged();
    } catch (e) {
      setError(pesanError(e));
    } finally {
      setSavingId("");
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[160] bg-black/45"
          onClick={onClose}
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
            aria-label="Kelola Barang Packing"
          >
            <div className="shrink-0 border-b border-slate-200 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Pengeluaran Packing</p>
                  <h2 className="mt-1 text-lg font-extrabold text-slate-900">Kelola Barang</h2>
                </div>
                <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Tutup">
                  <X size={18} className="text-slate-500" />
                </button>
              </div>
            </div>

            <div className="drawer-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="rounded-2xl border border-slate-200 p-3.5">
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Barang baru</p>
                <div className="space-y-2.5">
                  <Field label="Nama barang">
                    <input
                      type="text"
                      value={nama}
                      onChange={(event) => setNama(event.target.value)}
                      placeholder="Contoh: Plastik OPP 25x35"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Satuan" hint="pcs, roll, pack, dll.">
                    <input
                      type="text"
                      value={satuan}
                      onChange={(event) => setSatuan(event.target.value)}
                      placeholder="pcs"
                      className={inputClass}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={tambah}
                    disabled={saving}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    Tambah Barang
                  </button>
                </div>
              </div>

              {error ? (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-600">
                  {error}
                </p>
              ) : null}

              {errorMessage ? (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-600">
                  {errorMessage}
                </p>
              ) : null}

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Daftar barang {items.length ? `(${items.length})` : ""}
                </p>

                {loading ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((index) => (
                      <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center">
                    <p className="text-sm font-bold text-slate-700">Belum ada barang packing</p>
                    <p className="mt-1 text-xs text-slate-500">Tambahkan barang lewat form di atas.</p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {items.map((item) => (
                      <li key={item.id} className="rounded-2xl border border-slate-200 p-3">
                        {editingId === item.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editNama}
                              onChange={(event) => setEditNama(event.target.value)}
                              placeholder="Nama barang"
                              className={inputClass}
                              aria-label="Nama barang"
                            />
                            <input
                              type="text"
                              value={editSatuan}
                              onChange={(event) => setEditSatuan(event.target.value)}
                              placeholder="Satuan (pcs, roll, pack)"
                              className={inputClass}
                              aria-label="Satuan"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingId("")}
                                disabled={savingId === item.id}
                                className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                onClick={() => simpanEdit(item)}
                                disabled={savingId === item.id}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {savingId === item.id ? <Loader2 size={13} className="animate-spin" /> : null}
                                Simpan
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">{item.nama}</p>
                              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                                {item.satuan || "satuan belum diisi"} ·{" "}
                                <span className={item.aktif ? "text-emerald-600" : "text-slate-400"}>
                                  {item.aktif ? "Aktif" : "Nonaktif"}
                                </span>
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => mulaiEdit(item)}
                                aria-label={`Ubah ${item.nama}`}
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleAktif(item)}
                                disabled={savingId === item.id}
                                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                              >
                                {item.aktif ? "Nonaktifkan" : "Aktifkan"}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
