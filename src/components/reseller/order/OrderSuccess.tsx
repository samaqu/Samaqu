"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { resellerApi } from "@/lib/reseller/client";
import { orderStatus, rupiah } from "@/lib/reseller/format";
import { useReseller } from "../ResellerShell";
import PaymentMethodTabs, { type PaymentMethodChoice } from "../PaymentMethodTabs";
import UploadBukti from "../UploadBukti";
import { Note, StatusBadge } from "../ui";

/** Panel sukses setelah pesanan dibuat — termasuk upload bukti kekurangan. */
export default function OrderSuccess({
  result,
  onNew,
}: {
  result: {
    orderNumber: string;
    total: number;
    balanceDeduction: number;
    shortfall: number;
    status: string;
  };
  onNew: () => void;
}) {
  const { me } = useReseller();
  const [method, setMethod] = useState<PaymentMethodChoice>("bsi");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const status = orderStatus(result.status);

  const sendProof = async (url: string | null) => {
    setProofUrl(url);
    if (!url) return;
    setError("");
    setSending(true);
    try {
      const activeMethod: PaymentMethodChoice =
        method === "qris" && me.pengaturan.qris_image_url ? "qris" : "bsi";
      await resellerApi.uploadProof(result.orderNumber, url, activeMethod);
      setSent(true);
    } catch {
      setError("Bukti gagal dikirim. Coba upload ulang.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <div className="card-b stack">
        <div className="row">
          <CheckCircle size={26} style={{ color: "var(--rs-ok)" }} />
          <div>
            <h2 className="bold" style={{ fontSize: 18 }}>
              Pesanan berhasil dibuat
            </h2>
            <p className="small muted">Simpan nomor pesanan ini untuk pelacakan.</p>
          </div>
        </div>

        <div className="kv-list">
          <div className="it">
            <span className="muted">Nomor pesanan</span>
            <b className="bold">{result.orderNumber}</b>
          </div>
          <div className="it">
            <span className="muted">Status</span>
            <StatusBadge status={status} />
          </div>
          <div className="it">
            <span className="muted">Total</span>
            <b className="bold">{rupiah(result.total)}</b>
          </div>
          <div className="it">
            <span className="muted">Dipotong dari saldo</span>
            <b className="bold" style={{ color: "var(--rs-ok)" }}>
              {rupiah(result.balanceDeduction)}
            </b>
          </div>
        </div>

        {result.shortfall > 0 ? (
          <Note tone="warn">
            <b>Menunggu konfirmasi transfer</b> — kekurangan {rupiah(result.shortfall)}.
            <br />
            Pesanan diproses setelah admin mengecek transfer kamu. Kalau tidak dibayar dalam 24 jam,
            pesanan otomatis dibatalkan dan saldo dikembalikan.
          </Note>
        ) : null}

        {result.shortfall > 0 ? (
          <div>
            <p className="small bold" style={{ marginBottom: 8 }}>
              Upload bukti transfer kekurangan
            </p>
            {!sent ? (
              <div style={{ marginBottom: 10 }}>
                <PaymentMethodTabs settings={me.pengaturan} method={method} onChange={setMethod} />
              </div>
            ) : null}
            {sent ? (
              <Note tone="ok">Bukti terkirim. Pesanan diproses setelah admin mengonfirmasi.</Note>
            ) : (
              <UploadBukti value={proofUrl} onChange={sendProof} label="Pilih gambar bukti transfer" />
            )}
            {sending ? <p className="hint" style={{ marginTop: 6 }}>Mengirim bukti…</p> : null}
            {error ? <p className="err" style={{ marginTop: 6 }}>{error}</p> : null}
          </div>
        ) : null}

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <Link className="btn" href={`/reseller/pesanan/${encodeURIComponent(result.orderNumber)}`}>
            Lihat pesanan
          </Link>
          <button className="btn ghost" type="button" onClick={onNew}>
            Buat pesanan lagi
          </button>
        </div>
      </div>
    </div>
  );
}
