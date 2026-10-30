"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/affiliate/icons";
import {
  Badge,
  Empty,
  Pager,
  Search,
  Select,
  Stat,
  Table,
  paginate,
  useModal,
} from "@/components/affiliate/ui";
import { affiliateFetch } from "@/lib/affiliate/client";
import { COMMISSION_STATUS_LABEL, jam, money, num, tgl } from "@/lib/affiliate/format";
import { PERIOD_OPTIONS, inRange, periodLabel, rangeFor } from "@/lib/affiliate/period";

/**
 * Komisi Saya — saldo, riwayat komisi, dan rincian perhitungan.
 * Struktur mengikuti mockup.
 */

interface CommissionRow {
  id: string;
  orderId: string;
  orderNumber: string | null;
  baseAmount: number;
  rate: number;
  amount: number;
  paidAmount: number;
  status: string;
  reason: string | null;
  availableAt: string | null;
  breakdown: { productId: string; price: number; quantity: number; rate: number; amount: number }[];
  createdAt: string;
}

interface CommissionEvent {
  commission_id: string;
  from_status: string | null;
  to_status: string | null;
  amount: number | null;
  note: string | null;
  created_at: string;
}

export default function AffiliateCommissionsPage() {
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [events, setEvents] = useState<CommissionEvent[]>([]);
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
    commission_mode: "percent",
    commission_percent: 0,
    fixed_commission: null as number | null,
    validation_days: 14,
    require_paid: true,
    require_completed: true,
  });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("all");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { open } = useModal();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await affiliateFetch<{
          commissions: CommissionRow[];
          events: CommissionEvent[];
          balance: typeof balance;
          settings: typeof settings;
        }>("/api/affiliate/commissions");
        if (!alive) return;
        setCommissions(json.commissions || []);
        setEvents(json.events || []);
        setBalance(json.balance);
        setSettings(json.settings);
      } catch (e) {
        console.error("[AFFILIATE] Gagal memuat komisi:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab status dari URL (dipakai tombol "Lihat Detail" di ringkasan).
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("status");
    if (!fromUrl) return;
    const found = Object.entries(COMMISSION_STATUS_LABEL).find(([, v]) => v === fromUrl);
    if (found) setStatus(found[0]);
  }, []);

  const list = useMemo(() => {
    let rows = commissions;
    if (period !== "all") {
      const range = rangeFor(period);
      rows = rows.filter((c) => inRange(c.createdAt, range));
    }
    if (status) rows = rows.filter((c) => c.status === status);
    if (q) rows = rows.filter((c) => (c.orderNumber || "").toLowerCase().includes(q.toLowerCase()));
    return rows;
  }, [commissions, period, status, q]);

  const pg = paginate(list, page, 10);

  const showDetail = (row: CommissionRow) => {
    const history = events.filter((e) => e.commission_id === row.id);
    open({
      title: "Rincian Perhitungan Komisi",
      body: (
        <div>
          <div className="row between" style={{ marginBottom: 12 }}>
            <b className="dark">{row.orderNumber || row.orderId}</b>
            <Badge label={COMMISSION_STATUS_LABEL[row.status] || row.status} />
          </div>

          <div className="box">
            <div className="small muted b" style={{ marginBottom: 8 }}>
              RUMUS
            </div>
            <div className="b dark">
              Komisi = Dasar penjualan yang memenuhi syarat × Persentase komisi produk
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              Ongkos kirim, biaya layanan, dan potongan tidak termasuk dasar penjualan.
            </div>
          </div>

          <div className="mt">
            {row.breakdown?.length ? (
              row.breakdown.map((b, i) => (
                <div
                  className="row between"
                  style={{ padding: "8px 0", borderBottom: "1px solid var(--af-bd)" }}
                  key={i}
                >
                  <div className="small">
                    <b className="dark">{b.productId}</b>
                    <div className="muted">
                      {b.quantity} × {money(b.price)} = {money(b.price * b.quantity)} × {b.rate}%
                    </div>
                  </div>
                  <b>{money(b.amount)}</b>
                </div>
              ))
            ) : (
              <p className="small muted">Tidak ada rincian per item.</p>
            )}
          </div>

          <div className="kv mt">
            <dt>Dasar penjualan</dt>
            <dd>{money(row.baseAmount)}</dd>
            <dt>Estimasi komisi</dt>
            <dd>{money(row.amount)}</dd>
            <dt>Sudah dibayar</dt>
            <dd>{money(row.paidAmount)}</dd>
            <dt>Komisi final</dt>
            <dd style={{ color: "var(--af-pri)" }}>
              {money(row.status === "ditolak" ? 0 : row.amount - row.paidAmount)}
            </dd>
          </div>

          <div className={`note ${row.status === "ditolak" ? "" : "i"} mt`}>
            <Icon name="info" className="sm" />
            <span>
              {row.status === "ditolak"
                ? `Alasan: ${row.reason || "Pesanan dibatalkan atau diretur."}`
                : row.status === "menunggu"
                  ? `Komisi ini belum final dan belum dapat ditarik.${row.availableAt ? ` Siap setelah ${tgl(row.availableAt)}.` : ""}`
                  : row.status === "disetujui"
                    ? "Komisi telah disetujui dan masuk ke saldo tersedia untuk ditarik."
                    : "Komisi ini sudah dicairkan melalui penarikan dana."}
            </span>
          </div>

          {history.length > 0 && (
            <>
              <h4 className="b dark mt" style={{ marginBottom: 10 }}>
                Riwayat Perubahan Komisi
              </h4>
              <ul className="tl">
                {history.map((h, i) => (
                  <li key={i}>
                    <div className="small b dark">
                      {h.from_status || "baru"} → {h.to_status || "-"}
                      {h.amount ? ` · ${money(h.amount)}` : ""}
                    </div>
                    {h.note ? <div className="small muted">{h.note}</div> : null}
                    <div className="small muted">{jam(h.created_at)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ),
    });
  };

  return (
    <div>
      <div className="grid g5">
        <Stat
          icon="coins"
          label="Total Komisi"
          value={money(balance.pending + balance.approved + balance.paid)}
          sub="Di luar yang tidak disetujui"
        />
        <Stat icon="clock" label="Menunggu Validasi" value={money(balance.pending)} sub="Belum dapat ditarik" />
        <Stat icon="cc" label="Disetujui" value={money(balance.approved)} sub="Masuk saldo tersedia" />
        <Stat icon="cash" label="Sudah Dibayarkan" value={money(balance.paid)} sub="Telah dicairkan" />
        <Stat icon="xc" label="Tidak Disetujui" value={money(balance.rejected)} sub="Batal / retur" />
      </div>

      {settings.commission_percent === 0 && settings.commission_mode === "percent" ? (
        <div className="note mt">
          <Icon name="info" className="sm" />
          <span>
            Persentase komisi belum ditetapkan admin. Nilai di dashboard mengikuti pengaturan
            resmi di dashboard admin → Affiliate → Pengaturan Komisi.
          </span>
        </div>
      ) : null}

      <div className="card mt">
        <div className="ch">
          <div>
            <h3>Riwayat Komisi</h3>
            <p>{list.length} catatan komisi</p>
          </div>
        </div>

        <div className="filters">
          <Search
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Cari nomor pesanan…"
          />
          <Select
            value={period}
            onChange={(v) => {
              setPeriod(v);
              setPage(1);
            }}
            options={[
              ["all", "Semua Periode"],
              ...PERIOD_OPTIONS.filter(([k]) => k !== "tm" && k !== "lm").map(
                ([k, l]) => [k, l] as [string, string],
              ),
            ]}
          />
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              ["", "Semua Status"],
              ["menunggu", "Menunggu Validasi"],
              ["disetujui", "Disetujui"],
              ["dibayarkan", "Dibayarkan"],
              ["ditolak", "Tidak Disetujui"],
            ]}
          />
        </div>

        {loading ? (
          <div className="cp muted small">Memuat komisi…</div>
        ) : pg.total === 0 ? (
          <Empty icon="coins" title="Komisi tidak ditemukan" text="Belum ada komisi dari pesanan referral." />
        ) : (
          <>
            <Table
              columns={[
                { label: "Tanggal", render: (c) => tgl(c.createdAt) },
                {
                  label: "No. Pesanan",
                  render: (c) => (
                    <button
                      className="b"
                      style={{ border: 0, background: "none", color: "var(--af-pri)", cursor: "pointer", padding: 0 }}
                      onClick={() => showDetail(c)}
                      type="button"
                    >
                      {c.orderNumber || "-"}
                    </button>
                  ),
                },
                { label: "Dasar Penjualan", num: true, render: (c) => money(c.baseAmount) },
                {
                  label: "Komisi %",
                  num: true,
                  render: (c) =>
                    c.baseAmount
                      ? `${((c.amount / c.baseAmount) * 100).toFixed(1).replace(".", ",")}%`
                      : "-",
                },
                {
                  label: "Nilai Komisi",
                  num: true,
                  render: (c) => (
                    <b className="dark">{money(c.amount)}</b>
                  ),
                },
                { label: "Status", render: (c) => <Badge label={COMMISSION_STATUS_LABEL[c.status] || c.status} /> },
                {
                  label: "Keterangan",
                  render: (c) => <span className="small muted">{c.reason || "-"}</span>,
                },
                {
                  label: "",
                  render: (c) => (
                    <button className="btn s sm" onClick={() => showDetail(c)} type="button">
                      Rincian
                    </button>
                  ),
                },
              ]}
              rows={pg.rows}
            />
            <Pager page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onPage={setPage} />
          </>
        )}
      </div>

      {period !== "all" ? (
        <p className="small muted mt">Periode aktif: {periodLabel(period, rangeFor(period))}</p>
      ) : null}
      <p className="small muted">Total transaksi: {num(list.length)}</p>
    </div>
  );
}
