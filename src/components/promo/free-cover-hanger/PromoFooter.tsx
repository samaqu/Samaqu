import Image from "next/image";
import { PROMO_FOOTER } from "@/lib/promo/free-cover-hanger";

/** Footer gelap: logo + tagline. */
export function PromoFooter() {
  return (
    <div style={{ background: "#000000", color: "#FFFFFF" }}>
      <div
        className="fch-wrap fch-footer-pad"
        style={{
          paddingTop: 36,
          paddingBottom: 60,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/*
          Logo aset resmi. Berkas `logo.svg` berwarna hitam, sedangkan footer berlatar
          hitam — `filter: invert(1)` membaliknya jadi putih tanpa mengubah asetnya.
          Rasio asli dipertahankan (`width:auto`).
        */}
        <Image
          src="/logo.svg"
          alt={PROMO_FOOTER.logo}
          width={2560}
          height={853}
          style={{ height: 26, width: "auto", display: "block", filter: "invert(1)" }}
        />
        <div style={{ fontSize: 15, color: "#BDBDB8" }}>{PROMO_FOOTER.tagline}</div>
      </div>
    </div>
  );
}
