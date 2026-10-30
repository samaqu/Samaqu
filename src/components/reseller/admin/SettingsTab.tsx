"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { AdminApiError, opsResellerApi, type ResellerSettings } from "./api";
import { supabase } from "@/lib/supabase";
import { MEDIA_LIMITS, uploadToCloudinary } from "@/lib/cloudinary";
import RupiahInput from "@/components/reseller/RupiahInput";

/**
 * Pengaturan reseller: biaya admin non-BSI, rekening BSI tujuan top up, dan
 * gambar QRIS portal (dipakai tab QRIS di Top Up & bayar kekurangan).
 * Upload QRIS memakai mekanisme Cloudinary yang sama (scope "reseller",
 * sesi admin diizinkan) dan langsung tersimpan.
 */
export default function SettingsTab({ onChanged }: { onChanged: () => void }) {
  const [form, setForm] = useState<ResellerSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [qrisBusy, setQrisBusy] = useState(false);
  const [qrisError, setQrisError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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
        qris_image_url: form.qrisImageUrl || "",
      });
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menyimpan pengaturan.");
    } finally {
      setBusy(false);
    }
  };

  const saveQris = async (url: string | null) => {
    setQrisError("");
    setQrisBusy(true);
    try {
      await opsResellerApi.updateSettings({ qris_image_url: url || "" });
      setForm((prev) => (prev ? { ...prev, qrisImageUrl: url } : prev));
      onChanged();
    } catch (e) {
      setQrisError(e instanceof AdminApiError ? e.message : "Gagal menyimpan QRIS.");
    } finally {
      setQrisBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const uploadQris = async (file: File | null) => {
    if (!file) return;
    setQrisError("");
    if (!file.type.startsWith("image/")) {
      setQrisError("QRIS harus berupa gambar (JPG, PNG, atau WebP).");
      return;
    }
    if (file.size > MEDIA_LIMITS.imageMaxBytes) {
      setQrisError("Ukuran gambar maksimal 10MB.");
      return;
    }
    setQrisBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const url = await uploadToCloudinary(file, {
        scope: "reseller",
        token: data.session?.access_token,
      });
      await saveQris(url);
    } catch {
      setQrisError("Upload QRIS gagal. Coba lagi.");
    } finally {
      setQrisBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200 p-5 max-w-2xl space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
            Biaya admin penarikan (non-BSI)
          </label>
          <RupiahInput
            value={form.adminFeeNonBsi}
            onChange={(value) => setForm({ ...form, adminFeeNonBsi: value })}
            placeholder="2.500"
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

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
          Gambar QRIS portal reseller
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => uploadQris(e.target.files?.[0] ?? null)}
        />
        {form.qrisImageUrl ? (
          <div className="flex items-start gap-3">
            <img
              src={form.qrisImageUrl}
              alt="QRIS portal reseller"
              className="w-32 h-32 object-contain rounded-xl border border-slate-200 bg-slate-50"
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg text-[12px] font-bold bg-slate-100 hover:bg-slate-200 inline-flex items-center gap-1.5"
                disabled={qrisBusy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={13} /> Ganti gambar
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg text-[12px] font-bold bg-red-50 text-red-700 hover:bg-red-100 inline-flex items-center gap-1.5"
                disabled={qrisBusy}
                onClick={() => saveQris(null)}
              >
                <Trash2 size={13} /> Hapus
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="px-3 py-2 rounded-lg text-[12px] font-bold bg-slate-100 hover:bg-slate-200 inline-flex items-center gap-1.5"
            disabled={qrisBusy}
            onClick={() => fileRef.current?.click()}
          >
            {qrisBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {qrisBusy ? "Mengunggah…" : "Upload gambar QRIS"}
          </button>
        )}
        <p className="text-[11px] text-slate-500 mt-1">
          Kalau kosong, tab QRIS disembunyikan di portal reseller (hanya transfer BSI).
        </p>
        {qrisError ? <p className="text-sm text-red-600 font-semibold mt-1">{qrisError}</p> : null}
      </div>

      <p className="text-[12px] text-slate-500">
        Rekening & QRIS ini tampil di portal reseller (top up & kekurangan saldo). Saldo reseller baru bertambah
        setelah admin mengonfirmasi lewat tab Perlu Dicek.
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
