import Link from "next/link";

type Variant = "primary" | "ghost-pill" | "closing-primary" | "sticky";

/**
 * Tombol "Mulai Pilih Hargamu" / "Open Order" — semuanya mengarah ke halaman Open Order
 * yang SUDAH ADA. `href` datang dari `openOrderHref(searchParams)` sehingga query atribusi
 * kampanye (utm_*, gclid, fbclid, …) ikut terbawa.
 *
 * Gaya visual mengikuti mockup per pemakaian; ukuran & warna disalin apa adanya.
 * Server component — tidak butuh state.
 */
export default function CampaignOrderCta({
  variant,
  label,
  href,
  arrow = false,
}: {
  variant: Variant;
  label: string;
  href: string;
  arrow?: boolean;
}) {
  const base = {
    textDecoration: "none",
    borderRadius: "999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
  } as const;

  const styles: Record<Variant, React.CSSProperties> = {
    primary: {
      ...base,
      background: "var(--cyp-cream)",
      color: "var(--cyp-black)",
      fontWeight: 700,
      fontSize: "15px",
      padding: "18px 30px",
    },
    "ghost-pill": {
      ...base,
      color: "var(--cyp-cream)",
      fontSize: "14px",
      fontWeight: 500,
      border: "1px solid rgba(244,241,234,0.5)",
      padding: "10px 18px",
    },
    "closing-primary": {
      ...base,
      background: "var(--cyp-cream)",
      color: "var(--cyp-black)",
      fontWeight: 700,
      fontSize: "15px",
      height: "56px",
    },
    sticky: {
      ...base,
      flex: "1 1 auto",
      background: "var(--cyp-cream)",
      color: "var(--cyp-black)",
      fontWeight: 700,
      fontSize: "15px",
      height: "52px",
    },
  };

  return (
    <Link href={href} style={styles[variant]}>
      {label}
      {arrow ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      ) : null}
    </Link>
  );
}
