"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/affiliate/icons";
import {
  Badge,
  Empty,
  Pager,
  Stat,
  Table,
  paginate,
  useModal,
  useToast,
} from "@/components/affiliate/ui";
import { affiliateFetch } from "@/lib/affiliate/client";
import { WITHDRAWAL_STATUS_LABEL, jam, money, tgl } from "@/lib/affiliate/format";

/**
 * Penarikan Dana — pengajuan pencairan komisi + riwayatnya.
 * Struktur mengikuti mockup. Validasi saldo & minimum dilakukan di server.
 */

interface WithdrawalRow {
  id: string;
  ref: string;
  amount: number;
  fee: number;
  netAmount: number;
  method: string;
  bankName: string | null;
  bankNumber: string | null;
  bankHolder: string | null;
  status: string;
  reason: string | null;
  proofNote: string | null;
  createdAt: string;
  paidAt: string | null;
  history: { from_status: string | null; to_status: string | null; note: string | null; created_at: string }[];
}

interface AccountRow {
  id: string;
  method: string;
  bank: string;
  number: string;
  holder: string;
  isPrimary: boolean;
}

export default function AffiliateWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [balance, setBalance] = useState({
    pending: 0,
    approved: 0,
    available: 0,
    paid: 0,
    rejected: 0,
    processing: 0,
    withdrawn: 0,
  });
  const [settings, setSettings] = useState({
    min_withdrawal: 0,
    withdrawal_fee_bank: 0,
    withdrawal_fee_ewallet: 0,
  });
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [accountId, setAccountId] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const { open, close } = useModal();
  const { toast } = useToast();

  const load = async () => {
    try {
      const [wdJson, accountJson] = await Promise.all([
        affiliateFetch<{
          withdrawals: WithdrawalRow[];
          balance: typeof balance;
          settings: typeof settings;
        }>("/api/affiliate/withdrawals"),
        affiliateFetch<{ accounts: AccountRow[] }>("/api/affiliate/accounts"),
      ]);
      setWithdrawals(wdJson.withdrawals || []);
      setBalance(wdJson.balance);
      setSettings(wdJson.settings);
      setAccounts(accountJson.accounts || []);
    } catch (e) {
      console.error("[AFFILIATE] Gagal memuat penarikan:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const numericAmount = useMemo(() => Number(String(amount).replace(/\D/g, "")) || 0, [amount]);
  const fee = method === "E-wallet" ? settings.withdrawal_fee_ewallet : settings.withdrawal_fee_bank;
  const net = Math.max(0, numericAmount - fee);
  const left = balance.available - numericAmount;

  const filteredAccounts = useMemo(
    () => accounts.filter((a) => !method || a.method === method),
    [accounts, method],
  );

  const pg = paginate(withdrawals, page, 6);

  const submit = () => {
    const next: Record<string, string> = {};
    if (!numericAmount) next.amount = "Jumlah penarikan wajib diisi.";
    else if (settings.min_withdrawal > 0 && numericAmount < settings.min_withdrawal) {
      next.amount = `Jumlah kurang dari batas minimum ${money(settings.min_withdrawal)}.`;
    } else if (numericAmount > balance.available) {
      next.amount = `Jumlah melebihi saldo tersedia (${money(balance.available)}).`;
    }
    if (!method) next.method = "Pilih metode penarikan.";
    if (!accountId) next.account = "Pilih rekening tujuan.";
    setErr(next);
    if (Object.keys(next).length) {
      toast("Periksa kembali formulir penarikan", "err");
      return;
    }

    const account = accounts.find((a) => a.id === accountId);
    open({
      size: "sm",
      title: "Konfirmasi Penarikan",
      body: (
        <div>
          <div className="kv box">
            <dt>Nominal</dt>
            <dd>{money(numericAmount)}</dd>
            <dt>Biaya admin</dt>
            <dd>− {money(fee)}</dd>
            <dt>Dana bersih</dt>
            <dd style={{ color: "var(--af-pri)" }}>{money(net)}</dd>
            <dt>Rekening tujuan</dt>
            <dd>
              {account?.bank} {account?.number}
              <br />
              <span className="small muted">{account?.holder}</span>
            </dd>
            <dt>Saldo tersisa</dt>
            <dd>{money(left)}</dd>
          </div>
          <div className="note mt">
            <Icon name="info" className="sm" />
            <span>
              Pengajuan akan ditinjau admin. Dana belum dikirim sebelum admin mencatat
              pembayaran.
            </span>
          </div>
        </div>
      ),
      foot: (
        <>
          <button className="btn s" onClick={close} type="button">
            Kembali
          </button>
          <button className="btn p" onClick={confirm} type="button">
            Konfirmasi Penarikan
          </button>
        </>
      ),
    });
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await affiliateFetch<{ withdrawal: WithdrawalRow }>("/api/affiliate/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amount: numericAmount, method, accountId }),
      });
      close();
      setAmount("");
      setMethod("");
      setAccountId("");
      setPage(1);
      await load();
      open({
        size: "sm",
        title: "Penarikan berhasil diajukan",
        body: (
          <div style={{ textAlign: "center" }}>
            <div
              className="aic"
              style={{ width: 56, height: 56, margin: "0 auto", background: "var(--af-okbg)", color: "var(--af-ok)" }}
            >
              <Icon name="cc" className="lg" />
            </div>
            <p className="muted mt">Nomor referensi penarikan</p>
            <div className="b dark" style={{ fontSize: 20, marginTop: 4 }}>
              {res.withdrawal.ref}
            </div>
            <p className="small muted mt">
              {money(net)} ke rekening tujuan. Status: Menunggu. Pengajuan masih bisa dibatalkan
              sebelum diproses.
            </p>
          </div>
        ),
        foot: (
          <button className="btn p w" onClick={close} type="button">
            Selesai
          </button>
        ),
      });
      toast(`Penarikan ${res.withdrawal.ref} berhasil diajukan`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal mengajukan penarikan", "err");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (row: WithdrawalRow) => {
    if (!window.confirm(`Penarikan ${row.ref} akan dibatalkan dan saldo dikembalikan.`)) return;
    try {
      await affiliateFetch("/api/affiliate/withdrawals", {
        method: "PATCH",
        body: JSON.stringify({ id: row.id, action: "cancel" }),
      });
      toast("Penarikan dibatalkan, saldo dikembalikan");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal membatalkan penarikan", "err");
    }
  };

  const showDetail = (row: WithdrawalRow) => {
    open({
      title: "Detail Penarikan",
      body: (
        <div>
          <div className="row between" style={{ marginBottom: 12 }}>
            <b className="dark">{row.ref}</b>
            <Badge label={WITHDRAWAL_STATUS_LABEL[row.status] || row.status} />
          </div>
          <div className="kv box">
            <dt>Tanggal pengajuan</dt>
            <dd>{jam(row.createdAt)}</dd>
            <dt>Nominal</dt>
            <dd>{money(row.amount)}</dd>
            <dt>Biaya admin</dt>
            <dd>− {money(row.fee)}</dd>
            <dt>Dana bersih</dt>
            <dd style={{ color: "var(--af-pri)" }}>{money(row.netAmount)}</dd>
            <dt>Metode</dt>
            <dd>{row.method}</dd>
            <dt>Tujuan</dt>
            <dd>
              {row.bankName} {row.bankNumber}
              <br />
              <span className="small muted">{row.bankHolder}</span>
            </dd>
          </div>
          {row.reason ? (
            <div
              className="note mt"
              style={{ background: "var(--af-errbg)", color: "var(--af-err)", borderColor: "#FECACA" }}
            >
              <Icon name="alert" className="sm" />
              <span>{row.reason}</span>
            </div>
          ) : null}
          {row.proofNote ? (
            <div className="note i mt">
              <Icon name="info" className="sm" />
              <span>Bukti pembayaran: {row.proofNote}</span>
            </div>
          ) : null}
          <h4 className="b dark mt" style={{ marginBottom: 10 }}>
            Riwayat Status
          </h4>
          <ul className="tl">
            {row.history.map((h, i) => (
              <li key={i}>
                <div className="small b dark">
                  {h.from_status || "baru"} → {h.to_status || "-"}
                </div>
                {h.note ? <div className="small muted">{h.note}</div> : null}
                <div className="small muted">{jam(h.created_at)}</div>
              </li>
            ))}
          </ul>
        </div>
      ),
      foot: (
        <>
          {row.status === "menunggu" ? (
            <button className="btn s" style={{ color: "var(--af-err)" }} onClick={() => cancel(row)} type="button">
              Batalkan Penarikan
            </button>
          ) : null}
          <button className="btn p" onClick={close} type="button">
            Tutup
          </button>
        </>
      ),
    });
  };

  if (loading) {
    return <div className="card p-10 text-center muted">Memuat penarikan…</div>;
  }

  return (
    <div>
      <div className="grid g4">
        <Stat icon="cash" label="Saldo Tersedia" value={money(balance.available)} sub="Dapat ditarik sekarang" />
        <Stat icon="clock" label="Saldo Menunggu Validasi" value={money(balance.pending)} sub="Belum dapat ditarik" />
        <Stat icon="cc" label="Total Sudah Ditarik" value={money(balance.withdrawn)} sub="Penarikan berhasil" />
        <Stat icon="rot" label="Penarikan Diproses" value={money(balance.processing)} sub="Menunggu & diproses" />
      </div>

      <div className="split mt" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)" }}>
        <div className="card">
          <div className="ch">
            <div>
              <h3>Ajukan Penarikan</h3>
              <p>Pencairan diproses admin setelah dana dikirim.</p>
            </div>
          </div>
          <div className="cp">
            <div className="fg">
              <label className="fl">Jumlah Penarikan</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: 10 }} className="muted b">
                  Rp
                </span>
                <input
                  className={`inp ${err.amount ? "e" : ""}`}
                  style={{ paddingLeft: 40 }}
                  inputMode="numeric"
                  value={numericAmount ? numericAmount.toLocaleString("id-ID") : ""}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              {err.amount ? (
                <div className="fe">{err.amount}</div>
              ) : (
                <div className="fh">
                  {settings.min_withdrawal > 0 ? `Minimal penarikan ${money(settings.min_withdrawal)}` : "Belum ada minimum penarikan"} · saldo tersedia{" "}
                  {money(balance.available)}
                </div>
              )}
            </div>

            <div className="row wrap" style={{ margin: "-6px 0 14px", gap: 6 }}>
              {[50000, 100000, 250000]
                .filter((v) => v <= balance.available)
                .map((v) => (
                  <button
                    key={v}
                    className="chip"
                    onClick={() => setAmount(String(v))}
                    type="button"
                  >
                    {money(v)}
                  </button>
                ))}
              {balance.available >= (settings.min_withdrawal || 1) ? (
                <button className="chip" onClick={() => setAmount(String(balance.available))} type="button">
                  Tarik Semua
                </button>
              ) : null}
            </div>

            <div className="fg">
              <label className="fl">Pilih Metode</label>
              <div className="grid g2" style={{ gap: 8 }}>
                {["Transfer Bank", "E-wallet"].map((m) => (
                  <button
                    key={m}
                    className={`chip ${method === m ? "on" : ""}`}
                    style={{ borderRadius: 10, padding: 10 }}
                    onClick={() => {
                      setMethod(m);
                      const first = accounts.find((a) => a.method === m);
                      setAccountId(first ? first.id : "");
                    }}
                    type="button"
                  >
                    <Icon name={m === "Transfer Bank" ? "card" : "cash"} className="sm" /> {m}
                  </button>
                ))}
              </div>
              {err.method ? <div className="fe">{err.method}</div> : null}
            </div>

            <div className="fg">
              <label className="fl">Rekening Tujuan</label>
              <select
                className={`sel ${err.account ? "e" : ""}`}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={!method}
              >
                <option value="">{method ? "— Pilih rekening tersimpan —" : "Pilih metode terlebih dahulu"}</option>
                {filteredAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank} {a.number} · {a.holder}
                    {a.isPrimary ? " (Utama)" : ""}
                  </option>
                ))}
              </select>
              {err.account ? (
                <div className="fe">{err.account}</div>
              ) : (
                <div className="fh">
                  <Link href="/affiliate/pengaturan" style={{ color: "var(--af-pri)" }}>
                    Kelola rekening
                  </Link>
                </div>
              )}
            </div>

            <div className="box">
              <div className="kv">
                <dt>Jumlah penarikan</dt>
                <dd>{money(numericAmount)}</dd>
                <dt>Biaya admin</dt>
                <dd>{method ? `− ${money(fee)}` : "—"}</dd>
                <dt className="b dark">Estimasi dana bersih</dt>
                <dd style={{ color: "var(--af-pri)", fontSize: 15 }}>{money(net)}</dd>
                <dt>Saldo tersisa</dt>
                <dd style={left < 0 ? { color: "var(--af-err)" } : undefined}>{money(left)}</dd>
              </div>
            </div>

            <button className="btn p w mt" onClick={submit} disabled={busy} type="button">
              <Icon name="cash" className="sm" />
              {busy ? "Mengirim…" : "Ajukan Penarikan"}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <div>
              <h3>Riwayat Penarikan</h3>
              <p>{withdrawals.length} transaksi</p>
            </div>
          </div>

          {pg.total === 0 ? (
            <Empty icon="cash" title="Belum ada penarikan" text="Pengajuan penarikan kamu akan muncul di sini." />
          ) : (
            <>
              <Table
                columns={[
                  {
                    label: "No. Referensi",
                    render: (w) => (
                      <button
                        className="b"
                        style={{ border: 0, background: "none", color: "var(--af-pri)", cursor: "pointer", padding: 0 }}
                        onClick={() => showDetail(w)}
                        type="button"
                      >
                        {w.ref}
                      </button>
                    ),
                  },
                  { label: "Tanggal", render: (w) => tgl(w.createdAt) },
                  { label: "Nominal", num: true, render: (w) => money(w.amount) },
                  { label: "Biaya", num: true, render: (w) => money(w.fee) },
                  { label: "Dana Bersih", num: true, render: (w) => <b className="dark">{money(w.netAmount)}</b> },
                  {
                    label: "Metode",
                    render: (w) => (
                      <span className="small">
                        {w.bankName} {w.bankNumber}
                      </span>
                    ),
                  },
                  { label: "Status", render: (w) => <Badge label={WITHDRAWAL_STATUS_LABEL[w.status] || w.status} /> },
                  {
                    label: "Aksi",
                    render: (w) => (
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn s sm" onClick={() => showDetail(w)} type="button">
                          Detail
                        </button>
                        {w.status === "menunggu" ? (
                          <button
                            className="btn s sm"
                            style={{ color: "var(--af-err)" }}
                            onClick={() => cancel(w)}
                            type="button"
                          >
                            Batalkan
                          </button>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
                rows={pg.rows}
              />
              <Pager page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onPage={setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
