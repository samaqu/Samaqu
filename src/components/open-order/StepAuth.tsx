"use client";

/**
 * Langkah 4 versi "belum masuk" — gerbang masuk/daftar sebelum data pemesan.
 *
 * Checkout Open Order hanya untuk customer yang punya akun. Keranjang & data pemesan hidup di
 * state wizard ini, jadi gerbangnya **inline** (bukan redirect ke /akun/login) supaya tidak ada
 * yang hilang di tengah jalan. Setelah masuk, langkah 4 lanjut menampilkan form data pemesan yang
 * sudah terisi nama + WhatsApp dari akun, dan pesanannya tersimpan dengan `customer_id` akun itu
 * sehingga muncul di menu "Pesanan".
 */

import { useState } from "react";
import { getCurrentCustomer, loginCustomer, registerCustomer } from "@/lib/customer-auth";
import ForgotPasswordFlow from "@/components/akun/ForgotPasswordFlow";
import { DANGER, Field, INK, MUTED, PrimaryButton, TextInput } from "./ui";

export interface AuthAccount {
  id: string;
  name: string;
  whatsapp: string;
  email: string;
}

type Mode = "masuk" | "daftar" | "lupa";

export default function StepAuth({ onAuthenticated }: { onAuthenticated: (account: AuthAccount) => void }) {
  const [mode, setMode] = useState<Mode>("masuk");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
  }

  /** Sesi sudah ada → teruskan ke langkah data pemesan (bukan redirect). */
  async function continueWithSession() {
    const account = await getCurrentCustomer();
    if (!account) return false;
    onAuthenticated({
      id: account.id,
      name: account.name || "",
      whatsapp: account.whatsapp || "",
      email: account.email || "",
    });
    return true;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!email.trim() || !password) {
      setError("Email dan password wajib diisi.");
      return;
    }
    setLoading(true);
    const result = await loginCustomer(email.trim(), password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    const ok = await continueWithSession();
    if (!ok) setError("Masuk gagal. Coba lagi ya.");
    setLoading(false);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!name.trim() || !email.trim() || !password) {
      setError("Nama, email, dan password wajib diisi.");
      return;
    }
    if (password.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }
    setLoading(true);
    const result = await registerCustomer(email.trim(), password, name.trim(), whatsapp.trim());
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    // Kalau project meminta verifikasi email, signUp tidak menghasilkan sesi — arahkan ke tab
    // Masuk dengan email yang tadi diisi supaya tinggal memasukkan password.
    const ok = await continueWithSession();
    if (!ok) {
      setMode("masuk");
      setPassword("");
      setNotice("Akun dibuat. Cek email untuk verifikasi (kalau diminta), lalu masuk di sini.");
    }
    setLoading(false);
  }

  if (mode === "lupa") {
    return (
      <div className="rounded-3xl p-5 sm:p-6" style={{ background: "var(--cream-bright)", border: "1px solid rgba(0,0,0,.3)" }}>
        <ForgotPasswordFlow
          onCancel={() => switchMode("masuk")}
          onAuthenticated={async () => {
            const ok = await continueWithSession();
            if (!ok) {
              switchMode("masuk");
              setNotice("Password sudah diganti. Silakan masuk.");
            }
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-3xl p-5 sm:p-6" style={{ background: "var(--cream-bright)", border: "1px solid rgba(0,0,0,.3)" }}>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em]" style={{ color: "var(--gold)" }}>
          Sebelum Checkout
        </p>
        <h2
          className="mt-2 text-[1.35rem] font-semibold leading-snug sm:text-[1.5rem]"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}
        >
          {mode === "masuk" ? "Masuk dulu ya" : "Daftar akun Samaqu"}
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
          Pesanan yang barusan kamu susun tetap tersimpan di halaman ini. Setelah {mode === "masuk" ? "masuk" : "daftar"}, data
          pemesan langsung terisi dari akun dan pesananmu bisa dilacak di menu <span style={{ color: INK }}>Pesanan</span>.
        </p>

        {/* Pilihan mode */}
        <div className="mt-5 inline-flex rounded-lg p-1" style={{ background: "rgba(0,0,0,.18)" }}>
          {(["masuk", "daftar"] as Mode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => switchMode(option)}
              aria-pressed={mode === option}
              className="rounded-md px-4 py-2 text-[12px] font-medium uppercase tracking-[0.12em] transition-all duration-200"
              style={
                mode === option
                  ? { background: "var(--espresso)", color: "var(--cream)" }
                  : { color: INK }
              }
            >
              {option === "masuk" ? "Masuk" : "Daftar"}
            </button>
          ))}
        </div>

        <form onSubmit={mode === "masuk" ? handleLogin : handleRegister} className="mt-5 space-y-4">
          {mode === "daftar" && (
            <>
              <Field label="Nama Lengkap" required>
                <TextInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama penerima paket"
                  autoComplete="name"
                  required
                />
              </Field>
              <Field label="No. WhatsApp">
                <TextInput
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="0812-3456-7890"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </Field>
            </>
          )}

          <Field label="Email" required>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              autoComplete="email"
              required
            />
          </Field>

          <Field label="Password" required hint={mode === "daftar" ? "Minimal 6 karakter." : undefined}>
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password akun"
              autoComplete={mode === "masuk" ? "current-password" : "new-password"}
              required
              minLength={6}
            />
          </Field>

          {error && <p className="text-[12px] leading-relaxed" style={{ color: DANGER }}>{error}</p>}
          {notice && (
            <p className="text-[12px] leading-relaxed" style={{ color: INK, background: "rgba(0,0,0,.12)", border: "1px solid rgba(0,0,0,.45)", borderRadius: 10, padding: "10px 12px" }}>
              {notice}
            </p>
          )}

          <PrimaryButton type="submit" disabled={loading}>
            {loading ? "Memproses…" : mode === "masuk" ? "Masuk & Lanjut" : "Daftar & Lanjut"}
          </PrimaryButton>
        </form>

        {mode === "masuk" && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => switchMode("lupa")}
              className="text-[12px] font-semibold"
              style={{ color: INK }}
            >
              Lupa password?
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
        Sudah punya akun? Pilih <span style={{ color: INK }}>Masuk</span>. Belum punya? Pilih{" "}
        <span style={{ color: INK }}>Daftar</span> — cukup nama, email, dan password.
      </p>
    </div>
  );
}
