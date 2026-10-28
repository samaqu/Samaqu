"use client";

import { useState } from "react";
import Link from "next/link";
import Footer from "@/components/Footer";
import { getWhatsAppLink } from "@/lib/store-settings";
import { useSafeLocale, useSafeTranslations } from "@/lib/safe-i18n";
import s from "./create-your-price.module.css";

const MIN_PRICE = 300000;
const MAX_PRICE = 500000;
const QUICK_PRICES = [300000, 320000, 350000];

export default function CreateYourPricePage() {
  const t = useSafeTranslations("createYourPrice");
  const locale = useSafeLocale();
  const [price, setPrice] = useState(MIN_PRICE);

  const fmt = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
  const pct = ((price - MIN_PRICE) / (MAX_PRICE - MIN_PRICE)) * 100;
  const heroHeading = `${t("heroTitleLead")} ${t("heroTitleAccent")}`;

  const steps = [
    { num: "01", title: t("step1Title"), desc: t("step1Desc") },
    { num: "02", title: t("step2Title"), desc: t("step2Desc") },
    { num: "03", title: t("step3Title"), desc: t("step3Desc") },
  ];

  const beliefs = [
    { num: "01", title: t("point1Title"), desc: t("point1Desc") },
    { num: "02", title: t("point2Title"), desc: t("point2Desc") },
    { num: "03", title: t("point3Title"), desc: t("point3Desc") },
  ];

  return (
    <>
      <main className={s.root}>
        <section className={`${s.hero} ${s.onDark}`}>
          <div className={s.wrap}>
            <div className={s.heroGrid}>
              <div className={s.heroCopy}>
                <p className={`${s.eyebrow} ${s.heroEyebrow}`}>
                  <span className={s.eyebrowLine} aria-hidden="true" />
                  <span>{t("heroEyebrow")}</span>
                </p>

                <h1 className={s.heroTitle} aria-label={heroHeading}>
                  <span>{t("heroTitleLead")}</span>
                  <span className={s.heroTitleAccent}>{t("heroTitleAccent")}</span>
                </h1>

                <p className={s.heroLead}>{t("heroSubtitle")}</p>

                <div className={s.actionGroup}>
                  <div className={s.actionRow}>
                    <a href="#cara-kerja" className={`${s.btn} ${s.btnHeroLight}`}>
                      {t("heroBtn1")}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 4v16M5 13l7 7 7-7" />
                      </svg>
                    </a>
                    <Link href={`/${locale}/open-order`} className={`${s.btn} ${s.btnHeroDark}`}>
                      {t("openOrderCta")}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M7 17 17 7M9 7h8v8" />
                      </svg>
                    </Link>
                  </div>
                  <a href="#cerita" className={s.storyLink}>
                    {t("heroBtn2")}
                  </a>
                </div>
              </div>

              <div className={s.demoCard}>
                <div className={s.demoHeader}>
                  <p className={s.demoLabel}>{t("simLabel")}</p>
                  <p className={s.demoTitle}>{t("simTitle")}</p>
                </div>

                <div className={s.priceStage} aria-hidden="true">
                  <span className={`${s.demoPrice} ${s.demoPriceOne}`}>{fmt(MIN_PRICE)}</span>
                  <span className={`${s.demoPrice} ${s.demoPriceTwo}`}>{fmt(QUICK_PRICES[1])}</span>
                  <span className={`${s.demoPrice} ${s.demoPriceThree}`}>{fmt(QUICK_PRICES[2])}</span>
                </div>

                <div className={s.demoSlider} aria-hidden="true">
                  <div className={s.demoTrack}>
                    <span className={s.demoFill} />
                    <span className={s.demoThumb} />
                  </div>
                  <div className={s.demoRange}>
                    <span>{fmt(MIN_PRICE)} (min)</span>
                    <span>{fmt(MAX_PRICE)}</span>
                  </div>
                </div>

                <div className={s.demoChips} aria-hidden="true">
                  <span className={`${s.demoChip} ${s.demoChipOne}`}>{fmt(QUICK_PRICES[0])}</span>
                  <span className={`${s.demoChip} ${s.demoChipTwo}`}>{fmt(QUICK_PRICES[1])}</span>
                  <span className={`${s.demoChip} ${s.demoChipThree}`}>{fmt(QUICK_PRICES[2])}</span>
                </div>

                <div className={s.demoBadge}>
                  <span className={s.demoBadgeIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 4.5 4.5L19 7" />
                    </svg>
                  </span>
                  <span>{t("simBadge")}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="cerita" className={s.beliefSection}>
          <div className={s.beliefContainer}>
            <div className={`${s.beliefTop} ${s.storyReveal}`}>
              <div className={s.beliefHeading}>
                <p className={s.beliefEyebrow}>
                  <span className={s.beliefEyebrowLine} aria-hidden="true" />
                  <span>{t("storyEyebrow")}</span>
                </p>
                <h2 className={s.beliefTitle}>
                  <span>{t("storyTitleLead")} </span>
                  <span className={s.beliefTitleAccent}>{t("storyTitleAccent")}</span>
                </h2>
              </div>

              <div className={s.storyCard}>
                <div className={s.storyCardTop}>
                  <span className={s.storyCardIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="9" cy="8" r="3" />
                      <circle cx="17" cy="9" r="2" />
                      <path d="M3 20a6 6 0 0 1 12 0M15 20a5 5 0 0 1 6-4.5" />
                    </svg>
                  </span>
                  <p>{t("storyCardLead")}</p>
                </div>

                <span className={s.storyCardDivider} aria-hidden="true" />

                <p className={s.storyCardText}>
                  {t("storyCardBottomLead")}{" "}
                  <span className={s.storyCardPhrase}>
                    {t("storyCardPhraseLead")}{" "}
                    <span className={s.storyCardHighlight}>{t("storyCardPhraseAccent")}</span>
                  </span>
                </p>
              </div>
            </div>

            <div className={`${s.beliefPanel} ${s.storyReveal}`}>
              <p className={s.beliefStatement}>
                <span className={s.beliefStatementMuted}>{t("beliefLead")}</span>{" "}
                <span>{t("beliefAccent")}</span>
              </p>

              <span className={s.beliefDivider} aria-hidden="true" />

              <div className={s.beliefPath}>
                <span className={s.beliefStitchDesktop} aria-hidden="true">
                  <svg width="100%" height="2" aria-hidden="true">
                    <line x1="0" y1="1" x2="100%" y2="1" stroke="#6B6B6B" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" />
                  </svg>
                </span>
                <span className={s.beliefStitchMobile} aria-hidden="true">
                  <svg width="2" height="100%" aria-hidden="true">
                    <line x1="1" y1="0" x2="1" y2="100%" stroke="#6B6B6B" strokeWidth="2" strokeDasharray="7 5" strokeLinecap="round" />
                  </svg>
                </span>

                <ol className={s.beliefPoints}>
                  {beliefs.map((belief) => (
                    <li key={belief.num} className={s.beliefPoint}>
                      <span className={s.beliefNumber}>{belief.num}</span>
                      <div className={s.beliefBody}>
                        <h3>{belief.title}</h3>
                        <p>{belief.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section id="cara-kerja" className={s.howSection}>
          <div className={s.howContainer}>
            <div className={`${s.howHead} ${s.howReveal}`}>
              <p className={s.howEyebrow}>
                <span className={s.howEyebrowLine} aria-hidden="true" />
                <span>{t("howEyebrow")}</span>
              </p>
              <h2 className={s.howTitle}>
                <span>{t("howTitleLead")} </span>
                <span className={s.howTitleAccent}>{t("howTitleAccent")}</span>
              </h2>
            </div>

            <div className={s.howGrid}>
              <div className={`${s.howStepsCol} ${s.howReveal}`}>
                <span className={s.howStitch} aria-hidden="true">
                  <svg className={s.howStitchSvg} width="2" height="100%" aria-hidden="true">
                    <line
                      x1="1"
                      y1="0"
                      x2="1"
                      y2="100%"
                      stroke="#9E9E9E"
                      strokeWidth="2"
                      strokeDasharray="8 6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>

                <ol className={s.howSteps}>
                  {steps.map((step) => (
                    <li key={step.num} className={s.howStep}>
                      <span className={s.howStepNumber}>{step.num}</span>
                      <div className={s.howStepBody}>
                        <h3>{step.title}</h3>
                        <p>{step.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className={`${s.howSimulator} ${s.howReveal}`}>
                <div className={s.simPricing}>
                  <p className={s.simLabel}>{t("simLabel")}</p>
                  <p className={s.simTitle}>{t("simTitle")}</p>
                  <p className={s.simPrice} aria-live="polite">
                    <span key={price} className={s.simPriceValue}>
                      {fmt(price)}
                    </span>
                  </p>
                </div>

                <input
                  type="range"
                  min={MIN_PRICE}
                  max={MAX_PRICE}
                  step={10000}
                  value={price}
                  onChange={(event) => setPrice(Number(event.target.value))}
                  className={s.slider}
                  style={{ "--pct": `${pct}%` } as React.CSSProperties}
                  aria-label={t("simTitle")}
                  aria-valuetext={fmt(price)}
                />

                <div className={s.sliderRange}>
                  <span>{fmt(MIN_PRICE)} (min)</span>
                  <span>{fmt(MAX_PRICE)}</span>
                </div>

                <div className={s.quickPrices}>
                  {QUICK_PRICES.map((quickPrice) => (
                    <button
                      key={quickPrice}
                      type="button"
                      onClick={() => setPrice(quickPrice)}
                      className={s.quickPrice}
                      aria-pressed={price === quickPrice}
                    >
                      {fmt(quickPrice)}
                    </button>
                  ))}
                </div>

                <div className={s.simNote}>
                  <span className={s.simNoteIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 4.5 4.5L19 7" />
                    </svg>
                  </span>
                  <div className={s.simNoteBody}>
                    <p className={s.simNoteTitle}>{t("simMinTitle")}</p>
                    <p className={s.simNoteDesc}>{t("simMinDesc")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={s.notDiscountSection}>
          <div className={s.notDiscountContainer}>
            <div className={s.notDiscountTop}>
              <div className={`${s.notDiscountHead} ${s.notDiscountReveal}`}>
                <p className={s.notDiscountEyebrow}>
                  <span className={s.notDiscountEyebrowLine} aria-hidden="true" />
                  <span>{t("notDiscountEyebrow")}</span>
                </p>
                <h2 className={s.notDiscountTitle}>
                  <span>{t("notDiscountTitleLead")} </span>
                  <span className={s.notDiscountTitleAccent}>{t("notDiscountTitleAccent")}</span>
                </h2>
                <p className={s.notDiscountSub}>{t("notDiscountSub")}</p>
              </div>

              <div className={`${s.notListCard} ${s.notDiscountReveal}`}>
                <ul className={s.notList}>
                  {(["notDiscountItem1", "notDiscountItem2", "notDiscountItem3"] as const).map((key) => (
                    <li key={key} className={s.notListRow}>
                      <span className={s.notListIcon} aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </span>
                      <span>{t(key)}</span>
                    </li>
                  ))}
                  <li className={s.notListPositive}>
                    <span className={s.notListIconPositive} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 4.5 4.5L19 7" />
                      </svg>
                    </span>
                    <span>{t("notDiscountItem4")}</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className={`${s.notDiscountPanel} ${s.notDiscountReveal}`}>
              <p className={s.notDiscountStatement}>
                <span>{t("notDiscountScaleLead")}</span>{" "}
                <span className={s.notDiscountStatementAccent}>{t("notDiscountScaleAccent")}</span>
              </p>

              <div className={s.notDiscountSupport}>
                <span className={s.notDiscountStitch} aria-hidden="true">
                  <svg width="2" height="100%" aria-hidden="true">
                    <line
                      x1="1"
                      y1="0"
                      x2="1"
                      y2="100%"
                      stroke="#6B6B6B"
                      strokeWidth="2"
                      strokeDasharray="7 5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <p>{t("notDiscountSupport")}</p>
              </div>
            </div>
          </div>
        </section>

        <section className={s.closingSection}>
          <div className={s.closingContainer}>
            <div className={`${s.closingCopy} ${s.closingReveal}`}>
              <p className={s.closingEyebrow}>
                <span className={s.closingEyebrowLine} aria-hidden="true" />
                <span>{t("closingEyebrow")}</span>
              </p>
              <h2 className={s.closingTitle}>
                <span className={s.closingTitleMuted}>{t("closingTitleLead")}</span>{" "}
                <span>{t("closingTitleAccent")}</span>
              </h2>
              <p className={s.closingSub}>{t("closingSub")}</p>
            </div>

            <div className={`${s.hangingPrices} ${s.closingReveal}`} aria-hidden="true">
              <span className={s.hangarThread}>
                <svg width="100%" height="2">
                  <line x1="0" y1="1" x2="100%" y2="1" stroke="#5C5C5C" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" />
                </svg>
              </span>

              <div className={s.hangarRow}>
                <div className={`${s.hangarItem} ${s.hangarOne}`}>
                  <span className={s.hangarString} />
                  <div className={`${s.hangarCard} ${s.hangarCardLight}`}>
                    <span className={s.hangarHole} />
                    <span className={s.hangarLabel}>{t("closingPriceMin")}</span>
                    <span className={s.hangarPrice}>{fmt(MIN_PRICE)}</span>
                  </div>
                </div>

                <div className={`${s.hangarItem} ${s.hangarTwo}`}>
                  <span className={s.hangarString} />
                  <div className={`${s.hangarCard} ${s.hangarCardDark}`}>
                    <span className={s.hangarHole} />
                    <span className={s.hangarLabel}>{t("closingPricePick")}</span>
                    <span className={s.hangarPrice}>{fmt(QUICK_PRICES[1])}</span>
                  </div>
                </div>

                <div className={`${s.hangarItem} ${s.hangarThree}`}>
                  <span className={s.hangarString} />
                  <div className={`${s.hangarCard} ${s.hangarCardLight}`}>
                    <span className={s.hangarHole} />
                    <span className={s.hangarLabel}>{t("closingPricePick")}</span>
                    <span className={s.hangarPrice}>{fmt(QUICK_PRICES[2])}</span>
                  </div>
                </div>
              </div>

              <div className={s.closingPill}>
                <span className={s.closingPillIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 4.5 4.5L19 7" />
                  </svg>
                </span>
                <span>{t("closingPill")}</span>
              </div>
            </div>

            <div className={`${s.closingActions} ${s.closingReveal}`}>
              <Link href={`/${locale}/open-order`} className={`${s.closingBtn} ${s.closingBtnPrimary}`}>
                {t("closingBtn")}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <a
                href={getWhatsAppLink(t("askAdminWa"))}
                target="_blank"
                rel="noopener"
                className={`${s.closingBtn} ${s.closingBtnSecondary}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 5h14v10H10l-5 4V5Z" />
                </svg>
                {t("askAdmin")}
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
