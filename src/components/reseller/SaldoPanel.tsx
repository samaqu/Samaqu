"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resellerApi, type LedgerRow } from "@/lib/reseller/client";
import { LEDGER_TABS } from "@/lib/reseller/format";
import { MutasiList } from "./ListPanels";
import { Note } from "./ui";

/** Riwayat mutasi saldo lengkap: tab jenis + filter bulan + muat lebih banyak. */
export default function SaldoPanel() {
  const [tab, setTab] = useState("semua");
  const currentMonth = useMemo(() => {
    const wib = new Date(Date.now() + 7 * 3600 * 1000);
    return wib.toISOString().slice(0, 7);
  }, []);
  const [bulan, setBulan] = useState(currentMonth);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPage = useCallback(async (nextTab: string, month: string, nextPage: number) => {
    const spec = LEDGER_TABS.find((t) => t.key === nextTab) || LEDGER_TABS[0];
    if (spec.jenis.length <= 1) {
      const res = await resellerApi.ledger({
        jenis: spec.jenis[0],
        bulan: month,
        page: nextPage,
        pageSize: 30,
      });
      return { rows: res.data, total: res.total };
    }
    const parts = await Promise.all(
      spec.jenis.map((jenis) =>
        resellerApi.ledger({ jenis, bulan: month, page: nextPage, pageSize: 30 })
      )
    );
    return {
      rows: parts
        .flatMap((part) => part.data)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      total: parts.reduce((sum, part) => sum + part.total, 0),
    };
  }, []);

  const load = useCallback(
    async (nextTab: string, month: string, nextPage: number, append: boolean) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetchPage(nextTab, month, nextPage);
        setRows((prev) => (append ? [...prev, ...res.rows] : res.rows));
        setHasMore(nextPage * 30 < res.total);
      } catch {
        setError("Gagal memuat mutasi saldo.");
      } finally {
        setLoading(false);
      }
    },
    [fetchPage]
  );

  useEffect(() => {
    setPage(1);
    load(tab, bulan, 1, false);
  }, [tab, bulan, load]);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-b stack" style={{ gap: 12 }}>
          <div className="tabs">
            {LEDGER_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`tab ${tab === t.key ? "on" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 10 }}>
            <label className="small bold" htmlFor="rs-bulan">
              Bulan
            </label>
            <input
              id="rs-bulan"
              type="month"
              className="in"
              style={{ maxWidth: 190 }}
              value={bulan}
              onChange={(e) => setBulan(e.target.value)}
            />
            {bulan !== currentMonth ? (
              <button type="button" className="btn ghost sm" onClick={() => setBulan(currentMonth)}>
                Bulan ini
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <Note tone="err">
          {error}{" "}
          <button
            className="btn ghost sm"
            type="button"
            style={{ marginLeft: 8 }}
            onClick={() => load(tab, bulan, 1, false)}
          >
            Coba lagi
          </button>
        </Note>
      ) : null}

      <div className="card">
        <div className="card-b" style={{ paddingTop: 6, paddingBottom: 10 }}>
          <MutasiList rows={rows} loading={loading && rows.length === 0} />
          {!loading && hasMore ? (
            <button
              className="btn ghost sm blk"
              type="button"
              style={{ marginTop: 10 }}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                load(tab, bulan, next, true);
              }}
            >
              Muat lebih banyak
            </button>
          ) : null}
          {loading && rows.length > 0 ? <p className="hint" style={{ marginTop: 8 }}>Memuat…</p> : null}
        </div>
      </div>
    </div>
  );
}
