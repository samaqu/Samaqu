"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "../panel.module.css";

/**
 * Kartu "Bot WhatsApp" di Beranda panel admin.
 *
 * Mengatur siapa yang membalas chat: bot local (laptop) atau server (MiMo).
 * Mode "auto" memakai local selama heartbeat-nya < 3 menit.
 */

const MODES = [
  { value: "auto", label: "Otomatis", desc: "Local selama aktif, server kalau local mati" },
  { value: "local", label: "Local saja", desc: "Server tidak membalas" },
  { value: "server", label: "Server saja", desc: "Bot local berhenti" },
  { value: "off", label: "Mati total", desc: "Local & server berhenti membalas" },
] as const;

export default function BotSwitchCard() {
  const [mode, setMode] = useState("auto");
  const [heartbeat, setHeartbeat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  async function load() {
    try {
      const t = await token();
      const res = await fetch("/api/admin/wa-bot-mode", {
        cache: "no-store",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Gagal memuat mode bot.");
      setMode(String(json?.mode || "auto"));
      setHeartbeat(json?.heartbeat || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat mode bot.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Selaraskan dengan server tiap 15 detik: kalau mode diubah dari tab lain
    // atau penyimpanan gagal, tampilan tidak "menipu".
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(next: string) {
    if (next === mode || saving) return;
    setSaving(true);
    setError("");
    try {
      const t = await token();
      const res = await fetch("/api/admin/wa-bot-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ mode: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Gagal menyimpan mode bot.");
      setMode(String(json?.mode || next));
      setHeartbeat(json?.heartbeat || heartbeat);
      // Baca ulang dari server: yang ditampilkan harus sama dengan yang tersimpan.
      await load();
      const check = await fetch("/api/admin/wa-bot-mode", {
        cache: "no-store",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      }).then((r) => r.json()).catch(() => null);
      if (check?.mode && check.mode !== next) {
        setError(`Mode tersimpan sebagai "${check.mode}", bukan "${next}". Coba lagi.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan mode bot.");
    } finally {
      setSaving(false);
    }
  }

  const heartbeatMs = heartbeat ? Date.parse(heartbeat) : 0;
  const localAlive = Number.isFinite(heartbeatMs) && Date.now() - heartbeatMs < 3 * 60 * 1000;
  const effective =
    mode === "off"
      ? "Mati total"
      : mode === "server"
        ? "Server (MiMo)"
        : mode === "local"
          ? "Local (dipaksa)"
          : localAlive
            ? "Local (otomatis)"
            : "Server (local tidak terdeteksi)";
  const heartbeatLabel = heartbeat
    ? `${Math.max(0, Math.round((Date.now() - heartbeatMs) / 1000))} detik lalu`
    : "belum pernah";

  return (
    <section className={styles.card}>
      <div className={styles.ph}>
        <div className={styles.ic} style={{ background: "#e8f3fb", color: "#2f6f9e" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="8" width="16" height="12" rx="3" />
            <path d="M12 8V4" />
            <circle cx="9" cy="14" r="1" />
            <circle cx="15" cy="14" r="1" />
          </svg>
        </div>
        <div>
          <b>Bot WhatsApp</b>
          <small>Pilih siapa yang membalas chat: local (laptop) atau server.</small>
        </div>
        <span className={styles.all}>{effective}</span>
      </div>

      {loading ? (
        <div className={styles.empty}>
          <p>Memuat mode bot…</p>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", padding: "0 18px 12px" }}>
            {MODES.map((option) => {
              const active = mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={saving}
                  onClick={() => void save(option.value)}
                  style={{
                    textAlign: "left",
                    border: `1px solid ${active ? "#2f6f9e" : "#dbe5ee"}`,
                    background: active ? "#2f6f9e" : "#fff",
                    color: active ? "#fff" : "#2a1a22",
                    borderRadius: 12,
                    padding: "10px 12px",
                    cursor: saving ? "default" : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  <span style={{ display: "block", fontWeight: 700, fontSize: 13 }}>{option.label}</span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 11, color: active ? "rgba(255,255,255,.8)" : "#6b7785" }}>
                    {option.desc}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ padding: "0 18px 16px", fontSize: 12, color: error ? "#b3261e" : "#6b7785" }}>
            {error
              ? error
              : mode === "off"
                ? "Bot dimatikan. Pesan tetap masuk ke inbox, tapi tidak dibalas otomatis."
                : `Heartbeat bot local: ${heartbeatLabel} · ${localAlive ? "terdeteksi aktif" : "tidak aktif"}`}
          </div>
        </>
      )}
    </section>
  );
}
