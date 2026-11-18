"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { addressSummary, MAX_ADDRESSES, type ResellerAddress } from "@/lib/reseller/addresses";
import AddressFormModal from "./AddressFormModal";
import { AdminApiError, opsResellerApi } from "./api";
import { ConfirmActionModal } from "./Modal";

/**
 * Kelola buku alamat satu reseller (kartu di detail reseller): tambah, ubah, hapus, jadikan utama.
 * Alamat tersimpan hanya mengisi form Buat Pesanan; pesanan lama tidak terpengaruh.
 */
export default function AddressBookCard({ resellerId }: { resellerId: string }) {
  const [rows, setRows] = useState<ResellerAddress[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<{ open: boolean; initial: ResellerAddress | null }>({ open: false, initial: null });
  const [removing, setRemoving] = useState<ResellerAddress | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setRows((await opsResellerApi.resellerAddresses(resellerId)).data);
    } catch (e) {
      setRows([]);
      setError(e instanceof AdminApiError ? e.message : "Gagal memuat alamat.");
    }
  }, [resellerId]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const makeDefault = async (row: ResellerAddress) => {
    setBusy(true);
    setError("");
    try {
      await opsResellerApi.setDefaultAddress(resellerId, row.id);
      await load();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menjadikan alamat utama.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: ResellerAddress) => {
    setBusy(true);
    setError("");
    try {
      await opsResellerApi.deleteAddress(resellerId, row.id);
      setRemoving(null);
      await load();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menghapus alamat.");
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  const full = (rows?.length ?? 0) >= MAX_ADDRESSES;

  return (
    <div className="space-y-2">
      {rows === null ? <p className="dp-kosong-teks">Memuat alamat…</p> : null}
      {rows && rows.length === 0 && !error ? (
        <p className="dp-kosong-teks">Belum ada alamat tersimpan. Tambahkan supaya pesanan berikutnya tinggal pilih.</p>
      ) : null}

      {rows?.map((row) => (
        <div key={row.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <b className="text-[13px] text-slate-900">{row.label}</b>
                {row.is_default ? (
                  <span className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-700">Utama</span>
                ) : null}
              </div>
              <div className="text-[12px] text-slate-600">
                {row.recipient_name} · {row.whatsapp}
              </div>
              <div className="text-[12px] text-slate-500 break-words">{addressSummary(row)}</div>
              {row.notes ? <div className="text-[11px] text-slate-400">Catatan: {row.notes}</div> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {!row.is_default ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => makeDefault(row)}
                className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                Jadikan utama
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => setForm({ open: true, initial: row })}
              className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              Ubah
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRemoving(row)}
              className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Hapus
            </button>
          </div>
        </div>
      ))}

      {error ? <p className="text-[12px] text-red-600 font-semibold">{error}</p> : null}

      <button
        type="button"
        disabled={full || rows === null}
        onClick={() => setForm({ open: true, initial: null })}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-slate-300 text-[12.5px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        <Plus size={14} /> {full ? `Maksimal ${MAX_ADDRESSES} alamat` : "Tambah alamat"}
      </button>

      {form.open ? (
        <AddressFormModal
          resellerId={resellerId}
          initial={form.initial}
          firstAddress={(rows?.length ?? 0) === 0}
          onClose={() => setForm({ open: false, initial: null })}
          onSaved={() => {
            setForm({ open: false, initial: null });
            load();
          }}
        />
      ) : null}

      {removing ? (
        <ConfirmActionModal
          title="Hapus alamat"
          description={`Hapus alamat "${removing.label}" (${removing.recipient_name})? Pesanan yang sudah dibuat tidak terpengaruh.${
            removing.is_default && (rows?.length ?? 0) > 1 ? " Alamat tertua yang tersisa akan jadi alamat utama." : ""
          }`}
          confirmLabel="Hapus"
          tone="danger"
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={() => remove(removing)}
        />
      ) : null}
    </div>
  );
}
