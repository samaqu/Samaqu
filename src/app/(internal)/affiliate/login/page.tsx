"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthLayout from "@/components/affiliate/AuthLayout";
import { useToast } from "@/components/affiliate/ui";
import { supabaseAffiliate as supabase } from "@/lib/supabase-affiliate";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";

/**
 * Halaman masuk portal affiliate — port 1:1 dari mockup "pages/masuk".
 * Autentikasi tetap memakai Supabase Auth yang sama dengan toko & dashboard.
 */
function Arrow() {
  return (
    <span className="arr" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

export default function AffiliateLoginPage() {
  const router = useRouter();
  // Prefix path portal: "" di affiliate.samaqu.id, "/affiliate" di domain utama.
  const [base, setBase] = useState("/affiliate");
  useEffect(() => {
    setBase(portalBaseFor(window.location.hostname));
  }, []);

  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<{ email?: string; pw?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  // Tautan reset kata sandi dari email mendarat di sini dengan token di alamat (#access_token=...&type=recovery).
  // Klien affiliate sengaja detectSessionInUrl:false, jadi tokennya dipasang manual, lalu orangnya membuat kata sandi baru.
  const [recovery, setRecovery] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [recBusy, setRecBusy] = useState(false);
  const [recErr, setRecErr] = useState("");
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const clearHash = () => window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (params.get("error")) {
      setErr({ form: "Tautan reset kata sandi sudah kedaluwarsa atau sudah dipakai. Klik \"Lupa kata sandi?\" untuk meminta tautan baru." });
      clearHash();
      return;
    }
    const access = params.get("access_token");
    const refresh = params.get("refresh_token");
    if (params.get("type") !== "recovery" || !access || !refresh) return;
    clearHash();
    void supabase.auth.setSession({ access_token: access, refresh_token: refresh }).then(({ error }) => {
      if (error) setErr({ form: "Tautan reset kata sandi tidak valid. Klik \"Lupa kata sandi?\" untuk meminta tautan baru." });
      else setRecovery(true);
    });
  }, []);

  const saveNewPassword = async () => {
    if (newPw.length < 8 || !/\d/.test(newPw) || !/[a-zA-Z]/.test(newPw)) {
      setRecErr("Kata sandi minimal 8 karakter, kombinasi huruf dan angka.");
      return;
    }
    if (newPw !== newPw2) {
      setRecErr("Konfirmasi kata sandi tidak sama.");
      return;
    }
    setRecBusy(true);
    setRecErr("");
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setRecBusy(false);
    if (error) {
      setRecErr(error.message || "Gagal menyimpan kata sandi baru.");
      return;
    }
    toast("Kata sandi baru tersimpan.");
    router.push(portalPath(base));
    router.refresh();
  };

  const submit = async () => {
    const next: typeof err = {};
    if (!email.trim()) next.email = "Email wajib diisi.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Format email tidak valid.";
    if (!password) next.pw = "Kata sandi wajib diisi.";

    setErr(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (error) {
      const msg = error.message || "";
      if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("credential")) {
        setErr({ pw: "Email atau kata sandi salah." });
      } else if (msg.toLowerCase().includes("confirm") || msg.toLowerCase().includes("verified")) {
        setErr({ form: "Email belum diverifikasi. Cek inbox email kamu untuk link verifikasi." });
      } else {
        setErr({ form: msg });
      }
      return;
    }

    router.push(portalPath(base));
    router.refresh();
  };

  // Reset lewat kode: email berisi kode (dan tombol); kode dimasukkan di sini lalu orangnya membuat kata sandi baru.
  // Jeda kirim ulang 60 detik: setiap permintaan baru membatalkan kode/tautan sebelumnya, jadi menekan berkali-kali
  // justru membuat semua email lama tidak berlaku.
  const RESEND_SECONDS = 60;
  const [forgotStep, setForgotStep] = useState<"none" | "code">("none");
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const forgotPassword = async () => {
    if (sending || cooldown > 0) return;
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErr({ email: "Isi email yang benar dulu untuk kirim kode reset kata sandi." });
      return;
    }
    setErr({});
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${portalPath(base, "login")}`,
    });
    setSending(false);
    if (error) {
      const wait = /(\d+)\s*seconds?/i.exec(error.message || "");
      if (/rate|security purposes|only request/i.test(error.message || "")) {
        setCooldown(wait ? Number(wait[1]) + 1 : 15);
        toast("Terlalu cepat. Tunggu sebentar lalu coba lagi.", "err");
      } else {
        toast(error.message || "Gagal mengirim kode reset.", "err");
      }
      return;
    }
    setCooldown(RESEND_SECONDS);
    setCode("");
    setCodeErr("");
    setForgotStep("code");
    toast("Kode reset dikirim ke email kamu.");
  };

  const verifyCode = async () => {
    const token = code.replace(/\D/g, "");
    if (token.length < 6) {
      setCodeErr("Masukkan kode dari email (6 digit).");
      return;
    }
    setCodeBusy(true);
    setCodeErr("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "recovery" });
    setCodeBusy(false);
    if (error) {
      setCodeErr("Kode salah atau sudah tidak berlaku. Pakai kode dari email yang PALING BARU, atau kirim ulang kode.");
      return;
    }
    // Sesi sudah terpasang oleh verifyOtp: lanjut ke layar kata sandi baru.
    setForgotStep("none");
    setRecovery(true);
  };

  return (
    <AuthLayout
      backHref={portalPath(base)}
      eyebrow="Masuk affiliate"
      title="Masuk ke akunmu"
      subtitle={
        <>
          Belum punya akun?{" "}
          <Link
            href={portalPath(base, "daftar")}
            className="font-semibold text-black underline underline-offset-4"
          >
            Daftar jadi affiliate
          </Link>
        </>
      }
      visualImage="/affiliate/mockup/visual-login.png"
      visualImageAlt="Model mengenakan thobe SAMAQU warna cokelat"
      visualEyebrow="SAMAQU Affiliate"
      visualTitle={
        <>
          Selamat datang kembali, <span className="serif font-normal">partner.</span>
        </>
      }
      visualText="Cek performa link referral, riwayat transaksi, dan status komisimu dalam satu dashboard."
    >
      {recovery ? (
        <form
          className="mt-10 grid gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void saveNewPassword();
          }}
        >
          <div className="notice" role="status">
            Buat kata sandi baru untuk akun affiliate-mu. Setelah tersimpan kamu langsung masuk ke portal.
          </div>
          {recErr ? (
            <div className="notice" role="alert" style={{ background: "#fef2f2", color: "#b42318" }}>
              {recErr}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="r-pw">Kata sandi baru</label>
            <input
              id="r-pw"
              type={show ? "text" : "password"}
              className="input"
              placeholder="Minimal 8 karakter, huruf dan angka"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="r-pw2">Ulangi kata sandi baru</label>
            <input
              id="r-pw2"
              type={show ? "text" : "password"}
              className="input"
              autoComplete="new-password"
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
            />
          </div>
          <label className="check">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Tampilkan kata sandi
          </label>
          <button type="submit" className="btn btn-primary w-full mt-2" disabled={recBusy}>
            {recBusy ? "Menyimpan…" : "Simpan kata sandi baru"} <Arrow />
          </button>
        </form>
      ) : forgotStep === "code" ? (
        <form
          className="mt-10 grid gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void verifyCode();
          }}
        >
          <div className="notice" role="status">
            Email reset dikirim ke <b>{email.trim()}</b>. Buka email <b>yang paling baru</b> (cek juga folder Spam), lalu masukkan kodenya di bawah. Kalau di email hanya ada tombol, klik tombolnya. Kode dan tombol dari email yang lebih lama tidak berlaku lagi.
          </div>
          {codeErr ? (
            <div className="notice" role="alert" style={{ background: "#fef2f2", color: "#b42318" }}>
              {codeErr}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="c-code">Kode dari email</label>
            <input
              id="c-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="input"
              placeholder="123456"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <button type="submit" className="btn btn-primary w-full mt-2" disabled={codeBusy}>
            {codeBusy ? "Memeriksa…" : "Lanjut"} <Arrow />
          </button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="font-semibold text-black underline-offset-4 hover:underline disabled:opacity-50 disabled:no-underline"
              onClick={forgotPassword}
              disabled={sending || cooldown > 0}
            >
              {cooldown > 0 ? `Kirim ulang kode (${cooldown} dtk)` : sending ? "Mengirim…" : "Kirim ulang kode"}
            </button>
            <button type="button" className="underline-offset-4 hover:underline" onClick={() => setForgotStep("none")}>
              Kembali masuk
            </button>
          </div>
        </form>
      ) : (
      <form
        className="mt-10 grid gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {err.form ? (
          <div
            className="notice"
            role="alert"
            style={{ background: "#fef2f2", color: "#b42318" }}
          >
            {err.form}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="l-email">Email</label>
          <input
            id="l-email"
            type="email"
            className="input"
            placeholder="nama@email.com"
            autoComplete="email"
            value={email}
            aria-invalid={Boolean(err.email)}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="err" aria-live="polite">
            {err.email || ""}
          </span>
        </div>

        <div className="field">
          <div className="flex justify-between items-center">
            <label htmlFor="l-pw">Kata sandi</label>
            <button
              type="button"
              onClick={forgotPassword}
              disabled={sending || cooldown > 0}
              className="text-sm font-semibold text-black underline-offset-4 hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {sending ? "Mengirim…" : cooldown > 0 ? `Tunggu ${cooldown} dtk` : "Lupa kata sandi?"}
            </button>
          </div>
          <div className="pw-wrap">
            <input
              id="l-pw"
              type={show ? "text" : "password"}
              className="input pr-28"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              aria-invalid={Boolean(err.pw)}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="pw-toggle"
              aria-pressed={show}
              onClick={() => setShow((v) => !v)}
            >
              {show ? "Sembunyikan" : "Lihat"}
            </button>
          </div>
          <span className="err" aria-live="polite">
            {err.pw || ""}
          </span>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />{" "}
          Ingat saya di perangkat ini
        </label>

        <button type="submit" className="btn btn-primary w-full mt-2" disabled={busy}>
          {busy ? "Memproses…" : "Masuk"} <Arrow />
        </button>
      </form>
      )}

      <div className="notice mt-10">
        <svg
          className="flex-none mt-0.5"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#000"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
        <span>Akun baru bisa digunakan setelah pendaftaran disetujui admin.</span>
      </div>
    </AuthLayout>
  );
}
