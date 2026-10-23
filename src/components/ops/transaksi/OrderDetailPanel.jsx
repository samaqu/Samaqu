"use client";

/**
 * Isi detail pesanan bergaya panel admin — SATU komponen untuk tiga surface:
 *   theme="panel" → panel admin (aksen pink)
 *   theme="mono"  → dashboard ops & dashboard admin (aksen hitam/slate)
 *
 * Yang berbeda hanya warna aksen; susunan, data, dan ikonnya sama.
 */

import { CreditCard, MapPin, ShoppingBag, Truck } from "lucide-react";
import { NEUTRAL_ITEM_PHOTO } from "@/lib/order-photo";
import { isPaketItem, variantName } from "@/lib/item-label";
import { ORDER_STAGE_LABEL, SHIPPING_STATUS_LABEL, orderStage } from "@/lib/order-flow";
import CopyButton from "@/components/ui/CopyButton";
import { usePaymentMethodName } from "@/lib/use-payment-methods";
import { paymentChannelLabel } from "@/lib/payment-channel";
import { formatWeightExact } from "@/lib/shipping-weight";
import { formatTrackingTime } from "@/lib/jnt/track-status";
import { jntServiceTag } from "@/lib/jnt/layanan";
import JntBadge from "@/components/JntBadge";
import { formatRupiah, formatTanggalJamID } from "@/components/ops/transaksi/transaksi-format";

const STAGE_KEY = {
  belum_bayar: "bayar",
  belum_dipacking: "packing",
  sudah_dipacking: "siap",
  dikirim: "kirim",
  selesai: "selesai",
  dibatalkan: "batal",
};

const BANNER = {
  belum_bayar: ["Menunggu pembayaran", "Pesanan akan dibatalkan otomatis jika belum dibayar dalam 24 jam."],
  belum_dipacking: ["Pesanan perlu dipacking", "Kemas pesanan, lalu buat resi supaya paket siap diserahkan ke kurir."],
  sudah_dipacking: ["Menunggu pickup", "Resi sudah dibuat — paket menunggu dijemput kurir J&T."],
  dikirim: ["Pesanan dalam perjalanan", "Paket sedang diantar oleh kurir ke alamat pembeli."],
  selesai: ["Pesanan selesai", "Pesanan telah diterima oleh pembeli."],
  dibatalkan: ["Pesanan dibatalkan", ""],
};

const STEP_LEVEL = { belum_bayar: 0, belum_dipacking: 1, sudah_dipacking: 2, dikirim: 3, selesai: 4 };

export default function OrderDetailPanel({
  order,
  theme = "panel",
  latestTracking = null,
  trackingState = "idle",
  shippingContent = null,
  onOpenTrack,
  serviceCode = "",
}) {
  const isMono = theme === "mono";
  const stage = orderStage(order);
  const panelKey = STAGE_KEY[stage] || "batal";
  const banner = BANNER[stage] || ["Pesanan", ""];
  const stepLevel = STEP_LEVEL[stage] ?? 0;
  const awb = order.awb_no || "";
  const kota = order.kota || order.shipping_city || "";
  const region = [order.shipping_kecamatan, kota, order.shipping_province, order.shipping_postal_code]
    .filter(Boolean)
    .join(", ");
  const { name: paymentName } = usePaymentMethodName(order.payment_method);
  // Rincian channel gateway (mis. Mayar → "QRIS" / "BNI Virtual Account"), kalau sudah tercatat.
  const channelLabel = paymentChannelLabel(order.payment_channel);
  const paymentDetail = paymentName
    ? `${paymentName}${channelLabel ? ` · ${channelLabel}` : ""}`
    : channelLabel || "-";
  const serviceTag = jntServiceTag(serviceCode || order.shipping_method);
  const accent = isMono ? "#0f172a" : "var(--panel-accent, #c2255c)";
  const minAccent = isMono ? "#475569" : "#B4552F";

  const meta = latestTracking
    ? [latestTracking.location, latestTracking.dateTime ? formatTrackingTime(latestTracking.dateTime) : ""]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className={`panel-tx${isMono ? " panel-mono" : ""}`}>
      <div className={`ban b-${panelKey}`}>
        <div className="bt">
          <div>
            <b>{banner[0]}</b>
            <p>{stage === "dibatalkan" ? order.notes || banner[1] : banner[1]}</p>
          </div>
          <span className={`bd s-${panelKey}`}>{ORDER_STAGE_LABEL[stage]}</span>
        </div>
        {stage !== "dibatalkan" ? (
          <div className="stp">
            {["Dibayar", "Dikemas", "Dikirim", "Selesai"].map((label, index) => (
              <div key={label} className={index < stepLevel ? "d" : ""}>
                <i />
                <span>{label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sec2">
        <div className="sh">
          <Truck />
          <b>Informasi Pengiriman</b>
          {awb && onOpenTrack ? (
            <a onClick={onOpenTrack} role="button" tabIndex={0}>
              Lihat ›
            </a>
          ) : null}
        </div>
        <div className="kv">
          <span>Kurir</span>
          <b style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            <JntBadge label="J&T Express" />
          </b>
        </div>
        <div className="kv">
          <span>Layanan</span>
          <b>
            <span className="bd s-siap">{serviceTag}</span>
          </b>
        </div>

        {shippingContent ? (
          shippingContent
        ) : (
          <>
            <div className="kv">
              <span>Nomor Resi</span>
              <b style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                {awb || "-"}
                <CopyButton value={awb} label="nomor resi" />
              </b>
            </div>
            {latestTracking ? (
              <div className="kv" style={{ alignItems: "flex-start" }}>
                <span>Status terbaru</span>
                <b style={{ textAlign: "right" }}>
                  {latestTracking.status}
                  {meta ? <small style={{ display: "block", fontWeight: 500 }}>{meta}</small> : null}
                </b>
              </div>
            ) : (
              <div className="kv">
                <span>Status kirim</span>
                <b>
                  {trackingState === "loading"
                    ? "memuat…"
                    : SHIPPING_STATUS_LABEL[order.shipping_status] || order.shipping_status || "-"}
                </b>
              </div>
            )}
            {!awb ? <p className="adr">Resi belum dibuat untuk pesanan ini.</p> : null}
          </>
        )}
      </div>

      {order.shipping_address ? (
        <div className="sec2">
          <div className="sh">
            <MapPin />
            <b>Alamat Pengiriman</b>
          </div>
          <p className="adr">
            <b>{order.customer_name}</b>{" "}
            {order.customer_whatsapp ? <span>({order.customer_whatsapp})</span> : null}
            <br />
            {order.shipping_address}
            {region ? (
              <>
                <br />
                {region}
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="sec2">
        <div className="sh">
          <ShoppingBag />
          <b>SAMAQU Official</b>
        </div>
        {(order.items || []).map((item, index) => (
          <div className="it" key={`${item.product_id}-${item.color}-${item.size}-${index}`}>
            <div className="th">
              <img src={item.product_image || NEUTRAL_ITEM_PHOTO} alt={item.product_name} loading="lazy" decoding="async" />
            </div>
            <div>
              <b>{item.product_name}</b>
              <small>
                {isPaketItem(item)
                  ? [item.kain ? `Kain ${item.kain}` : null, variantName(item.color) || variantName(item.series) || null]
                      .filter(Boolean)
                      .join(" · ")
                  : [item.kain ? `Kain ${item.kain}` : null, item.series, item.color && item.color !== "default" ? item.color : null, item.size]
                      .filter(Boolean)
                      .join(" · ")}
              </small>
              <small>× {item.quantity}</small>
              {item.weight ? (
                <small>
                  Berat:{" "}
                  <b style={{ color: "#334155" }}>
                    {item.weight.source === "missing" ? "-" : formatWeightExact(item.weight.grams)}
                  </b>
                  {item.weight.source !== "variant" ? (
                    <span style={{ color: "#b45309", fontWeight: 700 }}>
                      {" "}
                      · {item.weight.source === "product" ? "fallback berat produk" : "berat per ukuran belum diisi"}
                    </span>
                  ) : null}
                </small>
              ) : null}
              {item.customer_price && item.minimum_price ? (
                <small style={{ color: minAccent, fontWeight: 600 }}>
                  Min: Rp {formatRupiah(item.minimum_price)} · Dipilih: Rp {formatRupiah(item.customer_price)}
                </small>
              ) : null}
            </div>
            <b className="mono">Rp {formatRupiah(item.price * item.quantity)}</b>
          </div>
        ))}
        {(order.items || []).length === 0 ? <p className="adr">Tidak ada produk tercatat.</p> : null}
        <div className="rw">
          <span>Subtotal Produk</span>
          <span>Rp {formatRupiah(order.subtotal)}</span>
        </div>
        <div className="rw">
          <span>Subtotal Pengiriman</span>
          <span>Rp {formatRupiah(order.shipping_cost)}</span>
        </div>
        {order.discount > 0 ? (
          <div className="rw">
            <span>Voucher Toko</span>
            <span style={{ color: "#2f9e5b" }}>- Rp {formatRupiah(order.discount)}</span>
          </div>
        ) : null}
        <div className="rw t">
          <span>Total Pesanan</span>
          <span style={{ color: accent }}>Rp {formatRupiah(order.total)}</span>
        </div>
      </div>

      <div className="sec2">
        <div className="sh">
          <CreditCard />
          <b>Metode Pembayaran</b>
          <span style={{ marginLeft: "auto", color: isMono ? "#0f172a" : "#6b4b5a", fontWeight: 600 }}>{paymentDetail}</span>
        </div>
      </div>

      {order.notes ? <div className="note">Catatan pembeli: {order.notes}</div> : null}

      <div className="sec2">
        <div className="kv">
          <span>No. Pesanan</span>
          <b style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {order.order_number}
            <CopyButton value={order.order_number} label="nomor pesanan" />
          </b>
        </div>
        <div className="kv">
          <span>Waktu Pemesanan</span>
          <b>{formatTanggalJamID(order.created_at)}</b>
        </div>
        <div className="kv">
          <span>Waktu Pembayaran</span>
          <b>{order.paid_at ? formatTanggalJamID(order.paid_at) : "-"}</b>
        </div>
      </div>
    </div>
  );
}
