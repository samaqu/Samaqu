"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/affiliate/ui";
import { portalBaseFor, portalPath } from "@/lib/affiliate/site";
import s from "./register.module.css";

/**
 * Pendaftaran akun affiliate — port 1:1 dari mockup "pages/daftar".
 * Data tetap dikirim ke /api/affiliate/register (akun auth + profil affiliate
 * berstatus "menunggu" sampai disetujui admin).
 */
const CHANNELS = ["Instagram", "TikTok", "WhatsApp", "Facebook", "Lainnya"] as const;

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
  const [channel, setChannel] = useState("");
  const [channelOther, setChannelOther] = useState("");
  const [handle, setHandle] = useState("");
  const [contentNote, setContentNote] = useState("");
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
    const resolvedChannel = channel === "Lainnya" ? channelOther.trim() : channel;
    if (!resolvedChannel) next.channel = "Pilih channel utama.";
    if (channel === "Lainnya" && resolvedChannel.length > 0 && resolvedChannel.length < 2) {
      next.channelOther = "Sebutkan nama channel-nya.";
    }
    if (handle.trim().length < 2) next.handle = "Isi username atau link akunmu.";
    if (contentNote.trim().length > 600) next.content = "Cerita konten maksimal 600 karakter.";
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
          primaryChannel: channel === "Lainnya" ? channelOther.trim() : channel,
          channelHandle: handle.trim(),
          contentDescription: contentNote.trim(),
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
    <div className="af-public">
      <div className={s.layout}>
        <aside className={`${s.aside} on-dark`}>
          <div className={s.asideTop}>
            <Link
              href={portalPath(base)}
              className={s.brand}
              aria-label="SAMAQU, ke beranda"
            >
              SAMAQU
            </Link>
            <Link href={portalPath(base)} className={s.back}>
              ← Beranda
            </Link>
          </div>

          <span className={s.badge}>SAMAQU Affiliate Program</span>

          <p className={s.visualTitle}>
            Komisi hingga <span className={s.highlight}>20%</span>
            <span className={s.visualMuted}>dari setiap rekomendasi.</span>
          </p>

          <div className={s.stepsWrap}>
            <span className={s.thread} aria-hidden="true" />
            <ol className={s.steps}>
              <li className={s.step}>
                <span className={`${s.stepCircle} ${s.stepDone}`} aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12.5 9.5 17 19 7.5" />
                  </svg>
                </span>
                <span className={s.stepTextDone}>Beli minimal 1 produk SAMAQU</span>
              </li>
              <li className={s.step}>
                <span className={`${s.stepCircle} ${s.stepCurrent}`} aria-hidden="true">
                  02
                </span>
                <span className={s.stepTitleRow}>
                  <span className={s.stepTextActive}>Isi formulir pendaftaran</span>
                  <span className={s.hereBadge}>Kamu di sini</span>
                </span>
              </li>
              <li className={s.step}>
                <span className={s.stepCircle} aria-hidden="true">
                  03
                </span>
                <span className={s.stepTextTodo}>Verifikasi &amp; persetujuan admin</span>
              </li>
              <li className={s.step}>
                <span className={s.stepCircle} aria-hidden="true">
                  04
                </span>
                <span className={s.stepTextTodo}>Bagikan link, raih komisi</span>
              </li>
            </ol>
          </div>

          <p className={s.asideFine}>
            Gratis daftar · Tanpa stok · Cair ke rekening sendiri
          </p>

          <div className={s.mobileProgress}>
            <div className={s.progress} role="img" aria-label="Langkah 2 dari 4">
              <span className={`${s.progressSeg} ${s.progressDone}`} />
              <span className={`${s.progressSeg} ${s.progressCurrent}`} />
              <span className={s.progressSeg} />
              <span className={s.progressSeg} />
            </div>
            <p className={s.progressText}>Langkah 2 dari 4 · Isi formulir pendaftaran</p>
          </div>
        </aside>

        <main className={s.formPanel}>
          <div className={s.formShell}>
            <div className={s.formHead}>
              <h1 className={s.title}>Daftar jadi affiliate</h1>
              <p className={s.subtitle}>
                Sudah punya akun?{" "}
                <Link href={portalPath(base, "login")} className={s.loginLink}>
                  Masuk
                </Link>
              </p>
            </div>

            {!success ? (
              <div className={s.condition}>
                <span className={s.conditionIcon} aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 7h12l-1 13H7L6 7z" />
                    <path d="M9 7a3 3 0 0 1 6 0" />
                  </svg>
                </span>
                <p className={s.conditionText}>
                  <b>Syarat: sudah beli minimal 1 produk SAMAQU.</b>{" "}
                  <a
                    href="https://www.samaqu.id/id/katalog"
                    className={s.collectionLink}
                  >
                    Belum beli? Lihat koleksi
                  </a>
                </p>
              </div>
            ) : null}

            {success ? (
              <div className={s.success}>
                <div className={s.successIcon} aria-hidden="true">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                </div>
                <h2 tabIndex={-1} className={s.successTitle}>
                  Pendaftaranmu sudah kami terima.
                </h2>
                <p className={s.successText}>
                  Tim SAMAQU akan memverifikasi data dan bukti pembelianmu. Kamu akan dihubungi
                  setelah akun disetujui dan aktif.
                </p>
                <Link href={portalPath(base, "login")} className={s.successButton}>
                  Masuk ke akun affiliate
                </Link>
              </div>
            ) : (
              <form
                className={s.form}
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                {err.form ? (
                  <div className={s.formError} role="alert">
                    {err.form}
                  </div>
                ) : null}

                <div className={s.group}>
                  <div className={s.groupHead}>
                    <span className={s.groupNum} aria-hidden="true">
                      01
                    </span>
                    <span className={s.groupLabel}>DATA DIRI</span>
                  </div>

                  <div className={s.field}>
                    <label htmlFor="d-nama" className={s.label}>
                      Nama lengkap
                    </label>
                    <input
                      id="d-nama"
                      className={s.input}
                      placeholder="Nama sesuai identitas"
                      autoComplete="name"
                      value={fullName}
                      aria-invalid={Boolean(err.name)}
                      aria-describedby="d-nama-err"
                      onChange={(e) => setFullName(e.target.value)}
                    />
                    <span id="d-nama-err" className={s.error} aria-live="polite">
                      {err.name || ""}
                    </span>
                  </div>

                  <div className={s.twoCols}>
                    <div className={s.field}>
                      <label htmlFor="d-email" className={s.label}>
                        Email
                      </label>
                      <input
                        id="d-email"
                        type="email"
                        className={s.input}
                        placeholder="nama@email.com"
                        autoComplete="email"
                        value={email}
                        aria-invalid={Boolean(err.email)}
                        aria-describedby="d-email-err"
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <span id="d-email-err" className={s.error} aria-live="polite">
                        {err.email || ""}
                      </span>
                    </div>

                    <div className={s.field}>
                      <label htmlFor="d-wa" className={s.label}>
                        No. WhatsApp
                      </label>
                      <input
                        id="d-wa"
                        type="tel"
                        className={s.input}
                        placeholder="08xxxxxxxxxx"
                        autoComplete="tel"
                        value={phone}
                        aria-invalid={Boolean(err.phone)}
                        aria-describedby="d-wa-err"
                        onChange={(e) => setPhone(e.target.value)}
                      />
                      <span id="d-wa-err" className={s.error} aria-live="polite">
                        {err.phone || ""}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={s.group}>
                  <div className={s.groupHead}>
                    <span className={s.groupNum} aria-hidden="true">
                      02
                    </span>
                    <span className={s.groupLabel}>VERIFIKASI PEMBELIAN</span>
                  </div>

                  <div className={s.field}>
                    <label htmlFor="d-order" className={s.label}>
                      Nomor pesanan SAMAQU
                    </label>
                    <input
                      id="d-order"
                      className={s.input}
                      placeholder="Lihat di invoice pesananmu"
                      value={orderNumber}
                      aria-invalid={Boolean(err.order)}
                      aria-describedby="d-order-hint d-order-err"
                      onChange={(e) => setOrderNumber(e.target.value)}
                    />
                    <p id="d-order-hint" className={s.hint}>
                      Dipakai admin untuk mengecek syarat pembelian.
                    </p>
                    <span id="d-order-err" className={s.error} aria-live="polite">
                      {err.order || ""}
                    </span>
                  </div>
                </div>

                <div className={s.group}>
                  <div className={s.groupHead}>
                    <span className={s.groupNum} aria-hidden="true">
                      03
                    </span>
                    <span className={s.groupLabel}>CHANNEL PROMOSI</span>
                  </div>

                  <fieldset
                    className={s.chipsField}
                    aria-invalid={Boolean(err.channel)}
                    aria-describedby="d-channel-err"
                  >
                    <legend className={s.legend}>
                      Di mana kamu paling sering share?
                    </legend>
                    <div className={s.chips}>
                      {CHANNELS.map((c) => {
                        const id = `d-channel-${c.toLowerCase()}`;
                        return (
                          <label
                            key={c}
                            htmlFor={id}
                            className={`${s.chip} ${channel === c ? s.chipActive : ""}`}
                          >
                            <input
                              id={id}
                              type="radio"
                              name="d-channel"
                              value={c}
                              checked={channel === c}
                              onChange={(e) => setChannel(e.target.value)}
                              aria-invalid={Boolean(err.channel)}
                              aria-describedby="d-channel-err"
                              className={s.radio}
                            />
                            {c}
                          </label>
                        );
                      })}
                    </div>
                    <span id="d-channel-err" className={s.error} aria-live="polite">
                      {err.channel || ""}
                    </span>
                  </fieldset>

                  {channel === "Lainnya" ? (
                    <div className={s.field}>
                      <label htmlFor="d-channel-other" className={s.label}>
                        Sebutkan channel-nya
                      </label>
                      <input
                        id="d-channel-other"
                        className={s.input}
                        placeholder="Contoh: Podcast, Blog, Telegram"
                        value={channelOther}
                        aria-invalid={Boolean(err.channelOther)}
                        aria-describedby="d-channel-other-err"
                        onChange={(e) => setChannelOther(e.target.value)}
                      />
                      <span id="d-channel-other-err" className={s.error} aria-live="polite">
                        {err.channelOther || ""}
                      </span>
                    </div>
                  ) : null}

                  <div className={s.field}>
                    <label htmlFor="d-handle" className={s.label}>
                      Username atau link akun
                    </label>
                    <input
                      id="d-handle"
                      className={s.input}
                      placeholder="@username atau link profil"
                      value={handle}
                      aria-invalid={Boolean(err.handle)}
                      aria-describedby="d-handle-hint d-handle-err"
                      onChange={(e) => setHandle(e.target.value)}
                    />
                    <p id="d-handle-hint" className={s.hint}>
                      Supaya admin bisa melihat channel yang kamu pakai.
                    </p>
                    <span id="d-handle-err" className={s.error} aria-live="polite">
                      {err.handle || ""}
                    </span>
                  </div>

                  <div className={s.field}>
                    <div className={s.labelRow}>
                      <label htmlFor="d-content" className={s.label}>
                        Ceritakan sedikit tentang kontenmu
                      </label>
                      <span className={s.optional}>Opsional</span>
                    </div>
                    <textarea
                      id="d-content"
                      className={`${s.input} ${s.textarea}`}
                      rows={4}
                      maxLength={600}
                      placeholder="Contoh: konten outfit harian dan tips padu padan thobe untuk pria."
                      value={contentNote}
                      aria-invalid={Boolean(err.content)}
                      aria-describedby="d-content-err"
                      onChange={(e) => setContentNote(e.target.value)}
                    />
                    <span className={s.counter}>{contentNote.length}/600</span>
                    <span id="d-content-err" className={s.error} aria-live="polite">
                      {err.content || ""}
                    </span>
                  </div>
                </div>

                <div className={s.group}>
                  <div className={s.groupHead}>
                    <span className={s.groupNum} aria-hidden="true">
                      04
                    </span>
                    <span className={s.groupLabel}>BUAT AKUN</span>
                  </div>

                  <div className={s.field}>
                    <label htmlFor="d-pw" className={s.label}>
                      Kata sandi
                    </label>
                    <div className={s.pwWrap}>
                      <input
                        id="d-pw"
                        type={show ? "text" : "password"}
                        className={`${s.input} ${s.pwInput}`}
                        placeholder="Minimal 8 karakter"
                        autoComplete="new-password"
                        value={password}
                        aria-invalid={Boolean(err.pw)}
                        aria-describedby="d-pw-err"
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className={s.pwToggle}
                        aria-pressed={show}
                        onClick={() => setShow((v) => !v)}
                      >
                        {show ? "Sembunyikan" : "Lihat"}
                      </button>
                    </div>
                    <span id="d-pw-err" className={s.error} aria-live="polite">
                      {err.pw || ""}
                    </span>
                  </div>

                  <div className={s.field}>
                    <label className={s.tos} htmlFor="d-agree">
                      <input
                        id="d-agree"
                        type="checkbox"
                        className={s.tosInput}
                        checked={tos}
                        aria-invalid={Boolean(err.tos)}
                        aria-describedby="d-agree-err"
                        onChange={(e) => setTos(e.target.checked)}
                      />
                      <span className={s.tosText}>
                        Saya menyetujui{" "}
                        <Link
                          href={portalPath(base, "syarat-ketentuan")}
                          target="_blank"
                          rel="noopener"
                          className={s.tosLink}
                        >
                          syarat &amp; ketentuan
                        </Link>{" "}
                        program SAMAQU Affiliate dan memahami akun akan aktif setelah disetujui
                        admin.
                      </span>
                    </label>
                    <span id="d-agree-err" className={s.error} aria-live="polite">
                      {err.tos || ""}
                    </span>
                  </div>
                </div>

                <div className={s.submitBlock}>
                  <button type="submit" className={s.submit} disabled={busy}>
                    {busy ? "Mengirim…" : "Ajukan Pendaftaran"}
                    <svg
                      className={s.submitArrow}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                  <p className={s.formNote}>
                    Pengajuan diproses tim SAMAQU. Kamu akan dikabari setelah disetujui.
                  </p>
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
