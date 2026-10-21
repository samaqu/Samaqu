"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/affiliate/AuthLayout";
import { useToast } from "@/components/affiliate/ui";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";

/**
 * Pendaftaran akun affiliate — wireframe "Dark Slanted Auth" (1:1).
 * Data dikirim ke /api/affiliate/register (server membuat akun auth + profil
 * affiliate berstatus "menunggu" sampai disetujui admin).
 */
const INPUT =
  "w-full h-12 rounded-[10px] border bg-white px-4 text-[14px] font-medium text-[#111827] placeholder:text-[#9ca3af] outline-none transition focus:border-[#1f6274] focus:ring-2 focus:ring-[#1f6274]/15";
const INPUT_BORDER = { borderColor: "#e5e7eb" };
const INPUT_ERROR = { borderColor: "#ef4444" };

export default function AffiliateRegisterPage() {
  const router = useRouter();
  // Prefix path portal: "" di affiliate.samaqu.id, "/affiliate" di domain utama.
  const [base, setBase] = useState("/affiliate");
  useEffect(() => {
    setBase(portalBaseFor(window.location.hostname));
  }, []);
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [tos, setTos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = async () => {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 3) next.name = "Nama lengkap minimal 3 karakter.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Format email tidak valid.";
    if (!/^0\d{8,13}$/.test(phone.replace(/\D/g, ""))) {
      next.phone = "Nomor telepon harus diawali 0 dan berisi 9–14 digit.";
    }
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      next.pw = "Minimal 8 karakter, kombinasi huruf dan angka.";
    }
    if (confirm !== password) next.cf = "Konfirmasi tidak sama dengan kata sandi baru.";
    if (!tos) next.tos = "Kamu harus menyetujui ketentuan.";

    setErr(next);
    if (Object.keys(next).length) {
      toast("Periksa kembali formulir pendaftaran", "err");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/affiliate/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
          tos,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr({ form: json.error || "Gagal membuat akun." });
        toast(json.error || "Gagal membuat akun", "err");
        return;
      }

      toast("Pendaftaran berhasil, menunggu persetujuan admin.");
      router.push("/affiliate/login");
    } catch {
      setErr({ form: "Gagal terhubung ke server." });
      toast("Gagal terhubung ke server", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Daftar jadi affiliate"
      subtitle="Isi data diri kamu. Pendaftaran diperiksa admin sebelum aktif."
      heroTitle="Tumbuh bareng SAMAQU."
      heroSubtitle="Bagikan produk ke audiensmu, dapatkan komisi dari setiap pesanan."
      footerLink={{
        text: "Sudah punya akun?",
        link: portalPath(base, "login"),
        linkLabel: "Masuk",
      }}
    >
      <form
        className="space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {err.form ? (
          <div className="rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] font-medium text-red-700">
            {err.form}
          </div>
        ) : null}

        <div>
          <input
            placeholder="Nama Lengkap"
            className={INPUT}
            style={err.name ? INPUT_ERROR : INPUT_BORDER}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          {err.name ? <p className="mt-1 text-xs text-red-600">{err.name}</p> : null}
        </div>

        <div>
          <input
            type="email"
            placeholder="Email"
            className={INPUT}
            style={err.email ? INPUT_ERROR : INPUT_BORDER}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {err.email ? <p className="mt-1 text-xs text-red-600">{err.email}</p> : null}
        </div>

        <div>
          <input
            placeholder="Nomor Telepon"
            inputMode="tel"
            className={INPUT}
            style={err.phone ? INPUT_ERROR : INPUT_BORDER}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
          {err.phone ? <p className="mt-1 text-xs text-red-600">{err.phone}</p> : null}
        </div>

        <div className="relative">
          <input
            type={show ? "text" : "password"}
            placeholder="Password"
            className={`${INPUT} pr-12`}
            style={err.pw ? INPUT_ERROR : INPUT_BORDER}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          {err.pw ? <p className="mt-1 text-xs text-red-600">{err.pw}</p> : null}
        </div>

        <div>
          <input
            type={show ? "text" : "password"}
            placeholder="Konfirmasi Password"
            className={INPUT}
            style={err.cf ? INPUT_ERROR : INPUT_BORDER}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {err.cf ? <p className="mt-1 text-xs text-red-600">{err.cf}</p> : null}
        </div>

        <label className="flex items-start gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={tos}
            onChange={(e) => setTos(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#1f6274]"
          />
          <span>
            Saya menyetujui Ketentuan Program Affiliate dan Kebijakan Privasi SAMAQU.
          </span>
        </label>
        {err.tos ? <p className="text-xs text-red-600">{err.tos}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 h-12 w-full rounded-[10px] bg-[#1f6274] text-[14px] font-bold text-white transition-colors hover:bg-[#194f5e] disabled:opacity-60"
        >
          {busy ? "Mengirim…" : "Daftar"}
        </button>
      </form>
    </AuthLayout>
  );
}
