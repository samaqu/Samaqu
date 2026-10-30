"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { ApiError, resellerApi, type WithdrawalRow } from "@/lib/reseller/client";
import RupiahInput from "./RupiahInput";
import { maskAccount, rupiah, tglJamID, withdrawalStatus } from "@/lib/reseller/format";
import { useReseller } from "./ResellerShell";
import { EmptyState, Note, SkeletonRows, StatusBadge } from "./ui";

/** Tarik saldo: tanpa minimal, biaya admin sesuai pengaturan (gratis kalau BSI). */
export default function TarikSaldoPanel() {
  const { me, refreshMe } = useReseller();
  const [amount, setAmount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await resellerApi.withdrawals();
      setRows(res.data);
    } catch {
      setError("Gagal memuat riwayat penarikan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saldo = me.saldo.saldo_tersedia;
  const bankReady = Boolean(me.reseller.bank_name && me.reseller.bank_number && me.reseller.bank_holder);
  const fee = me.pengaturan.rekening_bsi ? 0 : me.pengaturan.admin_fee_non_bsi;
  const transfer = Math.max(0, amount - fee);
  const amountValid = amount >= 1 && amount <= saldo;

  const submit = async () => {
    if (!amountValid || busy) return;
    setError("");
    setBusy(true);
    try {
      await resellerApi.createWithdrawal(amount);
      setSent(true);
      setConfirming(false);
      setAmount(0);
      await Promise.all([load(), refreshMe()]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengajukan penarikan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-grid">
      <div className="stack">
        <div className="card">
          <div className="card-h">
            <h2>Riwayat penarikan</h2>
          </div>
          <div className="card-b" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {loading ? (
              <SkeletonRows rows={3} />
            ) : rows.length === 0 ? (
              <EmptyState text="Belum ada penarikan." />
            ) : (
              rows.map((row) => {
                const status = withdrawalStatus(row.status);
                return (
                  <div className="list-row" key={row.id} style={{ alignItems: "flex-start" }}>
                    <div>
                      <div className="t">{rupiah(row.amount)}</div>
                      <div className="s">
                        {maskAccount(row.bank_name, row.bank_number)} · {tglJamID(row.created_at)}
                      </div>
                      <div className="s">
                        Biaya admin {rupiah(row.admin_fee)} · diterima {rupiah(row.transfer_amount)}
                      </div>
                      {row.status === "rejected" && row.reject_reason ? (
                        <div className="s" style={{ color: "var(--rs-err)" }}>
                          Ditolak: {row.reject_reason}
                        </div>
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
          <h2>Tarik saldo</h2>
        </div>
        <div className="card-b">
          <div className="kv">
            <span>Saldo bisa dipakai</span>
            <b style={{ color: "var(--rs-ok)" }}>{rupiah(saldo)}</b>
          </div>

          {sent ? (
            <div style={{ margin: "10px 0" }}>
              <Note tone="ok">
                Penarikan sedang dicek admin. Saldo ditahan sampai admin mentransfer.
              </Note>
            </div>
          ) : null}

          {!bankReady ? (
            <Note tone="warn">
              Isi rekening bank dulu di <Link href="/reseller/profil" style={{ textDecoration: "underline" }}>Profil</Link>{" "}
              sebelum menarik saldo.
            </Note>
          ) : (
            <>
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="rs-wd-amt">Jumlah penarikan</label>
                <RupiahInput
                  id="rs-wd-amt"
                  value={amount}
                  max={saldo}
                  placeholder={String(saldo)}
                  onChange={(value) => {
                    setAmount(value);
                    setConfirming(false);
                    setSent(false);
                  }}
                />
              </div>

              <div className="kv-list" style={{ marginBottom: 12 }}>
                <div className="it">
                  <span className="muted">Rekening tujuan</span>
                  <b>{maskAccount(me.reseller.bank_name, me.reseller.bank_number)}</b>
                </div>
                <div className="it">
                  <span className="muted">Biaya admin {me.pengaturan.rekening_bsi ? "(BSI, gratis)" : ""}</span>
                  <b>{rupiah(fee)}</b>
                </div>
                <div className="it">
                  <span className="muted">Kamu terima</span>
                  <b style={{ color: "var(--rs-ok)" }}>{rupiah(transfer)}</b>
                </div>
              </div>

              {confirming ? (
                <div className="note warn" style={{ marginBottom: 12 }}>
                  Tarik {rupiah(amount)} ke {maskAccount(me.reseller.bank_name, me.reseller.bank_number)}?
                  Biaya admin {rupiah(fee)}, kamu terima {rupiah(transfer)}. Saldo ditahan sampai admin
                  mentransfer.
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn sm" type="button" disabled={busy} onClick={submit}>
                      {busy ? <Loader2 size={14} /> : null}
                      Ya, ajukan
                    </button>
                    <button className="btn ghost sm" type="button" onClick={() => setConfirming(false)}>
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn blk"
                  type="button"
                  disabled={!amountValid}
                  onClick={() => setConfirming(true)}
                >
                  Ajukan penarikan
                </button>
              )}
            </>
          )}

          {error ? (
            <div style={{ marginTop: 12 }}>
              <Note tone="err">{error}</Note>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
