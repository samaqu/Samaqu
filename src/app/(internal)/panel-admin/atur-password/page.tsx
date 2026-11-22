"use client";

/**
 * Atur Password — tujuan tautan undangan / atur ulang password admin panel.
 *
 * Supabase memasang sesi dari tautan (token di alamat) saat halaman dibuka; orangnya lalu membuat password sendiri.
 * Halaman ini sengaja berdiri sendiri (di luar kerangka panel) karena pemakainya belum bisa login.
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";

const INK = "#1f2937";
const SUB = "#6b7280";
const LINE = "#e5e7eb";

export default function AturPasswordPage() {
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const accept = (session: { user?: { email?: string | null } } | null) => {
      if (!alive || !session?.user) return;
      setEmail(session.user.email || "");
      setState((s) => (s === "done" ? s : "ready"));
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => accept(session));
    // Sesi dari tautan dipasang asinkron; beri waktu sebentar sebelum menyatakan tautan tidak valid.
    void supabase.auth.getSession().then(({ data }) => accept(data.session));
    const timer = setTimeout(() => {
      if (alive) setState((s) => (s === "checking" ? "invalid" : s));
    }, 4000);
    return () => {
      alive = false;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError("Password minimal 8 karakter.");
    if (pw !== pw2) return setError("Konfirmasi password tidak sama.");
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) return setError(err.message || "Gagal menyimpan password.");
    setState("done");
    setTimeout(() => {
      window.location.href = "/panel-admin";
    }, 1200);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 400, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, padding: 28, boxShadow: "0 8px 30px rgba(15,23,42,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: "#fbbf24", display: "grid", placeItems: "center", fontWeight: 800, color: INK }}>S</div>
          <div>
            <b style={{ display: "block", color: INK }}>SAMAQU</b>
            <small style={{ color: SUB }}>Panel Admin</small>
          </div>
        </div>

        {state === "checking" ? <p style={{ color: SUB, fontSize: 14 }}>Memeriksa tautan…</p> : null}

        {state === "invalid" ? (
          <>
            <h1 style={{ margin: "0 0 6px", fontSize: 18, color: INK }}>Tautan tidak valid</h1>
            <p style={{ margin: 0, color: SUB, fontSize: 14, lineHeight: 1.5 }}>
              Tautan ini sudah kedaluwarsa atau sudah dipakai. Minta penanggung jawab mengirim undangan atau tautan baru lewat menu Tim Admin.
            </p>
          </>
        ) : null}

        {state === "ready" ? (
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <div>
              <h1 style={{ margin: "0 0 4px", fontSize: 18, color: INK }}>Buat password</h1>
              <p style={{ margin: 0, color: SUB, fontSize: 13.5 }}>
                Akun: <b style={{ color: INK }}>{email}</b>
              </p>
            </div>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Password baru (min. 8 karakter)"
              autoComplete="new-password"
              style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none" }}
            />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Ulangi password"
              autoComplete="new-password"
              style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none" }}
            />
            {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              style={{ border: 0, borderRadius: 10, padding: "11px 14px", background: "#16a34a", color: "#fff", fontWeight: 800, fontSize: 14, cursor: busy ? "wait" : "pointer" }}
            >
              {busy ? "Menyimpan…" : "Simpan dan masuk"}
            </button>
          </form>
        ) : null}

        {state === "done" ? <p style={{ color: "#166534", fontWeight: 700, fontSize: 14 }}>Password tersimpan. Mengarahkan ke panel…</p> : null}
      </div>
    </div>
  );
}
