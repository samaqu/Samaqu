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

  const forgotPassword = async () => {
    if (!email.trim()) {
      setErr({ email: "Isi email dulu untuk kirim tautan reset kata sandi." });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${portalPath(base, "login")}`,
    });
    if (error) {
      toast(error.message || "Gagal mengirim tautan reset.", "err");
      return;
    }
    toast("Tautan reset kata sandi dikirim ke email kamu.");
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
              className="text-sm font-semibold text-black underline-offset-4 hover:underline"
            >
              Lupa kata sandi?
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
