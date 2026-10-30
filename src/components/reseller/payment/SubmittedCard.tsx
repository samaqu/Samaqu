"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";
import type { PaymentMethodChoice } from "./types";
import type { RsStatus } from "@/lib/reseller/format";
import { rupiah } from "@/lib/reseller/format";
import { StatusBadge } from "../ui";

const WAITING: RsStatus = { label: "Menunggu konfirmasi", tone: "warn" };

/** State "bukti terkirim" untuk halaman bayar top up & kekurangan pesanan. */
export default function SubmittedCard({
  amount,
  method,
  referenceLabel,
  reference,
  proofUrl,
  subtitle,
  finalStepLabel,
  historyHref,
  historyLabel,
  homeHref,
}: {
  amount: number;
  method: PaymentMethodChoice;
  referenceLabel: string;
  reference: string | null;
  proofUrl: string | null;
  subtitle: string;
  finalStepLabel: string;
  historyHref: string;
  historyLabel: string;
  homeHref: string;
}) {
  return (
    <div className="submitted-wrap">
      <div className="card submitted-card">
        <div className="submitted-check" aria-hidden="true">
          <CheckCircle size={34} />
        </div>
        <h1>Bukti pembayaran terkirim</h1>
        <p className="submitted-sub">{subtitle}</p>

        <div className="submitted-summary">
          <div className="kv">
            <span>Jumlah</span>
            <b>{rupiah(amount)}</b>
          </div>
          <div className="kv">
            <span>Metode</span>
            <b>{method === "qris" ? "QRIS" : "Transfer BSI"}</b>
          </div>
          <div className="kv">
            <span>{referenceLabel}</span>
            <b>{reference || "—"}</b>
          </div>
          <div className="kv">
            <span>Status</span>
            <StatusBadge status={WAITING} />
          </div>
          {proofUrl ? (
            <div className="kv">
              <span>Bukti</span>
              <a href={proofUrl} target="_blank" rel="noreferrer">
                <img className="submitted-proof" src={proofUrl} alt="Bukti pembayaran" />
              </a>
            </div>
          ) : null}
        </div>

        <ol className="submitted-steps">
          <li className="done">
            <span className="dot">1</span>
            <span>Bukti terkirim</span>
          </li>
          <li className="active">
            <span className="dot">2</span>
            <span>Dicek admin</span>
          </li>
          <li>
            <span className="dot">3</span>
            <span>{finalStepLabel}</span>
          </li>
        </ol>

        <div className="submitted-actions">
          <Link className="btn" href={historyHref}>
            {historyLabel}
          </Link>
          <Link className="btn ghost" href={homeHref}>
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
