"use client";

import Link from "next/link";
import { HandHeartIcon } from "@phosphor-icons/react/dist/csr/HandHeart";
import { cloudinaryUrl } from "@/lib/cloudinary";
import { useSafeTranslations } from "@/lib/safe-i18n";
import s from "./SamaQuran.module.css";

const READING_IMAGE_SRC = cloudinaryUrl(
  "https://res.cloudinary.com/kq5d3al5/image/upload/v1793154057/Membaca_Al-Qur_an_di_Bawah_Cahaya_Jendela.png",
  { width: 960 },
);

type IconProps = { className?: string };

function BookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 12c6-3 12-3 16 1 4-4 10-4 16-1v24c-6-3-12-3-16 1-4-4-10-4-16-1Z" />
      <path d="M24 13v24" />
    </svg>
  );
}

function ClockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="24" cy="24" r="14" />
      <path d="M24 14v10l7 4" />
    </svg>
  );
}

function DocumentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M10 34V14a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4Z" />
      <path d="M16 20h16M16 27h10" />
    </svg>
  );
}

function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M24 8l4 8 9 1-6.5 6.3L32 32l-8-4-8 4 1.5-8.7L11 17l9-1Z" />
    </svg>
  );
}

function PrayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M14 38V22a10 10 0 0 1 20 0v16M10 38h28M24 12V6" />
    </svg>
  );
}

function HeartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M24 37s-13-7.6-13-16a7 7 0 0 1 13-3.6A7 7 0 0 1 37 21c0 8.4-13 16-13 16Z" />
    </svg>
  );
}

function GrowthIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M24 40V22" />
      <path d="M24 29c-7 0-12-4-14-11 7-1 14 3 14 11ZM24 23c7 0 12-4 14-11-7-1-14 3-14 11Z" />
      <path d="M17 40h14" />
    </svg>
  );
}

function PersonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="24" cy="16" r="7" />
      <path d="M11 39c1-9 6-14 13-14s12 5 13 14" />
    </svg>
  );
}

function BenefitIcon({ className }: IconProps) {
  return <HandHeartIcon className={className} weight="regular" aria-hidden="true" />;
}

const MAKNA_ITEMS = [
  { Icon: BookIcon, idKey: "read" },
  { Icon: ClockIcon, idKey: "memorize" },
  { Icon: DocumentIcon, idKey: "study" },
  { Icon: StarIcon, idKey: "teach" },
  { Icon: PrayIcon, idKey: "practice" },
  { Icon: HeartIcon, idKey: "love" },
];

const VALUE_ITEMS = [
  { Icon: BookIcon, idKey: "samaQuran" },
  { Icon: PersonIcon, idKey: "ordinary" },
  { Icon: GrowthIcon, idKey: "growth" },
  { Icon: BenefitIcon, idKey: "benefit" },
];

function QuranIllustration({ alt }: { alt: string }) {
  return (
    <svg viewBox="0 0 520 420" className={s.quranSvg} role="img" aria-label={alt}>
      <g fill="none" stroke="#A3A3A3" strokeWidth="1.5">
        <path d="M146 262V154a114 114 0 0 1 228 0v108" />
        <path d="M170 262V158a90 90 0 0 1 180 0v104" />
      </g>
      <g stroke="#0A0A0A" strokeWidth="2" strokeLinejoin="round">
        <path d="M116 294 260 360 404 294v24L260 386 116 318Z" fill="#404040" />
        <path d="m184 326 76 36 76-36v62l-76 20-76-20Z" fill="#262626" />
        <path d="M260 258c-48-32-106-40-158-34v72c52-6 110 2 158 34Z" fill="#262626" />
        <path d="M260 258c48-32 106-40 158-34v72c-52-6-110 2-158 34Z" fill="#262626" />
        <path d="M258 252c-46-34-102-42-152-36v70c50-6 106 2 152 32Z" fill="#FFFFFF" />
        <path d="M262 252c46-34 102-42 152-36v70c-50-6-106 2-152 32Z" fill="#FFFFFF" />
      </g>
      <g stroke="#737373" strokeWidth="3" strokeLinecap="round">
        <path d="M128 238h102M128 254h102M128 270h76M292 238h102M292 254h102M318 270h76" />
      </g>
      <path d="M256 252h8v66h-8Z" fill="#737373" />
      <path d="M254 318h12v58l-6-12-6 12Z" fill="#0A0A0A" />
    </svg>
  );
}

export default function SamaQuran() {
  const t = useSafeTranslations("samaQuran");
  const maknaLabels = MAKNA_ITEMS.map((item) => t(`makna.${item.idKey}`));
  const heroHeadingLabel = `${t("heroTitle")} ${t("heroTitleLead")} ${maknaLabels.join(", ")}.`;

  return (
    <main className={s.root}>
      <section className={`${s.topsec} ${s.onDark}`}>
        <div className={s.wrap}>
          <nav aria-label={t("breadcrumbLabel")} className={s.crumbs}>
            <Link href="/">{t("breadcrumbHome")}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{t("breadcrumbCurrent")}</span>
          </nav>

          <div className={s.hero}>
            <div className={s.heroCopy}>
              <p className={`${s.rv} ${s.heroBadge}`}>
                <span className={s.dot} aria-hidden="true" />
                {t("heroBadge")}
              </p>
              <h1 className={`${s.rv} ${s.heroTitle}`} aria-label={heroHeadingLabel}>
                <span>{t("heroTitle")}</span>
                <span className={s.heroTitleLead}>{t("heroTitleLead")}</span>
                <span className={s.heroRotator} aria-hidden="true">
                  {maknaLabels.map((label) => (
                    <span key={label} className={s.rotatorItem}>
                      {label}
                    </span>
                  ))}
                </span>
              </h1>
              <p className={`${s.rv} ${s.heroSub}`}>{t("heroDesc")}</p>
              <div className={`${s.rv} ${s.heroActions}`}>
                <a href="#makna" className={`${s.btn} ${s.btnLight}`}>
                  {t("heroCta1")} <span className={s.arrow} aria-hidden="true">→</span>
                </a>
                <a href="#kontak" className={`${s.btn} ${s.btnOutlineLight}`}>
                  {t("heroCta2")}
                </a>
              </div>
              <ul className={`${s.rv} ${s.heroChips}`}>
                <li>{t("heroChip1")}</li>
                <li>{t("heroChip2")}</li>
                <li>{t("heroChip3")}</li>
              </ul>
            </div>

            <div className={`${s.rv} ${s.heroVisual}`}>
              <div className={s.quranFrame}>
                <p className={s.visualLabel}>{t("heroVisualLabel")}</p>
                <QuranIllustration alt={t("quranAlt")} />
                <p className={s.visualTitle}>{t("heroVisualTitle")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="makna" className={s.section}>
        <div className={s.wrap}>
          <div className={`${s.sc} ${s.sectionIntro}`}>
            <p className={s.eyebrow}>{t("maknaIntro")}</p>
            <h2 className={s.h2}>{t("maknaTitle")}</h2>
            <div className={s.leadGroup}>
              <p className={s.lead}>{t("maknaDesc1")}</p>
              <p className={s.leadStrong}>{t("maknaDesc2")}</p>
            </div>
          </div>

          <div className={`${s.sc} ${s.meaningGrid}`}>
            {MAKNA_ITEMS.map((item) => (
              <article key={item.idKey} className={s.meaningCard}>
                <item.Icon className={s.meaningIcon} />
                <h3>{t(`makna.${item.idKey}`)}</h3>
              </article>
            ))}
          </div>

          <p className={`${s.sc} ${s.meaningClosing}`}>{t("maknaClosing")}</p>
        </div>
      </section>

      <section id="perjalanan" className={s.section}>
        <div className={`${s.wrap} ${s.journey}`}>
          <div className={`${s.sc} ${s.journeyCopy}`}>
            <p className={s.eyebrow}>{t("perjalananEyebrow")}</p>
            <h2 className={s.h2}>
              {t("perjalananTitleLead")}
              <span>{t("perjalananTitleAccent")}</span>
            </h2>
            <div className={s.journeyText}>
              <p>{t("perjalananDesc1")}</p>
              <p>{t("perjalananDesc2")}</p>
              <p>{t("perjalananDesc3")}</p>
            </div>
            <blockquote className={s.journeyQuote}>{t("perjalananQuote")}</blockquote>
          </div>
          <div className={`${s.sc} ${s.journeyVisual}`}>
            <img
              className={s.readingImage}
              src={READING_IMAGE_SRC}
              alt={t("readingAlt")}
              width={1166}
              height={1349}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </section>

      <section id="nilai" className={s.section}>
        <div className={`${s.wrap} ${s.lifePanel}`}>
          <div className={`${s.sc} ${s.lifeHead}`}>
            <div>
              <p className={s.eyebrow}>{t("hidupEyebrow")}</p>
              <h2 className={s.h2}>{t("hidupTitle")}</h2>
            </div>
            <div className={s.lifeCopy}>
              <p className={s.lifeLead}>{t("hidupDesc1")}</p>
              <p>{t("hidupDesc2")}</p>
              <p>{t("hidupDesc3")}</p>
            </div>
          </div>

          <div className={`${s.sc} ${s.valueGrid}`}>
            {VALUE_ITEMS.map((item) => (
              <article key={item.idKey} className={s.valueCard}>
                <item.Icon className={s.valueIcon} />
                <h3>{t(`values.${item.idKey}`)}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="kontak" className={`${s.section} ${s.sectionLast}`}>
        <div className={`${s.wrap} ${s.onDark}`}>
          <div className={`${s.sc} ${s.cta}`}>
            <p className={s.ctaEyebrow}>{t("ctaEyebrow")}</p>
            <h2 className={s.ctaTitle}>{t("ctaTitle")}</h2>
            <p className={s.ctaDesc}>{t("ctaDesc")}</p>
            <div className={s.ctaActions}>
              <a href="#top" className={`${s.btn} ${s.btnOutlineLight}`}>
                {t("ctaBack")}
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
