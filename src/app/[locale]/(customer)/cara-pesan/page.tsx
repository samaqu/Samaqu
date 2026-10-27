"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import Link from "next/link";
import { getWhatsAppLink } from "@/lib/store-settings";
import { useSafeTranslations } from "@/lib/safe-i18n";
import s from "./cara-pesan.module.css";

type TabKey = "normal" | "open";

/** Logo pembayaran sesuai daftar di mockup (SVG resmi idn-finlogos). */
type PaymentLogo = { alt: string; file: string };

const PAYMENT_LOGOS: PaymentLogo[][] = [
  [
    { alt: "QRIS", file: "qris.svg" },
    { alt: "GoPay", file: "gopay.svg" },
    { alt: "OVO", file: "ovo.svg" },
    { alt: "DANA", file: "dana.svg" },
    { alt: "ShopeePay", file: "shopeepay.svg" },
    { alt: "LinkAja", file: "linkaja.svg" },
    { alt: "Jenius", file: "jenius.svg" },
  ],
  [
    { alt: "BNI", file: "bni.svg" },
    { alt: "BRI", file: "bri.svg" },
    { alt: "Mandiri", file: "bank-mandiri.svg" },
    { alt: "CIMB Niaga", file: "bank-cimb-niaga.svg" },
    { alt: "Permata Bank", file: "permata.svg" },
    { alt: "Bank BJB", file: "bank-bjb.svg" },
    { alt: "BSI", file: "bsi.svg" },
  ],
  [
    { alt: "Alfamart", file: "alfamart.svg" },
    { alt: "Indomaret", file: "indomaret.svg" },
    { alt: "Visa", file: "visa.svg" },
    { alt: "Mastercard", file: "mastercard.svg" },
  ],
];

export default function CaraPesanPage() {
  const t = useSafeTranslations("caraPesanPage");
  const [tab, setTab] = useState<TabKey>("normal");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabKeys: TabKey[] = ["normal", "open"];

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : tabKeys.length - 1)) % tabKeys.length;
    setTab(tabKeys[next]);
    tabRefs.current[next]?.focus();
  };

  const normalSteps = [
    { num: "01", title: t("normalStep1Title"), desc: t("normalStep1Desc") },
    { num: "02", title: t("normalStep2Title"), desc: t("normalStep2Desc") },
    { num: "03", title: t("normalStep3Title"), desc: t("normalStep3Desc") },
    { num: "04", title: t("normalStep4Title"), desc: t("normalStep4Desc") },
    { num: "05", title: t("normalStep5Title"), desc: t("normalStep5Desc") },
  ];

  const openSteps = [
    { num: "01", title: t("openStep1Title"), desc: t("openStep1Desc") },
    { num: "02", title: t("openStep2Title"), desc: t("openStep2Desc") },
    { num: "03", title: t("openStep3Title"), desc: t("openStep3Desc") },
    { num: "04", title: t("openStep4Title"), desc: t("openStep4Desc") },
    { num: "05", title: t("openStep5Title"), desc: t("openStep5Desc") },
  ];

  const paymentGroups = [t("payGroup1"), t("payGroup2"), t("payGroup3")].map((label, i) => ({
    label,
    logos: PAYMENT_LOGOS[i],
  }));

  const statuses = [
    { title: t("status1Title"), desc: t("status1Desc") },
    { title: t("status2Title"), desc: t("status2Desc") },
    { title: t("status3Title"), desc: t("status3Desc") },
    { title: t("status4Title"), desc: t("status4Desc") },
  ];

  const warranties = [
    { title: t("warranty1Title"), desc: t("warranty1Desc") },
    { title: t("warranty2Title"), desc: t("warranty2Desc") },
    { title: t("warranty3Title"), desc: t("warranty3Desc") },
  ];

  const contactReasons = [
    { title: t("contactReason1Title"), desc: t("contactReason1Desc") },
    { title: t("contactReason2Title"), desc: t("contactReason2Desc") },
    { title: t("contactReason3Title"), desc: t("contactReason3Desc") },
  ];

  return (
    <div className={s.root}>
      {/* ============ HERO ============ */}
      <section className={`${s.topsec} ${s.onDark}`}>
        <svg
          className={`${s.spin} ${s.heroGraphic}`}
          aria-hidden="true"
          viewBox="0 0 200 200"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1"
        >
          <rect x="40" y="40" width="120" height="120" />
          <rect x="40" y="40" width="120" height="120" transform="rotate(45 100 100)" />
          <circle cx="100" cy="100" r="30" />
        </svg>

        <div className={s.wrap} style={{ position: "relative" }}>
          <div className={s.hero}>
            <div className={s.heroCopy}>
              <p className={`${s.rv} ${s.heroBadge}`}>
                <span className={s.dot} />
                {t("heroBadge")}
              </p>
              <h1 className={s.rv}>
                {t("heroTitleLead")}
                <span className={s.rt}>
                  <span className={s.rw}>{t("heroRotate1")}</span>
                  <span className={s.rw}>{t("heroRotate2")}</span>
                  <span className={s.rw}>{t("heroRotate3")}</span>
                </span>
              </h1>
              <p className={`${s.rv} ${s.heroSub}`}>{t("heroDesc")}</p>

              <div className={`${s.rv} ${s.heroActions} ${s.stack}`}>
                <Link className={`${s.btn} ${s.btnPrimary}`} href="/katalog">
                  {t("heroCtaShop")} <span className={s.ar}>→</span>
                </Link>
                <a className={`${s.btn} ${s.btnOutlineDark}`} href="#jalur">
                  {t("heroCtaGuide")}
                </a>
              </div>

              <div className={`${s.rv} ${s.heroChips}`}>
                <span>{t("heroChip1")}</span>
                <span>{t("heroChip2")}</span>
                <span>{t("heroChip3")}</span>
              </div>
            </div>

            <div className={`${s.rv} ${s.hcards}`}>
              <div className={`${s.f1} ${s.hcard} ${s.hcardLight}`}>
                <p className={s.hcardLabel}>{t("hcard1Label")}</p>
                <p className={s.hcardTitle}>{t("hcard1Title")}</p>
                <div className={s.pillRow}>
                  <span className={`${s.pill} ${s.pillSolid}`}>{t("hcard1Pill1")}</span>
                  <span className={s.pill}>{t("hcard1Pill2")}</span>
                  <span className={s.pill}>{t("hcard1Pill3")}</span>
                </div>
              </div>

              <div className={`${s.f2} ${s.hcard} ${s.hcardDark}`}>
                <p className={s.hcardLabel}>{t("hcard2Label")}</p>
                <p className={s.hcardTitle}>{t("hcard2Title")}</p>
                <div className={s.hcardRow}>
                  <span>{t("hcard2Row1")}</span>
                  <b>{t("hcard2Val1")}</b>
                </div>
                <div className={s.hcardRow}>
                  <span>{t("hcard2Row2")}</span>
                  <b>{t("hcard2Val2")}</b>
                </div>
              </div>

              <div className={`${s.f3} ${s.hcard} ${s.hcardAccent}`}>
                <p className={s.hcardLabel}>{t("hcard3Label")}</p>
                <p className={s.hcardTitle}>{t("hcard3Title")}</p>
                <div className={s.miniBar}>
                  <i />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ JALUR ============ */}
      <section id="jalur" className={`${s.sec} ${s.secAlt}`}>
        <div className={s.wrap}>
          <div className={`${s.sc} ${s.secHead}`}>
            <div>
              <p className={s.eyebrow}>{t("routeEyebrow")}</p>
              <h2 className={s.h2}>{t("routeTitle")}</h2>
              <p className={s.lead}>{t("routeLead")}</p>
            </div>

            <div className={s.tabs} role="tablist" aria-label={t("tabsLabel")}>
              {tabKeys.map((key, i) => (
                <button
                  key={key}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  id={`tab-${key}`}
                  role="tab"
                  className={s.tabbtn}
                  aria-selected={tab === key}
                  aria-controls={`panel-${key}`}
                  tabIndex={tab === key ? 0 : -1}
                  onClick={() => setTab(key)}
                  onKeyDown={(event) => onTabKeyDown(event, i)}
                >
                  {key === "normal" ? t("tabNormal") : t("tabOpen")}
                </button>
              ))}
            </div>
          </div>

          <div role="tabpanel" id="panel-normal" aria-labelledby="tab-normal" hidden={tab !== "normal"}>
            <p className={`${s.rv} ${s.tabNote}`}>{t("normalNote")}</p>

            <ol className={s.stitch}>
              {normalSteps.map((step, i) => (
                <li key={step.num} className={s.rv} style={{ animationDelay: `${i * 0.09}s` }}>
                  <span
                    className={`${s.knot} ${i === normalSteps.length - 1 ? s.num : ""}`}
                    aria-hidden="true"
                  >
                    {step.num}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </li>
              ))}
            </ol>

            <div className={`${s.rv} ${s.secCta}`}>
              <Link className={`${s.btn} ${s.btnDark}`} href="/katalog">
                {t("normalCta")} <span className={s.ar}>→</span>
              </Link>
            </div>
          </div>

          <div role="tabpanel" id="panel-open" aria-labelledby="tab-open" hidden={tab !== "open"}>
            <p className={`${s.rv} ${s.tabNote}`}>
              {t("openNoteLead")} <strong>{t("openNoteHandle")}</strong>
              {t("openNoteTail")}
            </p>

            <ol className={s.stitch}>
              {openSteps.map((step, i) => (
                <li key={step.num} className={s.rv} style={{ animationDelay: `${i * 0.09}s` }}>
                  <span
                    className={`${s.knot} ${i === openSteps.length - 1 ? s.num : ""}`}
                    aria-hidden="true"
                  >
                    {step.num}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </li>
              ))}
            </ol>

            <div className={`${s.rv} ${s.secCta}`}>
              <Link className={`${s.btn} ${s.btnDark}`} href="/open-order">
                {t("openCta1")} <span className={s.ar}>→</span>
              </Link>
              <Link className={`${s.btn} ${s.btnOutline}`} href="/create-your-price">
                {t("openCta2")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PEMBAYARAN ============ */}
      <section className={s.sec}>
        <div className={s.wrap}>
          <div className={s.sc}>
            <p className={s.eyebrow}>{t("payEyebrow")}</p>
            <h2 className={s.h2}>{t("payTitle")}</h2>
          </div>

          {paymentGroups.map((group) => (
            <div key={group.label} className={`${s.paygrp} ${s.sc}`}>
              <p className={s.paylabel}>{group.label}</p>
              <div className={s.paylogos}>
                {group.logos.map((logo) => (
                  <span key={logo.alt} className={s.paylogo}>
                    <img src={`/assets/payments/${logo.file}`} alt={logo.alt} loading="lazy" />
                  </span>
                ))}
              </div>
            </div>
          ))}

        </div>
      </section>

      {/* ============ SETELAH CHECKOUT ============ */}
      <section className={s.sec}>
        <div className={`${s.panelDark} ${s.sc}`}>
          <div>
            <p className={s.eyebrow}>{t("statusEyebrow")}</p>
            <h2 className={s.h2}>{t("statusTitle")}</h2>
            <p className={s.lead}>{t("statusDesc")}</p>
          </div>

          <div style={{ marginTop: 52 }}>
            <div className={s.bar}>
              <i />
            </div>
            <div className={s.statuses}>
              {statuses.map((status) => (
                <div key={status.title}>
                  <h3>{status.title}</h3>
                  <p>{status.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ GARANSI ============ */}
      <section className={s.sec}>
        <div className={s.wrap}>
          <div className={s.sc}>
            <p className={s.eyebrow}>{t("warrantyEyebrow")}</p>
            <h2 className={s.h2}>{t("warrantyTitle")}</h2>
          </div>

          <div className={s.grid3}>
            {warranties.map((item) => (
              <article key={item.title} className={`${s.cardPlain} ${s.sc}`}>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>

          <p className={s.sc} style={{ margin: "28px 0 0" }}>
            <Link className={s.linkMore} href="/garansi-retur">
              {t("warrantyMore")}
            </Link>
          </p>
        </div>
      </section>

      {/* ============ KONTAK ============ */}
      <section id="kontak" className={`${s.sec} ${s.secLast}`}>
        <div className={`${s.cta} ${s.onDark} ${s.sc}`}>
          <div className={s.ctaGlow} aria-hidden="true" />
          <svg
            className={`${s.spin} ${s.spinCta}`}
            aria-hidden="true"
            viewBox="0 0 200 200"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1"
          >
            <rect x="40" y="40" width="120" height="120" />
            <rect x="40" y="40" width="120" height="120" transform="rotate(45 100 100)" />
            <circle cx="100" cy="100" r="34" />
          </svg>

          <div className={s.ctaCopy}>
            <p className={s.ctaEyebrow}>
              <i aria-hidden="true" />
              {t("contactEyebrow")}
            </p>
            <h2 className={s.ctaTitle}>{t("contactTitle")}</h2>
            <p className={s.ctaDesc}>{t("contactDesc")}</p>
            <div className={s.ctaActions}>
              <a
                className={`${s.btn} ${s.btnLight}`}
                href={getWhatsAppLink(t("waLinkContact"))}
                target="_blank"
                rel="noopener"
              >
                {t("contactWa")} <span className={s.ar}>→</span>
              </a>
              <a
                className={`${s.btn} ${s.btnOutlineLight}`}
                href="https://instagram.com/samaqu.id"
                target="_blank"
                rel="noopener"
              >
                {t("contactIg")}
              </a>
            </div>
          </div>

          <ul className={s.ctaReasons}>
            {contactReasons.map((reason) => (
              <li key={reason.title}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8.5 12.2 2.4 2.4 4.6-5" />
                </svg>
                <div>
                  <strong>{reason.title}</strong>
                  <span>{reason.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className={s.foot}>
        <span>{t("footerCopyright")}</span>
        <span>
          <Link href="/katalog">{t("footerKatalog")}</Link> &nbsp;·&nbsp;{" "}
          <Link href="/panduan-ukuran">{t("footerSize")}</Link> &nbsp;·&nbsp;{" "}
          <Link href="/garansi-retur">{t("footerWarranty")}</Link>
        </span>
      </footer>
    </div>
  );
}
