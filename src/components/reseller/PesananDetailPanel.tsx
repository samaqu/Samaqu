"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Truck } from "lucide-react";
import { resellerApi, type OrderDetail } from "@/lib/reseller/client";
import { rupiah, tglJamID } from "@/lib/reseller/format";
import { isPastDeadline } from "@/lib/reseller/deadline";
import {
  SHIPPING_STATUS_LABEL,
  orderStage,
  shippingStatusOf,
} from "@/lib/order-flow";
import OrderStagePill from "./OrderStagePill";
import ProductPhoto from "./ProductPhoto";
import { Note, SkeletonRows } from "./ui";

function paymentLabel(method: string | null | undefined): string {
  if (method === "qris") return "QRIS";
  if (method === "bsi") return "Transfer BSI";
  if (method === "reseller") return "Saldo reseller";
  return method || "—";
}

function itemChips(item: OrderDetail["order_items"][number]): string[] {
  return [
    item.kain ? `Kain ${item.kain}` : null,
    item.series,
    item.color && item.color !== "default" ? item.color : null,
    item.size,
  ].filter((value): value is string => Boolean(value));
}

/** Detail pesanan reseller — kartu bertumpuk, data & istilah sama dengan Transaksi admin. */
export default function PesananDetailPanel({ orderNumber }: { orderNumber: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    resellerApi
      .orderDetail(orderNumber)
      .then((res) => alive && setOrder(res.data))
      .catch((e) => alive && setError(e?.message || "Pesanan tidak ditemukan."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [orderNumber]);

  if (loading) {
    return (
      <div className="card">
        <div className="card-b">
          <SkeletonRows rows={5} />
        </div>
      </div>
    );
  }
  if (error || !order) {
    return (
      <Note tone="err">
        {error || "Pesanan tidak ditemukan."}{" "}
        <Link className="btn ghost sm" href="/reseller/pesanan" style={{ marginLeft: 8 }}>
          Kembali
        </Link>
      </Note>
    );
  }

  const stage = orderStage(order);
  const itemsTotal = order.order_items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );
  const profit = order.order_items.reduce(
    (sum, item) =>
      sum +
      Math.max(0, (Number(item.reseller_sell_price) || 0) - (Number(item.price) || 0)) *
        (Number(item.quantity) || 1),
    0
  );
  const shipStatus = shippingStatusOf(order);
  const shortfall = order.shortfall;
  const deadlinePassed = shortfall ? isPastDeadline(shortfall.deadline) : false;
  const waitingShortfall =
    Boolean(shortfall) &&
    shortfall?.status === "pending" &&
    order.status === "pending" &&
    !deadlinePassed;
  const address = [
    order.shipping_address,
    order.shipping_kecamatan || order.shipping_city,
    order.shipping_province,
    order.shipping_postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="stack" style={{ paddingBottom: waitingShortfall ? 78 : undefined }}>
      <Link href="/reseller/pesanan" className="row small bold" style={{ gap: 6 }}>
        <ArrowLeft size={15} /> Semua pesanan
      </Link>

      <div className="card">
        <div className="card-b stack" style={{ gap: 10 }}>
          <div className="spread" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="small muted">Nomor pesanan</div>
              <b style={{ fontSize: 17, fontFamily: "ui-monospace, monospace" }}>{order.order_number}</b>
              <div className="small muted">{tglJamID(order.created_at)}</div>
            </div>
            <OrderStagePill stage={stage} />
          </div>

          {shortfall && waitingShortfall ? (
            <Note tone="warn">
              <b>Menunggu pembayaran kekurangan {rupiah(shortfall.amount)}.</b>
              <br />
              Pesanan diproses setelah pembayaran dikonfirmasi admin.
              {shortfall.deadline ? (
                <div className="small" style={{ marginTop: 4 }}>
                  Bayar sebelum {tglJamID(shortfall.deadline)}.
                </div>
              ) : null}
              <div style={{ marginTop: 10 }}>
                <Link
                  className="btn sm"
                  href={`/reseller/pesanan/${encodeURIComponent(order.order_number)}/bayar`}
                >
                  Bayar kekurangan
                </Link>
              </div>
            </Note>
          ) : shortfall && shortfall.status === "rejected" ? (
            <Note tone="err">
              Bukti pembayaran kekurangan ditolak. Pesanan dibatalkan dan saldo yang terpotong sudah
              dikembalikan{order.cancel_reason ? `: ${order.cancel_reason}` : "."}
            </Note>
          ) : order.status === "dibatalkan" ? (
            <Note tone="err">
              Pesanan dibatalkan{order.cancel_reason ? `: ${order.cancel_reason}` : "."} Saldo yang
              terpotong sudah dikembalikan otomatis.
            </Note>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Informasi Produk</h2>
        </div>
        <div className="card-b" style={{ paddingTop: 8, paddingBottom: 10 }}>
          {order.order_items.map((item) => {
            const buy = Number(item.price) || 0;
            const sell = Number(item.reseller_sell_price) || 0;
            const qty = Number(item.quantity) || 1;
            const chips = itemChips(item);
            return (
              <div className="list-row" key={item.id} style={{ alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                  <ProductPhoto
                    src={item.product_image}
                    name={item.product_name}
                    series={item.series}
                    className="oi-ph"
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{item.product_name}</div>
                    <div className="s" style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                      {chips.map((chip) => (
                        <span className="chip-tag" key={chip}>
                          {chip}
                        </span>
                      ))}
                      <span className="chip-tag">× {qty}</span>
                    </div>
                    <div className="s" style={{ marginTop: 4 }}>
                      Beli {rupiah(buy)} · Jual {rupiah(sell)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right", flex: "none" }}>
                  <div className="amount pos">+{rupiah(Math.max(0, sell - buy) * qty)}</div>
                  <div className="s">untung</div>
                </div>
              </div>
            );
          })}

          <div className="kv-list" style={{ marginTop: 8, borderTop: "1px solid var(--rs-bd)", paddingTop: 8 }}>
            <div className="it">
              <span className="muted">Subtotal produk</span>
              <b>{rupiah(itemsTotal)}</b>
            </div>
            <div className="it">
              <span className="muted">Ongkir</span>
              <b>{rupiah(order.shipping_cost)}</b>
            </div>
            <div className="it">
              <span className="muted bold">Total</span>
              <b style={{ fontSize: 15 }}>{rupiah(order.total)}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Detail Pesanan</h2>
        </div>
        <div className="card-b">
          <div className="kv-list">
            <div className="it">
              <span className="muted">Nomor pesanan</span>
              <b style={{ fontFamily: "ui-monospace, monospace" }}>{order.order_number}</b>
            </div>
            <div className="it">
              <span className="muted">Metode pembayaran</span>
              <b>{paymentLabel(order.payment_method)}</b>
            </div>
            <div className="it">
              <span className="muted">Waktu pemesanan</span>
              <b>{tglJamID(order.created_at)}</b>
            </div>
            <div className="it">
              <span className="muted">Waktu pembayaran</span>
              <b>{order.paid_at ? tglJamID(order.paid_at) : "Belum dibayar"}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Penerima</h2>
        </div>
        <div className="card-b">
          <div className="kv-list">
            <div className="it">
              <span className="muted">Nama</span>
              <b>{order.customer_name || "—"}</b>
            </div>
            <div className="it">
              <span className="muted">WhatsApp</span>
              <b>{order.customer_whatsapp || "—"}</b>
            </div>
            <div className="it">
              <span className="muted">Alamat</span>
              <span style={{ textAlign: "right", maxWidth: 460 }}>{address || "—"}</span>
            </div>
            <div className="it">
              <span className="muted">Catatan</span>
              <span style={{ textAlign: "right", maxWidth: 460 }}>{order.shipping_notes || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Pengiriman</h2>
        </div>
        <div className="card-b stack" style={{ gap: 10 }}>
          <div className="kv-list">
            <div className="it">
              <span className="muted">Layanan</span>
              <b>{order.shipping_method || "—"}</b>
            </div>
            <div className="it">
              <span className="muted">Ongkir</span>
              <b>{rupiah(order.shipping_cost)}</b>
            </div>
            <div className="it">
              <span className="muted">Nomor resi</span>
              <b>
                {order.awb_no || "—"}
                {order.awb_no ? (
                  <button
                    type="button"
                    className="iconbtn"
                    style={{ width: 28, height: 28, marginLeft: 6, display: "inline-grid" }}
                    aria-label="Salin nomor resi"
                    onClick={() => navigator.clipboard?.writeText(order.awb_no || "").catch(() => {})}
                  >
                    <Copy size={12} />
                  </button>
                ) : null}
              </b>
            </div>
            <div className="it">
              <span className="muted">Status pengiriman</span>
              <b>{shipStatus ? SHIPPING_STATUS_LABEL[shipStatus] : "Belum dikirim"}</b>
            </div>
          </div>
          {order.tracking.length > 0 ? (
            <div className="timeline">
              {order.tracking.map((event, index) => (
                <div className="tl-item" key={index}>
                  <span className="tl-dot" />
                  <div>
                    <div className="small bold">{event.status_text || "Update J&T"}</div>
                    <div className="s">
                      {[event.city_name, event.event_time ? tglJamID(event.event_time) : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="small muted">
              <Truck size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
              Belum ada riwayat perjalanan paket.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Ringkasan Reseller</h2>
        </div>
        <div className="card-b">
          <div className="kv">
            <span>Harga beli produk</span>
            <b>{rupiah(itemsTotal)}</b>
          </div>
          <div className="kv">
            <span>Harga jual ke customer</span>
            <b>{rupiah(order.order_items.reduce((sum, item) => sum + (Number(item.reseller_sell_price) || 0) * (Number(item.quantity) || 1), 0))}</b>
          </div>
          <div className="kv">
            <span>Estimasi untung</span>
            <b style={{ color: "var(--rs-ok)" }}>{rupiah(profit)}</b>
          </div>
          <div className="kv">
            <span>Dipotong dari saldo</span>
            <b style={{ color: "var(--rs-ok)" }}>{rupiah(order.reseller_balance_deduction)}</b>
          </div>
          {Number(order.reseller_shortfall_amount) > 0 ? (
            <div className="kv">
              <span>Kekurangan pembayaran</span>
              <b>{rupiah(order.reseller_shortfall_amount)}</b>
            </div>
          ) : null}
        </div>
      </div>

      {waitingShortfall && shortfall ? (
        <div className="detail-pay-bar">
          <div>
            <div className="small muted">Kekurangan</div>
            <b>{rupiah(shortfall.amount)}</b>
          </div>
          <Link
            className="btn"
            href={`/reseller/pesanan/${encodeURIComponent(order.order_number)}/bayar`}
          >
            Bayar kekurangan
          </Link>
        </div>
      ) : null}
    </div>
  );
}
