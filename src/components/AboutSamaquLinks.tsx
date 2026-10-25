import Link from "next/link";
import Image from "next/image";
import { useSafeTranslations } from "@/lib/safe-i18n";

const LINK_KEYS = [
  { titleKey: "item1Title", subKey: "item1Sub", href: "/testimoni", shot: "/images/a200b6ee-90f6-46cb-a882-c85bc6cdb479.webp",
    icon: (<svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z" /></svg>) },
  { titleKey: "item2Title", subKey: "item2Sub", href: "/tentang-kami", shot: "/images/d245df95-d2d3-4ee7-8a3c-630bce4f42ed.webp",
    icon: (<svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 11a3 3 0 1 0-1-5.8" /><path d="M18 20a5 5 0 0 0-3-4.6" /></svg>) },
  { titleKey: "item3Title", subKey: "item3Sub", href: "/panduan-ukuran", shot: "/images/2fee48f0-e1f1-4e08-aa00-d5d70b78893b.webp",
    icon: (<svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>) },
  { titleKey: "item4Title", subKey: "item4Sub", href: "/faq", shot: "/images/eda1a6ee-5630-4c24-9a57-d17fce8f798d.webp",
    icon: (<svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.4V14" /><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" /></svg>) },
];

export default function AboutSamaquLinks() {
  const t = useSafeTranslations("aboutLinks");

  return (
    <section className="relative overflow-hidden" style={{ background: "#F3F3F3" }}>
      {/* Fabric backdrop */}
      <Image
        src="/images/daa1981f-297f-4fa3-aebe-e68d9b0e8ea8.webp"
        alt=""
        fill
        sizes="100vw"
        className="object-cover hidden lg:block"
        style={{ objectPosition: "72% 30%" }}
      />
      <div
        className="absolute inset-0 hidden lg:block"
        style={{
          background:
            "linear-gradient(100deg, #F3F3F3 0%, rgba(243,243,243,.96) 26%, rgba(243,243,243,.72) 48%, rgba(243,243,243,.28) 72%, rgba(243,243,243,.1) 100%)",
        }}
      />
      {/* Mobile veil */}
      <div
        className="absolute inset-0 lg:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(243,243,243,.92) 0%, rgba(243,243,243,.86) 45%, rgba(243,243,243,.94) 100%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20">
        {/* Header */}
        <div className="flex items-center gap-4 mb-5">
          <span className="h-px w-10" style={{ background: "#000000" }} />
          <span
            className="font-semibold font-ui"
            style={{ letterSpacing: "0.24em", fontSize: "11px", color: "#000000" }}
          >
            {t("eyebrow")}
          </span>
        </div>

        <h2
          className="font-semibold leading-[1.12] max-w-[14ch]"
          style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: "clamp(34px, 5vw, 46px)",
            color: "#000000",
          }}
        >
          {t("title")}
        </h2>
        <p
          className="mt-4 text-[15px] leading-relaxed max-w-[34ch]"
          style={{ color: "rgba(0,0,0,.6)" }}
        >
          {t("desc")}
        </p>

        {/* Cards */}
        <div className="mt-9 space-y-4 max-w-3xl">
          {LINK_KEYS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="about-card group flex items-center gap-4 sm:gap-5 p-4 sm:p-5"
            >
              {/* Background photo */}
              <Image
                src={link.shot}
                alt=""
                fill
                sizes="(min-width: 768px) 768px, 100vw"
                className="shot object-cover object-right-center"
              />
              <span className="veil" />

              {/* Icon */}
              <span className="relative z-10 grid place-items-center w-12 h-12 rounded-full shrink-0"
                style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.15)" }}
              >
                {link.icon}
              </span>

              {/* Text */}
              <span className="relative z-10 flex-1 min-w-0">
                <span className="block text-white font-semibold text-[16px]">{t(link.titleKey)}</span>
                <span className="block text-[13px] mt-0.5" style={{ color: "rgba(255,255,255,.7)" }}>
                  {t(link.subKey)}
                </span>
              </span>

              {/* Arrow */}
              <svg
                className="relative z-10 w-5 h-5 shrink-0 transition-transform duration-300 group-hover:translate-x-1"
                style={{ color: "rgba(255,255,255,.8)" }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
