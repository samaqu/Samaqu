"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ApiError, resellerApi, setResellerToken } from "@/lib/reseller/client";
import { countdownText, waDisplay } from "@/lib/reseller/format";
import { Note } from "./ui";

/** Login reseller: nomor WhatsApp → OTP 6 digit → dashboard. */
export default function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [whatsapp, setWhatsapp] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = (seconds: number) => {
    setResendIn(seconds);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setResendIn((value) => {
        if (value <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  };

  const requestCode = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await resellerApi.requestOtp(whatsapp);
      setInfo(res.message);
      setStep("otp");
      setCode("");
      startCountdown(60);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 429
          ? "Terlalu banyak permintaan. Coba lagi beberapa saat."
          : "Gagal mengirim kode. Coba lagi."
      );
    } finally {
      setBusy(false);
    }
  };

  const submitPhone = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = whatsapp.replace(/\D/g, "");
    if (digits.length < 9) {
      setError("Nomor WhatsApp tidak valid.");
      return;
    }
    await requestCode();
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.replace(/\D/g, "").length !== 6) {
      setError("Kode harus 6 digit.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await resellerApi.verifyOtp(whatsapp, code);
      setResellerToken(res.token);
      router.replace("/reseller");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Nomor ini belum terdaftar sebagai reseller aktif. Hubungi admin SAMAQU."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rs-root">
      <div className="login-wrap">
        <div className="login-card">
          <img className="logo" src="/logo.svg" alt="SAMAQU" />

          {step === "phone" ? (
            <>
              <h1>Masuk Reseller SAMAQU</h1>
              <p className="sub">Masukkan nomor WhatsApp yang terdaftar sebagai reseller</p>
              <form onSubmit={submitPhone} style={{ marginTop: 20 }}>
                {error ? (
                  <div style={{ marginBottom: 12 }}>
                    <Note tone="err">{error}</Note>
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="rs-wa">Nomor WhatsApp</label>
                  <input
                    id="rs-wa"
                    className="in"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="08xxxxxxxxxx"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    autoFocus
                  />
                </div>
                <button className="btn blk" type="submit" disabled={busy}>
                  {busy ? <Loader2 size={16} className="rs-spin" /> : null}
                  Kirim kode
                </button>
              </form>
            </>
          ) : (
            <>
              <h1>Masukkan kode OTP</h1>
              <p className="sub">Kode dikirim ke WhatsApp {waDisplay(whatsapp)}</p>
              <form onSubmit={submitCode} style={{ marginTop: 20 }}>
                {error ? (
                  <div style={{ marginBottom: 12 }}>
                    <Note tone="err">{error}</Note>
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="rs-otp">Kode 6 digit</label>
                  <input
                    id="rs-otp"
                    className="in otp-in"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="••••••"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoFocus
                  />
                  {info ? <span className="hint">{info}</span> : null}
                </div>
                <button className="btn blk" type="submit" disabled={busy || code.length !== 6}>
                  {busy ? <Loader2 size={16} className="rs-spin" /> : null}
                  Masuk
                </button>
              </form>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, gap: 10 }}>
                <button
                  className="btn ghost sm"
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setError("");
                    setCode("");
                  }}
                >
                  <ArrowLeft size={14} />
                  Ubah nomor
                </button>
                <button
                  className="btn ghost sm"
                  type="button"
                  disabled={resendIn > 0 || busy}
                  onClick={requestCode}
                >
                  {resendIn > 0 ? `Kirim ulang dalam ${countdownText(resendIn)}` : "Kirim ulang kode"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`.rs-spin{animation:rsSpin2 .8s linear infinite}@keyframes rsSpin2{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
