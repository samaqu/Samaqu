"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Search, Truck } from "lucide-react";
import { STRUK_CSS } from "@/components/akun/StrukShell";
import JntBadge from "@/components/JntBadge";
import { formatTrackingTime, sortHistoryDesc, trackingRow, trackingSummary } from "@/lib/jnt/track-status";
import type { TrackHistoryItem } from "@/lib/jnt/types";

interface TrackPayload {
  awb?: string;
  detail?: {
    services_code?: string;
    weight?: number | null;
    receiver?: { city?: string | null };
  };
  history?: TrackHistoryItem[];
  fetchedAt?: string;
  stale?: boolean;
}

export default function CekResiClient() {
  const [awbInput, setAwbInput] = useState("");
  const [checkedAwb, setCheckedAwb] = useState("");
  const [payload, setPayload] = useState<TrackPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const check = useCallback(async (raw: string, refresh = false) => {
    const awb = String(raw || "").trim().replace(/\s+/g, "");
    if (!awb) {
      setError("Masukkan nomor resi dulu.");
      return;
    }
    setLoading(true);
    setError("");
    setPayload(null);
    setCheckedAwb(awb);
    try {
      const res = await fetch(
        `/api/jnt/track?awb=${encodeURIComponent(awb)}${refresh ? "&refresh=1" : ""}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.data) {
        setError(json?.error || "Resi tidak ditemukan. Periksa lagi nomornya.");
        return;
      }
      setPayload(json.data as TrackPayload);
      setAwbInput(awb);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?awb=${encodeURIComponent(awb)}`,
      );
    } catch {
      setError("Gagal menghubungi layanan pelacakan. Coba lagi sebentar lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Buka halaman dari link yang sudah berisi ?awb=... → langsung cek.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("awb") || "";
    if (initial) {
      setAwbInput(initial);
      void check(initial);
    }
  }, [check]);

  const updates = useMemo(
    () => (payload?.history ? sortHistoryDesc(payload.history) : []),
    [payload],
  );
  const summary = useMemo(
    () => (payload?.history ? trackingSummary(payload.history) : null),
    [payload],
  );
  const awb = payload?.awb || checkedAwb;
  const service = String(payload?.detail?.services_code || "").toUpperCase();
  const destination = payload?.detail?.receiver?.city || "";
  const weight = Number(payload?.detail?.weight) || 0;

  async function salin() {
    if (!awb) return;
    try {
      await navigator.clipboard.writeText(awb);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard bisa diblokir browser — abaikan */
    }
  }

  return (
    <section className="min-h-screen" style={{ background: "var(--cream)" }}>
      <style>{STRUK_CSS}</style>

      <div className="mx-auto max-w-[900px] px-5 pt-28 pb-16 sm:pt-32 sm:px-8">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.28em]"
          style={{ color: "var(--gold)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}
        >
          Lacak Pengiriman
        </p>
        <h1
          className="mt-3 text-[2.5rem] leading-[1.05] sm:text-5xl"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)", fontWeight: 600 }}
        >
          Cek Resi
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Masukkan nomor resi J&amp;T untuk melihat status dan riwayat pengiriman paket SAMAQU.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void check(awbInput);
          }}
          className="mt-7 flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative min-w-0 flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              value={awbInput}
              onChange={(event) => {
                setAwbInput(event.target.value);
                if (error) setError("");
              }}
              placeholder="Contoh: JO0330017615"
              aria-label="Nomor resi J&T"
              maxLength={40}
              required
              className="w-full rounded-2xl border py-3.5 pl-11 pr-4 text-sm outline-none transition-shadow focus:ring-2"
              style={{
                borderColor: "rgba(0,0,0,.14)",
                background: "#fff",
                color: "var(--espresso)",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition-opacity disabled:opacity-60"
            style={{ background: "var(--espresso)", color: "var(--cream)" }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {loading ? "Mencari…" : "Cek Resi"}
          </button>
        </form>

        {error ? (
          <div className="sk-hint" style={{ marginTop: 16 }}>
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="sk-card" style={{ margin: "24px 0 0" }}>
            <div className="sk-steps">
              {[0, 1, 2].map((i) => (
                <div key={i} className="sk-step">
                  <div className="sk-rail"><span className="sk-node" /></div>
                  <div className="sk-txt" style={{ width: "100%" }}>
                    <span style={{ display: "block", height: 13, borderRadius: 7, background: "#ECECEC" }} />
                    <span style={{ display: "block", height: 11, width: "45%", borderRadius: 7, background: "#ECECEC", marginTop: 8 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : payload ? (
          <>
            <div className="sk-card" style={{ margin: "24px 0 0" }}>
              <div className="flex items-center gap-3">
                <JntBadge />
                <div className="min-w-0">
                  <p className="sk-eyebrow">Kurir</p>
                  <p className="mt-1 text-[13.5px] font-bold" style={{ color: "var(--espresso)" }}>
                    J&amp;T Express
                  </p>
                </div>
                {service ? (
                  <span
                    className="ml-auto shrink-0 rounded-full px-3 py-1 text-[11px] font-bold"
                    style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #dbeafe" }}
                  >
                    Service {service}
                  </span>
                ) : null}
              </div>

              <div className="sk-sep" style={{ margin: "16px 0 14px" }} />

              <p className="sk-eyebrow">Nomor Resi</p>
              <div className="mt-1.5 flex items-center gap-3">
                <p
                  className="min-w-0 break-all text-[19px] font-extrabold"
                  style={{ letterSpacing: ".04em", fontFamily: "'Consolas','Courier New',monospace" }}
                >
                  {awb || "—"}
                </p>
                <button
                  type="button"
                  onClick={salin}
                  disabled={!awb}
                  className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[12px] font-bold disabled:opacity-50"
                  style={{ borderColor: "var(--bd)", background: "#fffdf7", color: "var(--espresso)" }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Tersalin" : "Salin"}
                </button>
              </div>

              {destination || weight > 0 ? (
                <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                  {destination ? `Tujuan: ${destination}` : ""}
                  {destination && weight > 0 ? " • " : ""}
                  {weight > 0 ? `${(weight / 1000).toFixed(2)} kg` : ""}
                </p>
              ) : null}
            </div>

            <div className="sk-card" style={{ margin: "14px 0 0" }}>
              <div className="flex items-center gap-3">
                <h3 style={{ margin: 0 }}>Riwayat Pengiriman</h3>
                <button
                  type="button"
                  onClick={() => void check(awb, true)}
                  disabled={loading || !awb}
                  className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold disabled:opacity-50"
                  style={{ borderColor: "var(--bd)", background: "#fffdf7", color: "var(--espresso)" }}
                >
                  <RefreshCw size={12} />
                  Perbarui
                </button>
              </div>

              {summary ? (
                <div style={{ marginTop: 12 }}>
                  <p className="sk-eyebrow">Status terakhir</p>
                  <p className="mt-1.5 text-[14.5px] font-bold leading-snug" style={{ color: "var(--espresso)" }}>
                    {summary.status}
                  </p>
                  <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                    {formatTrackingTime(summary.updatedAt)}
                  </p>
                  {summary.note ? (
                    <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                      Catatan: <span style={{ color: "var(--espresso)" }}>{summary.note}</span>
                    </p>
                  ) : null}
                  {summary.receivedByThirdParty ? (
                    <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                      Diterima oleh: <span style={{ color: "var(--espresso)" }}>{summary.receivedByThirdParty}</span>
                    </p>
                  ) : null}
                  {summary.handoverNote ? (
                    <p className="mt-2 text-[12.5px] font-semibold" style={{ color: "#b45309" }}>
                      {summary.handoverNote}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {payload.stale ? (
                <div className="sk-hint" style={{ marginTop: 12 }}>
                  <span>J&amp;T sedang tidak bisa dihubungi. Ini data terakhir yang tersimpan.</span>
                </div>
              ) : null}

              {updates.length > 0 ? (
                <div className="sk-steps" style={{ marginTop: 14 }}>
                  {updates.map((item, index) => {
                    const row = trackingRow(item);
                    return (
                      <div key={`${row.dateTime}-${index}`} className={`sk-step ${index === 0 ? "is-active" : "is-done"}`}>
                        <div className="sk-rail">
                          <span className="sk-node" style={row.warning ? { background: "#d97706" } : undefined} />
                          {index < updates.length - 1 ? <span className="sk-line" /> : null}
                        </div>
                        <div className="sk-txt">
                          <b style={row.warning ? { color: "#b45309" } : undefined}>{row.status}</b>
                          <i>{[row.location, formatTrackingTime(row.dateTime)].filter(Boolean).join(" • ")}</i>
                          {row.note ? <i style={{ display: "block", marginTop: 2 }}>{row.note}</i> : null}
                          {row.receiver ? (
                            <i style={{ display: "block", marginTop: 2 }}>Diterima oleh: {row.receiver}</i>
                          ) : null}
                          {row.receivedByThirdParty ? (
                            <i style={{ display: "block", marginTop: 2 }}>Diterima oleh: {row.receivedByThirdParty}</i>
                          ) : null}
                          {row.handoverNote ? (
                            <i style={{ display: "block", marginTop: 2, color: "#b45309" }}>{row.handoverNote}</i>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="sk-note" style={{ margin: "12px 0 0" }}>
                  Belum ada update dari J&amp;T untuk resi ini.
                </div>
              )}
            </div>

            <p className="mt-5 flex items-center gap-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              <Truck size={13} />
              Data pelacakan berasal langsung dari J&amp;T Express.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
