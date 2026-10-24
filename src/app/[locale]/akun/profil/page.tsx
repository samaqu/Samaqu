"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Edit, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrentCustomer, logoutCustomer } from "@/lib/customer-auth";
import { useSafeLocale } from "@/lib/safe-i18n";
import { AkunHeader } from "@/components/akun/AkunShell";

const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

/** Pintasan pengaturan lain dari halaman profil (dipakai di mobile & desktop). */
const PENGATURAN = [
  {
    href: "/akun/alamat",
    title: "Alamat Pengiriman",
    sub: "Simpan alamat biar pesanan berikutnya lebih cepat",
    icon: <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11ZM12 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  },
  {
    href: "/akun/ubah-password",
    title: "Ubah Password",
    sub: "Ganti password dengan verifikasi OTP WhatsApp",
    icon: (
      <>
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V8a4 4 0 0 1 8 0v2" />
      </>
    ),
  },
  {
    href: "/akun/panduan-ukuran",
    title: "Panduan Ukuran",
    sub: "Tabel ukuran biar tidak salah pilih size",
    icon: (
      <>
        <path d="M3 14 14 3l7 7L10 21z" />
        <path d="M7.5 12.5 9 14M10.5 9.5 12 11M13.5 6.5 15 8" />
      </>
    ),
  },
  {
    href: "/akun/bantuan",
    title: "Hubungi Admin",
    sub: "Chat tim SAMAQU kalau ada pertanyaan",
    icon: (
      <>
        <path d="M21 12a8 8 0 1 1-3.2-6.4" />
        <path d="M8 11h8M8 15h5" />
      </>
    ),
  },
];

type Profil = { name: string; whatsapp: string; dd: string; mm: string; yyyy: string };

const KOSONG: Profil = { name: "", whatsapp: "", dd: "", mm: "", yyyy: "" };

/** Nilai yang tersimpan ditampilkan sebagai teks; input hanya muncul di mode Edit. */
function Baris({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <span className="block text-xs md:text-sm font-bold text-[#777777] mb-1">{label}</span>
      <p className="text-sm md:text-base font-semibold" style={{ color: value ? "#000000" : "#9aa5a1" }}>
        {value || "Belum diisi"}
      </p>
      {hint && <span className="block text-[11px] text-[#9aa5a1] mt-1">{hint}</span>}
    </div>
  );
}

export default function ProfilPage() {
  const locale = useSafeLocale();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [email, setEmail] = useState("");
  const [form, setForm] = useState<Profil>(KOSONG);
  // Nilai terakhir yang tersimpan — sumber tampilan read-only & tujuan tombol Batal.
  const [saved, setSaved] = useState<Profil>(KOSONG);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    async function init() {
      const c = await getCurrentCustomer();
      if (!c) return;
      const next: Profil = { ...KOSONG, name: c.name || "", whatsapp: c.whatsapp || "" };
      const birth = (c as { birth_date?: string }).birth_date;
      if (birth) {
        const d = new Date(birth);
        if (!isNaN(d.getTime())) {
          next.dd = String(d.getDate());
          next.mm = String(d.getMonth() + 1);
          next.yyyy = String(d.getFullYear());
        }
      }
      setForm(next);
      setSaved(next);
      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email || "");
      setLoading(false);
    }
    init();
  }, []);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 3) e.name = "Nama wajib diisi, minimal 3 karakter";
    if (form.dd && form.mm && form.yyyy) {
      const d = Number(form.dd), m = Number(form.mm), y = Number(form.yyyy);
      const test = new Date(y, m - 1, d);
      if (test.getDate() !== d || test.getMonth() !== m - 1) e.birth = "Tanggal lahir tidak valid";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function batal() {
    setForm(saved);
    setErrors({});
    setEditing(false);
  }

  async function simpan() {
    if (!validate()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const payload: Record<string, unknown> = { name: form.name.trim(), whatsapp: form.whatsapp.trim() || null };
    if (form.dd && form.mm && form.yyyy) payload.birth_date = `${form.yyyy}-${String(form.mm).padStart(2, "0")}-${String(form.dd).padStart(2, "0")}`;

    let { error } = await supabase.from("customers").update(payload).eq("id", user.id);
    let birthSkipped = false;
    // Kolom `birth_date` datang dari migration yang dijalankan manual di Supabase; selama
    // belum ada, PostgREST menolak seluruh update (400). Simpan sisanya dan beri tahu.
    if (error && payload.birth_date && /birth_date/i.test(error.message)) {
      delete payload.birth_date;
      birthSkipped = true;
      ({ error } = await supabase.from("customers").update(payload).eq("id", user.id));
    }
    setSaving(false);
    if (!error) {
      setSaved({ ...form, name: form.name.trim(), whatsapp: form.whatsapp.trim() });
      setEditing(false);
    }
    setToast(
      error
        ? "Gagal menyimpan perubahan."
        : birthSkipped
          ? "Perubahan tersimpan, tapi tanggal lahir belum bisa disimpan."
          : "Perubahan berhasil disimpan."
    );
    setTimeout(() => setToast(""), birthSkipped ? 4000 : 2400);
  }

  /**
   * Keluar dari akun: hapus sesi lalu muat ulang ke beranda — muat ulang penuh dipakai supaya
   * state customer yang sudah dimuat provider (layout akun) ikut bersih.
   */
  async function keluar() {
    setLoggingOut(true);
    await logoutCustomer();
    window.location.href = `/${locale}`;
  }

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const years = Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - i);
  const savedBirth = saved.dd && saved.mm && saved.yyyy
    ? `${Number(saved.dd)} ${BULAN[Number(saved.mm) - 1]} ${saved.yyyy}`
    : "";

  const inputClass = "w-full rounded-2xl border border-[#D8D8D8] bg-white px-4 py-3.5 text-sm md:text-base font-semibold outline-none focus:border-[#000000]";
  const selectClass = "rounded-2xl border border-[#D8D8D8] bg-white px-3 py-3.5 text-sm font-semibold outline-none";

  return (
    <>
      <AkunHeader title="Informasi Profil" back="/akun" />

      {loading ? (
        <div className="md:max-w-[600px] akun-card h-72 animate-pulse" />
      ) : (
        <div className="md:max-w-[600px] md:akun-card md:p-8">
          <div className="space-y-4 md:space-y-5">
            {editing ? (
              <>
                <label className="block">
                  <span className="block text-xs md:text-sm font-bold text-[#777777] mb-1.5">Nama Lengkap</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputClass}
                    style={{ color: "#000000" }}
                  />
                  {errors.name && <span className="block text-[11px] text-red-600 mt-1.5">{errors.name}</span>}
                </label>

                <label className="block">
                  <span className="block text-xs md:text-sm font-bold text-[#777777] mb-1.5">Email</span>
                  <input
                    type="text"
                    value={email}
                    readOnly
                    className="w-full rounded-2xl border border-[#E0E0E0] bg-[#f2efe8] px-4 py-3.5 text-sm md:text-base font-semibold text-[#9aa5a1] cursor-not-allowed"
                  />
                  <span className="block text-[11px] text-[#9aa5a1] mt-1.5">Email tidak dapat diubah.</span>
                </label>

                <label className="block">
                  <span className="block text-xs md:text-sm font-bold text-[#777777] mb-1.5">Nomor HP / WhatsApp</span>
                  <input
                    type="tel"
                    value={form.whatsapp}
                    onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                    placeholder="0812xxxxxxx"
                    className={inputClass}
                    style={{ color: "#000000" }}
                  />
                </label>

                <div>
                  <span className="block text-xs md:text-sm font-bold text-[#777777] mb-1.5">Tanggal Lahir</span>
                  <div className="grid grid-cols-3 gap-2 md:gap-3">
                    <select value={form.dd} onChange={(e) => setForm({ ...form, dd: e.target.value })} className={selectClass} style={{ color: "#000000" }}>
                      <option value="">Tgl</option>
                      {days.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select value={form.mm} onChange={(e) => setForm({ ...form, mm: e.target.value })} className={selectClass} style={{ color: "#000000" }}>
                      <option value="">Bulan</option>
                      {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
                    </select>
                    <select value={form.yyyy} onChange={(e) => setForm({ ...form, yyyy: e.target.value })} className={selectClass} style={{ color: "#000000" }}>
                      <option value="">Tahun</option>
                      {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  {errors.birth && <span className="block text-[11px] text-red-600 mt-1.5">{errors.birth}</span>}
                </div>
              </>
            ) : (
              <>
                <Baris label="Nama Lengkap" value={saved.name} />
                <Baris label="Email" value={email} hint="Email tidak dapat diubah." />
                <Baris label="Nomor HP / WhatsApp" value={saved.whatsapp} />
                <Baris label="Tanggal Lahir" value={savedBirth} />
              </>
            )}
          </div>

          {editing ? (
            <div className="flex flex-wrap items-center gap-3 mt-7">
              <button
                onClick={simpan}
                disabled={saving}
                className="akun-btn-green flex-1 min-w-[150px] py-4 rounded-full font-extrabold text-sm md:text-base inline-flex items-center justify-center gap-2 transition active:scale-[.99] disabled:opacity-60"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? "Menyimpan…" : "Simpan Perubahan"}
              </button>
              <button
                onClick={batal}
                disabled={saving}
                className="flex-1 min-w-[100px] py-4 rounded-full font-extrabold text-sm md:text-base border border-[#D8D8D8] bg-white transition active:scale-[.99] disabled:opacity-50"
                style={{ color: "#000000" }}
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="mt-7 w-full py-4 rounded-full font-extrabold text-sm md:text-base border border-[#D8D8D8] bg-white inline-flex items-center justify-center gap-2 transition active:scale-[.99]"
              style={{ color: "#000000" }}
            >
              <Edit size={15} strokeWidth={2} />
              Edit
            </button>
          )}
        </div>
      )}

      {/* ── Pengaturan akun: alamat, panduan ukuran, bantuan, dan keluar ──
          Di mobile jadi daftar baris yang gampang dijangkau jempol; di desktop satu kartu
          yang sama lebar dengan kartu profil di atasnya. */}
      {!loading && (
        <div className="mt-6 md:mt-8 md:max-w-[600px] md:akun-card md:p-8">
          <h2 className="akun-sect mb-3">Pengaturan</h2>

          <div className="space-y-2.5">
            {PENGATURAN.map((item) => (
              <Link
                key={item.href}
                href={`/${locale}${item.href}`}
                prefetch={true}
                className="flex items-center gap-3 rounded-2xl border border-[#EDE7DC] bg-[#faf8f4] px-4 py-3.5 transition hover:bg-[#f5f1ea] active:scale-[.99]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px]" style={{ background: "#e3ede9" }}>
                  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="#000000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    {item.icon}
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold" style={{ color: "#000000" }}>{item.title}</span>
                  <span className="block text-[11.5px] text-[#777777] mt-0.5">{item.sub}</span>
                </span>
                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-[#9aa5a1]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </Link>
            ))}
          </div>

          <button
            type="button"
            onClick={keluar}
            disabled={loggingOut}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#F3D6D3] bg-[#FDECEC] py-3.5 text-[13.5px] font-extrabold transition hover:bg-[#fbdedb] active:scale-[.99] disabled:opacity-60"
            style={{ color: "#b3261e" }}
          >
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            {loggingOut ? "Keluar…" : "Keluar dari Akun"}
          </button>
          <p className="mt-2.5 text-center text-[11.5px] text-[#9aa5a1]">
            Kamu akan keluar dari akun ini di perangkat ini.
          </p>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 z-50 rounded-full px-5 py-3 text-sm font-bold text-white shadow-lg" style={{ background: "#000000" }}>
          {toast}
        </div>
      )}
    </>
  );
}
