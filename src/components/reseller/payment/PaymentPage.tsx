"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle, Copy, Download, Loader2 } from "lucide-react";
import type { ResellerSettingsView } from "@/lib/reseller/client";
import { rupiah, topupStatus } from "@/lib/reseller/format";
import { ConfirmActionModal } from "../admin/Modal";
import UploadBukti from "../UploadBukti";
import type { PaymentMethodChoice } from "./types";
import { StatusBadge } from "../ui";
import { useCountdown } from "./useCountdown";

export type PaymentPageStatus =
  | "unpaid"
  | "submitted"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

/**
 * SATU halaman bayar untuk top up DAN kekurangan pesanan:
 * timer dari batas waktu server → total + salin → metode (QRIS/BSI) →
 * upload bukti → "Saya sudah bayar" → state terkirim / kedaluwarsa.
 */
export default function PaymentPage({
  title,
  amount,
  referenceLabel,
  reference,
  status,
  deadlineIso,
  proofUrl,
  rejectReason,
  settings,
  initialMethod,
  busy,
  onSubmit,
  onCancel,
  onExpire,
  backHref,
  homeHref,
  historyHref,
  historyLabel,
  submittedSub,
  expiredTitle,
  expiredMessage,
  expiredCtaLabel,
  expiredCtaHref,
}: {
  title: string;
  amount: number;
  referenceLabel: string;
  reference: string | null;
  status: PaymentPageStatus;
  deadlineIso: string | null;
  proofUrl: string | null;
  rejectReason?: string | null;
  settings: ResellerSettingsView;
  initialMethod: PaymentMethodChoice;
  busy: boolean;
  onSubmit: (proofUrl: string, method: PaymentMethodChoice) => Promise<void>;
  onCancel?: () => Promise<void>;
  onExpire?: () => void;
  backHref: string;
  homeHref: string;
  historyHref: string;
  historyLabel: string;
  submittedSub: string;
  expiredTitle: string;
  expiredMessage: string;
  expiredCtaLabel: string;
  expiredCtaHref: string;
}) {
  const hasQris = Boolean(settings.qris_image_url);
  const [method, setMethod] = useState<PaymentMethodChoice>(
    hasQris && initialMethod === "qris" ? "qris" : "bsi"
  );
  const [proof, setProof] = useState<string | null>(proofUrl);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const [copied, setCopied] = useState<"" | "total" | "rekening">("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const countdown = useCountdown(deadlineIso);
  const expireNotified = useRef(false);

  useEffect(() => {
    setProof(proofUrl);
  }, [proofUrl]);

  // Timer habis → minta wrapper memuat ulang (server yang menandai kedaluwarsa).
  useEffect(() => {
    if (status === "unpaid" && countdown.expired && !expireNotified.current) {
      expireNotified.current = true;
      onExpire?.();
    }
  }, [status, countdown.expired, onExpire]);

  const copy = async (kind: "total" | "rekening", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      /* clipboard diblokir — nilai tetap terlihat */
    }
  };

  const submit = async () => {
    if (!proof || submitting || busy) return;
    setLocalError("");
    setSubmitting(true);
    try {
      await onSubmit(proof, method);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Gagal mengirim bukti. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  const summaryCard = (badgeLabelTone: ReturnType<typeof topupStatus>) => (
    <div className="kv-list" style={{ gap: 8 }}>
      <div className="it">
        <span className="muted">Jumlah</span>
        <b>{rupiah(amount)}</b>
      </div>
      <div className="it">
        <span className="muted">Metode</span>
        <b>{method === "qris" ? "QRIS" : "Transfer BSI"}</b>
      </div>
      <div className="it">
        <span className="muted">{referenceLabel}</span>
        <b>{reference || "—"}</b>
      </div>
      <div className="it">
        <span className="muted">Status</span>
        <StatusBadge status={badgeLabelTone} />
      </div>
      {proofUrl ? (
        <div className="it">
          <span className="muted">Bukti</span>
          <a href={proofUrl} target="_blank" rel="noreferrer">
            <img
              src={proofUrl}
              alt="Bukti pembayaran"
              style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid #e4e4e0" }}
            />
          </a>
        </div>
      ) : null}
    </div>
  );

  // ── State: terkirim / dikonfirmasi / ditolak ──
  if (status !== "unpaid" && status !== "expired" && status !== "cancelled") {
    const badge =
      status === "submitted"
        ? topupStatus("pending")
        : status === "approved"
          ? topupStatus("approved")
          : topupStatus("rejected");
    return (
      <div className="stack" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-b stack" style={{ alignItems: "center", textAlign: "center" }}>
            {status === "rejected" ? (
              <span style={{ fontSize: 34 }} aria-hidden="true">✕</span>
            ) : (
              <CheckCircle size={44} style={{ color: "var(--rs-ok)" }} />
            )}
            <div>
              <h1 className="bold" style={{ fontSize: 19 }}>
                {status === "submitted"
                  ? "Bukti pembayaran terkirim"
                  : status === "approved"
                    ? "Pembayaran dikonfirmasi"
                    : "Bukti pembayaran ditolak"}
              </h1>
              <p className="small muted" style={{ marginTop: 6 }}>
                {status === "submitted"
                  ? submittedSub
                  : status === "approved"
                    ? "Terima kasih. Pembayaran sudah diverifikasi admin SAMAQU."
                    : rejectReason || "Silakan hubungi admin SAMAQU kalau ada pertanyaan."}
              </p>
            </div>
            <div style={{ width: "100%", textAlign: "left", marginTop: 6 }}>{summaryCard(badge)}</div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
              <Link className="btn" href={homeHref}>
                Kembali ke Beranda
              </Link>
              <Link className="btn ghost" href={historyHref}>
                {historyLabel}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── State: kedaluwarsa / dibatalkan ──
  if (status === "expired" || status === "cancelled" || (countdown.expired && status === "unpaid")) {
    return (
      <div className="stack" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-b stack" style={{ alignItems: "center", textAlign: "center" }}>
            <span style={{ fontSize: 34 }} aria-hidden="true">⏱</span>
            <h1 className="bold" style={{ fontSize: 19 }}>
              {status === "cancelled" ? "Pembayaran dibatalkan" : expiredTitle}
            </h1>
            <p className="small muted">{status === "cancelled" ? "Tidak ada saldo yang terpotong." : expiredMessage}</p>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
              <Link className="btn" href={expiredCtaHref}>
                {expiredCtaLabel}
              </Link>
              <Link className="btn ghost" href={homeHref}>
                Kembali ke Beranda
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── State: belum bayar ──
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <Link href={backHref} className="small bold" style={{ textDecoration: "underline" }}>
        ← {title}
      </Link>

      <div className="note warn" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span>
          <b>Bayar sebelum</b>
          {deadlineIso && countdown.mounted
            ? ` ${new Date(deadlineIso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </span>
        <b style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{countdown.label || "…"}</b>
      </div>

      <div className="card">
        <div className="card-b stack" style={{ gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <p className="small muted">Total pembayaran</p>
            <p className="bold" style={{ fontSize: 30, letterSpacing: "-0.02em" }}>{rupiah(amount)}</p>
            <button className="btn ghost sm" type="button" onClick={() => copy("total", String(amount))}>
              <Copy size={13} /> {copied === "total" ? "Tersalin" : "Salin jumlah"}
            </button>
          </div>

          {method === "qris" ? (
            <div className="note warn" style={{ textAlign: "center" }}>
              <b>QRIS — SAMAQU</b>
              <div style={{ margin: "10px auto" }}>
                <img
                  src={settings.qris_image_url || ""}
                  alt="QRIS pembayaran SAMAQU"
                  style={{ width: "100%", maxWidth: 300, borderRadius: 12, margin: "0 auto", display: "block" }}
                />
              </div>
              <div className="small">Merchant: SAMAQU</div>
              {reference ? <div className="small">Kode: <b>{reference}</b></div> : null}
              <a
                className="btn ghost sm"
                style={{ marginTop: 8 }}
                href={settings.qris_image_url || "#"}
                target="_blank"
                rel="noreferrer"
                download
              >
                <Download size={13} /> Simpan QRIS
              </a>
            </div>
          ) : (
            <div className="note warn">
              <b>Transfer manual ke rekening BSI SAMAQU:</b>
              <div style={{ marginTop: 6, fontWeight: 700 }}>{settings.bsi_bank_name}</div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{settings.bsi_account_number || "(belum diatur admin)"}</div>
              {settings.bsi_account_holder ? <div>a.n. {settings.bsi_account_holder}</div> : null}
              {settings.bsi_account_number ? (
                <button
                  className="btn ghost sm"
                  type="button"
                  style={{ marginTop: 8 }}
                  onClick={() => copy("rekening", `${settings.bsi_bank_name} ${settings.bsi_account_number}`)}
                >
                  <Copy size={13} /> {copied === "rekening" ? "Tersalin" : "Salin rekening"}
                </button>
              ) : null}
            </div>
          )}

          {hasQris ? (
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => setMethod(method === "qris" ? "bsi" : "qris")}
            >
              {method === "qris" ? "Ganti ke Transfer BSI" : "Ganti ke QRIS"}
            </button>
          ) : null}

          <div className="stack" style={{ gap: 6 }}>
            <p className="small bold">Langkah singkat</p>
            <p className="small muted">1. Scan QRIS / transfer sesuai metode.</p>
            <p className="small muted">2. Bayar tepat {rupiah(amount)}.</p>
            <p className="small muted">3. Upload bukti pembayaran di bawah.</p>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Bukti pembayaran</label>
            <UploadBukti value={proof} onChange={setProof} />
          </div>

          {localError ? <p className="err">{localError}</p> : null}

          <button className="btn blk" type="button" disabled={!proof || submitting || busy} onClick={submit}>
            {submitting ? <Loader2 size={16} /> : null}
            Saya sudah bayar
          </button>
          {onCancel ? (
            <button className="btn danger blk" type="button" onClick={() => setCancelOpen(true)} disabled={submitting}>
              Batalkan top up
            </button>
          ) : null}
        </div>
      </div>

      {cancelOpen && onCancel ? (
        <ConfirmActionModal
          title="Batalkan top up"
          description="Batalkan top up ini? Tidak ada saldo yang terpotong."
          confirmLabel="Ya, batalkan"
          tone="danger"
          busy={submitting}
          onClose={() => setCancelOpen(false)}
          onConfirm={async () => {
            setCancelOpen(false);
            try {
              await onCancel();
            } catch (e) {
              setLocalError(e instanceof Error ? e.message : "Gagal membatalkan top up.");
            }
          }}
        />
      ) : null}
    </div>
  );
}
