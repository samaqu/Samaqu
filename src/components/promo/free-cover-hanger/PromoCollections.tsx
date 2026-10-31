import Image from "next/image";
import { PROMO_COLLECTIONS, katalogHref, type PromoCollection } from "@/lib/promo/free-cover-hanger";

/** Foto tile: foto katalog kalau ada, kalau tidak placeholder abu-abu berlabel. */
function TilePhoto({ item, name }: { item: PromoCollection; name: string }) {
  return (
    <>
      {item.image ? (
        <div className="fch-tile-img" style={{ position: "absolute", inset: 0 }}>
          <Image
            src={item.image}
            alt={`Foto ${name}`}
            fill
            sizes="(max-width: 640px) 80vw, 620px"
            style={{ objectFit: "cover", objectPosition: "center top" }}
          />
        </div>
      ) : (
        <div
          className="fch-tile-img"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#3D3D3D",
            fontSize: 15,
            background: "#DEDEDB",
          }}
        >
          [Foto {name}]
        </div>
      )}
    </>
  );
}

/** Koleksi: Thobe besar + Kandora + Koko. Di HP menjadi carousel geser dengan snap. */
export function PromoCollections({ locale }: { locale: string }) {
  const href = katalogHref(locale);
  const featured = PROMO_COLLECTIONS.items.find((item) => item.featured);
  const others = PROMO_COLLECTIONS.items.filter((item) => !item.featured);

  return (
    <div className="fch-wrap" style={{ paddingBottom: 110 }}>
      <div
        className="fch-rv"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 36,
        }}
      >
        <h2 className="fch-disp fch-h-sec" style={{ fontWeight: 900 }}>
          {PROMO_COLLECTIONS.title}
        </h2>
        <a
          href={href}
          data-katalog-link=""
          data-fch-placement="collections_all"
          className="fch-hide-m"
          style={{ fontWeight: 600, fontSize: 17, textUnderlineOffset: 5 }}
        >
          {PROMO_COLLECTIONS.allLabel}
        </a>
        <span className="fch-only-m" style={{ fontSize: 14, color: "#3D3D3D" }}>
          {PROMO_COLLECTIONS.mobileHint}
        </span>
      </div>

      <div className="fch-coll">
        {featured ? (
          <a
            href={href}
            data-katalog-link=""
            data-fch-placement={`collection_${featured.name.toLowerCase()}`}
            className="fch-tile fch-coll-big fch-tap"
            style={{ textDecoration: "none", color: "#000000", display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div
              className="fch-coll-big-box"
              style={{ flex: 1, borderRadius: 28, overflow: "hidden", position: "relative", background: "#EEEDE8" }}
            >
              <TilePhoto item={featured} name={featured.name} />
              {featured.badge ? (
                <div
                  style={{
                    position: "absolute",
                    top: 16,
                    left: 16,
                    background: "#000000",
                    color: "#FFFFFF",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "9px 14px",
                    borderRadius: 999,
                  }}
                >
                  {featured.badge}
                </div>
              ) : null}
              <div
                style={{
                  position: "absolute",
                  bottom: 16,
                  left: 16,
                  background: "#FFFFFF",
                  color: "#000000",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 14px",
                  borderRadius: 999,
                  border: "1.5px solid #000000",
                }}
              >
                {PROMO_COLLECTIONS.bonusLabel}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="fch-disp fch-tile-name" style={{ fontSize: 52, fontWeight: 900 }}>
                  {featured.name}
                </div>
                <div style={{ fontSize: 16, color: "#3D3D3D", lineHeight: 1.5 }}>{featured.description}</div>
              </div>
              <span
                className="fch-tile-pill"
                style={{
                  flexShrink: 0,
                  height: 50,
                  padding: "0 20px",
                  borderRadius: 999,
                  background: "#000000",
                  color: "#FFFFFF",
                  display: "inline-flex",
                  alignItems: "center",
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                Lihat {featured.name}
              </span>
            </div>
          </a>
        ) : null}

        {others.map((item) => (
          <a
            key={item.name}
            href={href}
            data-katalog-link=""
            data-fch-placement={`collection_${item.name.toLowerCase()}`}
            className="fch-tile fch-tap"
            style={{ textDecoration: "none", color: "#000000", display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div
              className="fch-tile-box"
              style={{ aspectRatio: "16 / 10", borderRadius: 28, overflow: "hidden", position: "relative", background: "#EEEDE8" }}
            >
              <TilePhoto item={item} name={item.name} />
              <div
                style={{
                  position: "absolute",
                  bottom: 16,
                  left: 16,
                  background: "#FFFFFF",
                  color: "#000000",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 14px",
                  borderRadius: 999,
                  border: "1.5px solid #000000",
                }}
              >
                {PROMO_COLLECTIONS.bonusLabel}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div className="fch-disp fch-tile-name" style={{ fontSize: 40, fontWeight: 900 }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 15, color: "#3D3D3D", lineHeight: 1.5 }}>{item.description}</div>
              </div>
              <span
                className="fch-tile-pill"
                style={{
                  flexShrink: 0,
                  height: 46,
                  padding: "0 18px",
                  borderRadius: 999,
                  border: "1.5px solid #000000",
                  display: "inline-flex",
                  alignItems: "center",
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                Lihat {item.name}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
