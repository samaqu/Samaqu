"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Truck } from "lucide-react";
import { resellerApi, type OrderDetail } from "@/lib/reseller/client";
import { orderStatus, rupiah, tglJamID } from "@/lib/reseller/format";
import { useReseller } from "./ResellerShell";
import PaymentMethodTabs, { type PaymentMethodChoice } from "./PaymentMethodTabs";
import UploadBukti from "./UploadBukti";
import { Note, SkeletonRows, StatusBadge } from "./ui";

/** Detail pesanan reseller: item + untung, alamat, status, resi & tracking. */
export default function PesananDetailPanel({ orderNumber }: { orderNumber: string }) {
  const { me } = useReseller();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [method, setMethod] = useState<PaymentMethodChoice>("bsi");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

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

  const sendProof = async (url: string | null) => {
    setProofUrl(url);
    if (!url || !order) return;
    setSending(true);
    try {
      const activeMethod: PaymentMethodChoice =
        method === "qris" && me.pengaturan.qris_image_url ? "qris" : "bsi";
      await resellerApi.uploadProof(order.order_number, url, activeMethod);
      setSent(true);
    } catch {
      setError("Bukti gagal dikirim. Coba lagi.");
    } finally {
      setSending(false);
    }
  };

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

  const status = orderStatus(order.status);
  const waitingShortfall = order.reseller_shortfall_status === "pending" && order.status === "pending";
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

  return (
    <div className="stack">
      <Link href="/reseller/pesanan" className="row small bold" style={{ gap: 6 }}>
        <ArrowLeft size={15} /> Semua pesanan
      </Link>

      <div className="card">
        <div className="card-b stack">
          <div className="spread">
            <div>
              <div className="small muted">Nomor pesanan</div>
              <b style={{ fontSize: 17 }}>{order.order_number}</b>
              <div className="small muted">{tglJamID(order.created_at)}</div>
            </div>
            <StatusBadge status={status} />
          </div>

          {waitingShortfall ? (
            <Note tone="warn">
              <b>Menunggu konfirmasi transfer</b> — kekurangan {rupiah(order.reseller_shortfall_amount)}.
              <br />
              Pesanan diproses setelah admin mengecek transfer kamu. Kalau tidak dibayar dalam 24 jam,
              pesanan otomatis dibatalkan dan saldo dikembalikan.
              <div style={{ marginTop: 10 }}>
                {sent ? (
                  <span style={{ fontWeight: 700 }}>Bukti terkirim. Menunggu konfirmasi admin.</span>
                ) : (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <PaymentMethodTabs settings={me.pengaturan} method={method} onChange={setMethod} />
                    </div>
                    <UploadBukti value={proofUrl} onChange={sendProof} label="Upload bukti transfer" />
                  </>
                )}
                {sending ? <p className="hint" style={{ marginTop: 6 }}>Mengirim bukti…</p> : null}
              </div>
            </Note>
          ) : null}

          {order.status === "dibatalkan" ? (
            <Note tone="err">
              Pesanan dibatalkan{order.cancel_reason ? `: ${order.cancel_reason}` : "."} Saldo yang terpotong
              sudah dikembalikan otomatis.
            </Note>
          ) : null}

          {order.awb_no ? (
            <div className="note ok" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Truck size={16} />
              <span>
                Resi <b>{order.awb_no}</b>
                {order.tracking_status_text ? ` · ${order.tracking_status_text}` : ""}
              </span>
            </div>
          ) : null}

          <div className="kv-list">
            <div className="it">
              <span className="muted">Penerima</span>
              <b className="bold">
                {order.customer_name} · {order.customer_whatsapp}
              </b>
            </div>
            <div className="it">
              <span className="muted">Alamat</span>
              <span style={{ textAlign: "right", maxWidth: 420 }}>
                {order.shipping_address}, {order.shipping_kecamatan || order.shipping_city}
                {order.shipping_postal_code ? `, ${order.shipping_postal_code}` : ""}
              </span>
            </div>
            <div className="it">
              <span className="muted">Pengiriman</span>
              <span>
                {order.shipping_method} · {rupiah(order.shipping_cost)}
              </span>
            </div>
            <div className="it">
              <span className="muted">Nama toko di label</span>
              <b>{order.show_reseller_name_on_label ? "Tampil" : "Tidak tampil"}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Produk</h2>
        </div>
        <div className="card-b" style={{ paddingTop: 8, paddingBottom: 8 }}>
          {order.order_items.map((item) => {
            const buy = Number(item.price) || 0;
            const sell = Number(item.reseller_sell_price) || 0;
            const qty = Number(item.quantity) || 1;
            return (
              <div className="list-row" key={item.id} style={{ alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                  {item.product_image ? (
                    <img
                      src={item.product_image}
                      alt={item.product_name}
                      style={{ width: 44, height: 55, objectFit: "cover", borderRadius: 8 }}
                    />
                  ) : null}
                  <div>
                    <div className="t">{item.product_name}</div>
                    <div className="s">
                      {[item.series, item.color, item.size].filter(Boolean).join(" · ")} × {qty}
                    </div>
                    <div className="s">
                      Beli {rupiah(buy)} · Jual {rupiah(sell)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="amount pos">+{rupiah(Math.max(0, sell - buy) * qty)}</div>
                  <div className="s">untung</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="kv">
            <span>Harga beli produk</span>
            <b>{rupiah(itemsTotal)}</b>
          </div>
          <div className="kv">
            <span>Ongkir</span>
            <b>{rupiah(order.shipping_cost)}</b>
          </div>
          <div className="kv total">
            <span>Total</span>
            <b>{rupiah(order.total)}</b>
          </div>
          <div className="kv">
            <span>Dipotong dari saldo</span>
            <b style={{ color: "var(--rs-ok)" }}>{rupiah(order.reseller_balance_deduction)}</b>
          </div>
          <div className="kv">
            <span>Estimasi untung</span>
            <b style={{ color: "var(--rs-ok)" }}>{rupiah(profit)}</b>
          </div>
        </div>
      </div>

      {order.tracking.length > 0 ? (
        <div className="card">
          <div className="card-h">
            <h2>Perjalanan paket</h2>
          </div>
          <div className="card-b">
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
