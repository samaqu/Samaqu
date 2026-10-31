import {
  ADMIN_WA_LINK,
  ADMIN_WA_NUMBER,
  PROMO_FLAGS,
  PROMO_STICKY,
  katalogHref,
} from "@/lib/promo/free-cover-hanger";
import { QuotaBar } from "./QuotaBar";

/**
 * Bar bawah khusus HP (sticky). Padding bawah memakai `env(safe-area-inset-bottom)`
 * supaya tidak ketutup home indicator iPhone.
 */
export function PromoStickyBar({ locale }: { locale: string }) {
  return (
    <div
      className="fch-sticky-cta"
      style={{
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderTop: "1px solid #D6D5CF",
        padding: "10px 14px calc(10px + env(safe-area-inset-bottom))",
        gap: 10,
        alignItems: "center",
      }}
    >
      {PROMO_FLAGS.showQuota ? <QuotaBar compact /> : null}
      <a
        href={katalogHref(locale)}
        data-katalog-link=""
        data-fch-placement="sticky"
        className="fch-tap"
        style={{
          flex: 1,
          background: "#000000",
          color: "#FFFFFF",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 15,
          height: 50,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {PROMO_STICKY.ctaLabel}
      </a>
      <a
        href={ADMIN_WA_LINK}
        data-wa-number={ADMIN_WA_NUMBER}
        data-fch-placement="sticky"
        className="fch-tap"
        aria-label={PROMO_STICKY.waLabel}
        style={{
          width: 50,
          height: 50,
          flexShrink: 0,
          boxSizing: "border-box",
          borderRadius: "50%",
          border: "1.5px solid #000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#000000",
          background: "#FFFFFF",
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z" />
        </svg>
      </a>
    </div>
  );
}
