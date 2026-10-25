"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSafeTranslations } from "@/lib/safe-i18n";

interface CategoryItem {
  name: string;
  description: string;
  image_url: string;
}

const FALLBACK_CATEGORIES: CategoryItem[] = [
  { name: "Thobe", description: "Potongan panjang klasik, adem, dan berwibawa.", image_url: "/images/5616b4f5-b494-4940-808b-343520d0782e.webp" },
  { name: "Kandora", description: "Elegan untuk sehari-hari maupun formal.", image_url: "/images/8b1f2100-01e0-41cc-a77c-96dde3e2b290.webp" },
  { name: "Koko", description: "Modern dan nyaman untuk shalat.", image_url: "/images/44dc4804-7c64-4276-9e9d-374d0905f8ba.webp" },
  { name: "Vest", description: "Presisi untuk tampilan berkelas.", image_url: "/images/819b1d90-d58e-4670-bfbd-2883bd685f63.webp" },
  { name: "Kabak", description: "Premium berkualitas tinggi.", image_url: "/images/818e960c-6128-467b-b60f-eec772ee8125.webp" },
  { name: "Cover Hanger", description: "Jaga busana tetap rapi.", image_url: "/images/fe8e7d65-922e-4797-8488-317779065a0b.webp" },
];

export default function Koleksi() {
  const t = useSafeTranslations("koleksiHome");
  const [categories, setCategories] = useState<CategoryItem[]>(FALLBACK_CATEGORIES);

  // i18n descriptions override DB content
  const descMap: Record<string, string> = {
    Thobe: t("descThobe"),
    Kandora: t("descKandora"),
    Koko: t("descKoko"),
    Vest: t("descVest"),
    Kabak: t("descKabak"),
    "Cover Hanger": t("descCoverHanger"),
  };

  useEffect(() => {
    supabase.from("category_images").select("name, image_url").order("display_order").then(({ data, error }) => {
      if (!error && data && data.length > 0) {
        setCategories(data.map((c) => ({
          name: c.name,
          description: descMap[c.name] || c.name,
          image_url: c.image_url,
        })));
      }
    });
  }, []);

  return (
    <section id="produk" style={{ background: "#ffffff" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16 lg:py-20">

        {/* Header */}
        <p className="text-[10px] sm:text-[11px] tracking-[0.28em] uppercase mb-3 sm:mb-5" style={{ color: "#5a5a5a" }}>{t("eyebrow")}</p>

        <h1
          className="text-[1.65rem] sm:text-4xl md:text-5xl lg:text-[3.4rem] font-semibold leading-[1.08] tracking-tight max-w-2xl"
          style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "#000000" }}
        >
          {t("titleLine1")}{" "}
          <br className="hidden sm:block" />
          <span className="italic font-normal" style={{ color: "#000000" }}>{t("titleAccent")} </span>
          {t("titleLine2")}
        </h1>

        <p className="mt-3 sm:mt-5 max-w-xl text-[13px] sm:text-[15px] leading-relaxed" style={{ color: "#5a5a5a" }}>
          {t("desc")}
        </p>

        {/* Grid — same 2-column layout on all breakpoints */}
        <div className="mt-6 sm:mt-8 lg:mt-10 grid grid-cols-2 gap-2.5 sm:gap-4 lg:gap-5">

          {/* Thobe — tall (left col, spans 2 rows) */}
          <Link href="/katalog" className="card group relative overflow-hidden rounded-[14px] sm:rounded-[22px] shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)] row-span-2 min-h-[340px] sm:min-h-[460px] lg:min-h-[560px]" style={{ background: "#000000" }}>
            <img src={categories[0]?.image_url} alt="Thobe" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[800ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.06]" />
            <span className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-20 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-[8px] sm:text-[10px] font-semibold tracking-[0.18em] uppercase text-white" style={{ background: "#000000" }}>{t("bestSeller")}</span>
            <div className="absolute inset-0 card-shade" />
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 sm:gap-4 p-3 sm:p-6">
              <div>
                <h2 className="text-lg sm:text-3xl font-semibold text-[#ffffff]" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Thobe</h2>
                <p className="mt-0.5 sm:mt-1 max-w-[8rem] sm:max-w-[15rem] text-[10px] sm:text-[13px] leading-snug text-[rgba(255,255,255,.72)] line-clamp-2">{categories[0]?.description}</p>
              </div>
              <span className="shrink-0 grid h-7 w-7 sm:h-11 sm:w-11 place-items-center rounded-full border text-[#ffffff] transition hover:bg-[#ffffff] hover:text-[#000000]" style={{ borderColor: "rgba(255,255,255,.35)" }}>
                <span className="text-[11px] sm:text-base">→</span>
              </span>
            </div>
          </Link>

          {/* Koko — wide (right col, row 1) */}
          <Link href="/katalog" className="card group relative overflow-hidden rounded-[14px] sm:rounded-[22px] shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)] min-h-[160px] sm:min-h-[220px] lg:min-h-[270px]" style={{ background: "#000000" }}>
            <img src={categories[2]?.image_url} alt="Koko" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-[62%_35%] transition-transform duration-[800ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.06]" />
            <div className="absolute inset-0 wide-shade" />
            <div className="absolute inset-0 z-10 flex items-end justify-between gap-2 sm:gap-4 p-3 sm:p-6">
              <div>
                <h2 className="text-base sm:text-2xl font-semibold text-[#ffffff]" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Koko</h2>
                <p className="mt-0.5 sm:mt-1 max-w-[7rem] sm:max-w-[13rem] text-[10px] sm:text-[13px] leading-snug text-[rgba(255,255,255,.72)] line-clamp-2">{categories[2]?.description}</p>
              </div>
              <span className="shrink-0 grid h-7 w-7 sm:h-11 sm:w-11 place-items-center rounded-full border backdrop-blur-sm text-[#ffffff] transition hover:bg-[#ffffff] hover:text-[#000000]" style={{ borderColor: "rgba(255,255,255,.35)", background: "rgba(0,0,0,.35)" }}>
                <span className="text-[11px] sm:text-base">→</span>
              </span>
            </div>
          </Link>

          {/* Vest — wide (right col, row 2) */}
          <Link href="/katalog" className="card group relative overflow-hidden rounded-[14px] sm:rounded-[22px] shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)] min-h-[160px] sm:min-h-[220px] lg:min-h-[270px]" style={{ background: "#000000" }}>
            <img src={categories[3]?.image_url} alt="Vest" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-[55%_18%] transition-transform duration-[800ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.06]" />
            <div className="absolute inset-0 wide-shade" />
            <div className="absolute inset-0 z-10 flex items-end justify-between gap-2 sm:gap-4 p-3 sm:p-6">
              <div>
                <h2 className="text-base sm:text-2xl font-semibold text-[#ffffff]" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Vest</h2>
                <p className="mt-0.5 sm:mt-1 max-w-[7rem] sm:max-w-[13rem] text-[10px] sm:text-[13px] leading-snug text-[rgba(255,255,255,.72)] line-clamp-2">{categories[3]?.description}</p>
              </div>
              <span className="shrink-0 grid h-7 w-7 sm:h-11 sm:w-11 place-items-center rounded-full border backdrop-blur-sm text-[#ffffff] transition hover:bg-[#ffffff] hover:text-[#000000]" style={{ borderColor: "rgba(255,255,255,.35)", background: "rgba(0,0,0,.35)" }}>
                <span className="text-[11px] sm:text-base">→</span>
              </span>
            </div>
          </Link>

          {/* Kandora — tall (left col, spans 2 rows) */}
          <Link href="/katalog" className="card group relative overflow-hidden rounded-[14px] sm:rounded-[22px] shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)] row-span-2 min-h-[340px] sm:min-h-[460px] lg:min-h-[560px]" style={{ background: "#000000" }}>
            <img src={categories[1]?.image_url} alt="Kandora" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[800ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.06]" />
            <div className="absolute inset-0 card-shade" />
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 sm:gap-4 p-3 sm:p-6">
              <div>
                <h2 className="text-lg sm:text-3xl font-semibold text-[#ffffff]" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Kandora</h2>
                <p className="mt-0.5 sm:mt-1 max-w-[8rem] sm:max-w-[14rem] text-[10px] sm:text-[13px] leading-snug text-[rgba(255,255,255,.72)] line-clamp-2">{categories[1]?.description}</p>
              </div>
              <span className="shrink-0 grid h-7 w-7 sm:h-11 sm:w-11 place-items-center rounded-full border backdrop-blur-sm text-[#ffffff] transition hover:bg-[#ffffff] hover:text-[#000000]" style={{ borderColor: "rgba(255,255,255,.35)" }}>
                <span className="text-[11px] sm:text-base">→</span>
              </span>
            </div>
          </Link>

          {/* Kabak — wide (right col, row 3) */}
          <Link href="/katalog" className="card group relative overflow-hidden rounded-[14px] sm:rounded-[22px] shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)] min-h-[160px] sm:min-h-[220px] lg:min-h-[270px]" style={{ background: "#0d0d0d" }}>
            <img src={categories[4]?.image_url} alt="Kabak" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-[50%_55%] transition-transform duration-[800ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.06]" />
            <div className="absolute inset-0 wide-shade" />
            <div className="absolute inset-0 z-10 flex items-end justify-between gap-2 sm:gap-4 p-3 sm:p-6">
              <div>
                <h2 className="text-base sm:text-2xl font-semibold text-[#ffffff]" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Kabak</h2>
                <p className="mt-0.5 sm:mt-1 max-w-[7rem] sm:max-w-[13rem] text-[10px] sm:text-[13px] leading-snug text-[rgba(255,255,255,.72)] line-clamp-2">{categories[4]?.description}</p>
              </div>
              <span className="shrink-0 grid h-7 w-7 sm:h-11 sm:w-11 place-items-center rounded-full border backdrop-blur-sm text-[#ffffff] transition hover:bg-[#ffffff] hover:text-[#000000]" style={{ borderColor: "rgba(255,255,255,.35)", background: "rgba(0,0,0,.35)" }}>
                <span className="text-[11px] sm:text-base">→</span>
              </span>
            </div>
          </Link>

          {/* Cover Hanger — wide (right col, row 4) */}
          <Link href="/katalog" className="card group relative overflow-hidden rounded-[14px] sm:rounded-[22px] shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)] min-h-[160px] sm:min-h-[220px] lg:min-h-[270px]" style={{ background: "#000000" }}>
            <img src={categories[5]?.image_url} alt="Cover Hanger" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover object-[62%_45%] transition-transform duration-[800ms] ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.06]" />
            <div className="absolute inset-0 wide-shade" />
            <div className="absolute inset-0 z-10 flex items-end justify-between gap-2 sm:gap-4 p-3 sm:p-6">
              <div>
                <h2 className="text-base sm:text-2xl font-semibold text-[#ffffff]" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Cover Hanger</h2>
                <p className="mt-0.5 sm:mt-1 max-w-[7rem] sm:max-w-[13rem] text-[10px] sm:text-[13px] leading-snug text-[rgba(255,255,255,.72)] line-clamp-2">{categories[5]?.description}</p>
              </div>
              <span className="shrink-0 grid h-7 w-7 sm:h-11 sm:w-11 place-items-center rounded-full border backdrop-blur-sm text-[#ffffff] transition hover:bg-[#ffffff] hover:text-[#000000]" style={{ borderColor: "rgba(255,255,255,.35)", background: "rgba(0,0,0,.35)" }}>
                <span className="text-[11px] sm:text-base">→</span>
              </span>
            </div>
          </Link>

        </div>

        {/* CTA */}
        <div className="mt-8 sm:mt-10 lg:mt-12 flex justify-center">
          <Link
            href="/katalog"
            className="inline-flex items-center gap-2 sm:gap-3 rounded-full px-6 py-3 sm:px-8 sm:py-4 text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] transition hover:bg-[#000000]"
            style={{ background: "#000000", color: "#ffffff" }}
          >
            {t("cta")} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      <style jsx global>{`
        .card-shade { background: linear-gradient(to top, rgba(20,15,11,.92) 0%, rgba(20,15,11,.55) 38%, rgba(20,15,11,.05) 70%); }
        .wide-shade { background: linear-gradient(to top, rgba(20,15,11,.92) 0%, rgba(20,15,11,.45) 45%, rgba(20,15,11,0) 80%), linear-gradient(to right, rgba(20,15,11,.75) 0%, rgba(20,15,11,.15) 55%, rgba(20,15,11,0) 100%); }
        .card { transition: transform .45s cubic-bezier(.2,.7,.2,1), box-shadow .45s ease; }
        .card:hover { transform: translateY(-4px); box-shadow: 0 26px 55px -22px rgba(0,0,0,.55); }
        .card:hover img { transform: scale(1.06); }
        .card img { transition: transform .8s cubic-bezier(.2,.7,.2,1); }
        .card::after { content: ""; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); pointer-events: none; z-index: 20; }
        @media (max-width: 639px) {
          .card:hover { transform: none; box-shadow: 0 14px 30px -14px rgba(0,0,0,.4); }
          .card:hover img { transform: none; }
        }
      `}</style>
    </section>
  );
}
