"use client";

/**
 * Drawer "Detail Pesanan" portal reseller.
 *
 * Kerangka + animasi + overlay + lebar panel memakai `PanelDetailShell` dari
 * panel admin (`src/components/ops/transaksi/PanelDetailPesanan.tsx`) dengan tema
 * `mono` — sama persis dengan dashboard ops & /admin, tanpa salinan gaya.
 *
 * Isi drawer disusun dari data halaman detail lama (`PesananDetailPanel`) dengan
 * urutan: nomor+status+tanggal → produk → biaya → detail pesanan → penerima
 * (alamat tertutup) → pengiriman → ringkasan reseller.
 *
 * Tidak menulis apa pun ke database. Pembayaran kekurangan tetap memakai rute
 * lama `/reseller/pesanan/[orderNumber]/bayar`.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, MapPin, Package, Receipt, Truck } from "lucide-react";
import { resellerApi, type OrderDetail } from "@/lib/reseller/client";
import { rupiah, tglJamID } from "@/lib/reseller/format";
import { isPastDeadline } from "@/lib/reseller/deadline";
import { SHIPPING_STATUS_LABEL, orderStage, shippingStatusOf } from "@/lib/order-flow";
import ProductPhoto from "./ProductPhoto";
import OrderStagePill from "./OrderStagePill";
import { Note, SkeletonRows } from "./ui";
import { PanelDetailShell } from "@/components/ops/transaksi/PanelDetailPesanan";

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

export default function ResellerOrderDrawer({
  orderNumber,
  onClose,
}: {
  /** Nomor pesanan yang dibuka; `null` = tertutup. */
  orderNumber: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const open = Boolean(orderNumber);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nomor: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await resellerApi.orderDetail(nomor);
      setOrder(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pesanan tidak ditemukan.");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!orderNumber) {
      setOrder(null);
      setError("");
      return;
    }
    load(orderNumber);
  }, [orderNumber, load]);

  const totals = useMemo(() => {
    if (!order) return { beli: 0, jual: 0, untung: 0 };
    return order.order_items.reduce(
      (acc, item) => {
        const buy = Number(item.price) || 0;
        const sell = Number(item.reseller_sell_price) || 0;
        const qty = Number(item.quantity) || 1;
        acc.beli += buy * qty;
        acc.jual += sell * qty;
        acc.untung += Math.max(0, sell - buy) * qty;
        return acc;
      },
      { beli: 0, jual: 0, untung: 0 }
    );
  }, [order]);

  if (!open) return null;

  const stage = order ? orderStage(order) : "belum_bayar";
  const shipStatus = order ? shippingStatusOf(order) : null;
  const shortfall = order?.shortfall || null;
  const deadlinePassed = shortfall ? isPastDeadline(shortfall.deadline) : false;
  const waitingShortfall =
    Boolean(shortfall) && shortfall?.status === "pending" && order?.status === "pending" && !deadlinePassed;
  const address = order
    ? [
        order.shipping_address,
        order.shipping_kecamatan || order.shipping_city,
        order.shipping_province,
        order.shipping_postal_code,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const keHalamanBayar = () => {
    if (!order) return;
    router.push(`/reseller/pesanan/${encodeURIComponent(order.order_number)}/bayar`);
  };

  return (
    <PanelDetailShell open={open} onClose={onClose} tema="mono">
      <style>{RS_DRAWER_CSS}</style>

      <div className="rso">
        <div className="rso-head">
          <div>
            <span className="rso-kicker">Reseller Center</span>
            <h2>Detail Pesanan</h2>
          </div>
          <button type="button" className="rso-x" onClick={onClose} aria-label="Tutup">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="rso-body">
          {loading || !order ? (
            error ? (
              <Note tone="err">
                {error}
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="btn ghost sm" onClick={onClose}>
                    Tutup
                  </button>
                </div>
              </Note>
            ) : (
              <SkeletonRows rows={6} />
            )
          ) : (
            <>
              {/* 1. Nomor + status + tanggal */}
              <section className="rso-card">
                <div className="rso-top">
                  <div style={{ minWidth: 0 }}>
                    <CopyValue value={order.order_number} />
                    <div className="rso-sub">{tglJamID(order.created_at)}</div>
                  </div>
                  <OrderStagePill stage={stage} />
                </div>

                {shortfall && waitingShortfall ? (
                  <Note tone="warn">
                    <b>Menunggu pembayaran kekurangan {rupiah(shortfall.amount)}.</b>
                    <div className="rso-sub" style={{ marginTop: 4 }}>
                      Pesanan diproses setelah pembayaran dikonfirmasi admin.
                      {shortfall.deadline ? ` Bayar sebelum ${tglJamID(shortfall.deadline)}.` : ""}
                    </div>
                  </Note>
                ) : shortfall && shortfall.status === "rejected" ? (
                  <Note tone="err">
                    Bukti pembayaran kekurangan ditolak. Pesanan dibatalkan dan saldo yang terpotong sudah
                    dikembalikan{order.cancel_reason ? `: ${order.cancel_reason}` : "."}
                  </Note>
                ) : order.status === "dibatalkan" ? (
                  <Note tone="err">
                    Pesanan dibatalkan{order.cancel_reason ? `: ${order.cancel_reason}` : "."} Saldo yang terpotong
                    sudah dikembalikan otomatis.
                  </Note>
                ) : null}
              </section>

              {/* 2. Informasi produk + ringkasan biaya */}
              <section className="rso-card">
                <SectionHead icon={<Package size={13} />} title="Informasi Produk" />
                {order.order_items.length === 0 ? (
                  <p className="rso-sub" style={{ margin: 0 }}>
                    Tidak ada produk tercatat.
                  </p>
                ) : null}
                {order.order_items.map((item) => {
                  const buy = Number(item.price) || 0;
                  const sell = Number(item.reseller_sell_price) || 0;
                  const qty = Number(item.quantity) || 1;
                  const chips = itemChips(item);
                  return (
                    <div className="rso-item" key={item.id}>
                      <ProductPhoto
                        src={item.product_image}
                        name={item.product_name}
                        series={item.series}
                        className="rso-photo"
                      />
                      <div className="rso-item-txt">
                        <div className="rso-item-name">{item.product_name}</div>
                        <div className="rso-chips">
                          {chips.map((chip) => (
                            <span className="rso-chip" key={chip}>
                              {chip}
                            </span>
                          ))}
                          <span className="rso-chip">× {qty}</span>
                        </div>
                        <div className="rso-sub">
                          Beli {rupiah(buy)} · Jual {rupiah(sell)}
                        </div>
                      </div>
                      <div className="rso-profit">
                        +{rupiah(Math.max(0, sell - buy) * qty)}
                        <span>untung</span>
                      </div>
                    </div>
                  );
                })}

                <div className="rso-sum">
                  <div className="rso-sum-row">
                    <span>Subtotal produk</span>
                    <b>{rupiah(totals.beli)}</b>
                  </div>
                  <div className="rso-sum-row">
                    <span>Ongkir</span>
                    <b>{rupiah(order.shipping_cost)}</b>
                  </div>
                  <div className="rso-sum-line" />
                  <div className="rso-sum-row total">
                    <span>Total</span>
                    <b>{rupiah(order.total)}</b>
                  </div>
                </div>
              </section>

              {/* 3. Detail pesanan */}
              <section className="rso-card">
                <SectionHead icon={<Receipt size={13} />} title="Detail Pesanan" />
                <Row label="Nomor pesanan" value={order.order_number} mono />
                <Row label="Metode pembayaran" value={paymentLabel(order.payment_method)} />
                <Row label="Waktu pemesanan" value={tglJamID(order.created_at)} />
                <Row label="Waktu pembayaran" value={order.paid_at ? tglJamID(order.paid_at) : "Belum dibayar"} />
              </section>

              {/* 4. Penerima — alamat tertutup default */}
              <section className="rso-card">
                <SectionHead icon={<MapPin size={13} />} title="Penerima" />
                <Row label="Nama" value={order.customer_name || "—"} />
                <Row label="WhatsApp" value={order.customer_whatsapp || "—"} />
                <AlamatTersembunyi alamat={address} catatan={order.shipping_notes} />
              </section>

              {/* 5. Pengiriman */}
              <section className="rso-card">
                <SectionHead
                  icon={<Truck size={13} />}
                  title="Pengiriman"
                  aside={
                    <>
                      <span className="rso-badge jnt">J&amp;T</span>
                      {order.shipping_method ? <span className="rso-badge">{order.shipping_method}</span> : null}
                    </>
                  }
                />
                <Row label="Nomor resi" value={order.awb_no || "—"} mono copy={Boolean(order.awb_no)} />
                <Row
                  label="Status pengiriman"
                  value={shipStatus ? SHIPPING_STATUS_LABEL[shipStatus] : "Belum dikirim"}
                />
                <Row label="Ongkir" value={rupiah(order.shipping_cost)} />
                {order.tracking.length > 0 ? (
                  <div className="rso-timeline">
                    {order.tracking.slice(0, 6).map((event, index) => (
                      <div className="rso-tl" key={index}>
                        <span className="rso-dot" />
                        <div>
                          <div className="rso-tl-t">{event.status_text || "Update J&T"}</div>
                          <div className="rso-sub">
                            {[event.city_name, event.event_time ? tglJamID(event.event_time) : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rso-sub" style={{ margin: 0 }}>
                    Belum ada riwayat perjalanan paket.
                  </p>
                )}
              </section>

              {/* 6. Ringkasan reseller */}
              <section className="rso-card">
                <SectionHead icon={<Receipt size={13} />} title="Ringkasan Reseller" />
                <Row label="Harga beli produk" value={rupiah(totals.beli)} />
                <Row label="Harga jual ke customer" value={rupiah(totals.jual)} />
                <Row label="Estimasi untung" value={rupiah(totals.untung)} tone="ok" />
                <Row label="Dipotong dari saldo" value={rupiah(order.reseller_balance_deduction)} tone="ok" />
                {Number(order.reseller_shortfall_amount) > 0 ? (
                  <Row label="Kekurangan pembayaran" value={rupiah(order.reseller_shortfall_amount)} />
                ) : null}
                {shortfall ? (
                  <Row
                    label="Status kekurangan"
                    value={
                      shortfall.status === "approved"
                        ? "Dikonfirmasi"
                        : shortfall.status === "rejected"
                          ? "Ditolak"
                          : deadlinePassed
                            ? "Waktu habis"
                            : "Menunggu"
                    }
                  />
                ) : null}
              </section>

              {waitingShortfall && shortfall ? (
                <button type="button" className="rso-pay" onClick={keHalamanBayar}>
                  Bayar kekurangan {rupiah(shortfall.amount)}
                </button>
              ) : (
                <button type="button" className="rso-back" onClick={onClose}>
                  Kembali ke daftar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </PanelDetailShell>
  );
}

function SectionHead({ icon, title, aside }: { icon: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <div className="rso-sec">
      <span className="rso-sec-ico">{icon}</span>
      <span className="rso-sec-title">{title}</span>
      {aside ? <span className="rso-sec-aside">{aside}</span> : null}
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
  copy = false,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
  tone?: "ok";
}) {
  return (
    <div className="rso-row">
      <span className="rso-row-label">{label}</span>
      <span className={`rso-row-value${tone === "ok" ? " ok" : ""}${mono ? " mono" : ""}`}>
        {value}
        {copy ? (
          <button
            type="button"
            className="rso-copy"
            aria-label={`Salin ${label}`}
            onClick={() => navigator.clipboard?.writeText(value).catch(() => {})}
          >
            <Copy size={11} />
          </button>
        ) : null}
      </span>
    </div>
  );
}

/** Nomor pesanan + tombol salin. */
function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const salin = () => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rso-id">
      <b>{value}</b>
      <button type="button" className="rso-copy" aria-label="Salin nomor pesanan" onClick={salin}>
        <Copy size={12} />
      </button>
      {copied ? <span className="rso-copied">Tersalin</span> : null}
    </div>
  );
}

/** Alamat penerima tertutup secara default — dibuka lewat ketukan. */
function AlamatTersembunyi({ alamat, catatan }: { alamat: string; catatan: string | null }) {
  const [buka, setBuka] = useState(false);
  return (
    <div className="rso-row" style={{ alignItems: "flex-start" }}>
      <span className="rso-row-label">Alamat</span>
      <span className="rso-row-value" style={{ display: "block" }}>
        {buka ? (
          <>
            <span>{alamat || "—"}</span>
            {catatan ? <i className="rso-sub">Catatan: {catatan}</i> : null}
            <button type="button" className="rso-toggle" onClick={() => setBuka(false)}>
              <Eye size={11} /> Sembunyikan
            </button>
          </>
        ) : (
          <>
            <span className="rso-blur" aria-hidden="true">
              {alamat || "Alamat belum diisi"}
            </span>
            <button type="button" className="rso-toggle" onClick={() => setBuka(true)}>
              <Eye size={11} /> Tampilkan alamat
            </button>
          </>
        )}
      </span>
    </div>
  );
}

/* Gaya isi drawer. Kerangka/overlay/animasi milik PanelDetailShell (DP_STYLE).
   Palet = token portal reseller (monokrom + hijau untuk untung). */
const RS_DRAWER_CSS = `
.rso{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;height:100%;background:#f6f6f4;color:#374151;font-family:var(--font-inter),system-ui,sans-serif}
.rso-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 12px;background:#111;color:#fff}
.rso-kicker{display:block;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.6)}
.rso-head h2{margin:2px 0 0;font-size:18px;font-weight:800;color:#fff;line-height:1.2}
.rso-x{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:999px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.12);color:#fff;cursor:pointer}
.rso-x:hover{background:rgba(255,255,255,.22)}
.rso-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:8px;padding:10px 10px 16px;scrollbar-width:none}
.rso-body::-webkit-scrollbar{display:none}
.rso-card{background:#fff;border:1px solid #e4e4e0;border-radius:14px;padding:11px 12px;display:flex;flex-direction:column;gap:8px}
.rso-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.rso-id{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.rso-id b{font-family:ui-monospace,monospace;font-size:14px;font-weight:800;color:#111}
.rso-copied{font-size:10px;font-weight:800;color:#15803d}
.rso-sub{font-size:11.5px;font-weight:600;color:#6b7280;line-height:1.45}
.rso-sec{display:flex;align-items:center;gap:7px}
.rso-sec-ico{flex:none;display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:#f3f3f0;color:#111}
.rso-sec-title{font-size:12.5px;font-weight:800;color:#111}
.rso-sec-aside{margin-left:auto;display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
.rso-badge{font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:#f3f3f0;color:#374151;white-space:nowrap}
.rso-badge.jnt{background:#c8102e;color:#fff}
.rso-item{display:flex;align-items:flex-start;gap:9px}
.rso-photo{width:42px;height:52px;border-radius:8px;object-fit:cover;flex:none;background:#f3f3f0}
.rso-item-txt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px}
.rso-item-name{font-size:12.5px;font-weight:800;color:#111;line-height:1.3}
.rso-chips{display:flex;gap:4px;flex-wrap:wrap}
.rso-chip{font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:#f3f3f0;color:#374151;white-space:nowrap}
.rso-profit{flex:none;text-align:right;font-size:12px;font-weight:800;color:#15803d;white-space:nowrap}
.rso-profit span{display:block;font-size:9.5px;font-weight:700;color:#6b7280}
.rso-sum{display:flex;flex-direction:column;gap:4px;background:#f6f6f4;border-radius:10px;padding:8px 10px}
.rso-sum-row{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;color:#374151}
.rso-sum-row b{color:#111}
.rso-sum-line{height:1px;background:#e4e4e0;margin:2px 0}
.rso-sum-row.total span{font-size:12px;font-weight:800;color:#111}
.rso-sum-row.total b{font-size:15px;font-weight:800}
.rso-row{display:flex;align-items:flex-start;gap:8px;font-size:11.5px;line-height:1.5;padding:3px 0;border-top:1px solid #f2f2ef}
.rso-sec + .rso-row{border-top:0;padding-top:0}
.rso-row-label{flex:0 0 108px;font-weight:700;color:#6b7280}
.rso-row-value{flex:1 1 auto;min-width:0;font-weight:700;color:#111;overflow-wrap:anywhere;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.rso-row-value.mono{font-family:ui-monospace,monospace;font-size:11px}
.rso-row-value.ok{color:#15803d}
.rso-blur{filter:blur(4px);user-select:none;display:block;line-height:1.5}
.rso-copy{display:inline-grid;place-items:center;width:20px;height:20px;border:0;border-radius:6px;background:#f3f3f0;color:#374151;cursor:pointer}
.rso-copy:hover{background:#e8e8e3}
.rso-toggle{display:inline-flex;align-items:center;gap:4px;margin-top:5px;padding:4px 8px;border:0;border-radius:7px;background:#f3f3f0;color:#111;font:inherit;font-size:10.5px;font-weight:800;cursor:pointer}
.rso-toggle:hover{background:#e8e8e3}
.rso-timeline{display:flex;flex-direction:column;gap:8px;padding-top:2px}
.rso-tl{display:flex;gap:8px;align-items:flex-start}
.rso-dot{flex:none;width:7px;height:7px;margin-top:5px;border-radius:999px;background:#111}
.rso-tl-t{font-size:11.5px;font-weight:800;color:#111}
.rso-pay{width:100%;min-height:44px;border:0;border-radius:12px;background:#111;color:#fff;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
.rso-pay:hover{background:#242424}
.rso-back{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:40px;border:1px solid #e4e4e0;border-radius:12px;background:#fff;color:#374151;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
.rso-back:hover{background:#fafaf8}
@media (max-width:767px){
  .rso-row-label{flex-basis:92px}
  .rso-body{padding:8px 8px 20px}
}
`;
