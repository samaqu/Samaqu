"use client";

import { useState } from "react";
import { AdminApiError, opsResellerApi, type ResellerAdminRow } from "./api";
import BankSelect from "@/components/reseller/BankSelect";
import { rupiah } from "@/lib/reseller/format";
import { parseResellerDiscount } from "@/lib/reseller/pricing";
import type { LevelTier } from "@/lib/reseller/level";
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
  /** Diskon khusus reseller (persen) sebagai teks isian; kosong = ikut diskon default. */
  discount_percent: string;
  /** Level manual: "" = otomatis dari belanja, atau "silver" | "gold" | "platinum". */
  level_override: string;
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
    discount_percent:
      initial?.discount_percent === null || initial?.discount_percent === undefined ? "" : String(Number(initial.discount_percent)),
    level_override: initial?.level_override || "",
  };
}

/** Form tambah / ubah reseller. Tambah = langsung active + kirim WA akun dibuat. */
export default function ResellerFormModal({
  initial,
  defaultDiscount,
  levels,
  onClose,
  onSaved,
}: {
  initial?: ResellerAdminRow | null;
  /** Diskon default pengaturan reseller (persen), ditampilkan sebagai petunjuk. */
  defaultDiscount: number;
  /** Tiga level yang berlaku (nama + batas) untuk pilihan level manual. */
  levels: LevelTier[];
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
    if (!parseResellerDiscount(form.discount_percent).ok) {
      setError("Diskon reseller harus angka 0 sampai 100, atau kosongkan untuk ikut diskon default.");
      return;
    }
    setBusy(true);
    try {
      // Level manual hanya dikirim kalau BERUBAH, supaya mengubah data lain tetap jalan walau kolom level
      // belum ada di database (migrasi 20261114) dan tidak menimpa level yang sama.
      const { level_override: levelBaru, ...dataLain } = form;
      if (initial) {
        const berubah = levelBaru !== (initial.level_override || "");
        await opsResellerApi.updateReseller(initial.id, berubah ? { ...dataLain, level_override: levelBaru } : { ...dataLain });
      } else {
        await opsResellerApi.createReseller({ ...dataLain });
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
        <DiscountField
          value={form.discount_percent}
          defaultDiscount={defaultDiscount}
          onChange={(value) => set("discount_percent", value)}
        />
        {initial ? (
          <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
            <label htmlFor="reseller-level" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
              Level reseller
            </label>
            <select
              id="reseller-level"
              className="w-full px-3 py-2.5 bg-white border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
              value={form.level_override}
              onChange={(e) => set("level_override", e.target.value)}
            >
              <option value="">Otomatis dari belanja</option>
              {levels.map((tier) => (
                <option key={tier.key} value={tier.key}>
                  {tier.label} (ditetapkan manual)
                </option>
              ))}
            </select>
            <p className="text-[12px] text-slate-500 mt-2">
              Otomatis = naik/turun sesuai rata-rata belanja per bulan. Pilih level untuk menetapkannya manual (mis. reseller VIP);
              levelnya tidak berubah sampai dikembalikan ke Otomatis. Level hanya tampilan, tidak mengubah harga atau diskon.
            </p>
          </div>
        ) : null}
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

/**
 * Isian diskon khusus reseller. Kosong = ikut diskon default pengaturan; diisi = diskon reseller ini.
 * Berlaku untuk pesanan BARU (harga pesanan lama sudah tersimpan). Ada contoh harga supaya hasilnya jelas.
 */
function DiscountField({
  value,
  defaultDiscount,
  onChange,
}: {
  value: string;
  defaultDiscount: number;
  onChange: (value: string) => void;
}) {
  const parsed = parseResellerDiscount(value);
  const custom = parsed.ok && parsed.value !== null;
  const percent = parsed.ok ? (parsed.value ?? defaultDiscount) : null;
  const sample = 359000;
  return (
    <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
      <label htmlFor="reseller-discount" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
        Diskon reseller (%)
      </label>
      <div className="flex items-center gap-2">
        <input
          id="reseller-discount"
          className="w-28 px-3 py-2.5 bg-white border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-extrabold text-slate-900"
          inputMode="decimal"
          placeholder={String(defaultDiscount)}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
        />
        <span className="text-sm font-bold text-slate-500">%</span>
        {value.trim() ? (
          <button type="button" onClick={() => onChange("")} className="ml-auto text-[12px] font-bold text-blue-600 hover:underline">
            Pakai default ({defaultDiscount}%)
          </button>
        ) : null}
      </div>
      <p className="text-[12px] text-slate-500 mt-2">
        {custom
          ? "Diskon khusus reseller ini."
          : `Kosong = ikut diskon default (${defaultDiscount}%). Isi untuk memberi diskon berbeda, mis. 25, 13, atau 17.5.`}
        {" "}Berlaku untuk pesanan baru; pesanan lama tidak berubah.
      </p>
      {percent !== null ? (
        <p className="text-[12px] font-semibold text-slate-700 mt-1">
          Contoh: harga katalog {rupiah(sample)} &rarr; harga reseller {rupiah(Math.round(sample * (1 - percent / 100)))}
        </p>
      ) : (
        <p className="text-[12px] font-semibold text-red-600 mt-1">Isi angka 0 sampai 100.</p>
      )}
    </div>
  );
}
