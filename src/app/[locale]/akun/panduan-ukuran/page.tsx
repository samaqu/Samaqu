"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ruler, Loader2, MessageCircle, Eye, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useSafeTranslations } from "@/lib/safe-i18n";
import { supabase } from "@/lib/supabase";
import { getWhatsAppLink } from "@/lib/store-settings";
import { AkunHeader } from "@/components/akun/AkunShell";

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

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export default function AkunPanduanUkuranPage() {
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
    <>
      <AkunHeader title="Panduan Ukuran" back="/akun" />

      {/* Tabs */}
      <div className="flex items-center gap-2 mt-4 mb-6 overflow-x-auto pb-2">
        {CATEGORY_TABS.map((tab) => {
          const guideForTab = sizeGuides.find((g) => g.category === tab.value);
          const isSemua = tab.value === "Semua";
          const hasTabImage = isSemua ? hasImages : guideForTab?.image_url;
          const label = tab.key ? t(tab.key) : tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className="px-4 py-2 text-[12px] font-medium rounded-full whitespace-nowrap transition-all duration-200"
              style={{
                background: activeTab === tab.value ? "#000000" : "transparent",
                color: activeTab === tab.value ? "#fff" : "#777777",
                border: `1px solid ${activeTab === tab.value ? "#000000" : "#E0E0E0"}`,
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
            <Loader2 size={24} className="animate-spin mx-auto mb-3" style={{ color: "#000000" }} />
            <p className="text-sm" style={{ color: "#777777" }}>{t("loading")}</p>
          </motion.div>
        ) : filteredGuides.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center py-20 akun-card">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "#f2f2f2" }}>
              <Ruler size={28} strokeWidth={1.4} style={{ color: "#000000" }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: "#000000" }}>{t("emptyTitle")}</p>
            <p className="text-xs" style={{ color: "#777777" }}>{t("emptyDesc")}</p>
          </motion.div>
        ) : (
          <motion.div key={activeTab} variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredGuides.map((guide) => (
              <motion.div
                key={guide.id}
                variants={cardVariants}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                className="group akun-card overflow-hidden flex flex-col"
              >
                <div className="relative aspect-[4/3] overflow-hidden" style={{ background: "#f2f2f2" }}>
                  <img
                    src={guide.image_url}
                    alt={`Panduan Ukuran ${guide.category}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "rgba(0,0,0,.3)" }}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "#C5C5C5", boxShadow: "0 4px 16px rgba(197,197,197,.5)" }}>
                      <Eye size={18} color="#000000" strokeWidth={1.8} />
                    </div>
                  </div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Ruler size={14} strokeWidth={1.8} style={{ color: "#000000" }} />
                    <p className="text-[13px] font-semibold" style={{ color: "#000000" }}>{guide.category}</p>
                  </div>
                  <p className="text-[11px] mb-3 flex-1" style={{ color: "#777777" }}>
                    {t(CATEGORY_DESC_KEYS[guide.category] || "descDefault")}
                  </p>
                  <button
                    onClick={() => setLightboxGuide(guide)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold transition-all duration-200 cursor-pointer"
                    style={{ background: "#000000", color: "#fff" }}
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
        <div className="text-center mt-8">
          <p className="text-sm mb-3" style={{ color: "#777777" }}>
            {t("stillUnsure")}
          </p>
          <a
            href={getWhatsAppLink("Halo SAMAQU, saya ingin konsultasi ukuran")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[12px] tracking-[0.12em] uppercase font-semibold transition hover:opacity-90"
            style={{ background: "#C5C5C5", color: "#000000" }}
          >
            <MessageCircle size={16} strokeWidth={1.5} /> {t("consultWA")}
          </a>
        </div>
      )}

      {/* Lightbox */}
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
            <button
              onClick={() => setLightboxGuide(null)}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 rounded-full flex items-center justify-center z-50"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <X size={20} color="white" />
            </button>

            {filteredGuides.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); const prev = getAdjacentGuide("prev"); if (prev) setLightboxGuide(prev); }}
                className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center z-50"
                style={{ background: "rgba(255,255,255,.12)" }}
              >
                <ChevronLeft size={22} color="white" />
              </button>
            )}

            {filteredGuides.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); const next = getAdjacentGuide("next"); if (next) setLightboxGuide(next); }}
                className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center z-50"
                style={{ background: "rgba(255,255,255,.12)" }}
              >
                <ChevronRight size={22} color="white" />
              </button>
            )}

            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
              className="max-w-4xl max-h-[85vh] w-full flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[11px] tracking-[0.2em] uppercase font-medium mb-3" style={{ color: "rgba(255,255,255,.6)" }}>
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
    </>
  );
}
