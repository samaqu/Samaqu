"use client";

import { useState } from "react";
import { AdminApiError, opsResellerApi, type ResellerAdminRow } from "./api";
import BankSelect from "@/components/reseller/BankSelect";
import { Modal } from "./Modal";

const FIELDS: { key: keyof ResellerFormState; label: string; required?: boolean; placeholder?: string; textarea?: boolean; kind?: "bank" }[] = [
  { key: "store_name", label: "Nama toko", required: true },
  { key: "owner_name", label: "Nama pemilik", required: true },
  { key: "whatsapp", label: "Nomor WhatsApp", required: true, placeholder: "08xxxxxxxxxx" },
  { key: "city", label: "Kota", placeholder: "KOTA MAKASSAR" },
  { key: "store_info", label: "Info toko", textarea: true, placeholder: "Alamat toko / keterangan" },
  { key: "social_media", label: "Sosial media", placeholder: "Instagram / TikTok / Shopee" },
  { key: "bank_name", label: "Bank", kind: "bank" },
  { key: "bank_number", label: "Nomor rekening" },
  { key: "bank_holder", label: "Nama pemilik rekening" },
];

type ResellerFormState = {
  store_name: string;
  owner_name: string;
  whatsapp: string;
  city: string;
  store_info: string;
  social_media: string;
  bank_name: string;
  bank_number: string;
  bank_holder: string;
};

function initialState(initial?: ResellerAdminRow | null): ResellerFormState {
  return {
    store_name: initial?.store_name || "",
    owner_name: initial?.owner_name || "",
    whatsapp: initial?.whatsapp || "",
    city: initial?.city || "",
    store_info: initial?.store_info || "",
    social_media: initial?.social_media || "",
    bank_name: initial?.bank_name || "",
    bank_number: initial?.bank_number || "",
    bank_holder: initial?.bank_holder || "",
  };
}

/** Form tambah / ubah reseller. Tambah = langsung active + kirim WA akun dibuat. */
export default function ResellerFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: ResellerAdminRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ResellerFormState>(initialState(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof ResellerFormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!form.store_name.trim() || !form.owner_name.trim() || form.whatsapp.replace(/\D/g, "").length < 9) {
      setError("Nama toko, nama pemilik, dan nomor WhatsApp wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        await opsResellerApi.updateReseller(initial.id, { ...form });
      } else {
        await opsResellerApi.createReseller({ ...form });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menyimpan reseller.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "Ubah reseller" : "Tambah reseller"} onClose={onClose} width={520}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          {FIELDS.map((field) => (
            <div key={field.key} className={field.textarea ? "sm:col-span-2" : ""}>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                {field.label} {field.required ? <span className="text-red-500">*</span> : null}
              </label>
              {field.kind === "bank" ? (
                <div style={{ marginTop: 2 }}>
                  <BankSelect
                    label={field.label}
                    required={false}
                    value={form.bank_name}
                    onChange={(value) => set("bank_name", value)}
                  />
                </div>
              ) : field.textarea ? (
                <textarea
                  className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-semibold text-slate-900"
                  rows={2}
                  placeholder={field.placeholder}
                  value={form[field.key]}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              ) : (
                <input
                  className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-semibold text-slate-900"
                  placeholder={field.placeholder}
                  inputMode={field.key === "whatsapp" || field.key === "bank_number" ? "tel" : undefined}
                  value={form[field.key]}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
        {!initial ? (
          <p className="text-[12px] text-slate-500">
            Reseller langsung aktif dan menerima notifikasi WhatsApp bahwa akunnya dibuat.
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-600 font-semibold">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">
            Batal
          </button>
          <button type="submit" disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Menyimpan…" : initial ? "Simpan perubahan" : "Tambah reseller"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
