"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSafeLocale, useSafeTranslations } from "@/lib/safe-i18n";
import { strukStatus, strukSteps, tglJamID, rupiah } from "@/lib/akun-format";
import { orderStatusKey } from "@/lib/order-flow";
import CopyButton from "@/components/ui/CopyButton";
import { isPaketItem, itemVariantLabel } from "@/lib/item-label";
import {
  formatWeightExact,
  productWeightMapFromRows,
  resolveLineWeight,
  variantWeightMapFromRows,
  type ResolvedLineWeight,
} from "@/lib/shipping-weight";
import { usePaymentMethodName } from "@/lib/use-payment-methods";
import { startOnlinePayment } from "@/lib/mayar-client";
import { supabase } from "@/lib/supabase";
import ConfirmModal from "@/components/ConfirmModal";
import type { TrackHistoryItem } from "@/lib/jnt/types";
import { formatTrackingTime, sortHistoryDesc, trackingRow } from "@/lib/jnt/track-status";
import { NEUTRAL_ITEM_PHOTO } from "@/lib/order-photo";

export interface RincianOrderItem {
  product_id?: string | null;
  product_name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  product_image?: string;
  kain?: string | null;
  series?: string | null;
}

export interface RincianOrder {
  order_number: string;
  total: number;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  status: string;
  created_at: string;
  /** Jam pembatalan yang akurat (kolom `orders.cancelled_at`); `updated_at` cuma cadangan. */
  cancelled_at?: string | null;
  updated_at?: string;
  awb_no?: string | null;
  shipping_status?: string | null;
  tracking_status_code?: number | null;
  payment_method?: string | null;
  shipping_method?: string | null;
  /** Berat kirim pesanan (gram) — kolom `orders.weight`. */
  weight?: number | null;
  customer_name?: string | null;
  customer_whatsapp?: string | null;
  shipping_address?: string | null;
  shipping_city?: string | null;
  shipping_postal_code?: string | null;
  order_items: RincianOrderItem[];
  /** Pembayaran online (Mayar): diisi saat invoice dibuat, `paid_at` saat webhook memverifikasi lunas. */
  payment_provider?: string | null;
  payment_url?: string | null;
  payment_status?: string | null;
  paid_at?: string | null;
}

/**
 * Gaya halaman rincian pesanan: kartu putih di atas latar abu terang, mengikuti
 * tata letak halaman pesanan marketplace (banner status → info pengiriman → alamat →
 * produk → status → aksi bawah). Semua kelas berawalan `rp-` dan hanya hidup di
 * dalam <style> ini, jadi tidak menyentuh halaman akun lain.
 */
export const RINCIAN_CSS = `
.rp-root{background:#F5F6F7;color:#22262A;font-weight:500;letter-spacing:-.005em;min-height:70vh;padding-bottom:8px}
.rp-wrap{max-width:680px;margin:0 auto}
/* Mobile: pembungkus ini transparan (display:contents) supaya tata letaknya tidak berubah.
   Desktop: jadi satu lembar "struk hangat" — lihat @media di bawah. */
.rp-sheet{display:contents}
.rp-card{background:#fff;border:1px solid #ECEDEE;border-radius:12px;margin-top:10px;overflow:hidden}
.rp-sec{padding:14px 16px}
.rp-h{font-size:14px;font-weight:700;letter-spacing:-.01em;display:block}
.rp-sub{color:#757575}
.rp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.rp-mono{font-variant-numeric:tabular-nums}

/* ── Header mobile ── */
.rp-top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);border-bottom:1px solid #ECEDEE}
.rp-bk{width:36px;height:36px;flex:none;border-radius:10px;border:1px solid #E6E7E8;background:#fff;display:grid;place-items:center;cursor:pointer;transition:background .2s,transform .2s}
.rp-bk:hover{background:#F5F6F7}
.rp-bk:active{transform:scale(.95)}
.rp-bk:focus-visible{outline:2px solid #666666;outline-offset:2px}
.rp-top h1{font-size:16px;font-weight:700;letter-spacing:-.01em}

/* ── Judul desktop (sidebar akun sudah punya header sendiri) ── */
.rp-dhead{display:none}

/* ── Banner status ── */
.rp-banner{margin-top:10px;border-radius:12px;padding:16px;color:#fff;background:#666666;display:flex;align-items:center;gap:12px}
.rp-banner b{display:block;font-size:17px;font-weight:800;letter-spacing:-.015em}
.rp-banner small{display:block;font-size:12.5px;opacity:.86;margin-top:3px}
.rp-banner .rp-bico{flex:none;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center}
.rp-banner.t-wait{background:#666666}
.rp-banner.t-process{background:#878787}
.rp-banner.t-ship{background:#686868}
.rp-banner.t-done{background:#606060}
.rp-banner.t-cancel{background:#000000}

/* ── Baris info pengiriman / alamat ── */
.rp-line{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;line-height:1.5}
.rp-line + .rp-line{margin-top:8px}
.rp-line svg{flex:none;margin-top:2px}
.rp-ico{color:#9AA0A5}
.rp-strong{font-weight:700}
.rp-addr{color:#5F5F5F;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rp-addr.is-open{display:block}
.rp-lihat{border:0;background:none;padding:0 0 0 4px;color:#666666;font-size:13px;font-weight:700;cursor:pointer}

/* ── Produk ── */
.rp-it{display:flex;gap:12px;padding:14px 16px}
.rp-it + .rp-it{border-top:1px solid #F2F3F4}
.rp-thumb{width:76px;height:76px;flex:none;border-radius:8px;overflow:hidden;background:#F6F7F8}
.rp-thumb img{width:100%;height:100%;object-fit:contain;display:block}
.rp-nm{font-size:13.5px;font-weight:700;line-height:1.4}
.rp-var{font-size:12.5px;color:#757575;margin-top:4px;line-height:1.45}
.rp-pr{font-size:13.5px;font-weight:700;margin-top:7px}
.rp-sum{display:flex;align-items:center;gap:8px;justify-content:flex-end;width:100%;padding:13px 16px;border-top:1px solid #F2F3F4;font-size:13.5px;cursor:pointer;list-style:none;background:#fff}
.rp-sum::-webkit-details-marker{display:none}
.rp-sum b{font-weight:800}
.rp-sum svg{margin-left:2px;color:#757575;transition:transform .2s}
.rp-card details[open] > .rp-sum svg,.rp-card[open] > .rp-sum svg{transform:rotate(180deg)}
.rp-paysum{background:#FAFBFC;border-top:1px solid #F2F3F4}
.rp-row{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:5px 0}
.rp-row span:first-child{color:#757575}
.rp-row span:last-child{text-align:right;font-weight:600}
.rp-sep{border-top:1px dashed #DDE0E2;margin:9px 0}

/* ── Linimasa status ── */
.rp-steps{display:flex;flex-direction:column}
.rp-step{display:flex;gap:12px}
.rp-rail{display:flex;flex-direction:column;align-items:center;width:20px;flex:none}
.rp-node{width:20px;height:20px;border-radius:50%;border:2px solid #D8DBDE;background:#fff;display:grid;place-items:center;flex:none}
.rp-step.is-done .rp-node{background:#606060;border-color:#606060}
.rp-step.is-done .rp-node:after{content:"";width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg) translate(-1px,-2px)}
.rp-step.is-active .rp-node{border-color:#666666;box-shadow:0 0 0 4px rgba(102,102,102,.12)}
.rp-step.is-active .rp-node:after{content:"";width:7px;height:7px;border-radius:50%;background:#666666}
.rp-rail-line{flex:1;width:2px;background:#E9EBED;margin:3px 0;border-radius:2px}
.rp-txt{padding-bottom:16px;min-width:0}
.rp-step:last-child .rp-txt{padding-bottom:0}
.rp-txt b{display:block;font-size:13.5px;font-weight:700}
.rp-step.is-todo .rp-txt b{color:#A9AEB3;font-weight:600}
.rp-txt i{display:block;font-style:normal;font-size:12px;color:#8D9297;margin-top:2px}
.rp-step.is-active .rp-txt i{color:#666666;font-weight:600}
.rp-hint{display:flex;gap:9px;align-items:flex-start;margin-top:14px;padding:11px 13px;border-radius:10px;background:#F2F2F2;color:#000000;font-size:12.5px;line-height:1.45;font-weight:600}
.rp-hint svg{flex:none;margin-top:1px}

/* ── Aksi bawah ── */
.rp-act{position:sticky;bottom:var(--mobile-nav-h,62px);z-index:20;padding:10px 0 14px;background:linear-gradient(180deg,rgba(245,246,247,0),#F5F6F7 40%)}
.rp-btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:15px;border-radius:12px;background:#666666;color:#fff;font-size:14.5px;font-weight:700;text-decoration:none;cursor:pointer;border:0;box-shadow:0 10px 22px rgba(102,102,102,.24);transition:background .2s,transform .2s}
.rp-btn:hover{background:#000000}
.rp-btn:active{transform:scale(.99)}
.rp-btn:focus-visible{outline:2px solid #666666;outline-offset:2px}
.rp-btn:disabled{opacity:.6;cursor:default}
/* Tombol sekunder "Batalkan Pesanan": putih dengan garis & teks merah, di bawah tombol utama. */
.rp-btn.is-danger{margin-top:10px;background:#fff;border:1px solid #CDCDCD;color:#B91C1C;box-shadow:none}
.rp-btn.is-danger:hover{background:#FDF3F1}
.rp-err{margin-top:8px;text-align:center;font-size:12px;font-weight:600;color:#B91C1C}
.rp-note{padding:12px 14px;border-radius:10px;background:#fff;border:1px solid #ECEDEE;color:#757575;font-size:12.5px;text-align:center}
.rp-ft{text-align:center;font-size:11px;color:#9AA0A5;padding:16px 0 0}

/* ── Desktop: satu lembar "struk hangat" (kertas krem, garis putus-putus) yang
   sempit & terpusat — bukan kolom mobile yang dilebarkan. ── */
@media (min-width:768px){
 .rp-root{background:transparent;color:#2A2521}
 .rp-wrap{max-width:600px}
 .rp-dhead{display:flex;align-items:center;gap:14px;margin-bottom:14px}
 .rp-dhead h1{font-size:22px;font-weight:800;letter-spacing:-.025em}
 .rp-dhead a{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#828282;text-decoration:none}
 .rp-dhead a:hover{color:#666666}

 /* satu lembar kertas, blok-blok di dalamnya dipisah garis struk */
 .rp-sheet{display:block;background:#FFFDF8;border:1px solid #E7E7E7;border-radius:16px;box-shadow:0 20px 44px rgba(42,37,33,.08);overflow:hidden}
 .rp-banner{margin-top:0;border-radius:0;padding:18px 20px}
 .rp-banner b{font-size:18px}
 .rp-banner small{font-size:13px}
 .rp-card{margin-top:0;border:0;border-radius:0;background:none}
 .rp-sec{padding:16px 20px}
 .rp-line{font-size:14px}
 .rp-sub,.rp-var,.rp-addr,.rp-step.is-todo .rp-txt b{color:#757575}
 .rp-it{padding:16px 20px;gap:16px}
 .rp-it + .rp-it{border-top:1px dashed #EAEAEA}
 .rp-thumb{width:88px;height:88px;border-radius:10px;background:#F2F2F2}
 .rp-nm,.rp-pr{font-size:14px}
 .rp-var{font-size:13px}
 .rp-sum{padding:15px 20px;font-size:14px;border-top:1px dashed #EAEAEA;background:none}
 .rp-paysum{background:#FCF8F1;border-top:1px dashed #EAEAEA}
 .rp-paysum .rp-row{font-size:13.5px;padding:6px 0}
 .rp-sep{border-top-color:#DDDDDD}
 .rp-node{border-color:#D4D4D4;background:#FFFDF8}
 .rp-rail-line{background:#E4E4E4}
 .rp-hint{background:#F2F2F2}
 .rp-note{background:#FCF8F1;border-color:#E7E7E7;color:#828282}
 .rp-act{position:static;padding:16px 20px 20px;background:none}
 .rp-ft{display:none}
 /* pemisah antar blok di dalam lembar struk (letakkan paling akhir agar menang) */
 .rp-sheet > * + *{border-top:1px dashed #DDDDDD}
}
`;

/** Header halaman rincian (mobile). Sekaligus pemuat gaya halaman ini. */
export function RincianHeader({ title = "Detail Pesanan", back }: { title?: string; back: string }) {
  const locale = useSafeLocale();
  const href = `/${locale}${back}`;

  return (
    <>
      <style>{RINCIAN_CSS}</style>
      <div className="rp-top rp-md-hide">
        <Link href={href} className="rp-bk" aria-label="Kembali">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#22262A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
        </Link>
        <h1>{title}</h1>
      </div>
    </>
  );
}

function Pin() {
  return (
    <svg className="rp-ico" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
  );
}

const VARIAN_LINE = (item: RincianOrderItem) =>
  [itemVariantLabel(item), item.size && !isPaketItem(item) ? `Size ${item.size}` : "", `x${item.quantity}`].filter(Boolean).join(" • ");

export default function RincianPesanan({ order }: { order: RincianOrder }) {
  const locale = useSafeLocale();
  const t = useSafeTranslations("tracking");
  const to = (href: string) => `/${locale}${href}`;

  const { name: paymentName } = usePaymentMethodName(order.payment_method);

  const [showAlamat, setShowAlamat] = useState(false);
  const [paying, setPaying] = useState(false);
  const [latest, setLatest] = useState<TrackHistoryItem | null>(null);

  // Pesanan yang baru dibatalkan dari halaman ini ditimpa statusnya secara lokal supaya banner &
  // linimasa ikut berubah tanpa memuat ulang pesanan.
  const [cancelled, setCancelled] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  /** Jam pembatalan lokal, dipakai sampai halaman dimuat ulang dari server. */
  const [cancelTime, setCancelTime] = useState("");

  const status = cancelled ? "dibatalkan" : orderStatusKey(order);
  const sc = strukStatus(status);
  // Pesanan lama menyimpan `updated_at` = `created_at` (lihat `waktuBatal`), jadi pembatalan yang
  // baru terjadi dari halaman ini diberi jam sendiri — `cancelled_at` (jam akurat) sekaligus
  // `updated_at` untuk pesanan lama — supaya linimasa tidak menampilkan jam lama.
  const steps = strukSteps({
    ...order,
    status,
    cancelled_at: cancelTime || order.cancelled_at,
    updated_at: cancelTime || order.updated_at,
  });
  const items = order.order_items || [];
  // Hanya pesanan yang belum diserahkan ke kurir yang boleh dibatalkan sendiri (lihat /api/orders/cancel).
  const cancellable = !cancelled && (status === "pending" || status === "diproses");

  const resi = order.awb_no || "";
  const alamat = [order.shipping_address, order.shipping_city, order.shipping_postal_code]
    .filter(Boolean)
    .join(", ");

  // Berat per ITEM (gram) — dari `product_variants.weight` (per produk + warna + ukuran),
  // `products.weight` hanya cadangan. Sama seperti tampilan admin (satu fungsi pusat).
  const [itemWeights, setItemWeights] = useState<Record<string, ResolvedLineWeight>>({});
  useEffect(() => {
    const items = order.order_items || [];
    const ids = Array.from(new Set(items.map((it) => it.product_id).filter((x): x is string => !!x)));
    if (ids.length === 0) return;
    let alive = true;
    Promise.all([
      supabase.from("products").select("id, weight").in("id", ids),
      supabase.from("product_variants").select("product_id, color, size, weight").in("product_id", ids),
    ]).then(([pRes, vRes]) => {
      if (!alive) return;
      const productWeights = productWeightMapFromRows(pRes.data);
      const variantWeights = variantWeightMapFromRows(vRes.data);
      const map: Record<string, ResolvedLineWeight> = {};
      for (const it of items) {
        map[`${it.product_id}|${it.color}|${it.size}`] = resolveLineWeight(
          { productId: it.product_id, color: it.color, size: it.size },
          productWeights,
          variantWeights
        );
      }
      setItemWeights(map);
    });
    return () => { alive = false; };
  }, [order.order_items]);

  /** Batalkan pesanan: pengiriman di J&T dibatalkan dulu di server, baru status jadi `dibatalkan`. */
  async function cancelOrder() {
    setConfirmOpen(false);
    setCancelling(true);
    setCancelError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setCancelError("Sesi login berakhir. Masuk lagi ya.");
        return;
      }
      const res = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ orderNumber: order.order_number }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCancelError(data.error || "Gagal membatalkan pesanan. Coba lagi ya.");
        return;
      }
      setCancelTime(new Date().toISOString());
      setCancelled(true);
    } catch (err) {
      console.error("[AKUN] batal pesanan gagal:", err);
      setCancelError("Gagal membatalkan pesanan. Coba lagi ya.");
    } finally {
      setCancelling(false);
    }
  }

  // Satu baris status kirim terakhir di blok "Info Pengiriman" — sama seperti halaman lacak.
  useEffect(() => {
    if (!resi) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/jnt/track?awb=${encodeURIComponent(resi)}`);
        const json = await res.json();
        const history: TrackHistoryItem[] = json?.data?.history || [];
        if (alive && history.length) setLatest(sortHistoryDesc(history)[0]);
      } catch {
        /* status kirim cuma pelengkap — biarkan kosong kalau J&T tidak menjawab */
      }
    })();
    return () => {
      alive = false;
    };
  }, [resi]);

  // Baris status kirim terakhir — teks status & catatan J&T ditampilkan APA ADANYA.
  const latestRow = latest ? trackingRow(latest) : null;

  /** Buka halaman bayar Mayar (link dibuat ulang kalau memang belum ada / kedaluwarsa). */
  async function payNow() {
    setPaying(true);
    try {
      const url = order.payment_url || (await startOnlinePayment(order.order_number));
      if (url) window.location.href = url;
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="rp-root -mx-4 -mt-4 md:mx-0 md:mt-0">
      <style>{RINCIAN_CSS}</style>
      <RincianHeader title="Detail Pesanan" back="/akun/pesanan" />

      <div className="rp-wrap">
        <div className="rp-dhead">
          <h1>Detail Pesanan</h1>
          <Link href={to("/akun/pesanan")}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
            Pesanan Saya
          </Link>
        </div>

        {/* Satu lembar "struk hangat" di desktop; di mobile pembungkus ini transparan. */}
        <div className="rp-sheet">
        <section className={`rp-banner t-${sc.tone}`}>
          <span className="rp-bico">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>
          </span>
          <div>
            <b>{sc.label}</b>
            <small style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              #{order.order_number}
              <CopyButton value={order.order_number} label="nomor pesanan" />
              • {tglJamID(order.created_at)}
            </small>
          </div>
        </section>

        <section className="rp-card">
          <div className="rp-sec">
            <span className="rp-h">Info Pengiriman</span>
            <div className="rp-line" style={{ marginTop: 8 }}>
              <span className="rp-sub" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {order.shipping_method || "Pengiriman"}
                {resi ? `: ${resi}` : ""}
                {resi ? <CopyButton value={resi} label="nomor resi" /> : null}
              </span>
            </div>
            {order.weight && order.weight > 0 ? (
              <div className="rp-line" style={{ marginTop: 8 }}>
                <span className="rp-sub">Berat</span>
                <span className="rp-strong rp-mono" style={{ marginLeft: "auto" }}>{formatWeightExact(order.weight)}</span>
              </div>
            ) : null}
            {latestRow ? (
              <>
                <div className="rp-line" style={{ color: latestRow.warning ? "#b45309" : "#666666", fontWeight: 600 }}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>
                  <span>{latestRow.status}</span>
                </div>
                <div className="rp-line rp-sub" style={{ marginLeft: 27 }}>
                  <span>{[latestRow.location, formatTrackingTime(latestRow.dateTime)].filter(Boolean).join(" • ")}</span>
                </div>
                {latestRow.note ? (
                  <div className="rp-line rp-sub" style={{ marginLeft: 27 }}>
                    <span>{t("note")}: {latestRow.note}</span>
                  </div>
                ) : null}
                {/* Nama penerima dari J&T (`receiver`) — siapa yang menerima paket. */}
                {latestRow.receiver ? (
                  <div className="rp-line rp-sub" style={{ marginLeft: 27 }}>
                    <span>{t("receivedBy")}: {latestRow.receiver}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rp-line rp-sub" style={{ marginTop: 8 }}>
                <span>
                  {resi
                    ? "Belum ada update dari J&T. Riwayat muncul setelah kurir memindai paket."
                    : "Resi belum tersedia. Kami kabari begitu paket diserahkan ke J&T."}
                </span>
              </div>
            )}
          </div>

          {alamat ? (
            <div className="rp-sec" style={{ borderTop: "1px solid #F2F3F4" }}>
              <span className="rp-h">Alamat Pengiriman</span>
              <div className="rp-line" style={{ marginTop: 9 }}>
                <Pin />
                <span className="rp-strong">
                  {order.customer_name || "Penerima"}
                  {order.customer_whatsapp ? ` · ${order.customer_whatsapp}` : ""}
                </span>
              </div>
              <div className="rp-line" style={{ marginTop: 6 }}>
                <span className={`rp-addr${showAlamat ? " is-open" : ""}`}>{alamat}</span>
                <button type="button" className="rp-lihat" onClick={() => setShowAlamat((v) => !v)}>
                  {showAlamat ? "Tutup" : "Lihat"}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rp-card">
          {items.map((item, i) => (
            <div key={`${item.product_name}-${i}`} className="rp-it">
              <div className="rp-thumb">
                <img src={item.product_image || NEUTRAL_ITEM_PHOTO} alt={item.product_name} loading="lazy" decoding="async" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="rp-nm">{item.product_name}</p>
                <p className="rp-var">{VARIAN_LINE(item)}</p>
                {item.product_id && itemWeights[`${item.product_id}|${item.color}|${item.size}`] ? (
                  <p className="rp-var">
                    Berat: <b>{itemWeights[`${item.product_id}|${item.color}|${item.size}`].source === "missing" ? "-" : formatWeightExact(itemWeights[`${item.product_id}|${item.color}|${item.size}`].grams)}</b>
                  </p>
                ) : null}
                <p className="rp-pr rp-mono">{rupiah(item.price)}</p>
              </div>
            </div>
          ))}

          <details>
            <summary className="rp-sum">
              Total Pesanan: <b className="rp-mono">{rupiah(order.total)}</b>
              <Chevron />
            </summary>
            <div className="rp-sec rp-paysum">
              <div className="rp-row"><span>Subtotal</span><span className="rp-mono">{rupiah(order.subtotal)}</span></div>
              <div className="rp-row"><span>Ongkos Kirim</span><span className="rp-mono">{rupiah(order.shipping_cost)}</span></div>
              {order.discount ? (
                <div className="rp-row"><span>Diskon</span><span className="rp-mono">-{rupiah(order.discount)}</span></div>
              ) : null}
              <div className="rp-sep" />
              <div className="rp-row"><span className="rp-strong">Total</span><span className="rp-strong rp-mono">{rupiah(order.total)}</span></div>
              {paymentName ? (
                <div className="rp-row"><span>Metode Pembayaran</span><span>{paymentName}</span></div>
              ) : null}
              {order.payment_provider === "mayar" ? (
                <>
                  <div className="rp-row">
                    <span>Pembayaran Online</span>
                    <span style={{ color: order.paid_at ? "#047857" : "#b45309", fontWeight: 700 }}>
                      {order.paid_at ? "Lunas" : "Belum dibayar"}
                    </span>
                  </div>
                  {!order.paid_at ? (
                    <button type="button" onClick={payNow} disabled={paying} className="rp-btn" style={{ marginTop: 10 }}>
                      {paying ? "Membuka halaman bayar…" : "Bayar Sekarang"}
                    </button>
                  ) : null}
                </>
              ) : null}
              {order.shipping_method ? (
                <div className="rp-row"><span>Pengiriman</span><span>{order.shipping_method}</span></div>
              ) : null}
              {order.weight && order.weight > 0 ? (
                <div className="rp-row"><span>Berat</span><span className="rp-mono">{formatWeightExact(order.weight)}</span></div>
              ) : null}
              {resi ? (
                <div className="rp-row">
                  <span>Nomor Resi</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {resi}
                    <CopyButton value={resi} label="nomor resi" />
                  </span>
                </div>
              ) : null}
            </div>
          </details>
        </section>

        <details className="rp-card">
          <summary className="rp-sum">
            Status Pesanan <Chevron />
          </summary>
          <div className="rp-sec">
            <div className="rp-steps">
              {steps.map((step, i) => (
                <div key={step.label} className={`rp-step is-${step.state}`}>
                  <div className="rp-rail">
                    <span className="rp-node" />
                    {i < steps.length - 1 ? <span className="rp-rail-line" /> : null}
                  </div>
                  <div className="rp-txt">
                    <b>{step.label}</b>
                    <i>{step.sub}</i>
                  </div>
                </div>
              ))}
            </div>
            {sc.tone === "wait" ? (
              <p className="rp-hint">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                Pesanan ini belum dibayar. Selesaikan pembayaran supaya pesanan segera kami proses.
              </p>
            ) : null}
          </div>
        </details>

        <p className="rp-ft md:hidden">&copy; 2026 SAMAQU. All rights reserved.</p>

        <div className="rp-act">
          {resi ? (
            <Link href={to(`/akun/pesanan/${order.order_number}/lacak`)} className="rp-btn">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>
              Lacak Pesanan
            </Link>
          ) : (
            <div className="rp-note">Nomor resi belum tersedia. Kami kabari begitu paket diserahkan ke J&amp;T.</div>
          )}

          {cancellable ? (
            <>
              <button
                type="button"
                className="rp-btn is-danger"
                onClick={() => setConfirmOpen(true)}
                disabled={cancelling}
              >
                {cancelling ? "Membatalkan…" : "Batalkan Pesanan"}
              </button>
              {cancelError ? <p className="rp-err">{cancelError}</p> : null}
            </>
          ) : null}
        </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Batalkan Pesanan?"
        message={`Pesanan #${order.order_number} akan dibatalkan beserta pengirimannya di J&T. Tindakan ini tidak bisa dibatalkan.`}
        confirmText="Ya, Batalkan"
        cancelText="Tidak"
        onConfirm={cancelOrder}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
