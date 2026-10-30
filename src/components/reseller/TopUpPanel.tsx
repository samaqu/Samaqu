"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ApiError, resellerApi, type TopupRow } from "@/lib/reseller/client";
import { rupiah, topupDisplay } from "@/lib/reseller/format";
import { useReseller } from "./ResellerShell";
import MethodCards from "./payment/MethodCards";
import type { PaymentMethodChoice } from "./payment/types";
import RupiahInput from "./RupiahInput";
import { EmptyState, Note, SkeletonRows, StatusBadge } from "./ui";

const QUICK_AMOUNTS = [100_000, 250_000, 500_000, 1_000_000];

function methodLabel(method: string | null | undefined): string {
  return method === "qris" ? "QRIS" : "Transfer BSI";
}

/**
 * Langkah 1 top up: isi jumlah + pilih metode → "Lanjut bayar" membuat data
 * `menunggu_bayar` (60 menit) lalu pindah ke halaman bayar.
 * QRIS/rekening BELUM ditampilkan di sini.
 */
export default function TopUpPanel() {
  const { me } = useReseller();
  const router = useRouter();
  const hasQris = Boolean(me.pengaturan.qris_image_url);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethodChoice>("bsi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<TopupRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  const next = async () => {
    setError("");
    if (amount < 1) {
      setError("Isi jumlah top up dulu.");
      return;
    }
    setBusy(true);
    try {
      const activeMethod: PaymentMethodChoice = method === "qris" && hasQris ? "qris" : "bsi";
      const res = await resellerApi.createTopup(amount, activeMethod);
      router.push(`/reseller/top-up/${encodeURIComponent(res.code)}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal membuat top up. Coba lagi.");
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="card">
        <div className="card-b stack" style={{ gap: 16 }}>
          <div style={{ textAlign: "center" }}>
            <h1 className="bold" style={{ fontSize: 18 }}>
              Isi jumlah top up
            </h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              Saldo bertambah setelah admin mengonfirmasi bukti pembayaran.
            </p>
          </div>

          <div style={{ maxWidth: 320, margin: "0 auto", width: "100%" }}>
            <RupiahInput hero value={amount} onChange={setAmount} placeholder="0" ariaLabel="Jumlah top up" />
          </div>

          <div className="chips" style={{ justifyContent: "center" }}>
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

          <div>
            <p className="small bold" style={{ marginBottom: 8 }}>
              Pilih metode pembayaran
            </p>
            <MethodCards hasQris={hasQris} value={hasQris ? method : "bsi"} onChange={setMethod} />
          </div>

          {error ? <Note tone="err">{error}</Note> : null}

          <button className="btn blk" type="button" disabled={busy || amount < 1} onClick={next}>
            {busy ? <Loader2 size={16} /> : null}
            Lanjut bayar
          </button>
        </div>
      </div>

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
              const view = topupDisplay(row);
              return (
                <Link className="list-row" key={row.id} href={`/reseller/top-up/${encodeURIComponent(row.code)}`}>
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{rupiah(row.amount)}</div>
                    <div className="s">
                      {methodLabel(row.payment_method)} · {view.description}
                    </div>
                    {view.extra ? (
                      <div className="s" style={{ color: "var(--rs-err)" }}>
                        {view.extra}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    {view.badge ? <StatusBadge status={view.badge} /> : null}
                    <span className="s" style={{ textDecoration: "underline" }}>
                      Lihat
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
