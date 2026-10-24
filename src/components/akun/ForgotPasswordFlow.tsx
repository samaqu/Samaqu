"use client";

/**
 * Alur "Lupa password" customer: email → kode OTP WhatsApp → password baru.
 *
 * Dipakai di dua tempat:
 * - halaman `/akun/lupa-password` (tanpa `onAuthenticated`, langsung ke dashboard), dan
 * - gerbang `StepAuth` pada Open Order (inline, supaya keranjang tidak hilang).
 *
 * Setelah password diganti, komponen mencoba login otomatis. Kalau berhasil, pemanggil
 * `onAuthenticated` dipakai untuk melanjutkan langkah berikutnya; kalau gagal, customer
 * diarahkan masuk manual.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSafeLocale } from "@/lib/safe-i18n";

type Step = "email" | "kode" | "password" | "sukses";

const OTP_SECONDS = 5 * 60;
const RESEND_SECONDS = 60;
const PASSWORD_MIN_LENGTH = 6;

function countdown(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const inputStyle = {
  border: "1px solid rgba(0,0,0,.15)",
  background: "white",
  color: "var(--espresso)",
  "--tw-ring-color": "var(--gold)",
} as React.CSSProperties;

export default function ForgotPasswordFlow({
  onAuthenticated,
  onCancel,
  showTitle = true,
}: {
  /** Dipanggil setelah password diganti DAN login otomatis berhasil. */
  onAuthenticated?: () => void | Promise<void>;
  /** Kalau diisi, tampil tombol kembali (dipakai mode inline). */
  onCancel?: () => void;
  showTitle?: boolean;
}) {
  const router = useRouter();
  const locale = useSafeLocale();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
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

  async function requestCode(isResend = false) {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/lupa-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
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
          : json.message ||
              "Kalau email ini terdaftar, kode 6 digit sudah dikirim ke WhatsApp kamu.",
      );
    } catch {
      setError("Tidak bisa menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Format email tidak valid.");
      return;
    }
    await requestCode();
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
        body: JSON.stringify({ email: email.trim(), code }),
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
    setNotice("");

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

      // Password sudah diganti — coba langsung masuk supaya alurnya tidak berhenti.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!signInError) {
        if (onAuthenticated) await onAuthenticated();
        else router.replace(`/${locale}/akun`);
        return;
      }

      setStep("sukses");
    } catch {
      setError("Tidak bisa menghubungi server. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setResetToken("");
    setError("");
    setNotice("");
  }

  return (
    <div>
      {showTitle && (
        <>
          <h2
            className="text-2xl font-medium mb-2"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}
          >
            Lupa Password
          </h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            {step === "email" && "Masukkan email akun. Kode akan dikirim ke WhatsApp yang terdaftar."}
            {step === "kode" && "Masukkan 6 digit kode yang dikirim ke WhatsApp kamu."}
            {step === "password" && "Buat password baru untuk akun SAMAQU kamu."}
            {step === "sukses" && "Password berhasil diganti."}
          </p>
        </>
      )}

      {step === "email" && (
        <form onSubmit={handleEmail} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--espresso)" }}>
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                autoComplete="email"
                className="w-full rounded-xl pl-10 pr-4 py-3.5 text-sm outline-none transition-all focus:ring-2"
                style={inputStyle}
                required
              />
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <SubmitButton loading={loading}>Kirim kode WhatsApp</SubmitButton>
        </form>
      )}

      {step === "kode" && (
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="rounded-xl px-4 py-3 text-[12.5px] leading-relaxed" style={{ background: "#f8f5ef", color: "var(--espresso)" }}>
            {notice || "Cek WhatsApp kamu untuk kode verifikasi."}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--espresso)" }}>
              Kode verifikasi
            </label>
            <div className="relative">
              <ShieldCheck size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="w-full rounded-xl pl-10 pr-4 py-3.5 text-sm tracking-[0.4em] outline-none transition-all focus:ring-2 font-mono"
                style={inputStyle}
                required
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              <span>{otpLeft > 0 ? `Berlaku ${countdown(otpLeft)}` : "Kode sudah kedaluwarsa"}</span>
              <button
                type="button"
                onClick={() => requestCode(true)}
                disabled={loading || resendLeft > 0}
                className="font-semibold disabled:opacity-40"
                style={{ color: "var(--gold)" }}
              >
                {resendLeft > 0 ? `Kirim ulang (${resendLeft})` : "Kirim ulang kode"}
              </button>
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <SubmitButton loading={loading}>Verifikasi kode</SubmitButton>

          <button
            type="button"
            onClick={backToEmail}
            className="w-full text-[12px] font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            Ganti email
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handlePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--espresso)" }}>
              Password baru
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                autoComplete="new-password"
                className="w-full rounded-xl pl-10 pr-4 py-3.5 text-sm outline-none transition-all focus:ring-2"
                style={inputStyle}
                required
                minLength={PASSWORD_MIN_LENGTH}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--espresso)" }}>
              Ulangi password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Ulangi password baru"
                autoComplete="new-password"
                className="w-full rounded-xl pl-10 pr-4 py-3.5 text-sm outline-none transition-all focus:ring-2"
                style={inputStyle}
                required
                minLength={PASSWORD_MIN_LENGTH}
              />
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <SubmitButton loading={loading}>Simpan password</SubmitButton>
        </form>
      )}

      {step === "sukses" && (
        <div className="text-center py-4">
          <div className="mx-auto w-12 h-12 rounded-full grid place-items-center mb-4" style={{ background: "#eef7ee", color: "#2f7d32" }}>
            <ShieldCheck size={22} />
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--espresso)" }}>
            Password berhasil diganti
          </p>
          <p className="text-[12.5px] mb-5" style={{ color: "var(--text-muted)" }}>
            Silakan masuk memakai password baru kamu.
          </p>
          <Link
            href={`/${locale}/akun/login`}
            className="inline-block w-full py-3.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "var(--espresso)" }}
          >
            Masuk sekarang
          </Link>
        </div>
      )}

      {step !== "sukses" && (
        <div className="mt-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          {onCancel ? (
            <button type="button" onClick={onCancel} className="font-semibold" style={{ color: "var(--gold)" }}>
              Kembali ke Masuk
            </button>
          ) : (
            <Link href={`/${locale}/akun/login`} className="font-semibold" style={{ color: "var(--gold)" }}>
              Kembali ke Masuk
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-[13px]"
      style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}
    >
      {children}
    </div>
  );
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
      style={{ background: "var(--espresso)", boxShadow: "0 4px 14px -4px rgba(0,0,0,.4)" }}
    >
      {loading ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
      {children}
    </button>
  );
}
