"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
// Form penerima portal (komponen yang sama dengan Buat Pesanan); gayanya di-scope `.rs-root`.
import "@/app/(internal)/reseller/reseller.css";
import { addressToForm, formToAddressInput, parseAddressInput, type ResellerAddress } from "@/lib/reseller/addresses";
import PenerimaForm from "../order/PenerimaForm";
import { EMPTY_ADDRESS, type AddressValue } from "../order/types";
import { AdminApiError, opsResellerApi } from "./api";
import { Modal } from "./Modal";

/**
 * Tambah / ubah satu alamat di buku alamat reseller. Isian alamat memakai `PenerimaForm` (termasuk
 * "tempel alamat, isi otomatis") — pembaca alamat admin yang sama dengan form Transaksi.
 */
export default function AddressFormModal({
  resellerId,
  initial,
  initialForm,
  suggestLabel,
  firstAddress,
  onClose,
  onSaved,
}: {
  resellerId: string;
  /** Alamat yang diubah; kosong = alamat baru. */
  initial?: ResellerAddress | null;
  /** Isian awal untuk alamat baru (mis. dari form pesanan yang sedang diisi). */
  initialForm?: AddressValue;
  suggestLabel?: string;
  /** Belum ada alamat tersimpan: alamat ini otomatis jadi alamat utama. */
  firstAddress?: boolean;
  onClose: () => void;
  onSaved: (address: ResellerAddress) => void;
}) {
  const editing = Boolean(initial);
  const [label, setLabel] = useState(initial?.label || suggestLabel || "");
  const [form, setForm] = useState<AddressValue>(initial ? addressToForm(initial) : initialForm || EMPTY_ADDRESS);
  const [makeDefault, setMakeDefault] = useState(Boolean(initial?.is_default) || Boolean(firstAddress));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const patch = (change: Partial<AddressValue>) => setForm((prev) => ({ ...prev, ...change }));

  const submit = async () => {
    if (busy) return;
    const input = formToAddressInput(form, label, makeDefault);
    const checked = parseAddressInput(input);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = editing && initial
        ? await opsResellerApi.updateAddress(resellerId, initial.id, checked.value)
        : await opsResellerApi.addAddress(resellerId, checked.value);
      onSaved(res.data);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menyimpan alamat.");
      setBusy(false);
    }
  };

  const lockedDefault = Boolean(initial?.is_default) || Boolean(firstAddress);

  return (
    <Modal title={editing ? "Ubah alamat" : "Simpan alamat"} onClose={() => (busy ? undefined : onClose())} width={520}>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
            Label <span className="text-red-500">*</span>
          </label>
          <input
            className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Misal: Toko, Gudang, Rumah"
            autoFocus
          />
        </div>

        <div className="rs-root !min-h-0 !bg-transparent">
          <PenerimaForm value={form} onChange={patch} detectAddress={opsResellerApi.alamatTebak} />
        </div>

        <label className={`flex items-center gap-2 text-[13px] font-semibold ${lockedDefault ? "text-slate-400" : "text-slate-700"}`}>
          <input
            type="checkbox"
            checked={makeDefault}
            disabled={lockedDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
          />
          Jadikan alamat utama
          {lockedDefault ? (
            <span className="text-[11px] font-normal text-slate-400">
              {firstAddress && !initial ? "(alamat pertama otomatis jadi utama)" : "(ganti dengan menjadikan alamat lain utama)"}
            </span>
          ) : null}
        </label>

        <p className="text-[11.5px] text-slate-400">
          Alamat tersimpan hanya mengisi form pesanan. Mengubahnya tidak memengaruhi pesanan yang sudah dibuat.
        </p>
        {error ? <p className="text-sm text-red-600 font-semibold">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy ? <Loader2 size={15} /> : null}
            {busy ? "Menyimpan…" : "Simpan alamat"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
