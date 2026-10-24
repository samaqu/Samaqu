"use client";

/**
 * Ubah password untuk customer yang SUDAH login.
 *
 * Alur: kirim OTP ke WhatsApp terdaftar → verifikasi kode → password baru.
 * Memakai endpoint reset password yang sama (`/api/auth/*`), jadi aturan keamanan
 * (TTL 5 menit, maks 5 percobaan, token sekali pakai, rate limit) ikut berlaku.
 *
 * Berbeda dengan halaman "Lupa Password", di sini customer tidak perlu mengetik email
 * (diambil dari sesi) dan TIDAK login ulang setelah password diganti — sesinya tetap aktif.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useSafeLocale } from "@/lib/safe-i18n";

const OTP_SECONDS = 5 * 60;
const RESEND_SECONDS = 60;
const PASSWORD_MIN_LENGTH = 6;

type Step = "intro" | "kode" | "password" | "sukses";

function countdown(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function maskPhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 4 ? `****${digits.slice(-4)}` : digits;
}

const inputClass =
  "w-full rounded-2xl border border-[#D8D8D8] bg-white px-4 py-3.5 text-sm md:text-base font-semibold outline-none focus:border-[#000000]";

export default function ChangePasswordFlow({
  email,
  whatsapp,
}: {
  email: string;
  whatsapp: string;
}) {
  const [step, setStep] = useState<Step>("intro");
  const locale = useSafeLocale();
  const profileHref = `/${locale}/akun/profil`;
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [otpDeadline, setOtpDeadline] = useState(0);
  const [resendAt, setResendAt] = useState(0);

  useEffect(() => {
    if (step !== "kode") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);

  const otpLeft = Math.max(0, Math.ceil((otpDeadline - now) / 1000));
  const resendLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const target = maskPhone(whatsapp);

  async function requestCode(isResend = false) {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/lupa-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Gagal mengirim kode. Coba lagi.");
        return;
      }

      const start = Date.now();
      setNow(start);
      setOtpDeadline(start + OTP_SECONDS * 1000);
      setResendAt(start + RESEND_SECONDS * 1000);
      setCode("");
      setStep("kode");
      setNotice(
        isResend
          ? "Kode baru sudah dikirim. Cek WhatsApp kamu."
          : `Kode 6 digit sudah dikirim ke WhatsApp ${target}.`,
      );
    } catch {
      setError("Tidak bisa menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (code.length !== 6) {
      setError("Kode harus 6 digit.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verifikasi-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error || "Kode salah atau sudah kedaluwarsa.");
        if (json.expired) setResendAt(0);
        return;
      }

      setResetToken(json.resetToken);
      setStep("password");
    } catch {
      setError("Tidak bisa menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password minimal ${PASSWORD_MIN_LENGTH} karakter.`);
      return;
    }
    if (password !== confirm) {
      setError("Ulangi password belum sama.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error || "Gagal menyimpan password baru.");
        return;
      }

      setPassword("");
      setConfirm("");
      setStep("sukses");
    } catch {
      setError("Tidak bisa menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (!email) {
    return (
      <div className="rounded-2xl border border-[#F3D6D3] bg-[#FDECEC] px-4 py-3 text-[12.5px] text-[#b3261e]">
        Email akun tidak terbaca. Muat ulang halaman lalu coba lagi.
      </div>
    );
  }

  if (!whatsapp) {
    return (
      <div className="rounded-2xl border border-[#F3D6D3] bg-[#FDECEC] px-4 py-3.5 text-[12.5px] leading-relaxed text-[#b3261e]">
        Nomor WhatsApp belum diisi di profil, jadi kode OTP tidak bisa dikirim.
        <Link href={profileHref} className="ml-1 font-bold underline">
          Isi nomor dulu
        </Link>
        .
      </div>
    );
  }

  return (
    <div>
      {step === "intro" && (
        <div>
          <div className="flex items-start gap-3 rounded-2xl border border-[#EDE7DC] bg-[#faf8f4] px-4 py-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px]" style={{ background: "#e3ede9" }}>
              <ShieldCheck size={17} strokeWidth={1.8} style={{ color: "#000000" }} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold" style={{ color: "#000000" }}>
                Verifikasi lewat WhatsApp
              </p>
              <p className="text-[11.5px] leading-relaxed text-[#777777] mt-0.5">
                Kami akan mengirim kode 6 digit ke nomor WhatsApp yang terdaftar ({target}).
              </p>
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <button
            type="button"
            onClick={() => requestCode()}
            disabled={loading}
            className="mt-5 w-full py-4 rounded-full font-extrabold text-sm md:text-base text-white transition active:scale-[.99] disabled:opacity-60"
            style={{ background: "#000000" }}
          >
            {loading ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
            Kirim kode WhatsApp
          </button>
        </div>
      )}

      {step === "kode" && (
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="rounded-2xl border border-[#EDE7DC] bg-[#faf8f4] px-4 py-3 text-[12.5px] leading-relaxed" style={{ color: "#000000" }}>
            {notice || `Masukkan kode yang dikirim ke WhatsApp ${target}.`}
          </div>

          <div>
            <label className="block text-xs md:text-sm font-bold text-[#777777] mb-1.5">Kode Verifikasi</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className={`${inputClass} text-center tracking-[0.5em] font-mono`}
              style={{ color: "#000000" }}
              required
            />
            <div className="flex items-center justify-between mt-2 text-[11.5px] text-[#9aa5a1]">
              <span>{otpLeft > 0 ? `Berlaku ${countdown(otpLeft)}` : "Kode sudah kedaluwarsa"}</span>
              <button
                type="button"
                onClick={() => requestCode(true)}
                disabled={loading || resendLeft > 0}
                className="font-bold disabled:opacity-40"
                style={{ color: "#000000" }}
              >
                {resendLeft > 0 ? `Kirim ulang (${resendLeft})` : "Kirim ulang kode"}
              </button>
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-full font-extrabold text-sm md:text-base text-white transition active:scale-[.99] disabled:opacity-60"
            style={{ background: "#000000" }}
          >
            {loading ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
            Verifikasi kode
          </button>

          <button
            type="button"
            onClick={() => { setStep("intro"); setCode(""); setError(""); setNotice(""); }}
            className="w-full text-[12px] font-bold text-[#777777]"
          >
            Kirim ulang dari awal
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handlePassword} className="space-y-4">
          <div>
            <label className="block text-xs md:text-sm font-bold text-[#777777] mb-1.5">Password Baru</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa5a1]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                autoComplete="new-password"
                className={`${inputClass} pl-10`}
                style={{ color: "#000000" }}
                required
                minLength={PASSWORD_MIN_LENGTH}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs md:text-sm font-bold text-[#777777] mb-1.5">Ulangi Password Baru</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9aa5a1]" />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Ulangi password baru"
                autoComplete="new-password"
                className={`${inputClass} pl-10`}
                style={{ color: "#000000" }}
                required
                minLength={PASSWORD_MIN_LENGTH}
              />
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-full font-extrabold text-sm md:text-base text-white transition active:scale-[.99] disabled:opacity-60"
            style={{ background: "#000000" }}
          >
            {loading ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
            Simpan Password
          </button>
        </form>
      )}

      {step === "sukses" && (
        <div className="text-center py-3">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full" style={{ background: "#e3ede9", color: "#000000" }}>
            <ShieldCheck size={22} />
          </div>
          <p className="text-sm font-extrabold" style={{ color: "#000000" }}>
            Password berhasil diubah
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#777777]">
            Gunakan password baru saat masuk berikutnya. Sesi di perangkat ini tetap aktif.
          </p>
          <Link
            href={profileHref}
            className="mt-5 inline-block w-full rounded-full py-4 text-sm font-extrabold text-white"
            style={{ background: "#000000" }}
          >
            Kembali ke Profil
          </Link>
        </div>
      )}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-[#F3D6D3] bg-[#FDECEC] px-4 py-3 text-[12.5px] leading-relaxed text-[#b3261e]">
      {children}
    </div>
  );
}
