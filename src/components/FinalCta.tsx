"use client";

import { m as motion, type Variants } from "framer-motion";
import { getWhatsAppLink } from "@/lib/store-settings";
import { trackWhatsAppClick } from "@/lib/meta-pixel";
import { useSafeTranslations } from "@/lib/safe-i18n";

const revealVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 0.61, 0.36, 1], delay },
  }),
};

export default function FinalCta() {
  const t = useSafeTranslations("finalCta");
  return (
    <section
      className="relative overflow-hidden py-14 sm:py-24 lg:py-32"
      style={{ background: "#ffffff" }}
    >
      {/* Subtle dot pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(rgba(0,0,0,.06) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          maskImage:
            "radial-gradient(70% 60% at 50% 40%, black, transparent)",
          WebkitMaskImage:
            "radial-gradient(70% 60% at 50% 40%, black, transparent)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto w-full max-w-4xl px-5 sm:px-8">
        <motion.div
          className="text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          {/* Eyebrow */}
          <motion.div
            variants={revealVariants}
            custom={0}
            className="flex items-center justify-center gap-3 sm:gap-4 mb-6 sm:mb-7"
          >
            <span
              className="w-6 sm:w-8 h-px"
              style={{ background: "rgba(0,0,0,.3)" }}
            />
            <p
              className="font-ui text-[0.72rem] sm:text-[0.74rem] font-semibold uppercase tracking-[0.32em] sm:tracking-[0.38em]"
              style={{ color: "#000000" }}
            >
              {t("eyebrow")}
            </p>
            <span
              className="w-6 sm:w-8 h-px"
              style={{ background: "rgba(0,0,0,.3)" }}
            />
          </motion.div>

          {/* Headline */}
          <motion.h2
            variants={revealVariants}
            custom={0.12}
            className="text-[2.2rem] sm:text-5xl md:text-6xl lg:text-[4.5rem] font-semibold leading-[1.04] tracking-[-0.01em]"
            style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              color: "#000000",
            }}
          >
            {t("title")}
          </motion.h2>

          {/* Subheadline */}
          <motion.p
            variants={revealVariants}
            custom={0.24}
            className="mt-5 sm:mt-6 max-w-md mx-auto text-[0.95rem] sm:text-base leading-[1.75] font-ui"
            style={{ color: "rgba(0,0,0,.6)" }}
          >
            {t("subtitle")}
          </motion.p>

          {/* Divider */}
          <motion.div
            variants={revealVariants}
            custom={0.3}
            className="mt-8 sm:mt-9 mx-auto h-px w-16"
            style={{ background: "rgba(0,0,0,.2)" }}
          />

          {/* Buttons */}
          <div className="mt-8 sm:mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4">
            <motion.a
              variants={revealVariants}
              custom={0.36}
              href={getWhatsAppLink("Halo Admin SAMAQU, saya tertarik dengan koleksi Anda dan ingin bertanya soal pemesanan.")}
              target="_blank"
              rel="noopener"
              onClick={() => trackWhatsAppClick("final_cta")}
              className="inline-flex items-center gap-2.5 rounded-full px-7 sm:px-9 py-3.5 sm:py-4 text-[0.82rem] sm:text-[0.9rem] font-semibold uppercase tracking-[0.1em] font-ui transition-all duration-350 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-lg w-full sm:w-auto justify-center"
              style={{
                background: "#000000",
                color: "white",
                boxShadow: "0 8px 24px rgba(0,0,0,.25)",
              }}
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <span>{t("ctaWA")}</span>
            </motion.a>

            <motion.a
              variants={revealVariants}
              custom={0.48}
              href="/katalog"
              className="inline-flex items-center gap-2 rounded-full px-7 sm:px-9 py-3.5 sm:py-4 text-[0.82rem] sm:text-[0.9rem] font-semibold uppercase tracking-[0.1em] font-ui border transition-all duration-350 hover:-translate-y-0.5 hover:shadow-md group w-full sm:w-auto justify-center"
              style={{
                borderColor: "rgba(0,0,0,.25)",
                color: "#000000",
              }}
            >
              <span>{t("ctaCatalog")}</span>
              <svg
                className="transition-transform duration-350 group-hover:translate-x-1"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </motion.a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
