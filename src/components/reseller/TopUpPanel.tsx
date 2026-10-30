"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ApiError, resellerApi, type TopupRow } from "@/lib/reseller/client";
import { rupiah, tglJamID, topupStatus } from "@/lib/reseller/format";
import { useReseller } from "./ResellerShell";
import PaymentMethodTabs, { type PaymentMethodChoice } from "./PaymentMethodTabs";
import RupiahInput from "./RupiahInput";
import UploadBukti from "./UploadBukti";
import { EmptyState, Note, SkeletonRows, StatusBadge } from "./ui";

const QUICK_AMOUNTS = [100_000, 250_000, 500_000, 1_000_000];

function methodLabel(method: string | null | undefined): string {
  return method === "qris" ? "QRIS" : "Transfer BSI";
}

/** Top up saldo: transfer BSI atau scan QRIS, upload bukti, lalu dicek admin. */
export default function TopUpPanel() {
  const { me } = useReseller();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethodChoice>("bsi");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<TopupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await resellerApi.topups();
      setRows(res.data);
    } catch {
      setError("Gagal memuat riwayat top up.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (amount < 1) {
      setError("Masukkan jumlah top up.");
      return;
    }
    if (!proofUrl) {
      setError("Upload bukti transfer dulu.");
      return;
    }
    setBusy(true);
    try {
      const activeMethod: PaymentMethodChoice =
        method === "qris" && me.pengaturan.qris_image_url ? "qris" : "bsi";
      await resellerApi.createTopup(amount, proofUrl, activeMethod);
      setSent(amount);
      setAmount(0);
      setProofUrl(null);
      setMethod("bsi");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengirim top up. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-grid">
      <div className="stack">
        <div className="card">
          <div className="card-h">
            <h2>Riwayat top up</h2>
          </div>
          <div className="card-b" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {loading ? (
              <SkeletonRows rows={3} />
            ) : rows.length === 0 ? (
              <EmptyState text="Belum ada top up." />
            ) : (
              rows.map((row) => {
                const status = topupStatus(row.status);
                return (
                  <div className="list-row" key={row.id} style={{ alignItems: "flex-start" }}>
                    <div>
                      <div className="t">{rupiah(row.amount)}</div>
                      <div className="s">
                        {row.code} · {methodLabel(row.payment_method)} · {tglJamID(row.created_at)}
                      </div>
                      {row.status === "rejected" && row.reject_reason ? (
                        <div className="s" style={{ color: "var(--rs-err)" }}>
                          Ditolak: {row.reject_reason}
                        </div>
                      ) : null}
                      {row.proof_url ? (
                        <a className="s" style={{ textDecoration: "underline" }} href={row.proof_url} target="_blank" rel="noreferrer">
                          Lihat bukti
                        </a>
                      ) : null}
                    </div>
                    <StatusBadge status={status} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Top up baru</h2>
        </div>
        <div className="card-b">
          {sent > 0 ? (
            <div style={{ marginBottom: 12 }}>
              <Note tone="ok">
                Top up {rupiah(sent)} sedang dicek admin. Saldo bertambah setelah dikonfirmasi.
              </Note>
            </div>
          ) : null}

          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="rs-topup-amt">Jumlah top up</label>
              <RupiahInput id="rs-topup-amt" value={amount} onChange={setAmount} placeholder="500.000" />
              <div className="chips" style={{ marginTop: 8 }}>
                {QUICK_AMOUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${amount === value ? "on" : ""}`}
                    onClick={() => setAmount(value)}
                  >
                    {rupiah(value)}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Metode pembayaran</label>
              <PaymentMethodTabs settings={me.pengaturan} method={method} onChange={setMethod} />
            </div>

            <div className="field">
              <label>Bukti pembayaran</label>
              <UploadBukti value={proofUrl} onChange={setProofUrl} />
            </div>

            {error ? (
              <div style={{ marginBottom: 12 }}>
                <Note tone="err">{error}</Note>
              </div>
            ) : null}
            <button className="btn blk" type="submit" disabled={busy}>
              {busy ? <Loader2 size={16} /> : null}
              Kirim top up
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
