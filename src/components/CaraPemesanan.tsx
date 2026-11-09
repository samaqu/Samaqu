"use client";

import { useRef } from "react";
import { m as motion, useInView, type Variants } from "framer-motion";
import { CoatHanger } from "@phosphor-icons/react/dist/csr/CoatHanger";
import { Ruler } from "@phosphor-icons/react/dist/csr/Ruler";
import { ChatCircle } from "@phosphor-icons/react/dist/csr/ChatCircle";
import { Package } from "@phosphor-icons/react/dist/csr/Package";
import { useSafeTranslations } from "@/lib/safe-i18n";
import { getWhatsAppLink } from "@/lib/store-settings";
import { trackWhatsAppClick } from "@/lib/meta-pixel";

/* ─── Default Data (fallback icons only — text comes from i18n) ─── */
const STEP_ICONS = [CoatHanger, Ruler, ChatCircle, Package];

/* ─── Animation ─── */
const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const;

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: PREMIUM_EASE },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, ease: PREMIUM_EASE },
  },
};

/* ─── Monokrom hitam-putih (tema terang) ─── */
const INK = "#000000";
const MUTED = "rgba(0,0,0,.6)";
const MUTED_SOFT = "rgba(0,0,0,.35)";
const LINE = "rgba(0,0,0,.12)";
const CARD_BG = "#ffffff";
const CARD_BORDER = "rgba(0,0,0,.08)";

/* ─── Shared atoms ─── */

function StepIconBadge({ Icon, compact }: { Icon: typeof CoatHanger; compact?: boolean }) {
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full shrink-0 ${compact ? "w-9 h-9" : "w-11 h-11"}`}
      style={{ background: INK, boxShadow: "0 10px 26px -10px rgba(0,0,0,.35)" }}
    >
      <Icon size={compact ? 16 : 20} weight="regular" style={{ color: "#ffffff" }} />
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ border: "1px solid rgba(0,0,0,.15)" }}
      />
    </span>
  );
}

function GhostNumber({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`select-none font-medium leading-none ${className || ""}`}
      style={{
        fontFamily: "var(--font-cormorant), Georgia, serif",
        color: "rgba(0,0,0,.1)",
      }}
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

/* ─── Mobile: compact editorial 2×2 grid ─── */
function MobileGrid({ steps }: { steps: { title: string; desc: string; Icon: typeof CoatHanger }[] }) {
  return (
    <motion.div
      className="md:hidden grid grid-cols-2 gap-3"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
      role="list"
      aria-label={steps.map((s) => s.title).join(", ")}
    >
      {steps.map((step, i) => (
        <motion.div key={i} role="listitem" variants={cardVariants} className="group relative h-full">
          <div
            className="relative h-full rounded-2xl p-4 overflow-hidden transition-transform duration-300 active:scale-[0.985]"
            style={{
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              boxShadow: "0 14px 34px -20px rgba(0,0,0,.18)",
            }}
          >
            {/* Ghost numeral */}
            <GhostNumber
              n={i + 1}
              className="absolute -top-1 right-2 text-[3.2rem] transition-colors duration-500 group-hover:text-[rgba(0,0,0,.2)]"
            />
            {/* Hairline accent */}
            <span
              className="absolute left-0 top-4 bottom-4 w-[2px] rounded-full"
              style={{ background: "linear-gradient(180deg, #000000, transparent)" }}
            />

            <div className="relative">
              <StepIconBadge Icon={step.Icon} compact />
              <p
                className="mt-3.5 text-[8.5px] font-medium uppercase tracking-[0.3em] font-ui"
                style={{ color: MUTED_SOFT }}
              >
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-1 text-[13.5px] font-semibold leading-snug font-ui" style={{ color: INK }}>
                {step.title}
              </h3>
            </div>
            <p className="relative mt-2 text-[11px] leading-[1.55] font-ui" style={{ color: MUTED }}>
              {step.desc}
            </p>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ─── Desktop: editorial 4-column with ghost numerals ─── */
function DesktopJourney({ steps }: { steps: { title: string; desc: string; Icon: typeof CoatHanger }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <div ref={ref} className="hidden md:block relative">
      {/* Connector line */}
      <span className="absolute top-[55px] left-[9%] right-[9%] h-px overflow-hidden" style={{ background: LINE }}>
        <motion.span
          className="absolute inset-0 origin-left block"
          style={{ background: INK }}
          initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 1.6, ease: PREMIUM_EASE }}
        />
      </span>

      <motion.div
        className="relative grid grid-cols-4 gap-8 lg:gap-10"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
        role="list"
        aria-label={steps.map((s) => s.title).join(", ")}
      >
        {steps.map((step, i) => (
          <motion.div key={i} role="listitem" variants={cardVariants} className="group relative">
            {/* Ghost numeral — behind everything */}
            <GhostNumber
              n={i + 1}
              className="absolute -top-[46px] left-1 text-[7.5rem] lg:text-[8.5rem] transition-all duration-700 group-hover:text-[rgba(0,0,0,.18)] group-hover:-translate-y-1.5"
            />

            {/* Icon badge on the connector line */}
            <div className="relative z-10 mb-7">
              <StepIconBadge Icon={step.Icon} />
            </div>

            {/* Hairline under badge */}
            <span
              className="block w-10 h-px mb-5 transition-all duration-500 group-hover:w-16"
              style={{ background: INK }}
            />

            <h3 className="relative z-10 text-[1.35rem] lg:text-[1.5rem] font-semibold mb-2.5 font-ui" style={{ color: INK }}>
              {step.title}
            </h3>
            <p className="relative z-10 text-[0.9rem] leading-[1.7] max-w-[16rem] font-ui" style={{ color: MUTED }}>
              {step.desc}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

/* ─── Section ─── */
export default function CaraPemesanan() {
  const t = useSafeTranslations("caraPesan");

  const steps = [
    { title: t("step1Title"), desc: t("step1Desc"), Icon: STEP_ICONS[0] },
    { title: t("step2Title"), desc: t("step2Desc"), Icon: STEP_ICONS[1] },
    { title: t("step3Title"), desc: t("step3Desc"), Icon: STEP_ICONS[2] },
    { title: t("step4Title"), desc: t("step4Desc"), Icon: STEP_ICONS[3] },
  ];

  return (
    <section
      id="cara-pesan"
      className="relative px-5 sm:px-6 py-10 sm:py-16 lg:py-20 overflow-hidden"
      style={{ background: "#F3F3F3" }}
      aria-labelledby="cara-pesan-title"
    >
      {/* Ambient hairline at top */}
      <span
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(420px,70vw)] h-px"
        style={{ background: "linear-gradient(90deg,transparent,rgba(0,0,0,.28),transparent)" }}
        aria-hidden
      />

      <div className="mx-auto max-w-6xl">
        {/* ── Header ── */}
        <motion.div
          className="text-center mb-8 sm:mb-10 lg:mb-14"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <motion.p
            variants={headerVariants}
            className="inline-flex items-center gap-3 text-[0.68rem] font-medium uppercase tracking-[0.32em] font-ui"
            style={{ color: MUTED }}
          >
            <span className="w-7 h-px" style={{ background: "linear-gradient(90deg,transparent,rgba(0,0,0,.4))" }} />
            {t("eyebrow")}
            <span className="w-7 h-px" style={{ background: "linear-gradient(90deg,rgba(0,0,0,.4),transparent)" }} />
          </motion.p>
          <motion.h2
            variants={headerVariants}
            id="cara-pesan-title"
            className="mt-3 text-[2.6rem] sm:text-5xl lg:text-[3.6rem] font-semibold tracking-[-0.015em] leading-[1.05]"
            style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              color: INK,
            }}
          >
            {t("title")}
          </motion.h2>
          <motion.p
            variants={headerVariants}
            className="mx-auto mt-3 max-w-xl text-[15px] leading-[1.75] font-ui"
            style={{ color: MUTED }}
          >
            <strong style={{ color: INK }}>{t("subtitleLead")}</strong> {t("subtitle")}
          </motion.p>
        </motion.div>

        {/* ── Steps ── */}
        <MobileGrid steps={steps} />
        <DesktopJourney steps={steps} />

        {/* ── CTA ── */}
        <motion.div
          className="text-center mt-10 sm:mt-14 lg:mt-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.7, delay: 0.35, ease: PREMIUM_EASE }}
        >
          <a
            className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full px-8 sm:px-9 py-4 text-[0.8rem] sm:text-[0.85rem] font-semibold uppercase tracking-[0.18em] font-ui transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.97]"
            style={{
              background: INK,
              color: "#ffffff",
              boxShadow: "0 18px 44px -14px rgba(0,0,0,.4)",
            }}
            href={getWhatsAppLink(t("whatsappMsg"))}
            target="_blank"
            rel="noopener"
            onClick={() => trackWhatsAppClick("cara_pemesanan")}
            aria-label={t("ariaCta")}
          >
            <span
              className="absolute inset-0 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ background: "#333333" }}
              aria-hidden
            />
            <svg className="relative" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.57.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z" />
            </svg>
            <span className="relative">{t("cta")}</span>
            <svg
              className="relative transition-transform duration-500 group-hover:translate-x-1"
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
