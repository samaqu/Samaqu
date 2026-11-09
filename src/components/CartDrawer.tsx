"use client";

import { useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, Trash2, Tag, ShoppingBag, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { colorMap } from "@/lib/katalog-data";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { supabase } from "@/lib/supabase";
import { useSafeLocale } from "@/lib/safe-i18n";
import { useRouter } from "next/navigation";

export default function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const locale = useSafeLocale();
  const { items, removeItem, updateQty, subtotal, voucher, applyVoucher, removeVoucher } = useCart();
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState("");
  const promoApplied = voucher.discount > 0;

  const total = subtotal - voucher.discount;

  async function handleApplyPromo() {
    setPromoError("");
    const result = await applyVoucher(promoCode);
    if (result.ok) {
      setPromoCode("");
    } else {
      setPromoError(result.error || "Kode promo tidak valid");
    }
  }

  function handleRemovePromo() {
    removeVoucher();
    setPromoCode("");
    setPromoError("");
  }

  async function handleCheckout() {
    onClose();
    // Checkout wajib pakai akun: pesanan, resi, dan riwayat pelacakan tersimpan di akun customer.
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push(`/${locale}/akun/login?redirect=${encodeURIComponent("/checkout")}`);
      return;
    }
    router.push(`/${locale}/checkout`);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[9998]"
            style={{ background: "rgba(0,0,0,.35)", backdropFilter: "blur(2px)" }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 right-0 bottom-0 z-[9999] w-full max-w-[400px] flex flex-col"
            style={{ background: "var(--cream)", boxShadow: "-8px 0 40px -12px rgba(0,0,0,.18)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0"
              style={{ borderBottom: "1px solid rgba(0,0,0,.15)" }}>
              <div className="flex items-center gap-2.5">
                <ShoppingCart size={18} style={{ color: "#000000" }} />
                <h2 className="text-[15px] font-ui font-semibold" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>
                  Keranjang
                </h2>
                {items.length > 0 && (
                  <span className="text-[11px] font-ui px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(0,0,0,.1)", color: "#000000" }}>
                    {items.reduce((s, i) => s + i.qty, 0)} item
                  </span>
                )}
              </div>
              <button onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ border: "1px solid rgba(0,0,0,.25)" }}
                aria-label="Tutup keranjang">
                <X size={16} style={{ color: "var(--espresso)" }} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {items.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-16 h-16 rounded-full mb-4 flex items-center justify-center" style={{ background: "rgba(0,0,0,.08)" }}>
                    <ShoppingBag size={28} style={{ color: "var(--clay)" }} />
                  </div>
                  <p className="text-[15px] font-ui font-medium mb-1.5" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>
                    Keranjang kosong
                  </p>
                  <p className="text-[12px] font-ui mb-5" style={{ color: "var(--stone)" }}>
                    Tambahkan produk untuk mulai belanja.
                  </p>
                  <button onClick={() => { onClose(); router.push("/katalog"); }}
                    className="px-6 py-2.5 rounded-xl text-[12px] tracking-[0.06em] uppercase font-ui font-semibold transition-all duration-200 hover:scale-105"
                    style={{ background: "#000000", color: "white" }}>
                    Lihat Katalog
                  </button>
                </div>
              ) : (
                <>
                  {/* Item list */}
                  <div className="space-y-3 mb-4">
                    <AnimatePresence>
                      {items.map((item, i) => (
                        <motion.div
                          key={`${item.id}-${item.color}-${item.size}-${item.series ?? ""}`}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -40 }}
                          transition={{ duration: 0.2 }}
                          className="flex gap-3 p-3 rounded-xl"
                          style={{ background: "rgba(255,255,255,.6)", border: "1px solid rgba(0,0,0,.12)" }}>
                          {/* Image */}
                          <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0" style={{ background: "#e5e5e5" }}>
                            <img src={cloudinaryUrl(item.image, { width: 160 })} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <p className="text-[12px] font-ui font-semibold leading-tight truncate" style={{ color: "var(--espresso)" }}>
                                {item.name}
                              </p>
                              <button onClick={() => removeItem(i)}
                                className="shrink-0 p-0.5 rounded transition-all hover:scale-110" style={{ color: "var(--stone)" }}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {item.kain && (
                                <span className="text-[10px] font-ui" style={{ color: "var(--coffee)" }}>
                                  Kain {item.kain}
                                </span>
                              )}
                              {item.kain && item.series && <span className="text-[9px]" style={{ color: "var(--clay)" }}>·</span>}
                              {item.series && (
                                <span className="text-[10px] font-ui" style={{ color: "var(--coffee)" }}>
                                  {item.series}
                                </span>
                              )}
                              {((item.kain || item.series) && item.color !== "-" && item.color !== "default") && <span className="text-[9px]" style={{ color: "var(--clay)" }}>·</span>}
                              {item.color !== "-" && item.color !== "default" && (
                                <span className="flex items-center gap-1 text-[10px] font-ui" style={{ color: "var(--coffee)" }}>
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorMap[item.color] || "#ccc", border: "1px solid rgba(0,0,0,.1)" }} />
                                  {item.color}
                                </span>
                              )}
                              <span className="text-[9px]" style={{ color: "var(--clay)" }}>|</span>
                              <span className="text-[10px] font-ui" style={{ color: "var(--coffee)" }}>UK {item.size}</span>
                            </div>
                            {/* Catatan per item (hanya keranjang lama) — ditampilkan aman kalau ada. */}
                            {item.notes && (
                              <p className="text-[10px] font-ui mt-0.5" style={{ color: "var(--stone)" }}>Catatan: {item.notes}</p>
                            )}
                            <div className="flex items-center justify-between mt-1.5">
                              {/* Qty pill */}
                              <div className="inline-flex items-center rounded-full"
                                style={{ background: "var(--cream)", border: "1px solid rgba(0,0,0,.2)", padding: "1px 2px" }}>
                                <button onClick={() => updateQty(i, item.qty - 1)}
                                  className="w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90"
                                  style={{ color: "var(--espresso)" }}>
                                  <Minus size={11} />
                                </button>
                                <span className="w-6 text-center text-[12px] font-ui font-semibold" style={{ color: "var(--espresso)" }}>
                                  {item.qty}
                                </span>
                                <button onClick={() => updateQty(i, item.qty + 1)}
                                  className="w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90"
                                  style={{ color: "var(--espresso)" }}>
                                  <Plus size={11} />
                                </button>
                              </div>
                              {item.create_your_price_enabled && (
                                <p className="text-[10px] font-ui" style={{ color: "#000000" }}>
                                  Harga pilihanmu
                                </p>
                              )}
                              <p className="text-[13px] font-ui font-semibold" style={{ color: "#000000" }}>
                                Rp {((item.create_your_price_enabled && item.customer_price ? item.customer_price : item.price) * item.qty).toLocaleString("id-ID")}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Promo code */}
                  <div className="p-3 rounded-xl mb-4"
                    style={{ background: "rgba(255,255,255,.5)", border: "1px solid rgba(0,0,0,.12)" }}>
                    {promoApplied ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tag size={14} style={{ color: "#000000" }} />
                          <span className="text-[12px] font-ui font-semibold" style={{ color: "#000000" }}>{voucher.code}</span>
                        </div>
                        <button onClick={handleRemovePromo} className="text-[11px] font-ui underline" style={{ color: "var(--stone)" }}>Hapus</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input type="text" value={promoCode} onChange={(e) => { setPromoCode(e.target.value); setPromoError(""); }}
                          placeholder="Kode promo"
                          className="flex-1 text-[12px] font-ui bg-transparent outline-none px-2 py-1.5 rounded-lg"
                          style={{ border: `1px solid ${promoError ? "#e74c3c" : "rgba(0,0,0,.2)"}`, color: "var(--espresso)" }} />
                        <button onClick={handleApplyPromo}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-ui font-semibold transition-all hover:scale-105 shrink-0"
                          style={{ background: "var(--espresso)", color: "white" }}>
                          Pakai
                        </button>
                      </div>
                    )}
                    {promoError && <p className="text-[10px] font-ui mt-1 ml-1" style={{ color: "#e74c3c" }}>{promoError}</p>}
                  </div>

                  {/* Summary */}
                  <div className="rounded-xl p-3.5"
                    style={{ background: "rgba(255,255,255,.4)", border: "1px solid rgba(0,0,0,.1)" }}>
                    <div className="space-y-1.5">
                      <SummaryLine label="Subtotal" value={`Rp ${subtotal.toLocaleString("id-ID")}`} />
                      {promoApplied && <SummaryLine label={`Diskon (${voucher.code})`} value={`- Rp ${voucher.discount.toLocaleString("id-ID")}`} valueColor="#000000" />}
                      <SummaryLine label="Pengiriman" value="Dihitung saat checkout" />
                    </div>
                    <div className="h-px my-2.5" style={{ background: "rgba(0,0,0,.15)" }} />
                    <div className="flex justify-between items-end">
                      <span className="text-[11px] font-ui" style={{ color: "var(--stone)" }}>Total</span>
                      <span className="text-[17px] font-ui font-semibold" style={{ color: "#000000" }}>
                        Rp {total.toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer checkout button */}
            {items.length > 0 && (
              <div className="px-5 py-4 shrink-0" style={{ borderTop: "1px solid rgba(0,0,0,.12)" }}>
                <button onClick={handleCheckout}
                  className="w-full py-3.5 rounded-xl text-[12px] tracking-[0.06em] uppercase font-ui font-semibold transition-all duration-300 active:scale-[0.98]"
                  style={{ background: "#000000", color: "white", boxShadow: "0 6px 20px -6px rgba(0,0,0,.25)" }}>
                  Checkout — Rp {total.toLocaleString("id-ID")}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SummaryLine({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[11px] font-ui" style={{ color: "var(--coffee)" }}>{label}</span>
      <span className="text-[11px] font-ui font-medium" style={{ color: valueColor || "var(--espresso)" }}>{value}</span>
    </div>
  );
}
