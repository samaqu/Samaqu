"use client";

import Link from "next/link";
import Image from "next/image";
import { HandHeartIcon } from "@phosphor-icons/react/dist/csr/HandHeart";
import Footer from "@/components/Footer";
import { getWhatsAppLink } from "@/lib/store-settings";
import { useSafeTranslations } from "@/lib/safe-i18n";
import s from "./tentang-kami.module.css";

function FabricIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 13h25v25H7Z" />
      <path d="M12 18h15v15H12Z" strokeDasharray="4 4" />
      <path d="m33 16 9-9" />
      <ellipse cx="40" cy="9" rx="2.5" ry="1.5" transform="rotate(-45 40 9)" />
    </svg>
  );
}

function FeatherIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M40 7C25 8 14 18 10 38c-1 4 0 5 1 5 19-3 29-16 30-31 0-2 0-3-1-5Z" />
      <path d="m10 42 20-20M24 21c-4 0-8 2-11 5M29 26c0 4-1 8-4 11" />
    </svg>
  );
}

function PriceTagIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6h16a4 4 0 0 1 4 4v13a4 4 0 0 1-1.2 2.8L24.8 40a3.5 3.5 0 0 1-5 0L5.6 25.8A4 4 0 0 1 4.4 23V10a4 4 0 0 1 4-4Z" />
      <circle cx="15" cy="14" r="2.5" />
      <path d="M19 25h21" strokeDasharray="4 4" />
    </svg>
  );
}

const OFFER_ICONS = [FabricIcon, FeatherIcon, PriceTagIcon];

export default function TentangKamiPage() {
  const t = useSafeTranslations("tentangKami");
  const heroTitle = `${t("heroTitleLead")} ${t("heroTitleAccent")}`;
  const peopleTags = [t("peopleTag1"), t("peopleTag2"), t("peopleTag3")];
  const offerTags = [t("offerTag1"), t("offerTag2"), t("offerTag3")];

  return (
    <>
      <main className={s.root}>
        <section className={`${s.hero} ${s.onDark}`}>
          <div className={s.wrap}>
            <nav aria-label={t("breadcrumbLabel")} className={s.crumbs}>
              <Link href="/">{t("breadcrumbHome")}</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{t("breadcrumbCurrent")}</span>
            </nav>

            <div className={s.heroGrid}>
              <div className={s.heroCopy}>
                <p className={s.eyebrow}>{t("heroEyebrow")}</p>
                <h1 className={s.heroTitle} aria-label={heroTitle}>
                  <span>{t("heroTitleLead")}</span>
                  <span className={s.heroTitleAccent}>{t("heroTitleAccent")}</span>
                </h1>
                <div className={s.heroStory}>
                  <p>{t("heroP1")}</p>
                  <p>{t("heroP2")}</p>
                </div>
              </div>

              <div className={s.heroArtFrame}>
                <img
                  className={s.heroImage}
                  src="https://res.cloudinary.com/kq5d3al5/image/upload/v1793159114/samaqu-hero-thobe-1000.webp"
                  alt={t("heroArtAlt")}
                  width={1000}
                  height={1250}
                  fetchPriority="high"
                />
              </div>
            </div>
          </div>
        </section>

        <section id="cerita" className={s.journeySection}>
          <div className={s.journeyContainer}>
            <div className={`${s.reveal} ${s.journeyIntro}`}>
              <p className={s.journeyEyebrow}>
                <span className={s.journeyEyebrowLine} aria-hidden="true" />
                <span>{t("chapterJourney")}</span>
              </p>
              <h2 className={s.journeyTitle}>
                <span>{t("journeyTitleLead")} </span>
                <span className={s.journeyTitleAccent}>{t("journeyTitleAccent")}</span>
              </h2>
              <p className={s.journeyParagraph}>{t("journeyDesc")}</p>
            </div>

            <ol className={`${s.reveal} ${s.steps}`}>
              <li className={s.step}>
                <div className={s.markerColumn} aria-hidden="true">
                  <span className={s.questionMarker}>?</span>
                  <svg className={s.stitchLine} width="2" height="100%" aria-hidden="true">
                    <line
                      x1="1"
                      y1="0"
                      x2="1"
                      y2="100%"
                      stroke="#8A8A8A"
                      strokeWidth="2"
                      strokeDasharray="8 6"
                      strokeLinecap="round"
                    />
                  </svg>
                  <svg className={s.needle} width="12" height="30" viewBox="0 0 12 30" fill="none" aria-hidden="true">
                    <ellipse cx="6" cy="5" rx="2.2" ry="4.2" stroke="#5C5C5C" strokeWidth="1.6" />
                    <path d="M6 9.2V29" stroke="#5C5C5C" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
                <div className={s.questionContent}>
                  <p className={s.stepLabel}>{t("questionLabel")}</p>
                  <blockquote className={s.questionQuote}>{t("questionText")}</blockquote>
                </div>
              </li>

              <li className={s.step}>
                <div className={s.markerColumn} aria-hidden="true">
                  <span className={`${s.questionMarker} ${s.answerMarker}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="m5 12 4.5 4.5L19 7"
                        stroke="#FFFFFF"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>
                <div className={s.answerCard}>
                  <p className={s.answerTitle}>
                    {t("answerTitleLead")}{" "}
                    <span className={s.answerHighlight}>{t("answerTitleAccent")}</span>
                  </p>
                  <p className={s.answerDesc}>{t("answerDesc")}</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className={s.peopleSection}>
          <div className={s.peopleContainer}>
            <div className={`${s.reveal} ${s.peopleIntro}`}>
              <div className={s.peopleHeading}>
                <p className={s.peopleEyebrow}>
                  <span className={s.peopleEyebrowLine} aria-hidden="true" />
                  <span>{t("chapterPeople")}</span>
                </p>
                <h2 className={s.peopleTitle}>
                  <span>{t("peopleTitleLead")} </span>
                  <span className={s.peopleTitleAccent}>{t("peopleTitleAccent")}</span>
                </h2>
              </div>
              <p className={s.peopleLead}>{t("peopleDesc1")}</p>
            </div>

            <div className={`${s.reveal} ${s.peopleStepsWrap}`}>
              <span className={s.peopleStitchDesktop} aria-hidden="true">
                <svg width="100%" height="2" aria-hidden="true">
                  <line
                    x1="0"
                    y1="1"
                    x2="100%"
                    y2="1"
                    stroke="#8A8A8A"
                    strokeWidth="2"
                    strokeDasharray="8 6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className={s.peopleStitchMobile} aria-hidden="true">
                <svg width="2" height="100%" aria-hidden="true">
                  <line
                    x1="1"
                    y1="0"
                    x2="1"
                    y2="100%"
                    stroke="#8A8A8A"
                    strokeWidth="2"
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <ol className={s.peopleSteps}>
                {peopleTags.map((tag, index) => (
                  <li key={tag} className={s.peopleStep}>
                    <span className={s.peopleStepNumber}>0{index + 1}</span>
                    <span className={s.peopleStepWord}>{tag}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className={`${s.reveal} ${s.peopleStatements}`}>
              <p className={`${s.peopleStatement} ${s.peopleStatementSoft}`}>{t("peopleDesc2")}</p>
              <p className={`${s.peopleStatement} ${s.peopleStatementBold}`}>{t("peopleClosing")}</p>
            </div>

            <div className={`${s.reveal} ${s.peopleClosingBar}`}>
              <p className={s.peopleClosingText}>{t("peopleBridge")}</p>
              <svg className={s.threadNeedle} viewBox="0 0 180 24" fill="none" aria-hidden="true">
                <path
                  d="M2 12H110"
                  stroke="#8A8A8A"
                  strokeWidth="2"
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                />
                <ellipse cx="116" cy="12" rx="7" ry="3" stroke="#FFFFFF" strokeWidth="1.8" />
                <path d="M123 12H176" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </section>

        <section className={s.offerSection}>
          <div className={s.offerContainer}>
            <div className={`${s.reveal} ${s.offerIntro}`}>
              <div className={s.offerHeading}>
                <p className={s.offerEyebrow}>
                  <span className={s.offerEyebrowLine} aria-hidden="true" />
                  <span>{t("chapterOffer")}</span>
                </p>
                <h2 className={s.offerTitle}>
                  <span>{t("offerTitleLead")} </span>
                  <span className={s.offerTitleAccent}>{t("offerTitleAccent")}</span>
                </h2>
              </div>
              <p className={s.offerSub}>{t("offerSub")}</p>
            </div>

            <div className={`${s.reveal} ${s.offerCards}`}>
              {offerTags.map((tag, index) => {
                const Icon = OFFER_ICONS[index];
                return (
                  <article key={tag} className={s.offerCardOuter}>
                    <div className={s.offerCardInner}>
                      <div className={s.offerCardTop}>
                        <span className={s.offerCardIcon}>
                          <Icon />
                        </span>
                        <span className={s.offerCardNumber}>0{index + 1}</span>
                      </div>
                      <h3 className={s.offerCardLabel}>{tag}</h3>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className={`${s.reveal} ${s.offerClosing}`}>
              <p className={s.offerClosingText}>
                <span>{t("offerClosingLead")}</span>{" "}
                <span className={s.offerClosingAccent}>{t("offerClosingAccent")}</span>
              </p>
              <svg className={s.offerThreadNeedle} viewBox="0 0 180 24" fill="none" aria-hidden="true">
                <path
                  d="M2 12H110"
                  stroke="#8A8A8A"
                  strokeWidth="2"
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                />
                <ellipse cx="116" cy="12" rx="7" ry="3" stroke="#111111" strokeWidth="1.8" />
                <path d="M123 12H176" stroke="#111111" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </section>

        <section className={s.section}>
          <div className={s.wrap}>
            <div className={`${s.reveal} ${s.impact}`}>
              <div className={s.impactCopy}>
                <p className={s.eyebrow}>{t("chapterImpact")}</p>
                <h2 className={s.impactTitle}>{t("impactTitle")}</h2>
                <p className={s.impactDesc}>{t("impactDesc")}</p>
              </div>
              <div className={s.impactIcon} aria-hidden="true">
                <HandHeartIcon weight="thin" />
              </div>
            </div>
          </div>
        </section>

        <section className={s.growthSection}>
          <div className={s.growthContainer}>
            <div className={`${s.reveal} ${s.growthIntro}`}>
              <p className={s.growthEyebrow}>
                <span className={s.growthEyebrowLine} aria-hidden="true" />
                <span>{t("chapterGrowth")}</span>
              </p>
              <div className={s.growthBox}>
                <p className={s.growthParagraph}>{t("growthP1")}</p>
                <span className={s.growthStitch} aria-hidden="true">
                  <svg className={s.growthStitchVertical} width="2" height="100%" aria-hidden="true">
                    <line
                      x1="1"
                      y1="0"
                      x2="1"
                      y2="100%"
                      stroke="#8A8A8A"
                      strokeWidth="2"
                      strokeDasharray="8 6"
                      strokeLinecap="round"
                    />
                  </svg>
                  <svg className={s.growthStitchHorizontal} width="100%" height="2" aria-hidden="true">
                    <line
                      x1="0"
                      y1="1"
                      x2="100%"
                      y2="1"
                      stroke="#8A8A8A"
                      strokeWidth="2"
                      strokeDasharray="7 5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <p className={s.growthParagraph}>{t("growthP2")}</p>
              </div>
            </div>

            <h2 className={`${s.reveal} ${s.growthTitle}`}>
              <span>{t("growthTitleLead")}</span>{" "}
              <span className={s.growthHighlight}>{t("growthTitleHighlight")}</span>{" "}
              <span>{t("growthTitleTail")}</span>
            </h2>

            <div className={`${s.reveal} ${s.growthFoot}`}>
              <svg className={s.growthVisual} viewBox="0 0 300 64" fill="none" aria-hidden="true">
                <path
                  d="M0 58H300"
                  stroke="#8A8A8A"
                  strokeWidth="2"
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                />
                <circle cx="18" cy="55" r="3" fill="#BDBDBD" />
                <circle cx="50" cy="53" r="5" fill="#A8A8A8" />
                <circle cx="88" cy="50" r="8" fill="#8A8A8A" />
                <circle cx="133" cy="46" r="12" fill="#6B6B6B" />
                <circle cx="187" cy="41" r="17" fill="#3D3D3D" />
                <circle cx="255" cy="30" r="28" fill="#111111" />
                <path
                  d="m244 30 7 7 14-15"
                  stroke="#FFFFFF"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className={s.growthClosing}>{t("growthP4")}</p>
            </div>
          </div>
        </section>

        <section className={s.ctaSection}>
          <div className={s.ctaContainer}>
            <div className={`${s.reveal} ${s.ctaGrid}`}>
              <div className={s.ctaPanel}>
                <p className={s.ctaPill}>
                  <span className={s.ctaPillDot} aria-hidden="true" />
                  {t("closingLead")}
                </p>
                <h2 className={s.ctaTitle}>
                  <span>{t("closingTitleLead")} </span>
                  <span className={s.ctaTitleAccent}>{t("closingTitleAccent")}</span>
                </h2>
              </div>

              <div className={s.ctaRight}>
                <div className={s.ctaImageFrame}>
                  <Image
                    src="/images/samaqu-cta-thobe-1000.webp"
                    alt={t("ctaImageAlt")}
                    fill
                    sizes="(min-width: 768px) 42vw, 100vw"
                    className={s.ctaImage}
                  />
                  <p className={s.ctaImageCaption}>{t("closingLabel")}</p>
                </div>

                <div className={s.ctaActions}>
                  <Link href="/katalog" className={`${s.ctaAction} ${s.ctaActionWhite}`}>
                    <span className={`${s.ctaActionIcon} ${s.ctaActionIconDark}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 17 17 7M9 7h8v8" />
                      </svg>
                    </span>
                    <span className={s.ctaActionLabel}>{t("ctaCatalog")}</span>
                  </Link>

                  <a
                    href={getWhatsAppLink(t("ctaWhatsapp"))}
                    target="_blank"
                    rel="noopener"
                    className={`${s.ctaAction} ${s.ctaActionGray}`}
                  >
                    <span className={`${s.ctaActionIcon} ${s.ctaActionIconLight}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 5h14v10H10l-5 4V5Z" />
                      </svg>
                    </span>
                    <span className={s.ctaActionLabel}>{t("ctaAdmin")}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
