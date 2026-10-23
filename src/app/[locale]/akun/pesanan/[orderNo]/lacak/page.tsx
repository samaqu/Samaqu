"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getCustomerOrders } from "@/lib/customer-auth";
import { useAkunCustomer } from "@/components/akun/AkunContext";
import { useSafeLocale, useSafeTranslations } from "@/lib/safe-i18n";
import { strukStatus } from "@/lib/akun-format";
import { orderStatusKey } from "@/lib/order-flow";
import type { TrackHistoryItem } from "@/lib/jnt/types";
import { formatTrackingTime, sortHistoryDesc, trackingRow, trackingSummary } from "@/lib/jnt/track-status";
import { STRUK_CSS, StrukHeader, StrukTitle } from "@/components/akun/StrukShell";

interface Order {
  order_number: string;
  status: string;
  created_at: string;
  updated_at?: string;
  awb_no?: string | null;
  shipping_method?: string | null;
  shipping_status?: string | null;
  tracking_status_code?: number | null;
}

interface TrackDetail {
  services_code?: string;
  qty?: number;
  weight?: number;
  receiver?: { city?: string };
}

interface TrackPayload {
  awb?: string;
  detail?: TrackDetail;
  history?: TrackHistoryItem[];
  /** Kapan data diambil dari J&T (ISO). */
  fetchedAt?: string;
  /** true = data tersimpan karena J&T tidak bisa dihubungi. */
  stale?: boolean;
}

export default function LacakPage() {
  const params = useParams();
  const orderNo = decodeURIComponent(String(params.orderNo));
  const locale = useSafeLocale();
  const t = useSafeTranslations("tracking");
  const { customer, ready } = useAkunCustomer();
  const [order, setOrder] = useState<Order | null>(null);
  const [payload, setPayload] = useState<TrackPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resi = order?.awb_no || null;

  // Ambil riwayat dari J&T (cache pendek di server). `refresh` = tombol "Perbarui".
  const loadTrack = useCallback(async (refresh: boolean) => {
    if (!resi) return;
    setTracking(true);
    setTrackError(null);
    try {
      const res = await fetch(`/api/jnt/track?awb=${encodeURIComponent(resi)}${refresh ? "&refresh=1" : ""}`);
      const json = await res.json();
      if (json?.success && json?.data) setPayload(json.data as TrackPayload);
      else setTrackError(json?.error || t("empty"));
    } catch {
      setTrackError(t("error"));
    } finally {
      setTracking(false);
    }
  }, [resi, t]);

  useEffect(() => {
    if (!ready) return;
    if (!customer) {
      setLoading(false);
      return;
    }
    const customerId = customer.id;
    let alive = true;
    async function init() {
      try {
        if (!alive) return;
        const orders = (await getCustomerOrders(customerId)) as Order[];
        if (!alive) return;
        setOrder(orders.find((o) => o.order_number === orderNo) || null);
      } catch (error) {
        console.error("[akun/lacak] gagal memuat pesanan:", error);
      } finally {
        if (alive) setLoading(false);
      }
    }
    init();
    return () => { alive = false; };
  }, [orderNo, customer, ready]);

  useEffect(() => {
    if (resi) loadTrack(false);
  }, [resi, loadTrack]);

  // Riwayat terbaru di atas — diurut dari waktu asli J&T.
  const updates = useMemo(() => sortHistoryDesc(payload?.history), [payload]);
  const summary = useMemo(() => trackingSummary(payload?.history), [payload]);
  const sc = order ? strukStatus(orderStatusKey(order)) : null;
  const awb = order?.awb_no || payload?.awb;

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
    <div className="sk-root -mx-4 -mt-4 md:mx-0 md:mt-0">
      <style>{STRUK_CSS}</style>
      <StrukHeader title={t("history")} back={`/akun/pesanan/${orderNo}`} />

      <div className="sk-wrap sk-body">
        <StrukTitle
          title={t("history")}
          back={`/${locale}/akun/pesanan/${orderNo}`}
          backLabel="Detail Pesanan"
        />

        <div className="sk-cols">
          <section className="sk-hero sk-up sk-d2">
            <div className="sk-card" style={{ margin: 0, padding: "20px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    flex: "none",
                    padding: "7px 12px",
                    borderRadius: 12,
                    background: "#ED1C24",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: ".02em",
                  }}
                >
                  J&amp;T
                </span>
                <div>
                  <p className="sk-eyebrow">Kurir</p>
                  <p style={{ fontSize: 13.5, fontWeight: 700, marginTop: 3 }}>
                    J&amp;T Express{payload?.detail?.services_code ? ` — ${payload.detail.services_code}` : ""}
                  </p>
                </div>
                {sc ? (
                  <span className={`sk-chip sk-t-${sc.tone}`} style={{ position: "static", marginLeft: "auto" }}>
                    <span className="sk-dot" />
                    {sc.label}
                  </span>
                ) : null}
              </div>

              <div className="sk-sep" style={{ margin: "16px 0 14px" }} />

              <p className="sk-eyebrow">Nomor Resi</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                <p
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    letterSpacing: ".04em",
                    fontFamily: "'Consolas','Courier New',monospace",
                    wordBreak: "break-all",
                  }}
                >
                  {awb || "—"}
                </p>
                <button
                  type="button"
                  onClick={salin}
                  disabled={!awb}
                  className="sk-bk"
                  style={{ width: "auto", marginLeft: "auto", padding: "0 13px", height: 36, gap: 7, display: "flex", alignItems: "center", fontSize: 12, fontWeight: 700 }}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5h10" /></svg>
                  {copied ? "Tersalin" : "Salin"}
                </button>
              </div>

              {payload?.detail?.receiver?.city ? (
                <p style={{ fontSize: 12.5, color: "#666666", marginTop: 12 }}>
                  Tujuan: {payload.detail.receiver.city}
                  {payload.detail.weight ? ` • ${payload.detail.weight / 1000} kg` : ""}
                </p>
              ) : null}
            </div>
          </section>

          <section className="sk-card sk-pay sk-up sk-d3">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ margin: 0 }}>{t("history")}</h3>
              <button
                type="button"
                onClick={() => loadTrack(true)}
                disabled={tracking || !resi}
                className="sk-bk"
                style={{ width: "auto", marginLeft: "auto", padding: "0 12px", height: 32, fontSize: 12, fontWeight: 700 }}
              >
                {tracking ? t("loading") : t("refresh")}
              </button>
            </div>

            {/* Ringkasan status: teks & keterangan diambil apa adanya dari event J&T terbaru. */}
            {summary ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8A85" }}>
                  {t("currentStatusTitle")}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 14.5, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.35 }}>
                  {summary.status}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#666666" }}>
                  {formatTrackingTime(summary.updatedAt)}
                </p>
                {summary.note ? (
                  <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#666666" }}>
                    {t("noteLabel")}: <span style={{ color: "#1a1a1a" }}>{summary.note}</span>
                  </p>
                ) : null}
              </div>
            ) : null}

            {payload?.stale ? (
              <div className="sk-hint" style={{ marginTop: 12 }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                {t("stale")}
              </div>
            ) : null}

            {loading || tracking ? (
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
            ) : trackError ? (
              <div className="sk-hint" style={{ marginTop: 12 }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                {trackError}
              </div>
            ) : updates.length > 0 ? (
              <div className="sk-steps">
                {updates.map((item, i) => {
                  // Teks status & catatan ditampilkan APA ADANYA dari J&T.
                  const row = trackingRow(item);
                  return (
                    <div key={`${row.dateTime}-${i}`} className={`sk-step ${i === 0 ? "is-active" : "is-done"}`}>
                      <div className="sk-rail">
                        <span className="sk-node" style={row.warning ? { background: "#d97706" } : undefined} />
                        {i < updates.length - 1 ? <span className="sk-line" /> : null}
                      </div>
                      <div className="sk-txt">
                        <b style={row.warning ? { color: "#b45309" } : undefined}>{row.status}</b>
                        <i>{[row.location, formatTrackingTime(row.dateTime)].filter(Boolean).join(" • ")}</i>
                        {row.note ? (
                          <i style={{ display: "block", marginTop: 2 }}>{t("note")}: {row.note}</i>
                        ) : null}
                        {/* Nama penerima dari J&T (`receiver`) — siapa yang menerima paket. */}
                        {row.receiver ? (
                          <i style={{ display: "block", marginTop: 2 }}>{t("receivedBy")}: {row.receiver}</i>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="sk-note" style={{ margin: 0, marginTop: 12 }}>
                {awb ? t("noUpdate") : t("noResi")}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
