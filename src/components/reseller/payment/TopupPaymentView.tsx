"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, resellerApi, type TopupRow } from "@/lib/reseller/client";
import { useReseller } from "../ResellerShell";
import { Note } from "../ui";
import PaymentPage, { type PaymentPageStatus } from "./PaymentPage";
import { resolvePaymentPageStatus } from "./status";
import type { PaymentMethodChoice } from "./types";

/** Halaman bayar TOP UP (`/reseller/top-up/[kode]`) — memakai PaymentPage bersama. */
export default function TopupPaymentView({ code }: { code: string }) {
  const { me } = useReseller();
  const [row, setRow] = useState<TopupRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await resellerApi.topupDetail(code);
      setRow(res.data);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat top up.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (proofUrl: string, method: PaymentMethodChoice) => {
    setBusy(true);
    try {
      await resellerApi.patchTopup(code, {
        action: "submit_proof",
        proof_url: proofUrl,
        payment_method: method,
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await resellerApi.patchTopup(code, { action: "cancel" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="muted small">Memuat top up…</p>;
  }
  if (error || !row) {
    return (
      <Note tone="err">
        {error || "Top up tidak ditemukan."}{" "}
        <Link className="btn ghost sm" href="/reseller/top-up" style={{ marginLeft: 8 }}>
          Ke halaman Top Up
        </Link>
      </Note>
    );
  }

  const status: PaymentPageStatus = resolvePaymentPageStatus({
    kind: "topup",
    status: row.status,
    proofUrl: row.proof_url,
    deadlineIso: row.pay_deadline,
  });

  return (
    <PaymentPage
      title="Top up saldo"
      amount={row.amount}
      referenceLabel="Kode top up"
      reference={row.code}
      status={status}
      deadlineIso={row.pay_deadline}
      proofUrl={row.proof_url}
      rejectReason={row.reject_reason}
      settings={me.pengaturan}
      initialMethod={row.payment_method === "qris" ? "qris" : "bsi"}
      busy={busy}
      onSubmit={submit}
      onCancel={status === "unpaid" ? cancel : undefined}
      onExpire={load}
      backHref="/reseller/top-up"
      homeHref="/reseller"
      historyHref="/reseller/saldo"
      historyLabel="Lihat riwayat top up"
      submittedSub="Admin SAMAQU sedang mengecek. Kamu dapat WhatsApp begitu saldo masuk."
      submittedFinalStep="Saldo masuk"
      rejectedCtaLabel="Top up lagi"
      rejectedCtaHref="/reseller/top-up"
      expiredTitle="Waktu pembayaran habis"
      expiredMessage="Waktu pembayaran habis. Buat top up baru ya."
      expiredCtaLabel="Top up lagi"
      expiredCtaHref="/reseller/top-up"
    />
  );
}
