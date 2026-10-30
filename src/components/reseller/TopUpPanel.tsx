"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { ApiError, resellerApi, type TopupRow } from "@/lib/reseller/client";
import { rupiah, tglJamID, topupStatus } from "@/lib/reseller/format";
import { useReseller } from "./ResellerShell";
import UploadBukti from "./UploadBukti";
import { EmptyState, Note, SkeletonRows, StatusBadge } from "./ui";

/** Top up saldo: transfer manual ke BSI + upload bukti, lalu dicek admin. */
export default function TopUpPanel() {
  const { me } = useReseller();
  const [amount, setAmount] = useState(0);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<TopupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(0);
  const [copied, setCopied] = useState(false);

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
      await resellerApi.createTopup(amount, proofUrl);
      setSent(amount);
      setAmount(0);
      setProofUrl(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengirim top up. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const copyAccount = async () => {
    const { bsi_bank_name, bsi_account_number, bsi_account_holder } = me.pengaturan;
    try {
      await navigator.clipboard.writeText(
        `${bsi_bank_name} ${bsi_account_number} a.n. ${bsi_account_holder}`.trim()
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard diblokir */
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
                        {row.code} · {tglJamID(row.created_at)}
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
          <div className="note warn" style={{ marginBottom: 14 }}>
            <b>Transfer manual ke rekening BSI SAMAQU:</b>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{me.pengaturan.bsi_bank_name}</div>
            <div style={{ fontWeight: 700 }}>{me.pengaturan.bsi_account_number || "(belum diatur admin)"}</div>
            {me.pengaturan.bsi_account_holder ? <div>a.n. {me.pengaturan.bsi_account_holder}</div> : null}
            {me.pengaturan.bsi_account_number ? (
              <button className="btn ghost sm" type="button" style={{ marginTop: 8 }} onClick={copyAccount}>
                <Copy size={13} /> {copied ? "Tersalin" : "Salin rekening"}
              </button>
            ) : null}
          </div>

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
              <input
                id="rs-topup-amt"
                className="in"
                inputMode="numeric"
                placeholder="500000"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
              />
            </div>
            <div className="field">
              <label>Bukti transfer</label>
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
