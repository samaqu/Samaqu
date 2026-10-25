"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, CheckCircle, MessageCircle, Quote, Shirt, Ruler, Headphones, Heart, X, Play } from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import { getTestimonials, type DbTestimonial } from "@/lib/db";
import { getWhatsAppLink } from "@/lib/store-settings";
import { supabase } from "@/lib/supabase";
import { useSafeTranslations } from "@/lib/safe-i18n";
import { cloudinaryUrl } from "@/lib/cloudinary";

interface Product {
  id: string;
  name: string;
  category: string;
}

interface Testimoni {
  name: string;
  cat: string;
  text: string;
  img?: string;
  rating: number;
  verified: boolean;
  product_id: string | null;
  series_name: string | null;
  product_name?: string;
  product_category?: string;
  video_url?: string;
}

const headerVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const TRUST_ITEMS = [
  "Kualitas Sama",
  "Create Your Price",
  "Jahitan Rapi",
  "Kirim Seluruh Indonesia",
  "Konsultasi Size Gratis",
];

const FEEL_ITEMS = [
  { icon: <Star size={20} strokeWidth={1.5} />, title: "Kualitas", desc: "Produk, bahan, jahitan, dan finishing tetap sama — berapa pun harga yang kamu pilih di atas Harga Minimum." },
  { icon: <Heart size={20} strokeWidth={1.5} />, title: "Kenyamanan", desc: "Setiap jenis kain punya karakter berbeda — ketebalan, kenyamanan, hingga tampilan. Nyaman dipakai sepanjang hari." },
  { icon: <Ruler size={20} strokeWidth={1.5} />, title: "Ukuran", desc: "Panduan Size dan Rekomendasi Size berdasarkan tinggi serta berat badan. Masih ragu? Tim Samaqu siap membantu." },
  { icon: <Headphones size={20} strokeWidth={1.5} />, title: "Pelayanan", desc: "Dari konsultasi sebelum order, proses 1–2 hari kerja, sampai bantuan retur — tim kami mendampingi di setiap tahap." },
];

function TestimonialCard({ t, onImageClick }: { t: Testimoni; onImageClick: (url: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: "white", border: "1px solid rgba(0,0,0,.08)", boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}
    >
      {/* Header: Avatar + Name + Rating */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold" style={{ background: "#000000", color: "#ffffff", fontFamily: "Georgia, serif" }}>
          {getInitials(t.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate" style={{ color: "#000000" }}>{t.name}</p>
            {t.verified && (
              <span title="Pembelian terverifikasi" aria-label="Pembelian terverifikasi" className="inline-flex">
                <CheckCircle size={12} style={{ color: "#000000" }} />
              </span>
            )}
          </div>
          <div className="flex gap-0.5 mt-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} size={12} fill={i < t.rating ? "#000000" : "none"} stroke="#000000" strokeWidth={1.5} />
            ))}
          </div>
        </div>
      </div>

      {/* Product Info Badge — always show */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {t.product_name ? (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(0,0,0,.05)", color: "#000000" }}>
              <Shirt size={10} strokeWidth={2} />
              {t.product_name}
            </span>
          ) : t.cat ? (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(0,0,0,.05)", color: "#000000" }}>
              <Shirt size={10} strokeWidth={2} />
              {t.cat}
            </span>
          ) : null}
          {t.series_name && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(0,0,0,.03)", color: "rgba(0,0,0,.55)" }}>
              {t.series_name}
            </span>
          )}
        </div>
      </div>

      {/* Review Text */}
      <div className="px-4 pb-3 flex-1">
        <p className="text-[13px] leading-relaxed line-clamp-4" style={{ color: "var(--text-secondary)" }}>
          {t.text}
        </p>
      </div>

      {/* Media */}
      {(t.img || t.video_url) && (
        <div className="px-4 pb-4">
          {t.video_url ? (
            <button
              onClick={() => onImageClick(t.video_url!)}
              className="relative w-full aspect-video rounded-xl overflow-hidden group cursor-pointer"
              style={{ background: "#e5e5e5" }}
            >
              <img src={cloudinaryUrl(t.img || t.video_url, { width: 600 })} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,.2)" }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#ffffff", boxShadow: "0 4px 12px rgba(0,0,0,.3)" }}>
                  <Play size={20} fill="#000000" stroke="none" className="ml-0.5" />
                </div>
              </div>
            </button>
          ) : (
            <button
              onClick={() => onImageClick(t.img!)}
              className="w-full rounded-xl overflow-hidden cursor-pointer"
            >
              <img src={cloudinaryUrl(t.img || "", { width: 800 })} alt="" className="w-full h-auto object-cover max-h-48" loading="lazy" />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const isVideo = url.includes(".mp4") || url.includes("video");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{ background: "rgba(0,0,0,.85)" }}
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,.15)" }}>
        <X size={20} color="white" />
      </button>
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="w-full max-w-[90vw] sm:max-w-3xl max-h-[80vh] sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video src={url} controls className="w-full h-auto max-h-[80vh] sm:max-h-[85vh] object-contain rounded-xl" />
        ) : (
          <img src={cloudinaryUrl(url, { width: 1600 })} alt="" className="w-full h-auto max-h-[80vh] sm:max-h-[85vh] object-contain rounded-xl" />
        )}
      </motion.div>
    </motion.div>
  );
}

export default function TestimoniPage() {
  const t = useSafeTranslations("testimoni");
  const [testimoniData, setTestimoniData] = useState<Testimoni[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("Semua");

  useEffect(() => {
    async function loadData() {
      const [testimonialData, productData] = await Promise.all([
        getTestimonials(),
        supabase.from("products").select("id, name, category"),
      ]);

      const productsMap = new Map((productData.data || []).map((p: Product) => [p.id, p]));

      const mapped: Testimoni[] = testimonialData.map((t) => {
        const product = t.product_id ? productsMap.get(t.product_id) : null;
        return {
          name: t.customer_name,
          cat: product?.category || t.category,
          text: t.content,
          img: t.image_url || undefined,
          rating: t.rating,
          verified: t.verified,
          product_id: t.product_id,
          series_name: t.series_name,
          product_name: product?.name,
          product_category: product?.category,
          video_url: t.video_url || undefined,
        };
      });
      setTestimoniData(mapped);
      setLoading(false);
    }
    loadData();
  }, []);

  // Get unique categories from testimonials
  const categories = useMemo(() => {
    const cats = new Set(testimoniData.map((t) => t.cat).filter(Boolean));
    return ["Semua", ...Array.from(cats)];
  }, [testimoniData]);

  // Filter testimonials
  const filteredTestimonials = useMemo(() => {
    if (filterCategory === "Semua") return testimoniData;
    return testimoniData.filter((t) => t.cat === filterCategory);
  }, [testimoniData, filterCategory]);

  return (
    <section className="min-h-screen" style={{ background: "#F3F3F3" }}>
      {/* ═══ HERO ═══ */}
      <div className="relative overflow-hidden" style={{ background: "#000000", color: "#ffffff" }}>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "url(/hero-testimoni.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.8), rgba(0,0,0,.88), rgba(0,0,0,1))" }} />
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: "rgba(255,255,255,.1)" }} />

        <div className="relative pt-28 sm:pt-32 lg:pt-36 pb-12 sm:pb-16">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-14">
            <div className="grid gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-center">
              <div>
                <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}>
                  <motion.p variants={headerVariants} className="flex items-center gap-2 text-[11px] sm:text-[12px] tracking-[0.32em] uppercase mb-4 font-ui font-medium" style={{ color: "#ffffff" }}>
                    <Star size={14} strokeWidth={2} fill="#ffffff" stroke="#ffffff" /> {t("eyebrow")}
                  </motion.p>
                  <motion.h1 variants={headerVariants} className="text-[2rem] sm:text-5xl lg:text-[3.7rem] font-semibold leading-[1.05] tracking-tight mb-3" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "#ffffff" }}>
                    {t("title")}
                  </motion.h1>
                  <motion.p variants={headerVariants} className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.08em] mb-4" style={{ color: "rgba(255,255,255,.5)" }}>
                    {t("tagline")}
                  </motion.p>
                  <motion.p variants={headerVariants} className="text-sm sm:text-base leading-relaxed max-w-lg font-ui" style={{ color: "rgba(255,255,255,.7)" }}>
                    {t("desc")}
                  </motion.p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-7 flex flex-wrap gap-3">
                  <a href="#koleksi" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[12px] tracking-[0.06em] uppercase font-ui font-semibold transition-all duration-200" style={{ background: "#ffffff", color: "#000000", boxShadow: "0 10px 24px -14px rgba(0,0,0,.4)" }}>
                    <Shirt size={16} strokeWidth={1.5} /> {t("ctaCollection")}
                  </a>
                  <a href={getWhatsAppLink("Halo SAMAQU, saya ingin konsultasi produk")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[12px] tracking-[0.06em] uppercase font-ui font-semibold transition-all duration-200" style={{ border: "1px solid rgba(255,255,255,.14)", color: "#ffffff" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" /></svg>
                    {t("ctaConsult")}
                  </a>
                </motion.div>
              </div>

              {/* Rating card */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-2xl p-6 sm:p-7" style={{ background: "#000000", border: "1px solid rgba(255,255,255,.14)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] tracking-[0.15em] uppercase font-ui font-bold" style={{ color: "rgba(255,255,255,.45)" }}>{t("ratingLabel")}</p>
                  <div className="flex gap-0.5">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} fill="#ffffff" stroke="#ffffff" />)}</div>
                </div>
                <p className="mt-4 text-[0.95rem] leading-relaxed font-ui" style={{ color: "rgba(255,255,255,.85)" }}>
                  &quot;Bahannya jatuh, jahitannya rapi, dan ukurannya pas sesuai rekomendasi tim. Packing-nya juga aman.&quot;
                </p>
                <div className="mt-5 grid grid-cols-3 gap-4 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,.14)" }}>
                  <div>
                    <p className="text-xl font-extrabold" style={{ color: "#ffffff" }}>100%</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,.45)" }}>{t("stat1Label")}</p>
                  </div>
                  <div>
                    <p className="text-xl font-extrabold" style={{ color: "#ffffff" }}>1–2</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,.45)" }}>{t("stat2Label")}</p>
                  </div>
                  <div>
                    <p className="text-xl font-extrabold" style={{ color: "#ffffff" }}>34</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,.45)" }}>{t("stat3Label")}</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MARQUEE ═══ */}
      <div className="overflow-hidden py-3.5" style={{ background: "#F3F3F3", borderTop: "1px solid rgba(0,0,0,.1)", borderBottom: "1px solid rgba(0,0,0,.1)" }}>
        <div className="marquee-track flex" style={{ width: "max-content" }}>
          {[0, 1].map((set) => (
            <div key={set} className="flex shrink-0 items-center gap-7 pr-7 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "rgba(0,0,0,.5)" }}>
              {TRUST_ITEMS.map((item) => (
                <span key={`${set}-${item}`} className="flex items-center gap-2">
                  <CheckCircle size={13} strokeWidth={2} style={{ color: "#000000" }} /> {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ BREADCRUMB ═══ */}
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-14" style={{ paddingTop: "40px", paddingBottom: "24px" }}>
        <Breadcrumb />
      </div>

      {/* ═══ FILTER + GRID ═══ */}
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-14 pb-16">
        {/* Filter */}
        {categories.length > 2 && (
          <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className="px-4 py-2 text-[12px] font-ui font-medium rounded-full whitespace-nowrap transition-all duration-200"
                style={{
                  background: filterCategory === cat ? "#000000" : "transparent",
                  color: filterCategory === cat ? "#ffffff" : "#000000",
                  border: `1px solid ${filterCategory === cat ? "#000000" : "rgba(0,0,0,.15)"}`,
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="w-6 h-6 border-2 rounded-full animate-spin mx-auto" style={{ borderColor: "rgba(0,0,0,.15)", borderTopColor: "#000000" }} />
          </div>
        ) : filteredTestimonials.length === 0 ? (
          <div className="text-center py-20">
            <MessageCircle size={34} strokeWidth={1.4} className="mx-auto mb-4" style={{ color: "#000000" }} />
            <p className="text-sm font-ui" style={{ color: "rgba(0,0,0,.55)" }}>{t("emptyState")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTestimonials.map((t, i) => (
              <TestimonialCard key={`${t.name}-${i}`} t={t} onImageClick={setLightboxUrl} />
            ))}
          </div>
        )}
      </div>

      {/* ═══ CTA ═══ */}
      <section id="koleksi" className="relative overflow-hidden" style={{ background: "#000000", color: "#ffffff" }}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(255,255,255,.1)" }} />
        <div className="relative max-w-4xl mx-auto px-5 sm:px-8 py-16 sm:py-20 text-center">
          <div className="mx-auto mb-5 w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,.08)", color: "#ffffff" }}>
            <Shirt size={28} strokeWidth={1.5} />
          </div>
          <p className="text-[11px] tracking-[0.2em] uppercase font-ui font-medium mb-3" style={{ color: "#ffffff" }}>{t("ctaTitle")}</p>
          <h2 className="text-[1.6rem] sm:text-[2.3rem] font-semibold leading-tight" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>
            {t("ctaDesc")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed max-w-md mx-auto" style={{ color: "rgba(255,255,255,.65)" }}>
            {t("ctaSubtext")}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-lg mx-auto">
            <a href="/katalog" className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[12px] tracking-[0.06em] uppercase font-ui font-semibold transition-all duration-200" style={{ background: "#ffffff", color: "#000000", boxShadow: "0 10px 24px -14px rgba(0,0,0,.4)" }}>
              <Shirt size={16} strokeWidth={1.5} /> {t("ctaCollection")}
            </a>
            <a href={getWhatsAppLink("Halo SAMAQU, saya ingin konsultasi produk")} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[12px] tracking-[0.06em] uppercase font-ui font-semibold transition-all duration-200" style={{ border: "1px solid rgba(255,255,255,.14)", color: "#ffffff" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" /></svg>
              {t("ctaWA")}
            </a>
          </div>
        </div>
      </section>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      </AnimatePresence>

      {/* Marquee animation */}
      <style jsx global>{`
        @keyframes marquee-x { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .marquee-track { animation: marquee-x 40s linear infinite; }
      `}</style>
    </section>
  );
}
