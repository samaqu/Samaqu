"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CheckCircle, Clock, Copy, Download, Landmark, Loader2, QrCode } from "lucide-react";
import type { ResellerSettingsView } from "@/lib/reseller/client";
import { rupiah, topupStatus } from "@/lib/reseller/format";
import { ConfirmActionModal } from "../admin/Modal";
import UploadBukti from "../UploadBukti";
import SubmittedCard from "./SubmittedCard";
import type { PaymentMethodChoice, PaymentPageStatus } from "./types";
import { StatusBadge } from "../ui";
import { useCountdown } from "./useCountdown";

export type { PaymentPageStatus } from "./types";

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
  proofKind,
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
  submittedFinalStep,
  rejectedCtaLabel,
  rejectedCtaHref,
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
  proofKind: "topup" | "order-payment";
  rejectReason?: string | null;
  settings: ResellerSettingsView;
  initialMethod: PaymentMethodChoice;
  busy: boolean;
  onSubmit: (proofUrl: string, method: PaymentMethodChoice, proofKey: string) => Promise<void>;
  onCancel?: () => Promise<void>;
  onExpire?: () => void;
  backHref: string;
  homeHref: string;
  historyHref: string;
  historyLabel: string;
  submittedSub: string;
  submittedFinalStep: string;
  rejectedCtaLabel: string;
  rejectedCtaHref: string;
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
  const [proofKey, setProofKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [localError, setLocalError] = useState("");
  const [copied, setCopied] = useState<"" | "total" | "rekening">("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const countdown = useCountdown(deadlineIso);
  const expireNotified = useRef(false);

  useEffect(() => {
    setProof(proofUrl);
    setProofKey(null);
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
    if (!proof || !proofKey || submitting || busy) return;
    setLocalError("");
    setSubmitting(true);
    try {
      await onSubmit(proof, method, proofKey);
      setJustSubmitted(true);
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

  const viewStatus: PaymentPageStatus =
    status === "unpaid" && justSubmitted ? "submitted" : status;

  // ── State: bukti terkirim (modern) ──
  if (viewStatus === "submitted") {
    return (
      <SubmittedCard
        amount={amount}
        method={method}
        referenceLabel={referenceLabel}
        reference={reference}
        proofUrl={proof || proofUrl}
        subtitle={submittedSub}
        finalStepLabel={submittedFinalStep}
        historyHref={historyHref}
        historyLabel={historyLabel}
        homeHref={homeHref}
      />
    );
  }

  // ── State: dikonfirmasi / ditolak ──
  if (viewStatus === "approved" || viewStatus === "rejected") {
    const badge = viewStatus === "approved" ? topupStatus("approved") : topupStatus("rejected");
    return (
      <div className="stack" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-b stack" style={{ alignItems: "center", textAlign: "center" }}>
            {viewStatus === "rejected" ? (
              <span style={{ fontSize: 34 }} aria-hidden="true">✕</span>
            ) : (
              <CheckCircle size={44} style={{ color: "var(--rs-ok)" }} />
            )}
            <div>
              <h1 className="bold" style={{ fontSize: 19 }}>
                {viewStatus === "approved" ? "Pembayaran dikonfirmasi" : "Bukti pembayaran ditolak"}
              </h1>
              <p className="small muted" style={{ marginTop: 6 }}>
                {viewStatus === "approved"
                  ? "Terima kasih. Pembayaran sudah diverifikasi admin SAMAQU."
                  : `${rejectReason || "Silakan hubungi admin SAMAQU kalau ada pertanyaan."} Buat pembayaran baru untuk mengunggah bukti lagi.`}
              </p>
            </div>
            <div style={{ width: "100%", textAlign: "left", marginTop: 6 }}>{summaryCard(badge)}</div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
              {viewStatus === "rejected" ? (
                <Link className="btn" href={rejectedCtaHref}>
                  {rejectedCtaLabel}
                </Link>
              ) : (
                <Link className="btn" href={historyHref}>
                  {historyLabel}
                </Link>
              )}
              <Link className="btn ghost" href={homeHref}>
                Kembali ke Beranda
              </Link>
              {viewStatus === "rejected" ? (
                <Link className="btn ghost" href={historyHref}>
                  {historyLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── State: kedaluwarsa / dibatalkan ──
  if (viewStatus === "expired" || viewStatus === "cancelled" || (countdown.expired && viewStatus === "unpaid")) {
    return (
      <div className="stack" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-b stack" style={{ alignItems: "center", textAlign: "center" }}>
            <span style={{ fontSize: 34 }} aria-hidden="true">⏱</span>
            <h1 className="bold" style={{ fontSize: 19 }}>
              {viewStatus === "cancelled" ? "Pembayaran dibatalkan" : expiredTitle}
            </h1>
            <p className="small muted">{viewStatus === "cancelled" ? "Tidak ada saldo yang terpotong." : expiredMessage}</p>
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
  const deadlineDate = deadlineIso ? new Date(deadlineIso) : null;
  // Tanggal + jam batas (dihitung setelah mount supaya HTML server & klien sama).
  const deadlineText =
    deadlineDate && countdown.mounted
      ? `${deadlineDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" })}, ${deadlineDate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
      : "";
  const urgent = countdown.remainingMs !== null && countdown.remainingMs < 60 * 60 * 1000;
  const bsiNumber = settings.bsi_account_number;
  const steps = [
    method === "qris" ? "Scan QRIS di aplikasi bank atau e-wallet." : "Transfer ke rekening BSI SAMAQU.",
    `Bayar tepat ${rupiah(amount)}.`,
    "Upload bukti pembayaran, lalu ketuk Saya sudah bayar.",
  ];

  return (
    <div className="pay-page">
      <Link href={backHref} className="pay-back">
        <ArrowLeft size={15} /> {title}
      </Link>

      <div className="pay-grid">
        <div className="pay-col">
          <section className={`pay-timer${urgent ? " urgent" : ""}`} aria-live="off">
            <span className="pay-timer-ic" aria-hidden="true">
              <Clock size={18} />
            </span>
            <div className="pay-timer-txt">
              <small>Sisa waktu bayar</small>
              <b>{countdown.label || "…"}</b>
            </div>
            {deadlineText ? (
              <span className="pay-timer-due">
                Batas bayar
                <b>{deadlineText}</b>
              </span>
            ) : null}
          </section>

          <section className="card pay-total">
            <p className="pay-lbl">Total pembayaran</p>
            <p className="pay-amount">{rupiah(amount)}</p>
            <p className="pay-hint">Bayar tepat jumlah ini supaya cepat dikonfirmasi.</p>
            <button className="btn ghost sm" type="button" onClick={() => copy("total", String(amount))}>
              {copied === "total" ? <Check size={13} strokeWidth={3} /> : <Copy size={13} />}
              {copied === "total" ? "Tersalin" : "Salin jumlah"}
            </button>
            {reference ? (
              <div className="pay-ref">
                <span>{referenceLabel}</span>
                <b>{reference}</b>
              </div>
            ) : null}
          </section>

          <section className="card pay-method">
            <p className="pay-lbl">Metode pembayaran</p>
            {hasQris ? (
              <div className="pay-seg" role="tablist" aria-label="Pilih metode pembayaran">
                <button type="button" role="tab" aria-selected={method === "bsi"} className={method === "bsi" ? "on" : ""} onClick={() => setMethod("bsi")}>
                  <Landmark size={15} /> Transfer BSI
                </button>
                <button type="button" role="tab" aria-selected={method === "qris"} className={method === "qris" ? "on" : ""} onClick={() => setMethod("qris")}>
                  <QrCode size={15} /> QRIS
                </button>
              </div>
            ) : null}

            {method === "qris" ? (
              <div className="pay-qr">
                <div className="pay-qr-frame">
                  <img src={settings.qris_image_url || ""} alt="QRIS pembayaran SAMAQU" />
                </div>
                <p className="pay-qr-meta">
                  Merchant: <b>SAMAQU</b>
                  {reference ? (
                    <>
                      {" "}
                      · Kode <b>{reference}</b>
                    </>
                  ) : null}
                </p>
                <a className="btn ghost sm" href={settings.qris_image_url || "#"} target="_blank" rel="noreferrer" download>
                  <Download size={13} /> Simpan QRIS
                </a>
              </div>
            ) : (
              <div className="pay-bank">
                <div className="pay-bank-top">
                  <span className="pay-bank-ic" aria-hidden="true">
                    <Landmark size={18} />
                  </span>
                  <div>
                    <small>Transfer manual ke</small>
                    <b>{settings.bsi_bank_name}</b>
                  </div>
                </div>
                <div className="pay-acc-row">
                  <span className="pay-acc">{bsiNumber || "(belum diatur admin)"}</span>
                  {bsiNumber ? (
                    <button className="btn ghost sm" type="button" onClick={() => copy("rekening", `${settings.bsi_bank_name} ${bsiNumber}`)}>
                      {copied === "rekening" ? <Check size={13} strokeWidth={3} /> : <Copy size={13} />}
                      {copied === "rekening" ? "Tersalin" : "Salin"}
                    </button>
                  ) : null}
                </div>
                {settings.bsi_account_holder ? <p className="pay-holder">a.n. {settings.bsi_account_holder}</p> : null}
              </div>
            )}
          </section>
        </div>

        <div className="pay-col">
          <section className="card pay-steps">
            <p className="pay-lbl">Langkah singkat</p>
            <ol>
              {steps.map((text, index) => (
                <li key={index}>
                  <span className="pay-step-no">{index + 1}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card pay-proof">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Bukti pembayaran</label>
              <UploadBukti value={proof} onChange={setProof} onKeyChange={setProofKey} kind={proofKind} />
            </div>
            {localError ? <p className="err">{localError}</p> : null}
          </section>

          <div className="pay-cta">
            <button className="btn blk" type="button" disabled={!proof || !proofKey || submitting || busy} onClick={submit}>
              {submitting ? <Loader2 size={16} /> : null}
              Saya sudah bayar
            </button>
            {!proof ? <p className="pay-cta-hint">Upload bukti dulu supaya tombol ini aktif.</p> : null}
          </div>

          {onCancel ? (
            <button className="pay-cancel" type="button" onClick={() => setCancelOpen(true)} disabled={submitting}>
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
