import Image from "next/image";
import { PROMO_NAV, katalogHref } from "@/lib/promo/free-cover-hanger";

/** Navigasi atas: logo SAMAQU (aset resmi `public/logo.svg`) + tombol katalog. */
export function PromoNav({ locale }: { locale: string }) {
  return (
    <div style={{ borderBottom: "1.5px solid #000000", background: "#FFFFFF" }}>
      <div
        className="fch-wrap fch-nav"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 76, gap: 16 }}
      >
        {/*
          Logo memakai aset resmi, bukan teks — konsisten dengan Navbar & Footer situs.
          Rasio asli 2560×853 dipertahankan (`width:auto` + `height` tetap) supaya tidak
          gepeng. `priority` karena elemen ini di atas fold.
        */}
        <Image
          src="/logo.svg"
          alt={PROMO_NAV.logo}
          width={2560}
          height={853}
          priority
          className="fch-nav-logo"
          style={{ height: 28, width: "auto", display: "block" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <span
            className="fch-hide-m"
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}
          >
            <span className="fch-live" style={{ width: 8, height: 8, borderRadius: "50%", background: "#000000" }} />
            {PROMO_NAV.statusText}
          </span>
          <a
            href={katalogHref(locale)}
            data-katalog-link=""
            data-fch-placement="nav"
            className="fch-btn-ink fch-nav-btn"
            style={{
              background: "#000000",
              color: "#FFFFFF",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15,
              padding: "0 22px",
              height: 46,
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {PROMO_NAV.ctaLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
