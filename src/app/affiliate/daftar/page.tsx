"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthLayout from "@/components/affiliate/AuthLayout";
import { useToast } from "@/components/affiliate/ui";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";

/**
 * Pendaftaran akun affiliate — port 1:1 dari mockup "pages/daftar".
 * Data tetap dikirim ke /api/affiliate/register (akun auth + profil affiliate
 * berstatus "menunggu" sampai disetujui admin).
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

export default function AffiliateRegisterPage() {
  // Prefix path portal: "" di affiliate.samaqu.id, "/affiliate" di domain utama.
  const [base, setBase] = useState("/affiliate");
  useEffect(() => {
    setBase(portalBaseFor(window.location.hostname));
  }, []);

  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [tos, setTos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = async () => {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 3) next.name = "Masukkan nama lengkap.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Masukkan email yang valid.";
    if (!/^0\d{8,13}$/.test(phone.replace(/\D/g, ""))) {
      next.phone = "Nomor telepon harus diawali 0 dan berisi 9–14 digit.";
    }
    if (!orderNumber.trim()) next.order = "Masukkan nomor pesanan sebagai bukti pembelian.";
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      next.pw = "Minimal 8 karakter, kombinasi huruf dan angka.";
    }
    if (!tos) next.tos = "Setujui syarat & ketentuan untuk melanjutkan.";

    setErr(next);
    if (Object.keys(next).length) {
      toast("Periksa kembali formulir pendaftaran", "err");
      return;
    }

    setBusy(true);
    try {
      // Syarat bergabung: minimal 1 pembelian valid, dicek server dari data pesanan.
      const eligibilityRes = await fetch("/api/affiliate/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), phone: phone.trim() }),
      });
      const eligibility = await eligibilityRes.json().catch(() => null);
      if (eligibility?.status === "not_eligible") {
        setErr({
          form: "Riwayat pembelianmu belum valid (pesanan dibatalkan/refund). Silakan lakukan pembelian pertama dulu sebelum mendaftar affiliate.",
        });
        return;
      }

      const res = await fetch("/api/affiliate/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          orderNumber: orderNumber.trim(),
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

      setSuccess(true);
      toast(
        json?.eligibility?.status === "needs_verification"
          ? "Pendaftaran terkirim. Riwayat pembelianmu akan diverifikasi admin."
          : "Pendaftaran berhasil, menunggu persetujuan admin.",
      );
    } catch {
      setErr({ form: "Gagal terhubung ke server." });
      toast("Gagal terhubung ke server", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      backHref={portalPath(base)}
      eyebrow="Langkah 2 dari 4 · Pendaftaran"
      title="Daftar jadi affiliate"
      subtitle={
        <>
          Sudah punya akun?{" "}
          <Link
            href={portalPath(base, "login")}
            className="font-semibold text-black underline underline-offset-4"
          >
            Masuk
          </Link>
        </>
      }
      topSlot={
        <div className="stepper mb-8" aria-hidden="true">
          <span className="on" />
          <span className="on" />
          <span />
          <span />
        </div>
      }
      visualImage="/affiliate/mockup/visual-cta.png"
      visualImageAlt="Model mengenakan vest putih dan thobe cokelat SAMAQU"
      visualPosition="50% 25%"
      visualEyebrow="Gabung affiliate"
      visualTitle={
        <>
          Rekomendasimu, <span className="serif font-normal">penghasilan tambahanmu.</span>
        </>
      }
      visualList={[
        "Beli minimal satu produk SAMAQU",
        "Isi formulir pendaftaran ini",
        "Tunggu verifikasi & persetujuan admin",
        "Bagikan link referral, raih komisi",
      ]}
    >
      {!success ? (
        <div className="notice mt-8">
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
            <path d="M6 7h12l-1 13H7L6 7z" />
            <path d="M9 7a3 3 0 0 1 6 0" />
          </svg>
          <span>
            <b>Syarat wajib:</b> kamu harus sudah membeli minimal satu produk SAMAQU. Belum beli?{" "}
            <a
              href="https://www.samaqu.id/id/katalog"
              className="font-semibold underline underline-offset-4"
            >
              Lihat koleksi
            </a>
          </span>
        </div>
      ) : null}

      {success ? (
        <div className="success show mt-10">
          <div className="w-14 h-14 rounded-full bg-black text-white flex items-center justify-center mb-6">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </div>
          <h2 tabIndex={-1} className="display text-3xl sm:text-4xl">
            Pendaftaranmu sudah kami terima.
          </h2>
          <p className="mt-3 leading-relaxed" style={{ color: "var(--c-text-2)" }}>
            Tim SAMAQU akan memverifikasi data dan bukti pembelianmu. Kamu akan dihubungi
            setelah akun disetujui dan aktif.
          </p>
          <Link href={portalPath(base, "login")} className="btn btn-outline mt-6">
            Masuk ke akun affiliate
          </Link>
        </div>
      ) : (
        <form
          className="mt-8 grid gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {err.form ? (
            <div className="notice" role="alert" style={{ background: "#fef2f2", color: "#b42318" }}>
              {err.form}
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="d-nama">Nama lengkap</label>
            <input
              id="d-nama"
              className="input"
              placeholder="Nama sesuai identitas"
              autoComplete="name"
              value={fullName}
              aria-invalid={Boolean(err.name)}
              onChange={(e) => setFullName(e.target.value)}
            />
            <span className="err" aria-live="polite">{err.name || ""}</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            <div className="field">
              <label htmlFor="d-email">Email</label>
              <input
                id="d-email"
                type="email"
                className="input"
                placeholder="nama@email.com"
                autoComplete="email"
                value={email}
                aria-invalid={Boolean(err.email)}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="err" aria-live="polite">{err.email || ""}</span>
            </div>
            <div className="field">
              <label htmlFor="d-wa">No. WhatsApp</label>
              <input
                id="d-wa"
                type="tel"
                className="input"
                placeholder="08xxxxxxxxxx"
                autoComplete="tel"
                value={phone}
                aria-invalid={Boolean(err.phone)}
                onChange={(e) => setPhone(e.target.value)}
              />
              <span className="err" aria-live="polite">{err.phone || ""}</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="d-order">Nomor pesanan SAMAQU</label>
            <input
              id="d-order"
              className="input"
              placeholder="Contoh: SMQ-000000"
              value={orderNumber}
              aria-invalid={Boolean(err.order)}
              onChange={(e) => setOrderNumber(e.target.value)}
            />
            <span className="text-xs" style={{ color: "var(--c-muted)" }}>
              Dipakai admin untuk memverifikasi syarat pembelian.
            </span>
            <span className="err" aria-live="polite">{err.order || ""}</span>
          </div>

          <div className="field">
            <label htmlFor="d-pw">Buat kata sandi</label>
            <div className="pw-wrap">
              <input
                id="d-pw"
                type={show ? "text" : "password"}
                className="input pr-28"
                placeholder="Minimal 8 karakter"
                autoComplete="new-password"
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
            <span className="err" aria-live="polite">{err.pw || ""}</span>
          </div>

          <label className="check" htmlFor="d-agree">
            <input
              id="d-agree"
              type="checkbox"
              checked={tos}
              aria-invalid={Boolean(err.tos)}
              onChange={(e) => setTos(e.target.checked)}
            />{" "}
            <span>
              Saya menyetujui{" "}
              <Link
                href={portalPath(base, "syarat-ketentuan")}
                target="_blank"
                rel="noopener"
                className="font-semibold text-black underline underline-offset-4"
              >
                syarat &amp; ketentuan
              </Link>{" "}
              program SAMAQU Affiliate dan memahami akun akan aktif setelah disetujui admin.
            </span>
          </label>
          <span className="err -mt-3" aria-live="polite">{err.tos || ""}</span>

          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Mengirim…" : "Ajukan Pendaftaran"} <Arrow />
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
