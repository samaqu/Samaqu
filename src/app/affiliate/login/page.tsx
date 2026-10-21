"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/affiliate/AuthLayout";
import { useToast } from "@/components/affiliate/ui";
import { supabaseAffiliate as supabase } from "@/lib/supabase-affiliate";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";

/**
 * Halaman masuk portal affiliate — wireframe "Dark Slanted Auth" (1:1).
 */
const INPUT =
  "w-full h-12 rounded-[10px] border bg-white pl-11 pr-4 text-[14px] font-medium text-[#111827] placeholder:text-[#9ca3af] outline-none transition focus:border-[#1f6274] focus:ring-2 focus:ring-[#1f6274]/15";
const INPUT_BORDER = { borderColor: "#e5e7eb" };
const INPUT_ERROR = { borderColor: "#ef4444" };

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
        setErr({ form: "Email belum diverifikasi. Cek inbox email Anda untuk link verifikasi." });
      } else {
        setErr({ form: msg });
      }
      return;
    }

    router.push("/affiliate");
    router.refresh();
  };

  const forgotPassword = async () => {
    if (!email.trim()) {
      setErr({ email: "Isi email dulu untuk kirim tautan reset kata sandi." });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/affiliate`,
    });
    if (error) {
      toast(error.message || "Gagal mengirim tautan reset.", "err");
      return;
    }
    toast("Tautan reset kata sandi dikirim ke email kamu.");
  };

  return (
    <AuthLayout
      title="Masuk ke portal affiliate"
      subtitle="Gunakan email dan kata sandi akun affiliate kamu."
      heroTitle="Tumbuh bareng SAMAQU."
      heroSubtitle="Bagikan produk ke audiensmu, dapatkan komisi dari setiap pesanan."
      footerLink={{
        text: "Belum punya akun affiliate?",
        link: portalPath(base, "daftar"),
        linkLabel: "Daftar di sini",
      }}
      aside={
        <button
          type="button"
          onClick={forgotPassword}
          className="text-[12px] font-medium text-[#6b7280] hover:text-[#111827] hover:underline"
        >
          Lupa kata sandi?
        </button>
      }
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
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#111827]">
            Email
          </label>
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <input
              type="email"
              placeholder="nama@email.com"
              className={INPUT}
              style={err.email ? INPUT_ERROR : INPUT_BORDER}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          {err.email ? <p className="mt-1 text-[11px] text-red-600">{err.email}</p> : null}
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#111827]">
            Password
          </label>
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              type={show ? "text" : "password"}
              placeholder="••••••••"
              className={INPUT}
              style={err.pw ? INPUT_ERROR : INPUT_BORDER}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#111827]"
              aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                {show ? (
                  <>
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <>
                    <path d="M17.94 17.94A10.6 10.6 0 0 1 12 19c-6.5 0-10-7-10-7a19.2 19.2 0 0 1 5.06-5.94M9.9 4.24A10.6 10.6 0 0 1 12 4c6.5 0 10 7 10 7a19.6 19.6 0 0 1-2.16 3.19" />
                    <path d="M1 1l22 22" />
                  </>
                )}
              </svg>
            </button>
          </div>
          {err.pw ? <p className="mt-1 text-[11px] text-red-600">{err.pw}</p> : null}
        </div>

        <button
          type="submit"
          disabled={busy}
          style={{ color: "#ffffff" }}
          className="mt-2 h-12 w-full rounded-[10px] bg-[#1f6274] text-[14px] font-bold transition-colors hover:bg-[#194f5e] disabled:opacity-60"
        >
          {busy ? "Memproses…" : "Masuk"}
        </button>
      </form>
    </AuthLayout>
  );
}
