"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, MapPin } from "lucide-react";
import { addressSummary, MAX_ADDRESSES, sameAddress, type ResellerAddress } from "@/lib/reseller/addresses";
import type { AddressValue } from "../order/types";
import AddressFormModal from "./AddressFormModal";
import { AdminApiError, opsResellerApi } from "./api";

/**
 * Panel "Alamat tersimpan" di langkah Penerima form Buat Pesanan: satu klik mengisi form dari buku alamat
 * reseller (tetap bisa diubah), dan alamat yang baru diisi bisa disimpan untuk pesanan berikutnya.
 * Alamat tersimpan hanya MENGISI form — pesanan tetap menyimpan salinan alamatnya sendiri.
 */
export default function SavedAddresses({
  resellerId,
  form,
  formComplete,
  onPick,
}: {
  resellerId: string;
  /** Isian penerima saat ini (untuk menandai alamat yang sedang dipakai dan menawarkan "Simpan"). */
  form: AddressValue;
  /** Isian sudah lengkap -> tombol "Simpan alamat ini" muncul. */
  formComplete: boolean;
  onPick: (address: ResellerAddress) => void;
}) {
  const [rows, setRows] = useState<ResellerAddress[] | null>(null);
  const [error, setError] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows((await opsResellerApi.resellerAddresses(resellerId)).data);
    } catch (e) {
      setRows([]);
      setError(e instanceof AdminApiError ? e.message : "Gagal memuat alamat tersimpan.");
    }
  }, [resellerId]);

  useEffect(() => {
    setRows(null);
    setNotice("");
    load();
  }, [load]);

  const inUse = rows?.find((row) => sameAddress(row, form)) || null;
  const canSave = formComplete && !inUse && (rows?.length ?? 0) < MAX_ADDRESSES;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-slate-600">
          <MapPin size={14} aria-hidden="true" /> Alamat tersimpan
          {rows ? <span className="text-slate-400 font-bold normal-case">({rows.length})</span> : null}
        </div>
        {canSave ? (
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className="px-2.5 py-1 rounded-lg text-[11.5px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100"
          >
            Simpan alamat ini
          </button>
        ) : inUse && formComplete ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-700">
            <Check size={13} strokeWidth={3} aria-hidden="true" /> Sudah tersimpan sebagai “{inUse.label}”
          </span>
        ) : null}
      </div>

      {rows === null ? <p className="text-[12px] text-slate-400">Memuat alamat…</p> : null}
      {rows && rows.length === 0 && !error ? (
        <p className="text-[12px] text-slate-500">
          Belum ada alamat tersimpan untuk reseller ini. Isi alamat di bawah, lalu klik “Simpan alamat ini” supaya pesanan berikutnya
          tinggal pilih.
        </p>
      ) : null}
      {error ? <p className="text-[12px] text-red-600 font-semibold">{error}</p> : null}
      {notice ? <p className="text-[12px] text-emerald-700 font-semibold">{notice}</p> : null}

      {rows && rows.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((row) => {
            const active = inUse?.id === row.id;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onPick(row)}
                aria-pressed={active}
                className={`text-left rounded-xl border-2 px-3 py-2.5 bg-white transition-colors ${
                  active ? "border-slate-900" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="flex items-center gap-1.5 flex-wrap">
                  <b className="text-[13px] text-slate-900">{row.label}</b>
                  {row.is_default ? (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-700">Utama</span>
                  ) : null}
                  {active ? <span className="text-[10px] font-extrabold text-slate-500">dipakai</span> : null}
                </span>
                <span className="block text-[12px] text-slate-600">
                  {row.recipient_name} · {row.whatsapp}
                </span>
                <span className="block text-[11.5px] text-slate-500 line-clamp-2">{addressSummary(row)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {saveOpen ? (
        <AddressFormModal
          resellerId={resellerId}
          initialForm={form}
          suggestLabel={form.district}
          firstAddress={(rows?.length ?? 0) === 0}
          onClose={() => setSaveOpen(false)}
          onSaved={(saved) => {
            setSaveOpen(false);
            setNotice(`Tersimpan sebagai “${saved.label}”.`);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
