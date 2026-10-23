"use client";

/**
 * Panel "Order Management" — daftar pesanan dashboard admin.
 *
 * Tampilannya mengikuti menu Transaksi dashboard ops: kartu KPI → tab tahap → bar filter →
 * tabel (berubah jadi kartu di layar ≤720px). Datanya tetap dari prop `orders` yang sudah
 * diambil halaman admin; tidak ada query baru.
 *
 * Aksi pesanan tetap hanya ada di drawer detail (`OrderDetailContent`); baris tabel cuma
 * membuka detail lewat `onSelect`.
 */
import { useMemo, useState } from "react";
import {
  ORDER_STAGE_LABEL,
  ORDER_STAGE_TABS,
  matchesStage,
  orderStage,
  type OrderStageFilter,
} from "@/lib/order-flow";
import { ORDER_SOURCE_LABEL, SALE_STATUSES, orderRevenue, orderSourceKey, orderSourceLabel, saleCount } from "@/lib/transaksi";
import StageIcon from "@/components/ops/transaksi/StageIcon";
import AnimatedNumber from "@/components/AnimatedNumber";
import "@/app/ops/ops-transaksi.css";

/** Field yang dipakai daftar; `Order` di halaman admin memenuhinya. */
export interface AdminOrderRow {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email?: string | null;
  customer_whatsapp?: string | null;
  shipping_method?: string | null;
  awb_no?: string | null;
  /** Status pengiriman (menunggu_pickup | dikirim | selesai) — beda dari status pesanan. */
  shipping_status?: string | null;
  status: string;
  total: number;
  /** Ongkir yang dibayar customer — diambil dari `order.total` oleh `orderRevenue()`. */
  shipping_cost?: number | null;
  created_at: string;
  /** Sumber mentah dari database; label selalu lewat helper `orderSource*`. */
  source?: string | null;
  order_items?: {
    product_name: string;
    color?: string | null;
    size?: string | null;
    series?: string | null;
    kain?: string | null;
    quantity: number;
  }[];
}

const STAGE_BADGE: Record<string, string> = {
  belum_bayar: "bayar",
  belum_dipacking: "packing",
  sudah_dipacking: "siap",
  dikirim: "kirim",
  selesai: "selesai",
  dibatalkan: "batal",
};

function tanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function jam(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
    .replace(":", ".");
}

function rupiah(n: number) {
  return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
}

/** "Kain X · Series · Warna · Ukuran" — bagian yang sama dengan kolom Produk di ops. */
function itemVariant(item?: NonNullable<AdminOrderRow["order_items"]>[number]) {
  if (!item) return "";
  return [
    item.kain ? `Kain ${item.kain}` : null,
    item.series,
    item.color && item.color !== "default" ? item.color : null,
    item.size,
  ]
    .filter(Boolean)
    .join(" · ");
}

function StageBadge({ order }: { order: AdminOrderRow }) {
  const stage = orderStage(order);
  return (
    <span className={`bd s-${STAGE_BADGE[stage] || "batal"}`}>
      {ORDER_STAGE_LABEL[stage]}
    </span>
  );
}

export default function OrdersView({
  orders,
  onSelect,
  loading = false,
  periodLabel,
  onPrevMonth,
  onNextMonth,
}: {
  orders: AdminOrderRow[];
  onSelect: (order: AdminOrderRow) => void;
  loading?: boolean;
  /** Label periode (mis. "Oktober 2026") — caption KPI, sama seperti menu Transaksi ops. */
  periodLabel?: string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
}) {
  const [orderSource, setOrderSource] = useState<string>("all");
  const [orderFilter, setOrderFilter] = useState<OrderStageFilter>("semua");
  const [orderSearch, setOrderSearch] = useState("");

  // Tabel boleh disaring per sumber; KPI & hitungan tab selalu memakai SELURUH pesanan
  // periode itu — aturan yang sama dengan menu Transaksi ops.
  const sourceOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (orderSource === "all") return true;
        return orderSourceKey(o) === orderSource;
      }),
    [orders, orderSource],
  );

  // Opsi filter memakai sumber yang sudah dipetakan helper, bukan tebakan awalan.
  const sourceOptions = useMemo(() => [...new Set(orders.map((o) => orderSourceKey(o)))], [orders]);

  const orderQuery = orderSearch.trim().toLowerCase();
  const searchedOrders = useMemo(() => {
    if (!orderQuery) return sourceOrders;
    return sourceOrders.filter((o) =>
      [
        o.order_number,
        o.customer_name,
        o.customer_email,
        o.customer_whatsapp,
        ...(o.order_items || []).map((item) => item.product_name),
      ].some((value) => (value || "").toLowerCase().includes(orderQuery))
    );
  }, [sourceOrders, orderQuery]);

  const visibleOrders = useMemo(
    () => searchedOrders.filter((o) => matchesStage(o, orderFilter)),
    [searchedOrders, orderFilter],
  );

  // KPI dihitung dari SELURUH pesanan periode itu (bukan hasil filter) — sama seperti menu Transaksi.
  //
  // Jumlah TRANSAKSI memakai aturan bersama `saleCount()` (diproses/dikirim/selesai): angka yang sama
  // dengan menu Transaksi, dashboard ops, dan "N transaksi" di Laporan Keuangan. Dulu kartu ini
  // menghitung SEMUA baris periode itu (termasuk belum bayar & dibatalkan), jadi angkanya beda
  // sendiri dari layar lain. Jumlah semua pesanan masuk tetap tampil sebagai keterangan (`ordersIn`).
  //
  // Omset memakai `orderRevenue()` (harga PRODUK saja = total − ongkir) supaya sama dengan kartu
  // "Omset bulan ini" di menu Transaksi & Laporan — `orders.total` masih memuat ongkir.
  const kpis = useMemo(() => {
    const sold = orders.filter((o) => (SALE_STATUSES as readonly string[]).includes(o.status));
    return {
      total: saleCount(orders),
      ordersIn: orders.length,
      revenue: sold.reduce((sum, o) => sum + orderRevenue(o), 0),
      unpaid: orders.filter((o) => orderStage(o) === "belum_bayar").length,
      toProcess: orders.filter((o) => {
        const stage = orderStage(o);
        return stage === "belum_dipacking" || stage === "sudah_dipacking";
      }).length,
    };
  }, [orders]);

  const stageTabs = useMemo(
    () =>
      ORDER_STAGE_TABS.map((tab) => ({
        ...tab,
        count:
          tab.key === "semua"
            ? orders.length
            : orders.filter((o) => orderStage(o) === tab.key).length,
      })),
    [orders],
  );

  const sourceLabelText =
    orderSource === "all" ? "Semua sumber" : ORDER_SOURCE_LABEL[orderSource] || orderSource;
  /** Label periode (mis. "Oktober 2026") — dipakai saat kartu masih memuat. */
  const periodCaption = periodLabel || sourceLabelText;
  /**
   * Keterangan kartu "Total transaksi": HANYA pesanan periode yang sedang dipilih, mis.
   * "dari 143 pesanan masuk bulan Oktober 2026" — jadi angka 143 tidak terbaca sebagai total
   * sepanjang waktu. Dulu bunyinya "Oktober 2026 · dari 143 pesanan masuk" (periode di depan,
   * "dari" di tengah) dan pemilik menanyakan 143 itu pesanan bulan mana. Bentuknya sama dengan
   * menu Transaksi ops.
   */
  const ordersNote = periodLabel
    ? `dari ${kpis.ordersIn} pesanan masuk bulan ${periodLabel}`
    : `dari ${kpis.ordersIn} pesanan masuk`;
  const filtersActive = Boolean(orderQuery) || orderFilter !== "semua" || orderSource !== "all";
  const resetFilters = () => {
    setOrderSearch("");
    setOrderFilter("semua");
    setOrderSource("all");
  };
  const ordersEmptyText = orderQuery
    ? "Tidak ada pesanan yang cocok dengan pencarian"
    : orderSource === "all"
      ? "Tidak ada pesanan"
      : `Tidak ada pesanan ${ORDER_SOURCE_LABEL[orderSource] || orderSource}`;

  return (
    <div className="ops-tx">
      <section className="ks">
        <div className="card k">
          <small>Total transaksi</small>
          <b><AnimatedNumber value={loading ? 0 : kpis.total} /></b>
          <i>{loading ? periodCaption : ordersNote}</i>
        </div>
        <div className="card k">
          <small>Omset bulan ini</small>
          <b><AnimatedNumber value={loading ? 0 : kpis.revenue} format={(n) => rupiah(n)} /></b>
          <i>Tidak termasuk dibatalkan</i>
        </div>
        <div className="card k">
          <small>Belum bayar</small>
          <b style={{ color: "#c76f00" }}><AnimatedNumber value={loading ? 0 : kpis.unpaid} /></b>
          <i>Perlu follow-up</i>
        </div>
        <div className="card k">
          <small>Perlu diproses</small>
          <b style={{ color: "#2e64c9" }}><AnimatedNumber value={loading ? 0 : kpis.toProcess} /></b>
          <i>Packing + siap kirim</i>
        </div>
      </section>

      <div className="bar">
        <div className="tabs">
          {stageTabs
            .filter((tab) => tab.key !== "belum_dipacking")
            .map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`tab${orderFilter === tab.key ? " on" : ""}`}
                onClick={() => setOrderFilter(tab.key)}
              >
                <span className="ti">
                  <StageIcon stage={tab.key} />
                </span>
                <span className="tl2">{tab.label}</span>
                <em>{tab.count}</em>
              </button>
            ))}
        </div>

        <div className="f">
          <input
            value={orderSearch}
            onChange={(event) => setOrderSearch(event.target.value)}
            placeholder="Cari no. pesanan / nama / WhatsApp..."
            aria-label="Cari pesanan"
          />
          <button
            type="button"
            className={`packf${orderFilter === "belum_dipacking" ? " on" : ""}`}
            onClick={() =>
              setOrderFilter((current) => (current === "belum_dipacking" ? "semua" : "belum_dipacking"))
            }
            aria-pressed={orderFilter === "belum_dipacking"}
          >
            Belum di packing
            <em>{stageTabs.find((tab) => tab.key === "belum_dipacking")?.count ?? 0}</em>
          </button>
          {onPrevMonth || onNextMonth ? (
            <div className="ptx-month">
              <button type="button" onClick={onPrevMonth} aria-label="Bulan sebelumnya">
                ‹
              </button>
              <b>{periodLabel || "Bulan ini"}</b>
              <button type="button" onClick={onNextMonth} aria-label="Bulan berikutnya">
                ›
              </button>
            </div>
          ) : null}
          <select
            value={orderSource}
            onChange={(event) => setOrderSource(event.target.value)}
            aria-label="Sumber pesanan"
          >
            <option value="all">Semua sumber</option>
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {ORDER_SOURCE_LABEL[source] || source}
              </option>
            ))}
          </select>
          {filtersActive ? (
            <button type="button" className="btn-sec" onClick={resetFilters}>
              Reset
            </button>
          ) : null}
        </div>
      </div>

      <div className="card tw">
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>Memuat…</div>
        ) : visibleOrders.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
            <b style={{ color: "#0f172a" }}>{ordersEmptyText}</b>
            <p style={{ fontSize: 13, marginTop: 4 }}>
              {filtersActive ? "Ubah pencarian atau filter, atau tampilkan semua." : "Pesanan akan muncul di sini."}
            </p>
          </div>
        ) : (
          <table>
            <colgroup>
              <col style={{ width: "16%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "4%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>No. Pesanan</th>
                <th>Pelanggan</th>
                <th>Produk</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>No. Resi</th>
                <th>Status</th>
                <th className="chev" />
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((o) => {
                const stage = orderStage(o);
                const firstItem = o.order_items?.[0];
                const extraItems = Math.max(0, (o.order_items?.length || 0) - 1);
                const variantText = itemVariant(firstItem);
                const sourceLabel = orderSourceLabel(o);
                return (
                  <tr key={o.id} onClick={() => onSelect(o)}>
                    <td data-label="No. Pesanan">
                      <span className="id">{o.order_number}</span>
                      <small>
                        {tanggal(o.created_at)} · {jam(o.created_at)}
                      </small>
                    </td>
                    <td data-label="Pelanggan">
                      <b>{o.customer_name}</b>
                      <small>{o.customer_whatsapp || o.customer_email || "-"}</small>
                    </td>
                    <td data-label="Produk">
                      <span style={{ fontWeight: 600 }}>{firstItem?.product_name || "-"}</span>
                      <small>
                        {variantText ? `${variantText} × ${firstItem?.quantity || 1}` : `× ${firstItem?.quantity || 0}`}
                        {extraItems > 0 ? ` · +${extraItems} lainnya` : ""}
                      </small>
                    </td>
                    <td className="mono" style={{ textAlign: "right" }} data-label="Total">
                      {rupiah(o.total)}
                      <small style={{ textAlign: "right" }}>{sourceLabel}</small>
                    </td>
                    <td data-label="No. Resi">
                      {o.awb_no ? (
                        <span className="resi-no" title={`No. Resi J&T ${o.awb_no}`}>
                          {o.awb_no}
                        </span>
                      ) : (
                        <span className="resi-empty">–</span>
                      )}
                      {stage === "belum_dipacking" ? <small className="pack-todo">Belum di packing</small> : null}
                      {stage === "sudah_dipacking" ? <small className="pack-done">Menunggu pickup</small> : null}
                    </td>
                    <td data-label="Status">
                      <StageBadge order={o} />
                    </td>
                    <td className="chev" style={{ textAlign: "right" }}>
                      ›
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
