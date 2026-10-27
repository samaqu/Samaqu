"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ruler, Loader2, ArrowLeft, MessageCircle, Eye, X, ChevronLeft, ChevronRight } from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import { useSafeTranslations } from "@/lib/safe-i18n";
import { supabase } from "@/lib/supabase";
import { getWhatsAppLink } from "@/lib/store-settings";

interface SizeGuideImage {
  id: string;
  category: string;
  image_url: string;
  updated_at: string;
}

const CATEGORY_TABS = [
  { key: "tabAll", value: "Semua" },
  { key: null, value: "Thobe" },
  { key: null, value: "Kandora" },
  { key: null, value: "Koko" },
  { key: null, value: "Vest" },
  { key: "tabRekomendasi", value: "Rekomendasi Size" },
];

const CATEGORY_DESC_KEYS: Record<string, string> = {
  Thobe: "descThobe",
  Kandora: "descKandora",
  Koko: "descKoko",
  Vest: "descVest",
  "Rekomendasi Size": "descRekomendasi",
};

const headerVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function PanduanUkuranPage() {
  const t = useSafeTranslations("sizeGuide");
  const [sizeGuides, setSizeGuides] = useState<SizeGuideImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Semua");
  const [lightboxGuide, setLightboxGuide] = useState<SizeGuideImage | null>(null);

  useEffect(() => {
    async function loadSizeGuides() {
      const { data } = await supabase
        .from("size_guide_images")
        .select("*")
        .order("category");
      if (data) setSizeGuides(data);
      setLoading(false);
    }
    loadSizeGuides();
  }, []);

  // Lightbox: Escape menutup, panah kiri/kanan pindah kategori, scroll halaman dikunci.
  useEffect(() => {
    if (!lightboxGuide) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxGuide(null);
      if (event.key === "ArrowLeft") {
        const prev = getAdjacentGuide("prev");
        if (prev) setLightboxGuide(prev);
      }
      if (event.key === "ArrowRight") {
        const next = getAdjacentGuide("next");
        if (next) setLightboxGuide(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
    // getAdjacentGuide membaca filteredGuides saat event terjadi, jadi cukup bergantung
    // pada sumber datanya (sizeGuides + tab aktif) agar tidak kena TDZ saat render.
  }, [lightboxGuide, sizeGuides, activeTab]);

  const filteredGuides =
    activeTab === "Semua"
      ? sizeGuides.filter((g) => g.image_url)
      : sizeGuides.filter((g) => g.category === activeTab && g.image_url);

  const hasImages = sizeGuides.some((g) => g.image_url);

  function getAdjacentGuide(direction: "prev" | "next") {
    if (!lightboxGuide) return null;
    const idx = filteredGuides.findIndex((g) => g.id === lightboxGuide.id);
    if (idx === -1) return null;
    if (direction === "next") return filteredGuides[(idx + 1) % filteredGuides.length];
    return filteredGuides[(idx - 1 + filteredGuides.length) % filteredGuides.length];
  }

  return (
    <section className="min-h-screen" style={{ background: "#F3F3F3" }}>
      {/* ═══ HERO ═══ */}
      <div className="relative overflow-hidden" style={{ background: "var(--espresso)", color: "var(--cream)" }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url(/hero-size.jpg)", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.85), rgba(0,0,0,.95))" }} />
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: "rgba(255,255,255,.1)" }} />

        <div className="relative pt-28 sm:pt-32 lg:pt-36 pb-10 sm:pb-14">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-14">
            <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}>
              <motion.p variants={headerVariants} className="flex items-center gap-2 text-[11px] sm:text-[12px] tracking-[0.32em] uppercase mb-4 font-ui font-medium" style={{ color: "#ffffff" }}>
                <Ruler size={14} strokeWidth={2} /> {t("eyebrow")}
              </motion.p>
              <motion.h1 variants={headerVariants} className="text-[2rem] sm:text-5xl lg:text-[3.7rem] font-semibold leading-[1.05] tracking-tight mb-3" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--cream)" }}>
                {t("title")}
              </motion.h1>
              <motion.p variants={headerVariants} className="text-sm sm:text-base leading-relaxed max-w-lg font-ui" style={{ color: "rgba(255,255,255,.7)" }}>
                {t("pageDesc")}
              </motion.p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-7 flex flex-wrap gap-3">
              <a href={getWhatsAppLink("Halo SAMAQU, saya ingin konsultasi ukuran")} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[12px] tracking-[0.06em] uppercase font-ui font-semibold transition-all duration-200" style={{ background: "#ffffff", color: "#000000", boxShadow: "0 10px 24px -14px rgba(0,0,0,.4)" }}>
                <MessageCircle size={16} strokeWidth={1.5} /> {t("consultWA")}
              </a>
              <a href="/" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[12px] tracking-[0.06em] uppercase font-ui font-semibold transition-all duration-200" style={{ border: "1px solid rgba(255,255,255,.14)", color: "var(--cream)" }}>
                <ArrowLeft size={16} strokeWidth={1.5} /> {t("backToHome")}
              </a>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ═══ BREADCRUMB ═══ */}
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-14" style={{ paddingTop: "40px", paddingBottom: "24px" }}>
        <Breadcrumb />
      </div>

      {/* ═══ TABS + CONTENT ═══ */}
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-14 pb-16">
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {CATEGORY_TABS.map((tab) => {
            const guideForTab = sizeGuides.find((g) => g.category === tab.value);
            const isSemua = tab.value === "Semua";
            const hasTabImage = isSemua ? hasImages : guideForTab?.image_url;
            const label = tab.key ? t(tab.key) : tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className="px-4 py-2 text-[12px] font-ui font-medium rounded-full whitespace-nowrap transition-all duration-200"
                style={{
                  background: activeTab === tab.value ? "var(--espresso)" : "transparent",
                  color: activeTab === tab.value ? "var(--cream)" : "var(--coffee)",
                  border: `1px solid ${activeTab === tab.value ? "var(--espresso)" : "rgba(0,0,0,.3)"}`,
                  opacity: !hasTabImage && !isSemua ? 0.5 : 1,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-20">
              <Loader2 size={24} className="animate-spin mx-auto mb-3" style={{ color: "var(--gold)" }} />
              <p className="text-sm font-ui" style={{ color: "var(--stone)" }}>{t("loading")}</p>
            </motion.div>
          ) : filteredGuides.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center py-20 rounded-2xl" style={{ background: "white", border: "1px solid rgba(0,0,0,.2)" }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "var(--sand-2)" }}>
                <Ruler size={28} strokeWidth={1.4} style={{ color: "var(--gold)" }} />
              </div>
              <p className="text-sm font-semibold font-ui mb-1" style={{ color: "var(--espresso)" }}>{t("emptyTitle")}</p>
              <p className="text-xs font-ui" style={{ color: "var(--stone)" }}>{t("emptyDesc")}</p>
            </motion.div>
          ) : (
            <motion.div key={activeTab} variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredGuides.map((guide) => (
                <motion.div
                  key={guide.id}
                  variants={cardVariants}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="group rounded-2xl overflow-hidden bg-white flex flex-col"
                  style={{ boxShadow: "0 2px 12px rgba(43,38,32,.06)", border: "1px solid rgba(0,0,0,.15)" }}
                >
                  {/* Thumbnail */}
                  <button type="button" onClick={() => setLightboxGuide(guide)} aria-label={`Lihat panduan ukuran ${guide.category}`} className="relative aspect-[4/3] w-full overflow-hidden p-3 cursor-zoom-in" style={{ background: "#f2f2f2", borderBottom: "1px solid rgba(0,0,0,.08)" }}>
                    <img
                      src={guide.image_url}
                      alt={`Panduan Ukuran ${guide.category}`}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "rgba(0,0,0,.28)" }}>
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--gold)", boxShadow: "0 4px 16px rgba(0,0,0,.5)" }}>
                        <Eye size={20} color="white" strokeWidth={1.8} />
                      </div>
                    </div>
                  </button>

                  {/* Info + Button */}
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Ruler size={14} strokeWidth={1.8} style={{ color: "var(--gold)" }} />
                      <p className="text-[13px] font-semibold font-ui" style={{ color: "var(--espresso)" }}>{guide.category}</p>
                    </div>
                    <p className="text-[11px] font-ui mb-4 flex-1" style={{ color: "var(--stone)" }}>
                      {t(CATEGORY_DESC_KEYS[guide.category] || "descDefault")}
                    </p>
                    <button
                      onClick={() => setLightboxGuide(guide)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-ui font-semibold transition-all duration-200 cursor-pointer"
                      style={{ background: "var(--espresso)", color: "var(--cream)" }}
                    >
                      <Eye size={14} strokeWidth={1.8} /> {t("viewDetail")}
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA */}
        {!loading && (
          <div className="text-center mt-12">
              <p className="text-sm font-ui mb-4" style={{ color: "var(--stone)" }}>
                {t("stillUnsure")}
              </p>
            <a
              href={getWhatsAppLink("Halo SAMAQU, saya ingin konsultasi ukuran")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-7 py-4 text-[12px] tracking-[0.18em] uppercase font-ui font-semibold text-white transition hover:opacity-90"
              style={{ background: "var(--espresso)" }}
            >
              <MessageCircle size={16} strokeWidth={1.5} /> {t("consultWA")}
            </a>
          </div>
        )}
      </div>

      {/* ═══ LIGHTBOX ═══ */}
      <AnimatePresence>
        {lightboxGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
            style={{ background: "rgba(0,0,0,.88)" }}
            onClick={() => setLightboxGuide(null)}
          >
            {/* Close */}
            <button
              onClick={() => setLightboxGuide(null)}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 rounded-full flex items-center justify-center z-50 transition-colors"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <X size={20} color="white" />
            </button>

            {/* Prev */}
            {filteredGuides.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); const prev = getAdjacentGuide("prev"); if (prev) setLightboxGuide(prev); }}
                className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center z-50 transition-colors"
                style={{ background: "rgba(255,255,255,.12)" }}
              >
                <ChevronLeft size={22} color="white" />
              </button>
            )}

            {/* Next */}
            {filteredGuides.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); const next = getAdjacentGuide("next"); if (next) setLightboxGuide(next); }}
                className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center z-50 transition-colors"
                style={{ background: "rgba(255,255,255,.12)" }}
              >
                <ChevronRight size={22} color="white" />
              </button>
            )}

            {/* Image */}
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-4xl max-h-[85vh] w-full flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[11px] tracking-[0.2em] uppercase font-ui font-medium mb-3" style={{ color: "rgba(255,255,255,.6)" }}>
                {lightboxGuide.category}
              </p>
              <div className="rounded-2xl overflow-hidden w-full" style={{ boxShadow: "0 20px 60px -16px rgba(0,0,0,.5)" }}>
                <img
                  src={lightboxGuide.image_url}
                  alt={`Panduan Ukuran ${lightboxGuide.category}`}
                  className="w-full h-auto max-h-[75vh] object-contain"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
