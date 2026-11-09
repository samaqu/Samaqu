"use client";

import { m as motion, type Variants } from "framer-motion";
import { useSafeTranslations } from "@/lib/safe-i18n";

/* ─── Data ─── */
const reviews = [
  {
    id: 1,
    quote:
      "Bahannya adem dan jahitannya rapi banget. Dipakai untuk shalat Jumat maupun acara terasa berkelas. Adminnya juga fast response.",
    name: "Ahmad R.",
    city: "Jakarta",
    initial: "A",
  },
  {
    id: 2,
    quote:
      "Pesan Thobe untuk keluarga, semuanya puas. Kualitas sesuai harga premiumnya. Packaging rapi dan pengiriman cepat.",
    name: "Fauzan H.",
    city: "Bandung",
    initial: "F",
  },
  {
    id: 3,
    quote:
      "Proses order gampang, tinggal chat admin dan dibimbing pilih size. Hasilnya pas dan nyaman. Pasti langganan.",
    name: "Irfan S.",
    city: "Surabaya",
    initial: "I",
  },
];

/* ─── Animation variants ─── */
const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.14 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

/* ─── Star rating ─── */
function StarRating() {
  return (
    <div className="flex gap-0.5 mb-5" aria-label="5 dari 5 bintang">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="#000000"
          stroke="#000000"
          strokeWidth="1.5"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

/* ─── Card ─── */
function TestimonialCard({ t }: { t: (typeof reviews)[number] }) {
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group relative bg-white rounded-sm p-6 sm:p-8 flex flex-col justify-between h-full"
      style={{ boxShadow: "0 4px 24px -8px rgba(43,38,32,.08)" }}
    >
      {/* Gold accent bar */}
      <span
        className="absolute top-0 left-6 sm:left-8 w-8 h-[2px] transition-all duration-500 group-hover:w-12"
        style={{ background: "#000000" }}
      />

      <div>
        <StarRating />
        <p
          className="text-[14px] sm:text-[15px] leading-[1.75] font-ui flex-1"
          style={{ color: "var(--coffee)" }}
        >
          &ldquo;{t.quote}&rdquo;
        </p>
      </div>

      {/* Divider */}
      <div
        className="my-6 h-px"
        style={{ background: "rgba(0,0,0,.2)" }}
      />

      {/* Author */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-medium"
          style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            background: "var(--sand-2)",
            color: "var(--espresso)",
            border: "1px solid rgba(0,0,0,.3)",
          }}
        >
          {t.initial}
        </div>
        <div>
          <p
            className="text-sm font-semibold font-ui leading-tight"
            style={{ color: "var(--espresso)" }}
          >
            {t.name}
          </p>
          <p
            className="text-[10px] sm:text-[11px] tracking-[0.18em] uppercase font-ui mt-0.5"
            style={{ color: "var(--stone)" }}
          >
            {t.city}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Section ─── */
export default function Testimoni() {
  const t = useSafeTranslations("testimoniHome");
  return (
    <section
      className="py-12 sm:py-20 lg:py-32 px-4 sm:px-8"
      style={{ background: "var(--cream)" }}
    >
      <div className="max-w-[1200px] mx-auto">
        {/* ── Header ── */}
        <motion.div
          className="text-center max-w-xl mx-auto mb-6 sm:mb-12 lg:mb-16"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={containerVariants}
        >
          <motion.p
            variants={headerVariants}
            className="text-[11px] sm:text-[12px] tracking-[0.32em] uppercase mb-4 font-ui"
            style={{ color: "#000000" }}
          >
            {t("eyebrow")}
          </motion.p>
          <motion.h2
            variants={headerVariants}
            className="text-3xl sm:text-4xl lg:text-5xl font-medium mb-5 leading-tight"
            style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              color: "var(--espresso)",
            }}
          >
            {t("title")}
          </motion.h2>
          <motion.p
            variants={headerVariants}
            className="text-sm sm:text-base leading-[1.75] font-ui"
            style={{ color: "var(--coffee)" }}
          >
            {t("subtitle")}
          </motion.p>
        </motion.div>

        {/* ── Cards ── */}
        <motion.div
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={containerVariants}
        >
          {reviews.map((t) => (
            <TestimonialCard key={t.id} t={t} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
