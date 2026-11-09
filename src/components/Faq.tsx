"use client";

import { useState } from "react";
import { m as motion, type Variants } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useSafeTranslations } from "@/lib/safe-i18n";

/* ─── Animation ─── */
const headerVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ─── FAQ Item ─── */
function FaqItem({
  index,
  item,
  isOpen,
  onToggle,
}: {
  index: number;
  item: { q: string; a: string };
  isOpen: boolean;
  onToggle: () => void;
}) {
  const num = String(index + 1).padStart(2, "0");
  const panelId = `faq-panel-${index}`;
  const btnId = `faq-btn-${index}`;

  return (
    <motion.div
      variants={itemVariants}
      className="faq-item relative"
      data-open={isOpen || undefined}
    >
      <h3>
        <button
          type="button"
          id={btnId}
          className="faq-trigger group flex w-full items-center gap-5 py-7 pl-5 pr-2 text-left"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {/* Number */}
          <span
            className="faq-num font-medium tabular-nums text-2xl shrink-0"
            style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              color: isOpen ? "#000000" : "rgba(0,0,0,.35)",
            }}
          >
            {num}
          </span>

          {/* Question */}
          <span
            className="faq-question-text flex-1 text-lg sm:text-xl font-medium leading-snug"
            style={{ color: "var(--espresso)" }}
          >
            {item.q}
          </span>

          {/* Chevron */}
          <span style={{ color: isOpen ? "#000000" : "rgba(0,0,0,.4)" }}>
            <ChevronDown
              size={24}
              strokeWidth={1.5}
              className="faq-icon shrink-0"
            />
          </span>
        </button>
      </h3>

      {/* Answer — grid-rows trick for smooth height */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        className="faq-answer"
      >
        <div>
          <p
            className="pb-6 sm:pb-8 pl-14 sm:pl-[3.75rem] pr-5 sm:pr-8 text-sm sm:text-base leading-relaxed"
            style={{ color: "rgba(0,0,0,.8)" }}
          >
            {item.a}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Section ─── */
export default function Faq() {
  const t = useSafeTranslations("faqHome");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    { q: t("q1"), a: t("a1") },
    { q: t("q2"), a: t("a2") },
    { q: t("q3"), a: t("a3") },
    { q: t("q4"), a: t("a4") },
    { q: t("q5"), a: t("a5") },
  ];

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="relative overflow-hidden py-14 sm:py-24 lg:py-32"
      style={{ background: "var(--beige)" }}
    >
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-12 lg:gap-16">
          {/* ── Left: sticky heading ── */}
          <div className="lg:col-span-4">
            <motion.div
              className="lg:sticky lg:top-28"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={headerVariants}
            >
              <span
                className="block text-sm font-bold uppercase tracking-[0.35em]"
                style={{
                  fontFamily: "var(--font-cormorant), Georgia, serif",
                  color: "#000000",
                }}
              >
                {t("eyebrow")}
              </span>
              <h2
                id="faq-heading"
                className="mt-4 sm:mt-5 text-5xl sm:text-6xl lg:text-7xl font-medium leading-[0.95]"
                style={{
                  fontFamily: "var(--font-cormorant), Georgia, serif",
                  color: "var(--espresso)",
                }}
              >
                {t("title")}
              </h2>
              <p
                className="mt-6 max-w-xs text-base leading-relaxed"
                style={{ color: "rgba(0,0,0,.7)" }}
              >
                {t("subtitle")}
              </p>
              <div
                className="mt-8 h-px w-16"
                style={{ background: "var(--sand)" }}
              />
              <p
                className="mt-6 max-w-xs text-sm leading-relaxed"
                style={{ color: "rgba(0,0,0,.55)" }}
              >
                {t("helpText")}
              </p>
            </motion.div>
          </div>

          {/* ── Right: accordion list ── */}
          <div className="lg:col-span-8">
            <motion.div
              className="divide-y"
              style={{ borderColor: "rgba(0,0,0,.5)" }}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={containerVariants}
            >
              {faqs.map((item, i) => (
                <FaqItem
                  key={i}
                  index={i}
                  item={item}
                  isOpen={openIndex === i}
                  onToggle={() =>
                    setOpenIndex(openIndex === i ? null : i)
                  }
                />
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
