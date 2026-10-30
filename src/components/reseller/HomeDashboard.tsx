"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, History } from "lucide-react";
import {
  resellerApi,
  type LedgerRow,
  type OrderListRow,
  type StatsResponse,
  type TopupRow,
  type WithdrawalRow,
} from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import { useReseller } from "./ResellerShell";
import { MutasiList, PesananList } from "./ListPanels";
import { Note, SkeletonCards } from "./ui";

/** Dashboard reseller: saldo, statistik bulan ini, aktivitas terbaru. */
export default function HomeDashboard() {
  const { me } = useReseller();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [orders, setOrders] = useState<OrderListRow[]>([]);
  const [pendingTopups, setPendingTopups] = useState<TopupRow[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statsRes, ledgerRes, ordersRes, topupsRes, withdrawalsRes] = await Promise.all([
        resellerApi.stats(),
        resellerApi.ledger({ pageSize: 5 }),
        resellerApi.orders({ page: 1, pageSize: 3 }),
        resellerApi.topups(),
        resellerApi.withdrawals(),
      ]);
      setStats(statsRes);
      setLedger(ledgerRes.data);
      setOrders(ordersRes.rows);
      setPendingTopups(topupsRes.data.filter((row) => row.status === "pending"));
      setPendingWithdrawals(withdrawalsRes.data.filter((row) => row.status === "pending"));
    } catch {
      setError("Gagal memuat data dashboard. Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="stack">
      {error ? (
        <Note tone="err">
          {error}{" "}
          <button className="btn sm ghost" type="button" onClick={load} style={{ marginLeft: 8 }}>
            Coba lagi
          </button>
        </Note>
      ) : null}

      <section className="saldo-card">
        <div>
          <div className="lbl">Saldo bisa dipakai</div>
          <div className="big">{rupiah(me.saldo.saldo_tersedia)}</div>
        </div>
        <div className="saldo-meta">
          <div>
            Ditahan untuk penarikan
            <b>{rupiah(me.saldo.saldo_ditahan)}</b>
          </div>
          <div>
            Top up belum dikonfirmasi
            <b>{stats ? rupiah(stats.pending_topup) : loading ? "…" : rupiah(0)}</b>
          </div>
        </div>
        <div className="saldo-actions">
          <Link className="btn on-dark" href="/reseller/top-up">
            <ArrowUpFromLine size={16} /> Top Up
          </Link>
          <Link className="btn on-dark ghost" href="/reseller/tarik-saldo">
            <ArrowDownToLine size={16} /> Tarik Saldo
          </Link>
          <Link className="btn on-dark ghost" href="/reseller/saldo">
            <History size={16} /> Riwayat
          </Link>
        </div>
      </section>

      {pendingTopups.length > 0 || pendingWithdrawals.length > 0 ? (
        <div className="stack" style={{ gap: 10 }}>
          {pendingTopups.map((row) => (
            <Note tone="warn" key={row.id}>
              Top up {rupiah(row.amount)} sedang dicek admin. Saldo bertambah setelah dikonfirmasi.
            </Note>
          ))}
          {pendingWithdrawals.map((row) => (
            <Note tone="warn" key={row.id}>
              Penarikan {rupiah(row.amount)} menunggu konfirmasi admin. Saldo ditahan sampai ditransfer.
            </Note>
          ))}
        </div>
      ) : null}

      <section>
        <h2 className="bold" style={{ fontSize: 15, marginBottom: 12 }}>
          Statistik bulan ini
        </h2>
        {loading ? (
          <SkeletonCards />
        ) : (
          <div className="grid-stats">
            <div className="stat">
              <small>Pesanan</small>
              <b>{stats?.pesanan ?? 0}</b>
            </div>
            <div className="stat">
              <small>Pcs terjual</small>
              <b>{stats?.pcs ?? 0}</b>
            </div>
            <div className="stat">
              <small>Belanja modal</small>
              <b>{rupiah(stats?.belanja_modal ?? 0)}</b>
            </div>
            <div className="stat">
              <small>Estimasi untung</small>
              <b style={{ color: "var(--rs-ok)" }}>{rupiah(stats?.estimasi_untung ?? 0)}</b>
              <div className="sub">Harga jual − harga beli</div>
            </div>
          </div>
        )}
      </section>

      <div className="grid2">
        <section className="card">
          <div className="card-h">
            <h2>Riwayat saldo terbaru</h2>
            <Link href="/reseller/saldo" className="link">
              Lihat semua
            </Link>
          </div>
          <div className="card-b" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <MutasiList rows={ledger} loading={loading} />
          </div>
        </section>

        <section className="card">
          <div className="card-h">
            <h2>Pesanan terbaru</h2>
            <Link href="/reseller/pesanan" className="link">
              Lihat semua
            </Link>
          </div>
          <div className="card-b" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <PesananList rows={orders} loading={loading} />
          </div>
        </section>
      </div>
    </div>
  );
}
