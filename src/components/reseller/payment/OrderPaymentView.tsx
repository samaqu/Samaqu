"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, resellerApi, type OrderDetail } from "@/lib/reseller/client";
import { useReseller } from "../ResellerShell";
import { Note } from "../ui";
import PaymentPage, { type PaymentPageStatus } from "./PaymentPage";
import { resolvePaymentPageStatus } from "./status";
import type { PaymentMethodChoice } from "./types";

/**
 * Halaman bayar KEKURANGAN pesanan (`/reseller/pesanan/[nomor]/bayar`).
 * Batas waktu = 24 jam sejak pesanan dibuat — SAMA dengan jendela auto-cancel
 * yang sudah ada (logic cron tidak diubah, ini hanya tampilan batasnya).
 */
export default function OrderPaymentView({ orderNumber }: { orderNumber: string }) {
  const { me } = useReseller();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await resellerApi.orderDetail(orderNumber);
      setOrder(res.data);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat pesanan.");
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (proofUrl: string, method: PaymentMethodChoice) => {
    setBusy(true);
    try {
      await resellerApi.uploadProof(orderNumber, proofUrl, method);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="muted small">Memuat pesanan…</p>;
  if (error || !order) {
    return (
      <Note tone="err">
        {error || "Pesanan tidak ditemukan."}{" "}
        <Link className="btn ghost sm" href="/reseller/pesanan" style={{ marginLeft: 8 }}>
          Ke daftar pesanan
        </Link>
      </Note>
    );
  }

  const shortfall = order.shortfall;
  if (!shortfall) {
    return (
      <Note tone="ok">
        Pesanan ini tidak punya kekurangan pembayaran.{" "}
        <Link className="btn ghost sm" href={`/reseller/pesanan/${encodeURIComponent(orderNumber)}`} style={{ marginLeft: 8 }}>
          Lihat pesanan
        </Link>
      </Note>
    );
  }

  const status: PaymentPageStatus = resolvePaymentPageStatus({
    kind: "order",
    status: shortfall.status,
    proofUrl: shortfall.proof_url,
    orderStatus: order.status,
    deadlineIso: shortfall.deadline,
  });

  return (
    <PaymentPage
      title="Bayar kekurangan pesanan"
      amount={shortfall.amount}
      referenceLabel="Nomor pesanan"
      reference={order.order_number}
      status={status}
      deadlineIso={shortfall.deadline}
      proofUrl={shortfall.proof_url}
      rejectReason={order.cancel_reason}
      settings={me.pengaturan}
      initialMethod={shortfall.payment_method === "qris" ? "qris" : "bsi"}
      busy={busy}
      onSubmit={submit}
      onExpire={load}
      backHref={`/reseller/pesanan/${encodeURIComponent(orderNumber)}`}
      homeHref="/reseller"
      historyHref={`/reseller/pesanan/${encodeURIComponent(orderNumber)}`}
      historyLabel="Lihat pesanan"
      submittedSub="Admin SAMAQU sedang mengecek. Pesanan diproses setelah pembayaran dikonfirmasi."
      submittedFinalStep="Pesanan diproses"
      rejectedCtaLabel="Buat pesanan lagi"
      rejectedCtaHref="/reseller/pesanan/baru"
      expiredTitle="Waktu pembayaran habis"
      expiredMessage="Pesanan dibatalkan otomatis dan saldo yang terpotong sudah dikembalikan."
      expiredCtaLabel="Lihat pesanan"
      expiredCtaHref={`/reseller/pesanan/${encodeURIComponent(orderNumber)}`}
    />
  );
}
