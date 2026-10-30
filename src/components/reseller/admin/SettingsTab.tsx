"use client";

import { useEffect, useState } from "react";
import { AdminApiError, opsResellerApi, type ResellerSettings } from "./api";

/** Pengaturan reseller: biaya admin non-BSI + rekening BSI tujuan top up. */
export default function SettingsTab({ onChanged }: { onChanged: () => void }) {
  const [form, setForm] = useState<ResellerSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    opsResellerApi
      .settings()
      .then((res) => setForm(res.data))
      .catch(() => setError("Gagal memuat pengaturan."));
  }, []);

  if (error && !form) {
    return <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold">{error}</div>;
  }
  if (!form) return <div className="p-10 text-center text-slate-400 text-sm">Memuat pengaturan…</div>;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      await opsResellerApi.updateSettings({
        admin_fee_non_bsi: form.adminFeeNonBsi,
        bsi_bank_name: form.bsiBankName,
        bsi_account_number: form.bsiAccountNumber,
        bsi_account_holder: form.bsiAccountHolder,
      });
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menyimpan pengaturan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200 p-5 max-w-2xl space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
            Biaya admin penarikan (non-BSI)
          </label>
          <input
            className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
            inputMode="numeric"
            value={form.adminFeeNonBsi || ""}
            onChange={(e) => setForm({ ...form, adminFeeNonBsi: Number(e.target.value.replace(/\D/g, "")) || 0 })}
          />
          <p className="text-[11px] text-slate-500 mt-1">Penarikan ke rekening BSI gratis.</p>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Nama bank BSI</label>
          <input
            className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
            value={form.bsiBankName}
            onChange={(e) => setForm({ ...form, bsiBankName: e.target.value })}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Nomor rekening BSI</label>
          <input
            className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
            inputMode="numeric"
            value={form.bsiAccountNumber}
            onChange={(e) => setForm({ ...form, bsiAccountNumber: e.target.value })}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Atas nama</label>
          <input
            className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
            value={form.bsiAccountHolder}
            onChange={(e) => setForm({ ...form, bsiAccountHolder: e.target.value })}
          />
        </div>
      </div>
      <p className="text-[12px] text-slate-500">
        Rekening ini tampil di portal reseller (top up & kekurangan saldo). Saldo reseller baru bertambah setelah admin
        mengonfirmasi lewat tab Perlu Dicek.
      </p>
      {error ? <p className="text-sm text-red-600 font-semibold">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-600 font-semibold">Pengaturan tersimpan.</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Menyimpan…" : "Simpan pengaturan"}
      </button>
    </form>
  );
}
