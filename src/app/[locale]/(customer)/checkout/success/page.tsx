"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";
import { motion } from "framer-motion";
import { ShieldCheck, Copy, Check, Clock, MessageCircle, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { trackPurchaseOnce, trackLead } from "@/lib/meta-pixel";
import { isPaketItem, itemNameSuffix } from "@/lib/item-label";
import { normalizeMethodType, paymentMethodLabel, type PaymentMethodRow } from "@/lib/payment-methods";
import { useResolvedPaymentMethod } from "@/lib/use-payment-methods";
import { startOnlinePayment } from "@/lib/mayar-client";
import { cloudinaryUrl } from "@/lib/cloudinary";

interface OrderData {
  order_number: string;
  customer_name: string;
  customer_whatsapp: string;
  total: number;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  shipping_method: string;
  payment_method: string;
  created_at: string;
  order_items: { product_id?: string | null; product_name: string; color: string; size: string; quantity: number; price: number }[];
}

function CheckoutSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const [order, setOrder] = useState<OrderData | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [storeSettings, setStoreSettings] = useState<{ whatsapp: string; store_name: string; tagline: string }>({
    whatsapp: "+62 812 3456 7890",
    store_name: "SAMAQU",
    tagline: "Busana yang Layak Menemani Setiap Momen",
  });
  // Metode pembayaran pesanan ini: uuid baru dari admin, atau slug lama ('bank'/'qris'/'cod')
  const { type: paymentTypeResolved, method: paidMethod } = useResolvedPaymentMethod(order?.payment_method);
  const [copied, setCopied] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  /** Mayar: buka halaman bayar pesanan ini (server membuat atau memakai ulang invoice-nya). */
  const handlePayNow = async () => {
    if (paying) return;
    setPaying(true);
    const url = await startOnlinePayment(orderId || "");
    if (url) window.location.href = url;
    else setPaying(false);
  };
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(24 * 60 * 60);
  const countdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchData() {
      if (!orderId) { setLoading(false); return; }
      // Kalau URL-nya membawa token tautan pesanan (`?t=…`), baca lewat endpoint lookup yang
      // memverifikasi token — jalur ini yang tetap jalan untuk customer tamu setelah policy RLS
      // `orders` ditutup dari anon. Tanpa token (tautan lama / sudah login), pakai jalur langsung.
      const lookupToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("t") : null;
      const orderPromise = lookupToken
        ? fetch(`/api/orders/lookup?order=${encodeURIComponent(orderId)}&t=${encodeURIComponent(lookupToken)}`)
            .then((r) => r.json())
            .then((json) => ({ data: json?.order || null }))
            .catch(() => ({ data: null }))
        : supabase
            .from("orders")
            .select("*, order_items(product_id, product_name, color, size, quantity, price)")
            .eq("order_number", orderId)
            .single();
      const [orderRes, paymentRes, settingsRes] = await Promise.all([
        orderPromise,
        supabase.from("payment_methods").select("*").eq("is_active", true).order("display_order"),
        supabase.from("store_settings").select("whatsapp, store_name, tagline").eq("id", 1).single(),
      ]);
      if (orderRes.data) setOrder(orderRes.data as unknown as OrderData);
      // Meta Pixel: Purchase (browser) — hanya sekali per pesanan, aman saat halaman di-refresh.
      // Nilai = subtotal produk saja, ongkir TIDAK dihitung.
      // CAPI Purchase dikirim server-side (/api/orders) dengan event_id = nomor pesanan,
      // jadi browser tidak perlu mengirim CAPI lagi (menghindari dobel).
      if (orderRes.data) {
        const orderData = orderRes.data as any;
        const items: NonNullable<OrderData["order_items"]> = orderData.order_items || [];
        const contents = items.map((item, i) => ({
          id: String(item.product_id || item.product_name || `item-${i}`),
          quantity: Number(item.quantity) || 1,
          item_price: Number(item.price) || 0,
        }));
        const contentIds = Array.from(new Set(contents.map((item) => item.id)));
        const numItems = contents.reduce((sum, item) => sum + item.quantity, 0);

        trackPurchaseOnce({
          orderId: orderData.order_number,
          value: Number(orderData.subtotal) || 0,
          contentIds,
          contents,
          numItems,
        });
      }
      if (paymentRes.data) setPaymentMethods(paymentRes.data);
      if (settingsRes.data) setStoreSettings((prev) => ({ ...prev, ...settingsRes.data }));
      setLoading(false);
    }
    fetchData();
  }, [orderId]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  function pad(n: number) { return n < 10 ? "0" + n : String(n); }
  function getCountdown() {
    const h = Math.floor(timeLeft / 3600);
    const m = Math.floor((timeLeft % 3600) / 60);
    const s = timeLeft % 60;
    return { h: pad(h), m: pad(m), s: pad(s) };
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    });
  }

  function getWhatsAppLink() {
    const wa = storeSettings.whatsapp.replace(/[^0-9+]/g, "").replace(/^0/, "62");
    const msg = `Halo ${storeSettings.store_name}, saya sudah transfer untuk pesanan ${order?.order_number || ""}. Mohon verifikasi. Terima kasih!`;
    return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
  }

  if (loading) {
    return (
      <section className="min-h-screen flex items-center justify-center grain" style={{ background: "var(--cream)" }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,.3)", borderTopColor: "var(--gold)" }} />
      </section>
    );
  }

  if (!order) {
    return (
      <section className="min-h-screen flex items-center justify-center grain" style={{ background: "var(--cream)" }}>
        <div className="text-center px-6">
          <p className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>Pesanan tidak ditemukan</p>
          <button onClick={() => router.push("/katalog")} className="text-sm font-ui underline" style={{ color: "var(--gold)" }}>Kembali ke Katalog</button>
        </div>
      </section>
    );
  }

  const cd = getCountdown();
  const wa = storeSettings.whatsapp.replace(/[^0-9+]/g, "").replace(/^0/, "62");

  // QRIS/e-wallet: pakai metode yang dipilih customer, atau semua metode non-bank untuk pesanan lama
  const qrisList = paidMethod && (paymentTypeResolved === "qris" || paymentTypeResolved === "ewallet")
    ? [paidMethod]
    : paymentMethods.filter((m) => normalizeMethodType(m.method_type) !== "bank");
  // Pembayaran online (Mayar) tidak pernah menampilkan daftar rekening bank — jangan sampai
  // customer transfer ke rekening manual padahal memilih bayar online.
  const bankList = paymentTypeResolved === "mayar"
    ? []
    : paidMethod && paymentTypeResolved === "bank"
      ? [paidMethod]
      : paymentMethods.filter((m) => normalizeMethodType(m.method_type) === "bank");

  return (
    <section className="min-h-screen relative overflow-x-hidden" style={{ background: "var(--cream)" }}>
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-40 -right-32 w-[34rem] h-[34rem] rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(circle, rgba(0,0,0,0.20), transparent 68%)" }} />
      <div className="pointer-events-none absolute top-1/2 -left-40 w-[30rem] h-[30rem] rounded-full blur-3xl opacity-25" style={{ background: "radial-gradient(circle, rgba(139,111,66,0.18), transparent 70%)" }} />

      {/* Header */}
      <header className="relative z-10 px-5 sm:px-8 py-5 flex items-center justify-between max-w-2xl mx-auto">
        <a href="/" className="text-xl sm:text-2xl tracking-[0.25em] font-medium" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>SAMAQU</a>
        <span className="inline-flex items-center gap-1.5 text-xs tracking-wide font-ui" style={{ color: "var(--text-muted)" }}>
          <ShieldCheck className="w-3.5 h-3.5" style={{ color: "#4b7a4e" }} />
          Transaksi aman
        </span>
      </header>

      <main className="relative z-10 px-5 sm:px-8 pt-4 pb-16 max-w-2xl mx-auto">
        {/* Success hero */}
        <div className="flex flex-col items-center text-center mb-9">
          <div className="relative mb-6">
            <motion.span initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 2.6, delay: 0.6, ease: "easeOut" }} className="absolute inset-0 rounded-full" style={{ background: "rgba(0,0,0,0.35)" }} />
            <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1], delay: 0.05 }} className="relative w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(145deg, #c79a54, #8b6f42)", boxShadow: "0 16px 36px -12px rgba(139,111,66,0.55)" }}>
              <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="#f8f5f1" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <motion.path d="M4.5 12.5l5 5 10-11" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.55, delay: 0.45, ease: "easeOut" }} />
              </svg>
            </motion.div>
          </div>
          <motion.h1 initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }} className="text-4xl sm:text-5xl leading-tight mb-3" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontStyle: "italic", color: "var(--espresso)" }}>Pesanan Berhasil Dibuat</motion.h1>
          <motion.p initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} className="text-sm sm:text-base max-w-md font-ui" style={{ color: "var(--text-secondary)" }}>Segera lakukan pembayaran untuk memulai proses pesanan busana Anda.</motion.p>
        </div>

        {/* Order summary */}
        <motion.section initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }} className="rounded-2xl p-5 sm:p-7 mb-5" style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(0,0,0,.06)", boxShadow: "0 18px 44px -28px rgba(0,0,0,0.4)" }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>Ringkasan Pesanan</h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide px-3 py-1 rounded-full font-ui" style={{ background: "rgba(0,0,0,0.12)", color: "#8b6f42" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--gold)" }} /> Menunggu Pembayaran
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 mb-5">
            <div>
              <p className="text-[11px] tracking-[0.15em] uppercase mb-1 font-ui" style={{ color: "var(--text-muted)" }}>Invoice</p>
              <p className="text-sm font-medium font-ui" style={{ color: "var(--espresso)" }}>{order.order_number}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.15em] uppercase mb-1 font-ui" style={{ color: "var(--text-muted)" }}>Nama</p>
              <p className="text-sm font-medium font-ui" style={{ color: "var(--espresso)" }}>{order.customer_name}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.15em] uppercase mb-1 font-ui" style={{ color: "var(--text-muted)" }}>Tanggal</p>
              <p className="text-sm font-medium font-ui" style={{ color: "var(--espresso)" }}>{new Date(order.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.15em] uppercase mb-1 font-ui" style={{ color: "var(--text-muted)" }}>Pengiriman</p>
              <p className="text-sm font-medium font-ui" style={{ color: "var(--espresso)" }}>{order.shipping_method}</p>
            </div>
          </div>

          {/* Product items */}
          {order.order_items?.map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-4" style={{ borderTop: "1px solid rgba(0,0,0,.06)" }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--bg-tertiary, #e8e1d9)" }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#8b6f42" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium font-ui truncate" style={{ color: "var(--espresso)" }}>{item.product_name}</p>
                <p className="text-xs font-ui" style={{ color: "var(--text-muted)" }}>{isPaketItem(item) ? `${item.quantity} item · ${item.product_name}${itemNameSuffix(item)}` : `${item.quantity} item · ${item.color} / ${item.size}`}</p>
              </div>
              <p className="text-sm font-medium font-ui shrink-0" style={{ color: "var(--espresso)" }}>Rp {(item.price * item.quantity).toLocaleString("id-ID")}</p>
            </div>
          ))}

          {/* Totals */}
          <div className="space-y-2.5 py-4" style={{ borderTop: "1px solid rgba(0,0,0,.06)" }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-ui" style={{ color: "var(--text-secondary)" }}>Subtotal Produk</span>
              <span className="text-sm font-medium font-ui" style={{ color: "var(--espresso)" }}>Rp {order.subtotal.toLocaleString("id-ID")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-ui" style={{ color: "var(--text-secondary)" }}>Ongkos Kirim</span>
              <span className="text-sm font-medium font-ui" style={{ color: "var(--espresso)" }}>Rp {order.shipping_cost.toLocaleString("id-ID")}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-ui" style={{ color: "var(--gold)" }}>Diskon</span>
                <span className="text-sm font-medium font-ui" style={{ color: "var(--gold)" }}>- Rp {order.discount.toLocaleString("id-ID")}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-4" style={{ borderTop: "1px solid rgba(0,0,0,.06)" }}>
            <span className="text-sm font-ui" style={{ color: "var(--text-secondary)" }}>Total Pembayaran</span>
            <span className="font-medium text-xl font-ui" style={{ color: "var(--gold)" }}>Rp {order.total.toLocaleString("id-ID")}</span>
          </div>
        </motion.section>

        {/* Payment Instructions - conditional by method */}
        {paymentTypeResolved === "cod" ? (
          <motion.section initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }} className="rounded-2xl p-5 sm:p-7 mb-5" style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(0,0,0,.06)", boxShadow: "0 18px 44px -28px rgba(0,0,0,0.4)" }}>
            <h2 className="flex items-center gap-2 text-xl mb-3" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#8b6f42" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
              Bayar di Tempat (COD)
            </h2>
            <p className="text-sm font-ui leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {paidMethod?.instructions || "Pembayaran dilakukan saat barang diterima. Admin akan menghubungi Anda untuk konfirmasi pengiriman."}
            </p>
          </motion.section>
        ) : paymentTypeResolved === "mayar" ? (
          /* Pembayaran Online (Mayar): dibayar di halaman Mayar (QRIS/VA/e-wallet), jadi TIDAK ada
             instruksi transfer bank di sini. */
          <motion.section initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }} className="rounded-2xl p-5 sm:p-7 mb-5" style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(0,0,0,.06)", boxShadow: "0 18px 44px -28px rgba(0,0,0,0.4)" }}>
            <h2 className="flex items-center gap-2 text-xl mb-4" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>
              <ShieldCheck className="w-5 h-5" style={{ color: "#8b6f42" }} />
              Pembayaran Online
            </h2>
            <p className="text-sm font-ui leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
              Selesaikan pembayaran lewat halaman pembayaran online (QRIS, Virtual Account, atau e-wallet). Nominal: <span style={{ color: "var(--gold)" }}>Rp {order.total.toLocaleString("id-ID")}</span>
            </p>
            <button onClick={handlePayNow} disabled={paying} className="w-full inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[12px] tracking-[0.06em] uppercase font-ui font-semibold transition-all duration-200 disabled:opacity-60" style={{ background: "var(--espresso, #2b211c)", color: "var(--cream, #f7f3ee)" }}>
              {paying ? "Membuka…" : "Bayar Sekarang"}
            </button>
          </motion.section>
        ) : paymentTypeResolved === "qris" || paymentTypeResolved === "ewallet" ? (
          <motion.section initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }} className="rounded-2xl p-5 sm:p-7 mb-5" style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(0,0,0,.06)", boxShadow: "0 18px 44px -28px rgba(0,0,0,0.4)" }}>
            <h2 className="flex items-center gap-2 text-xl mb-4" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#8b6f42" strokeWidth={1.5}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><line x1="14" y1="14" x2="21" y2="21" /></svg>
              QRIS / E-Wallet
            </h2>
            {qrisList.length > 0 ? qrisList.map((qm) => (
              <div key={qm.id} className="rounded-xl p-4 mb-3 last:mb-0" style={{ background: "var(--bg-secondary, #f0ebe5)", border: "1px solid rgba(0,0,0,.06)" }}>
                <p className="text-sm font-medium font-ui mb-2" style={{ color: "var(--espresso)" }}>{paymentMethodLabel(qm)}</p>
                {qm.account_name && !qm.qr_image_url && <p className="text-xs font-ui mb-2" style={{ color: "var(--text-muted)" }}>a.n. {qm.account_name}</p>}
                {qm.qr_image_url ? (
                  <img src={cloudinaryUrl(qm.qr_image_url, { width: 320 })} alt={paymentMethodLabel(qm)} className="w-40 h-40 mx-auto object-contain rounded-lg mb-2" />
                ) : qm.account_info ? (
                  <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,.6)" }}>
                    <span className="flex-1 font-medium text-base font-ui" style={{ color: "var(--espresso)", fontVariantNumeric: "tabular-nums" }}>{qm.account_info}</span>
                    <button onClick={() => copyToClipboard(qm.account_info || "", `qris-${qm.id}`)} className="inline-flex items-center gap-1.5 text-xs font-medium font-ui px-3 py-2 rounded-lg transition-colors" style={{ border: "1px solid rgba(0,0,0,.25)", color: copied === `qris-${qm.id}` ? "#4b7a4e" : "#8b6f42", borderColor: copied === `qris-${qm.id}` ? "#4b7a4e" : undefined }}>
                      {copied === `qris-${qm.id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied === `qris-${qm.id}` ? "Tersalin" : "Salin"}</span>
                    </button>
                  </div>
                ) : null}
              </div>
            )) : (
              <p className="text-sm font-ui text-center py-4" style={{ color: "var(--text-muted)" }}>Hubungi admin untuk info pembayaran</p>
            )}
            <p className="text-lg font-medium font-ui text-center mt-3" style={{ color: "var(--gold)" }}>Rp {order.total.toLocaleString("id-ID")}</p>
          </motion.section>
        ) : (
          /* Bank Transfer (default) */
          (bankList.length > 0 || !!paidMethod?.instructions) && (
            <motion.section initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }} className="rounded-2xl p-5 sm:p-7 mb-5" style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(0,0,0,.06)", boxShadow: "0 18px 44px -28px rgba(0,0,0,0.4)" }}>
              <h2 className="flex items-center gap-2 text-xl mb-5" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#8b6f42" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" /></svg>
                {paymentTypeResolved === "bank" ? "Instruksi Transfer Bank" : paidMethod ? paymentMethodLabel(paidMethod) : "Instruksi Pembayaran"}
              </h2>

              {bankList.length === 0 && paidMethod?.instructions && (
                <p className="text-sm font-ui mb-4" style={{ color: "var(--text-secondary)" }}>{paidMethod.instructions}</p>
              )}

              {bankList.map((pm, i) => (
                <div key={pm.id} className={i < bankList.length - 1 ? "mb-5 pb-5" : "mb-5"} style={{ borderBottom: i < bankList.length - 1 ? "1px solid rgba(0,0,0,.06)" : undefined }}>
                  <p className="text-sm font-medium font-ui" style={{ color: "var(--espresso)" }}>{pm.bank_name || paymentMethodLabel(pm)}</p>
                  <p className="text-xs font-ui mb-3" style={{ color: "var(--text-muted)" }}>a.n. {pm.account_name}</p>
                  <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-3" style={{ background: "var(--bg-secondary, #f0ebe5)" }}>
                    <span className="flex-1 font-medium text-base font-ui" style={{ color: "var(--espresso)", fontVariantNumeric: "tabular-nums" }}>{pm.account_number}</span>
                    <button onClick={() => copyToClipboard(pm.account_number || "", `acc-${i}`)} className="inline-flex items-center gap-1.5 text-xs font-medium font-ui px-3 py-2 rounded-lg transition-colors" style={{ border: "1px solid rgba(0,0,0,.25)", color: copied === `acc-${i}` ? "#4b7a4e" : "#8b6f42", borderColor: copied === `acc-${i}` ? "#4b7a4e" : undefined }}>
                      {copied === `acc-${i}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied === `acc-${i}` ? "Tersalin" : "Salin"}</span>
                    </button>
                  </div>
                </div>
              ))}

              <div>
                <p className="text-[11px] tracking-[0.15em] uppercase mb-2 font-ui" style={{ color: "var(--text-muted)" }}>Nominal Transfer</p>
                <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "var(--bg-secondary, #f0ebe5)" }}>
                  <span className="flex-1 font-medium text-lg font-ui" style={{ color: "var(--gold)", fontVariantNumeric: "tabular-nums" }}>Rp {order.total.toLocaleString("id-ID")}</span>
                  <button onClick={() => copyToClipboard(String(order.total), "nominal")} className="inline-flex items-center gap-1.5 text-xs font-medium font-ui px-3 py-2 rounded-lg transition-colors" style={{ border: "1px solid rgba(0,0,0,.25)", color: copied === "nominal" ? "#4b7a4e" : "#8b6f42", borderColor: copied === "nominal" ? "#4b7a4e" : undefined }}>
                    {copied === "nominal" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied === "nominal" ? "Tersalin" : "Salin"}</span>
                  </button>
                </div>
                <p className="text-[11px] mt-2 font-ui" style={{ color: "var(--text-muted)" }}>Pastikan nominal sesuai hingga digit terakhir untuk mempermudah verifikasi.</p>
              </div>
            </motion.section>
          )
        )}

        {/* Checklist */}
        <motion.section initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.5 }} className="rounded-2xl p-5 sm:p-6 mb-5" style={{ background: "var(--bg-secondary, #f0ebe5)", border: "1px solid rgba(0,0,0,.06)" }}>
          <p className="flex items-center gap-2 text-sm font-medium mb-4 font-ui" style={{ color: "var(--espresso)" }}>
            <Check className="w-4 h-4" style={{ color: "#4b7a4e" }} />
            Pastikan transfer sesuai
          </p>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-2.5 text-sm font-ui" style={{ color: "var(--text-secondary)" }}><span style={{ color: "var(--gold)" }}>✓</span> Transfer sesuai nominal yang tercantum</li>
            <li className="flex items-start gap-2.5 text-sm font-ui" style={{ color: "var(--text-secondary)" }}><span style={{ color: "var(--gold)" }}>✓</span> Simpan bukti transfer Anda</li>
            <li className="flex items-start gap-2.5 text-sm font-ui" style={{ color: "var(--text-secondary)" }}><span style={{ color: "var(--gold)" }}>✓</span> Konfirmasi via WhatsApp setelah transfer</li>
          </ul>
        </motion.section>

        {/* Countdown */}
        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.5 }} className="flex items-center justify-between gap-4 rounded-2xl px-5 py-4 mb-6" style={{ background: "rgba(0,0,0,0.10)", border: "1px solid rgba(0,0,0,0.28)" }}>
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 flex-shrink-0" style={{ color: "#8b6f42" }} />
            <span className="text-sm font-medium font-ui" style={{ color: "var(--espresso)" }}>Selesaikan sebelum waktu habis</span>
          </div>
          <div ref={countdownRef} className="flex items-center gap-1.5 font-ui" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span className="font-medium text-base px-2.5 py-1 rounded-md" style={{ background: "var(--espresso)", color: "var(--cream)" }}>{cd.h}</span>
            <span style={{ color: "#8b6f42" }}>:</span>
            <span className="font-medium text-base px-2.5 py-1 rounded-md" style={{ background: "var(--espresso)", color: "var(--cream)" }}>{cd.m}</span>
            <span style={{ color: "#8b6f42" }}>:</span>
            <span className="font-medium text-base px-2.5 py-1 rounded-md" style={{ background: "var(--espresso)", color: "var(--cream)" }}>{cd.s}</span>
          </div>
        </motion.div>

        {/* Primary CTA */}
        <motion.a initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.6 }} href={getWhatsAppLink()} onClick={() => trackLead(`transfer_${order?.order_number || "unknown"}`)} className="flex flex-col items-center justify-center gap-0.5 w-full px-7 py-4 rounded-2xl text-center transition-transform duration-200 hover:-translate-y-0.5 mb-3" style={{ background: "var(--espresso)", color: "var(--cream)", boxShadow: "0 18px 38px -16px rgba(0,0,0,0.6)" }}>
          <span className="inline-flex items-center gap-2 text-base font-medium font-ui">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.548 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.885 3.488" /></svg>
            {paymentTypeResolved === "cod" ? "Konfirmasi Pesanan" : "Saya Sudah Transfer"}
          </span>
          <span className="text-xs font-ui" style={{ color: "var(--text-muted)" }}>
            {paymentTypeResolved === "cod" ? "Konfirmasi via WhatsApp" : "Konfirmasi & kirim bukti via WhatsApp"}
          </span>
        </motion.a>

        {/* Trust badges */}
        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.7 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { icon: "shield", title: "Transaksi Aman", sub: "100% Terpercaya" },
            { icon: "doc", title: "Original", sub: "Kualitas Terjamin" },
            { icon: "chat", title: "Support 24/7", sub: "Siap Membantu" },
            { icon: "check", title: "Garansi Layanan", sub: "Kepuasan Terjamin" },
          ].map((badge) => (
            <div key={badge.title} className="rounded-xl p-4 text-center" style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(0,0,0,.06)" }}>
              <svg className="w-6 h-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="#8b6f42" strokeWidth={1.4}>
                {badge.icon === "shield" && <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />}
                {badge.icon === "doc" && <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />}
                {badge.icon === "chat" && <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />}
                {badge.icon === "check" && <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />}
              </svg>
              <p className="text-xs font-medium font-ui" style={{ color: "var(--espresso)" }}>{badge.title}</p>
              <p className="text-[10px] font-ui" style={{ color: "var(--text-muted)" }}>{badge.sub}</p>
            </div>
          ))}
        </motion.div>

        {/* Back to home */}
        <div className="text-center">
          <a href="/" className="inline-flex items-center gap-2 text-sm tracking-wide transition-opacity hover:opacity-70 font-ui" style={{ color: "var(--text-secondary)" }}>
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Beranda
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-5 pb-10 max-w-2xl mx-auto text-center">
        <div className="h-px w-full mb-5 opacity-50" style={{ background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
        <p className="text-base mb-1" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontStyle: "italic", color: "var(--text-secondary)" }}>{storeSettings.tagline}</p>
        <p className="text-[11px] tracking-wide font-ui" style={{ color: "var(--text-muted)" }}>© 2026 {storeSettings.store_name} · Premium Muslim Menswear</p>
      </footer>

      <style jsx global>{`
        .grain { background-image: radial-gradient(circle at 1px 1px, rgba(0,0,0,0.05) 1px, transparent 0); background-size: 24px 24px; }
      `}</style>
    </section>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<section className="min-h-screen flex items-center justify-center" style={{ background: "var(--cream)" }}><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,.3)", borderTopColor: "var(--gold)" }} /></section>}>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
