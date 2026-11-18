"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Search } from "lucide-react";
import { AdminApiError, opsResellerApi, type ResellerAdminRow, type RiwayatQuery } from "./api";
import { rupiah, tglJamID } from "@/lib/reseller/format";
import { ORDER_STAGE_STYLE, ORDER_STAGE_TABS, type OrderStage } from "@/lib/order-flow";
import type { RiwayatItem, RiwayatOrder, RiwayatSummary } from "@/lib/reseller/riwayat";
// Gaya tabel Transaksi (kelas `.card.tw`, `.id`, `.mono`, `.resi-no`, `.bd`, `.chev`). Seluruh rule
// di-scope `.ops-tx` / `.panel-tx`, jadi tidak memengaruhi bagian lain halaman Reseller.
import "@/app/(internal)/ops/ops-transaksi.css";
import "@/app/(internal)/panel-admin/panel-transaksi.css";

type Periode = "bulan" | "rentang" | "semua";

/** Warna lencana status — palet `.bd.s-*` yang sama dengan tabel Transaksi. */
const STAGE_BADGE: Record<OrderStage, string> = {
  belum_bayar: "bayar",
  menunggu_stok: "siap",
  belum_dipacking: "siap",
  sudah_dipacking: "siap",
  dikirim: "kirim",
  selesai: "selesai",
  dibatalkan: "batal",
};

/** Baris kecil di bawah nama produk: "Kain B-01 · Imalah · S × 1" (format yang sama dengan Transaksi). */
function itemDetail(item: RiwayatItem): string {
  const variant = [item.kain ? `Kain ${item.kain}` : "", item.series, item.color, item.size].filter(Boolean).join(" · ");
  return `${variant ? `${variant} ` : ""}× ${item.quantity}`;
}

const FIELD =
  "px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const STATUS_OPTIONS = ORDER_STAGE_TABS.filter((tab) => tab.key !== "semua");

function currentMonth(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}

function StagePill({ order }: { order: RiwayatOrder }) {
  const style = ORDER_STAGE_STYLE[order.stage];
  return (
    <span
      className="inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap"
      style={{ background: style.bg, color: style.color, borderColor: style.border }}
    >
      {order.stage_label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  warn,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Catatan kecil berwarna kuning (mis. saldo ditahan). */
  warn?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3.5 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1 truncate">{label}</p>
      <p className={`text-[18px] font-extrabold truncate ${accent ? "text-emerald-600" : "text-slate-900"}`}>{value}</p>
      {sub ? <p className={`text-[11px] mt-0.5 ${warn ? "text-amber-600" : "text-slate-400"}`}>{sub}</p> : null}
    </div>
  );
}

/** Riwayat pesanan semua reseller, satu baris per item — BACA SAJA (tanpa aksi yang mengubah data). */
export default function RiwayatTab({
  resellers,
  onOpenOrder,
  variant = "ops",
}: {
  resellers: ResellerAdminRow[];
  onOpenOrder: (orderNumber: string) => void;
  /** Dashboard ops (`ops-tx`) atau panel admin (`panel-tx`, ikut tema warna panel). */
  variant?: "ops" | "panel";
}) {
  const [resellerId, setResellerId] = useState("");
  const [periode, setPeriode] = useState<Periode>("bulan");
  const [bulan, setBulan] = useState(currentMonth());
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [orders, setOrders] = useState<RiwayatOrder[]>([]);
  const [summary, setSummary] = useState<RiwayatSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  // Pencarian ditunda sebentar supaya tidak memanggil server di setiap ketukan.
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const rangeInvalid = periode === "rentang" && Boolean(dari) && Boolean(sampai) && dari > sampai;

  const query = useMemo<RiwayatQuery>(
    () => ({
      reseller_id: resellerId || undefined,
      bulan: periode === "bulan" ? bulan || undefined : undefined,
      dari: periode === "rentang" ? dari || undefined : undefined,
      sampai: periode === "rentang" ? sampai || undefined : undefined,
      status: status || undefined,
      q: q || undefined,
    }),
    [resellerId, periode, bulan, dari, sampai, status, q]
  );

  const load = useCallback(
    async (nextPage: number) => {
      const id = ++requestId.current;
      if (nextPage === 1) setLoading(true);
      else setLoadingMore(true);
      setError("");
      try {
        const res = await opsResellerApi.riwayat({ ...query, page: nextPage });
        if (id !== requestId.current) return; // balasan lama, abaikan
        setOrders((prev) => (nextPage === 1 ? res.data : [...prev, ...res.data]));
        setSummary(res.summary);
        setTotal(res.total);
        setPage(res.page);
        setHasMore(res.has_more);
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e instanceof AdminApiError ? e.message : "Gagal memuat riwayat pesanan.");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [query]
  );

  useEffect(() => {
    if (rangeInvalid) {
      requestId.current++;
      setLoading(false);
      return;
    }
    load(1);
  }, [load, rangeInvalid]);

  const exportCsv = async () => {
    setExporting(true);
    setError("");
    try {
      const { blob, filename } = await opsResellerApi.riwayatCsv(query);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal mengekspor CSV.");
    } finally {
      setExporting(false);
    }
  };

  const selected = resellerId ? resellers.find((row) => row.id === resellerId) : undefined;
  const cards: { label: string; value: string; sub?: string }[] = summary
    ? [
        { label: "Jumlah pesanan", value: String(summary.pesanan) },
        { label: "Jumlah item", value: String(summary.item), sub: `${summary.pcs} pcs` },
        { label: "Total produk", value: rupiah(summary.total_produk) },
        { label: "Total ongkir", value: rupiah(summary.total_ongkir) },
      ]
    : [];

  const open = (order: RiwayatOrder) => onOpenOrder(order.order_number);
  const keyOpen = (order: RiwayatOrder) => (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open(order);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <select className={FIELD} value={resellerId} onChange={(e) => setResellerId(e.target.value)} aria-label="Filter reseller">
          <option value="">Semua reseller</option>
          {resellers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.store_name}
            </option>
          ))}
        </select>
        <select className={FIELD} value={periode} onChange={(e) => setPeriode(e.target.value as Periode)} aria-label="Jenis periode">
          <option value="bulan">Per bulan</option>
          <option value="rentang">Rentang tanggal</option>
          <option value="semua">Semua waktu</option>
        </select>
        {periode === "bulan" ? (
          <input type="month" className={FIELD} value={bulan} onChange={(e) => setBulan(e.target.value)} aria-label="Filter bulan" />
        ) : null}
        {periode === "rentang" ? (
          <>
            <input type="date" className={FIELD} value={dari} onChange={(e) => setDari(e.target.value)} aria-label="Dari tanggal" />
            <span className="text-slate-400 text-sm">s/d</span>
            <input type="date" className={FIELD} value={sampai} onChange={(e) => setSampai(e.target.value)} aria-label="Sampai tanggal" />
          </>
        ) : null}
        <select className={FIELD} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
          <option value="">Semua status</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${FIELD} w-full pl-9 text-slate-900`}
            placeholder="Cari nomor pesanan, resi, atau nama penerima…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting || loading || total === 0 || rangeInvalid}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Download size={15} /> {exporting ? "Mengekspor…" : "Export CSV"}
        </button>
      </div>

      {rangeInvalid ? (
        <div className="px-4 py-3 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold">
          Tanggal mulai tidak boleh setelah tanggal akhir.
        </div>
      ) : null}
      {error ? <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold">{error}</div> : null}

      {/* Kartu ringkasan: mengikuti filter, pesanan dibatalkan tidak dihitung */}
      {summary ? (
        <>
          <div className={`grid grid-cols-2 gap-3 ${selected ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            {cards.map((card) => (
              <SummaryCard key={card.label} label={card.label} value={card.value} sub={card.sub} />
            ))}
            {selected ? (
              <SummaryCard
                label={`Saldo saat ini · ${selected.store_name}`}
                value={rupiah(selected.saldo?.saldo_tersedia ?? 0)}
                sub={(selected.saldo?.saldo_ditahan ?? 0) > 0 ? `ditahan ${rupiah(selected.saldo?.saldo_ditahan ?? 0)}` : undefined}
                warn
                accent
              />
            ) : null}
          </div>
          {summary.dibatalkan > 0 ? (
            <p className="text-[11.5px] text-slate-400 -mt-2">
              {summary.dibatalkan} pesanan dibatalkan tampil di daftar tetapi tidak dihitung di kartu.
            </p>
          ) : null}
        </>
      ) : null}

      {/* Daftar: tabel bergaya Transaksi. Pembungkus tema membatasi CSS Transaksi hanya ke area ini. */}
      <div className={variant === "panel" ? "ops-root panel-tx !bg-transparent !min-h-0" : "ops-tx"}>
      <div className="card tw">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat riwayat pesanan…</div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-bold text-slate-700">Belum ada pesanan pada filter ini.</p>
            <p className="text-sm text-slate-500 mt-1">Ubah bulan, reseller, atau status untuk melihat pesanan lain.</p>
          </div>
        ) : (
          <>
            {/* Desktop: tabel bergaya Transaksi, satu baris per item (data order hanya di baris pertama) */}
            <div className="hidden min-[721px]:block overflow-x-auto">
              {/* Di bawah lebar minimum tabel menggulir mendatar (rapi), bukan menjejalkan kolom. */}
              <table className="!min-w-[960px]">
                <colgroup>
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "23%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "3%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>No. Pesanan</th>
                    <th>Reseller</th>
                    <th>Produk</th>
                    <th className="!text-right">Harga Beli</th>
                    <th className="!text-right">Ongkir</th>
                    <th>No. Resi</th>
                    <th>Status</th>
                    <th className="chev" />
                  </tr>
                </thead>
                {orders.map((order) => {
                  const lines = order.items.length > 0 ? order.items : [null];
                  return (
                    <tbody key={order.id}>
                      {lines.map((item, index) => {
                        const first = index === 0;
                        const last = index === lines.length - 1;
                        // Item satu pesanan dirapatkan jadi satu kelompok: garis pemisah hanya di bawah item terakhir.
                        const tdCls = `${last ? "" : "!border-b-0 !pb-0.5"} ${first ? "" : "!pt-0.5"}`.trim() || undefined;
                        return (
                          <tr
                            key={index}
                            tabIndex={0}
                            role="button"
                            aria-label={`Buka detail pesanan ${order.order_number}`}
                            onClick={() => open(order)}
                            onKeyDown={keyOpen(order)}
                            className={`focus:outline-none ${order.cancelled ? "opacity-60" : ""}`}
                          >
                            <td data-label="No. Pesanan" className={tdCls}>
                              {first ? (
                                <>
                                  <span className="id">{order.order_number}</span>
                                  <small>{tglJamID(order.created_at)}</small>
                                </>
                              ) : null}
                            </td>
                            <td data-label="Reseller" className={tdCls}>
                              {first ? <b>{order.reseller_name}</b> : null}
                            </td>
                            <td data-label="Produk" className={tdCls}>
                              {item ? (
                                <>
                                  <span className="font-semibold">{item.product_name || "—"}</span>
                                  <small>{itemDetail(item)}</small>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td data-label="Harga Beli" className={`mono text-right ${tdCls || ""}`}>
                              {item ? (
                                <>
                                  {rupiah(item.buy_price)}
                                  {item.quantity > 1 ? <small className="text-right">= {rupiah(item.buy_price * item.quantity)}</small> : null}
                                </>
                              ) : null}
                            </td>
                            <td data-label="Ongkir" className={`mono text-right ${tdCls || ""}`}>
                              {first ? rupiah(order.shipping_cost) : null}
                            </td>
                            <td data-label="No. Resi" className={tdCls}>
                              {first ? (
                                order.awb_no ? (
                                  <span
                                    className={`resi-no${order.cancelled ? " resi-void" : ""}`}
                                    title={order.cancelled ? `Resi ${order.awb_no} sudah di-void (pesanan dibatalkan)` : `No. Resi J&T ${order.awb_no}`}
                                  >
                                    {order.awb_no}
                                  </span>
                                ) : (
                                  <span className="resi-empty">–</span>
                                )
                              ) : null}
                            </td>
                            <td data-label="Status" className={tdCls}>
                              {first ? <span className={`bd s-${STAGE_BADGE[order.stage]}`}>{order.stage_label}</span> : null}
                            </td>
                            <td className={`chev text-right ${tdCls || ""}`}>{first ? "›" : null}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>

            {/* HP: satu kartu per pesanan, item dijejer di dalamnya */}
            <div className="min-[721px]:hidden divide-y divide-slate-100">
              {orders.map((order) => (
                <div
                  key={order.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Buka detail pesanan ${order.order_number}`}
                  onClick={() => open(order)}
                  onKeyDown={keyOpen(order)}
                  className={`px-4 py-3.5 cursor-pointer active:bg-slate-50 ${order.cancelled ? "text-slate-400" : "text-slate-700"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`font-bold text-[13px] ${order.cancelled ? "" : "text-slate-900"}`}>{order.order_number}</div>
                      <div className="text-[11px] text-slate-400">{tglJamID(order.created_at)}</div>
                    </div>
                    <StagePill order={order} />
                  </div>
                  <div className="text-[12px] mt-1">
                    {order.reseller_name}
                    {order.customer_name ? <span className="text-slate-400"> · {order.customer_name}</span> : null}
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {order.items.map((item, index) => (
                      <li key={index} className="rounded-lg bg-slate-50 px-3 py-2 text-[12px]">
                        <div className={`font-semibold ${order.cancelled ? "" : "text-slate-900"}`}>{item.product_name || "—"}</div>
                        <div className="text-[11px] text-slate-500">
                          {[item.series, item.kain ? `Kain ${item.kain}` : "", item.color, item.size ? `Size ${item.size}` : ""]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span>
                            {item.quantity} pcs × {rupiah(item.buy_price)}
                          </span>
                          <span className="font-semibold">{rupiah(item.quantity * item.buy_price)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between gap-3 mt-2 text-[12px]">
                    <span>Ongkir {rupiah(order.shipping_cost)}</span>
                    <span className="font-mono truncate">{order.awb_no ? `Resi ${order.awb_no}` : "Belum ada resi"}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-slate-100">
              <p className="text-[11.5px] text-slate-400">
                Menampilkan {orders.length} dari {total} pesanan
              </p>
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => load(page + 1)}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-xl text-[13px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                >
                  {loadingMore ? "Memuat…" : "Muat lagi"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
