import Link from "next/link";
import {
  HARAPAN,
  JOURNEY,
  KOLEKSI,
  NILAI,
  SQ_ASSETS,
  STORY_ANCHOR,
  TIMELINE,
} from "@/lib/campaign/sama-quran-content";
import s from "../sama-quran.module.css";
import LazyVideo from "./LazyVideo";
import StoryVideo from "./StoryVideo";
import WaLink from "./WaLink";

/* ── 1. HERO ── */
export function HeroSection({ katalog }: { katalog: string }) {
  return (
    <section
      className={`${s.heroGrid}`}
      style={{
        fontFamily: "var(--sq-sans)",
        background: "var(--sq-black)",
        color: "var(--sq-cream)",
        position: "relative",
        overflow: "hidden",
        minHeight: "920px",
      }}
    >
      <div
        className={s.glow}
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "8%",
          top: "-12%",
          width: "760px",
          height: "760px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(244,241,234,0.16) 0%, rgba(11,11,11,0) 62%)",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "40px",
          textAlign: "center",
          fontFamily: "var(--sq-serif)",
          fontSize: "clamp(120px, 19vw, 300px)",
          lineHeight: 0.85,
          letterSpacing: "-2px",
          color: "transparent",
          WebkitTextStroke: "1px rgba(244,241,234,0.10)",
          whiteSpace: "nowrap",
        }}
      >
        Sama Quran
      </div>

      <div
        style={{
          position: "relative",
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "24px 24px 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={SQ_ASSETS.logo}
          alt="SAMAQU"
          style={{ height: "22px", width: "auto", filter: "invert(1)" }}
        />
        <Link
          href={katalog}
          style={{
            color: "var(--sq-cream)",
            fontSize: "14px",
            fontWeight: 500,
            textDecoration: "none",
            border: "1px solid rgba(244,241,234,0.5)",
            padding: "10px 18px",
            borderRadius: "999px",
          }}
        >
          Lihat Katalog
        </Link>
      </div>

      <div
        style={{
          position: "relative",
          maxWidth: "1240px",
          margin: "0 auto",
          padding: "56px 24px 120px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))",
          gap: "64px",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          <div
            className={`${s.eyebrow} ${s.r1}`}
            style={{ display: "flex", gap: "14px", alignItems: "center", fontSize: "12px", letterSpacing: "4px", fontWeight: 700, color: "var(--sq-cream)" }}
          >
            <span style={{ flex: "0 0 40px", height: "1px", background: "var(--sq-cream)" }} />
            <span>NILAI DI BALIK SAMAQU</span>
          </div>

          <h1
            className={`${s.r2} ${s.heroTitle}`}
            style={{ margin: 0, fontFamily: "var(--sq-serif)", fontWeight: 500, lineHeight: 1.06, letterSpacing: "-0.5px" }}
          >
            <span style={{ display: "block", whiteSpace: "nowrap" }}>Hidup Sama Quran.</span>
            <em style={{ display: "block", whiteSpace: "nowrap" }}>Pulang Sama Quran.</em>
          </h1>

          <p
            className={`${s.r3} ${s.tBody}`}
            style={{ margin: 0, fontSize: "18px", lineHeight: 1.7, color: "var(--sq-faint)", maxWidth: "470px" }}
          >
            Bukan soal sudah hafal berapa juz. Tapi menjadikan Quran bagian dari hidup, mulai dari
            yang bisa kamu lakukan hari ini.
          </p>

          <div className={`${s.ctas} ${s.r4} ${s.btnRow}`} style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <Link
              href={katalog}
              style={{
                background: "var(--sq-cream)",
                color: "var(--sq-black)",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "15px",
                padding: "18px 32px",
                borderRadius: "999px",
                display: "flex",
                gap: "10px",
                alignItems: "center",
              }}
            >
              Lihat Katalog
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <a
              href={`#${STORY_ANCHOR}`}
              style={{
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "15px",
                padding: "18px 28px",
                borderRadius: "999px",
                color: "var(--sq-cream)",
                border: "1px solid rgba(244,241,234,0.4)",
                display: "flex",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M10 8.5l5 3.5-5 3.5z" />
              </svg>
              Tonton ceritanya
            </a>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "min(360px, 78vw)" }}>
            <div
              aria-hidden="true"
              style={{ position: "absolute", inset: "-18px", border: "1px solid rgba(244,241,234,0.28)", borderRadius: "30px" }}
            />
            <div
              style={{
                position: "relative",
                aspectRatio: "9 / 16",
                borderRadius: "22px",
                overflow: "hidden",
                boxShadow: "0 40px 90px rgba(0,0,0,0.6)",
              }}
            >
              <LazyVideo
                src={SQ_ASSETS.heroVideo}
                poster={SQ_ASSETS.heroPoster}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "28px",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
          fontSize: "11px",
          letterSpacing: "3px",
          color: "var(--sq-faint-2)",
        }}
      >
        <div
          style={{
            width: "22px",
            height: "36px",
            border: "1px solid var(--sq-faint-2)",
            borderRadius: "12px",
            display: "flex",
            justifyContent: "center",
            paddingTop: "6px",
            boxSizing: "border-box",
          }}
        >
          <span className={s.dot} style={{ width: "3px", height: "7px", borderRadius: "2px", background: "var(--sq-cream)" }} />
        </div>
        SCROLL
      </div>
    </section>
  );
}

/* ── 2. CERITA (VIDEO) ── */
export function StorySection() {
  return (
    <section id={STORY_ANCHOR} className={s.sec} style={{ padding: "96px 20px 24px" }}>
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "28px",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div
          className={s.tEyebrow}
          style={{ display: "flex", gap: "14px", alignItems: "center", fontSize: "12px", letterSpacing: "3px", color: "var(--sq-muted)", fontWeight: 700 }}
        >
          <span style={{ width: "40px", height: "1px", background: "var(--sq-muted)" }} />
          <span>CERITA SAMA QURAN</span>
          <span style={{ width: "40px", height: "1px", background: "var(--sq-muted)" }} />
        </div>

        <h2
          className={s.tH2}
          style={{ margin: 0, fontFamily: "var(--sq-serif)", fontWeight: 500, fontSize: "clamp(36px, 5vw, 60px)", lineHeight: 1.1 }}
        >
          Satu cerita, untuk setiap <em>perjalanan.</em>
        </h2>

        <div style={{ position: "relative", width: "min(400px, 86vw)", marginTop: "8px" }}>
          <div
            aria-hidden="true"
            style={{ position: "absolute", inset: "-16px", border: "1px solid var(--sq-line)", borderRadius: "30px" }}
          />
          <div
            style={{
              position: "relative",
              aspectRatio: "9 / 16",
              borderRadius: "22px",
              overflow: "hidden",
              background: "var(--sq-black)",
              boxShadow: "0 30px 70px rgba(14,14,14,0.22)",
            }}
          >
            <StoryVideo />
          </div>
        </div>

        <p style={{ margin: "8px 0 0", fontSize: "14px", color: "var(--sq-muted)" }}>
          Nyalakan suara untuk pengalaman terbaik.
        </p>
      </div>
    </section>
  );
}

/* ── 3. MAKNA ── */
export function MaknaSection() {
  return (
    <section id="makna" className={s.sec} style={{ padding: "72px 20px 96px", position: "relative", overflow: "hidden" }}>
      <div
        className={s.bgNum}
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "-40px",
          top: "20px",
          fontFamily: "var(--sq-serif)",
          fontSize: "clamp(260px, 40vw, 560px)",
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: "1.5px rgba(14,14,14,0.14)",
        }}
      >
        30
      </div>

      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "56px",
          alignItems: "center",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "26px" }}>
          <div className={s.tEyebrow} style={{ fontSize: "12px", letterSpacing: "3px", color: "var(--sq-muted)", fontWeight: 700 }}>
            MAKNA SAMA QURAN
          </div>
          <h2
            className={s.tH2}
            style={{ margin: 0, fontFamily: "var(--sq-serif)", fontWeight: 500, fontSize: "clamp(38px, 5vw, 64px)", lineHeight: 1.12 }}
          >
            Sama Quran bukan soal sudah hafal <em>berapa juz.</em>
          </h2>
          <p
            className={s.tLead}
            style={{ margin: 0, fontFamily: "var(--sq-serif)", fontSize: "clamp(26px, 3vw, 36px)", lineHeight: 1.4 }}
          >
            Tapi menjadikan Quran bagian dari <em>hidup.</em> Mulai dari yang bisa kita lakukan{" "}
            <em>hari ini.</em>
          </p>
          <p
            className={s.tBody}
            style={{ margin: 0, fontSize: "16px", lineHeight: 1.7, color: "var(--sq-body)", maxWidth: "480px" }}
          >
            Tidak perlu menunggu hafal 30, 20, atau 10 juz. Tidak perlu menunggu sempurna untuk mulai.
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <LazyVideo
            src={SQ_ASSETS.maknaVideo}
            poster={SQ_ASSETS.maknaPoster}
            ariaLabel="Tangan membuka mushaf di atas rehal"
            style={{
              width: "100%",
              maxWidth: "420px",
              aspectRatio: "9 / 13",
              objectFit: "cover",
              objectPosition: "center 70%",
              borderRadius: "20px",
              display: "block",
            }}
          />
        </div>
      </div>
    </section>
  );
}

/* ── 4. ENAM NILAI ── */
export function NilaiSection() {
  return (
    <section className={`${s.sec} ${s.sec0}`} style={{ padding: "0 16px 104px" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "16px",
            flexWrap: "wrap",
            borderBottom: "1px solid var(--sq-line)",
            paddingBottom: "16px",
          }}
        >
          <h2
            className={s.tH2}
            style={{ margin: 0, fontFamily: "var(--sq-serif)", fontWeight: 500, fontSize: "clamp(30px, 4vw, 44px)" }}
          >
            Enam nilai yang kami bawa
          </h2>
        </div>

        <div className={s.nilaiGrid}>
          {NILAI.map((item) => {
            const dark = "dark" in item && item.dark;
            const stroke = dark ? "#F4F1EA" : "#0E0E0E";
            return (
              <div
                key={item.title}
                className={s.nilaiCard}
                style={{
                  border: dark ? undefined : `1px solid ${"var(--sq-line)"}`,
                  background: dark ? "var(--sq-ink)" : undefined,
                  color: dark ? "var(--sq-cream)" : undefined,
                  borderRadius: "16px",
                  padding: "22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  minWidth: 0,
                }}
              >
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={stroke}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {"circles" in item && item.circles
                    ? item.circles.map((c) => <circle key={`${c.cx}-${c.cy}`} cx={c.cx} cy={c.cy} r={c.r} />)
                    : null}
                  {"circle" in item && item.circle ? (
                    <circle cx={item.circle.cx} cy={item.circle.cy} r={item.circle.r} />
                  ) : null}
                  <path d={item.path} />
                  {"extra" in item && item.extra ? <path d={item.extra} /> : null}
                </svg>
                <h3
                  className={s.nilaiTitle}
                  style={{ margin: 0, fontFamily: "var(--sq-serif)", fontWeight: 600, fontSize: "26px", lineHeight: 1.1 }}
                >
                  {item.title}
                </h3>
                <p
                  className={s.nilaiDesc}
                  style={{ margin: 0, fontSize: "14px", lineHeight: 1.5, color: dark ? "#D6D6D6" : "var(--sq-body)" }}
                >
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── 5. PERJALANAN (3 KARTU) ── */
export function JourneySection() {
  return (
    <section className={`${s.sec} ${s.sec0}`} style={{ padding: "0 16px 104px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "36px" }}>
        <div className={s.mLeft} style={{ display: "flex", flexDirection: "column", gap: "12px", textAlign: "center", alignItems: "center" }}>
          <div className={s.tEyebrow} style={{ fontSize: "12px", letterSpacing: "3px", color: "var(--sq-muted)", fontWeight: 700 }}>
            PERJALANAN KITA
          </div>
          <h2
            className={s.tH2}
            style={{ margin: 0, fontFamily: "var(--sq-serif)", fontWeight: 500, fontSize: "clamp(36px, 5vw, 60px)", lineHeight: 1.1 }}
          >
            Setiap orang sedang di jalannya masing-masing.
          </h2>
        </div>

        <div className={s.journey}>
          {JOURNEY.map((item) => (
            <div key={item.number} style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
              <div style={{ position: "relative" }}>
                <LazyVideo
                  src={item.video}
                  poster={item.poster}
                  ariaLabel={item.alt}
                  style={{
                    width: "100%",
                    aspectRatio: "3 / 4",
                    objectFit: "cover",
                    objectPosition: "center 70%",
                    borderRadius: "16px",
                    display: "block",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    top: "12px",
                    left: "12px",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "1px",
                    background: item.dark ? "var(--sq-ink)" : "var(--sq-cream)",
                    color: item.dark ? "var(--sq-cream)" : undefined,
                    padding: "5px 9px",
                    borderRadius: "999px",
                  }}
                >
                  {item.number}
                </span>
              </div>
              <div className={s.journeyCap} style={{ fontFamily: "var(--sq-serif)", fontSize: "26px", lineHeight: 1.15 }}>
                {item.caption} <em>{item.captionEm}</em>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 6. APA PUN PERJALANANMU (GELAP) ── */
export function JourneyDarkSection() {
  return (
    <section
      className={s.sec}
      style={{
        background: "var(--sq-black)",
        color: "var(--sq-cream)",
        padding: "104px 20px 112px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className={s.glow}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "30%",
          top: "50%",
          width: "900px",
          height: "900px",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(244,241,234,0.10) 0%, rgba(11,11,11,0) 60%)",
        }}
      />

      <div
        style={{
          position: "relative",
          maxWidth: "1160px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "64px",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "min(420px, 100%)" }}>
            <div
              aria-hidden="true"
              style={{ position: "absolute", inset: "-16px", border: "1px solid rgba(244,241,234,0.25)", borderRadius: "30px" }}
            />
            <LazyVideo
              src={SQ_ASSETS.jalanVideo}
              poster={SQ_ASSETS.jalanPoster}
              ariaLabel="Pria berjalan di jalan setapak menuju cahaya matahari"
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "940 / 1672",
                borderRadius: "22px",
                display: "block",
                objectFit: "cover",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <div
            className={s.tEyebrow}
            style={{ display: "flex", gap: "14px", alignItems: "center", fontSize: "12px", letterSpacing: "4px", fontWeight: 700, color: "var(--sq-faint)" }}
          >
            <span style={{ width: "40px", height: "1px", background: "var(--sq-faint-2)" }} />
            <span>PERJALANAN KITA</span>
          </div>

          <h2
            className={s.tH2}
            style={{ margin: 0, fontFamily: "var(--sq-serif)", fontWeight: 500, fontSize: "clamp(44px, 6vw, 84px)", lineHeight: 1.02 }}
          >
            Apa pun perjalananmu,
            <br />
            <em>tetap Sama Quran.</em>
          </h2>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
            <li
              aria-hidden="true"
              style={{ position: "absolute", left: "6px", top: "20px", bottom: "20px", borderLeft: "1.5px dashed rgba(244,241,234,0.35)" }}
            />
            {TIMELINE.map((label, index) => (
              <li key={label} style={{ display: "flex", gap: "18px", alignItems: "center", position: "relative", padding: "12px 0" }}>
                <span
                  style={{
                    flex: "0 0 14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: "var(--sq-black)",
                    border: "1.5px solid var(--sq-cream)",
                    position: "relative",
                    zIndex: 1,
                  }}
                />
                <span style={{ fontSize: "17px", color: "var(--sq-faint)" }}>
                  <span style={{ color: "var(--sq-faint-2)", fontSize: "12px", letterSpacing: "1px", marginRight: "10px" }}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {label}
                </span>
              </li>
            ))}
            <li style={{ display: "flex", gap: "18px", alignItems: "center", position: "relative", padding: "12px 0" }}>
              <span
                style={{
                  flex: "0 0 14px",
                  height: "14px",
                  borderRadius: "50%",
                  background: "var(--sq-cream)",
                  boxShadow: "0 0 0 6px rgba(244,241,234,0.15)",
                  position: "relative",
                  zIndex: 1,
                }}
              />
              <span style={{ fontFamily: "var(--sq-serif)", fontStyle: "italic", fontSize: "26px", color: "var(--sq-cream)" }}>
                Pulang
              </span>
            </li>
          </ul>

          <p
            className={s.tLead}
            style={{
              margin: 0,
              paddingTop: "24px",
              borderTop: "1px solid rgba(244,241,234,0.18)",
              fontFamily: "var(--sq-serif)",
              fontStyle: "italic",
              fontSize: "clamp(22px, 2.4vw, 30px)",
              lineHeight: 1.4,
              color: "#E4DFD5",
            }}
          >
            “Yang penting bukan hanya bagaimana kita menjalani hidup, tapi juga bagaimana kita pulang.”
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── 7. DARI NILAI KE KARYA ── */
export function HarapanSection() {
  return (
    <section className={s.sec} style={{ padding: "104px 20px" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "30px", alignItems: "center", textAlign: "center" }}>
        <div className={`${s.mLeft} ${s.tEyebrow}`} style={{ fontSize: "12px", letterSpacing: "3px", color: "var(--sq-muted)", fontWeight: 700 }}>
          DARI NILAI KE KARYA
        </div>
        <h2
          className={s.tH2}
          style={{ margin: 0, fontFamily: "var(--sq-serif)", fontWeight: 500, fontSize: "clamp(40px, 5.5vw, 72px)", lineHeight: 1.1 }}
        >
          Nilai ini kami bawa, ke setiap desain, ke setiap <span className={s.stitch}>jahitan.</span>
        </h2>
        <p className={s.tBody} style={{ margin: 0, fontSize: "18px", lineHeight: 1.7, color: "var(--sq-body)" }}>
          Kami juga orang biasa, yang sedang tumbuh.
        </p>

        <div className={s.harapanGrid} style={{ width: "100%", marginTop: "12px" }}>
          {HARAPAN.map((item) => (
            <div
              key={item.title}
              style={{
                background: "var(--sq-card)",
                border: "1px solid var(--sq-line)",
                borderRadius: "20px",
                padding: "32px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "18px",
                textAlign: "center",
                minWidth: 0,
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--sq-ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {"circle" in item && item.circle ? (
                  <circle cx={item.circle.cx} cy={item.circle.cy} r={item.circle.r} />
                ) : null}
                <path d={item.path} />
                {"extra" in item && item.extra ? <path d={item.extra} /> : null}
              </svg>
              <div style={{ fontSize: "17px", fontWeight: 700, lineHeight: 1.3 }}>{item.title}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 8. KOLEKSI ── */
export function KoleksiSection({ katalog }: { katalog: string }) {
  return (
    <section className={`${s.sec} ${s.sec0}`} style={{ padding: "0 20px 104px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "32px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "16px",
            borderBottom: "1px solid var(--sq-line)",
            paddingBottom: "16px",
          }}
        >
          <h2
            className={s.tH2}
            style={{ margin: 0, fontFamily: "var(--sq-serif)", fontWeight: 500, fontSize: "clamp(32px, 4vw, 48px)" }}
          >
            Koleksi Samaqu
          </h2>
          <Link href={katalog} style={{ fontSize: "14px", fontWeight: 700, textDecoration: "none", color: "var(--sq-ink)" }}>
            Lihat semua →
          </Link>
        </div>

        <div className={s.prodGrid}>
          {KOLEKSI.map((item) => (
            <Link
              key={item.name}
              href={katalog}
              style={{ color: "var(--sq-ink)", textDecoration: "none", display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div
                style={{
                  aspectRatio: "3 / 4",
                  background: "var(--sq-card)",
                  borderRadius: "16px",
                  overflow: "hidden",
                }}
              >
                {/* Foto kategori yang sama dengan section Koleksi di homepage. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
              <div style={{ fontFamily: "var(--sq-serif)", fontSize: "24px", fontWeight: 600 }}>{item.name}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 9. CTA PENUTUP ── */
export function ClosingCtaSection({ katalog, waHref }: { katalog: string; waHref: string | null }) {
  return (
    <section className={`${s.sec} ${s.sec0}`} style={{ padding: "0 20px 112px" }}>
      <div
        className={s.ctaCard}
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          background: "var(--sq-black)",
          color: "var(--sq-cream)",
          borderRadius: "28px",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          alignItems: "stretch",
          position: "relative",
        }}
      >
        <div style={{ padding: "clamp(32px, 5vw, 72px)", display: "flex", flexDirection: "column", justifyContent: "center", gap: "28px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SQ_ASSETS.logo} alt="SAMAQU" style={{ height: "20px", width: "auto", alignSelf: "flex-start", filter: "invert(1)" }} />

          <div
            className={s.tEyebrow}
            style={{ display: "flex", gap: "14px", alignItems: "center", fontSize: "12px", letterSpacing: "3px", fontWeight: 700, color: "var(--sq-faint)" }}
          >
            <span style={{ width: "32px", height: "1px", background: "var(--sq-faint-2)" }} />
            <span>MULAI DARI YANG BISA</span>
          </div>

          <h2
            className={s.tH2}
            style={{ margin: 0, fontFamily: "var(--sq-serif)", fontWeight: 500, fontSize: "clamp(40px, 4.6vw, 64px)", lineHeight: 1.04, letterSpacing: "-0.5px" }}
          >
            Bawa nilainya.
            <br />
            <em>Bagikan manfaatnya.</em>
          </h2>

          <p className={s.tBody} style={{ margin: 0, fontSize: "17px", lineHeight: 1.7, color: "var(--sq-faint)", maxWidth: "440px" }}>
            Thobe, kandora, dan koko yang dibuat dengan nilai Sama Quran, untuk menemani setiap
            perjalananmu.
          </p>

          <div className={`${s.btnRow} ${s.ctaBtns}`} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", maxWidth: "460px" }}>
            <Link
              href={katalog}
              style={{
                background: "var(--sq-cream)",
                color: "var(--sq-black)",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "15px",
                height: "56px",
                borderRadius: "999px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
              }}
            >
              Lihat Katalog
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <WaLink
              href={waHref}
              style={{
                color: "var(--sq-cream)",
                textDecoration: "none",
                fontWeight: 500,
                fontSize: "15px",
                height: "56px",
                borderRadius: "999px",
                border: "1px solid rgba(244,241,234,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.4A9 9 0 1 1 21 12z" />
              </svg>
              Chat Admin
            </WaLink>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px 22px",
              paddingTop: "22px",
              borderTop: "1px solid rgba(244,241,234,0.14)",
              fontSize: "13px",
              color: "var(--sq-faint)",
            }}
          >
            {["Garansi tukar ukuran", "Garansi uang kembali", "Kirim ke seluruh Indonesia"].map((label) => (
              <span key={label} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 12l5 5L19 7" />
                </svg>
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className={s.ctaMedia} style={{ position: "relative", minHeight: "520px", background: "var(--sq-cream)" }}>
          <LazyVideo
            src={SQ_ASSETS.stitchVideo}
            poster={SQ_ASSETS.stitchPoster}
            ariaLabel="Animasi benang menjahit thobe"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 40%",
              display: "block",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "20px",
              bottom: "20px",
              background: "rgba(11,11,11,0.82)",
              color: "var(--sq-cream)",
              fontSize: "12px",
              letterSpacing: "2px",
              padding: "8px 14px",
              borderRadius: "999px",
            }}
          >
            DARI NILAI KE SETIAP JAHITAN
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 10. FOOTER + STICKY CTA ── */
export function SiteFooter({ katalog, waHref }: { katalog: string; waHref: string | null }) {
  return (
    <>
      <footer style={{ borderTop: "1px solid var(--sq-line)", padding: "28px 20px 120px" }}>
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            fontSize: "14px",
            color: "var(--sq-muted)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SQ_ASSETS.logo} alt="SAMAQU" style={{ height: "16px", width: "auto" }} />
          <div>© 2026 Samaqu</div>
        </div>
      </footer>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(244,241,234,0.96)",
          borderTop: "1px solid var(--sq-line)",
          padding: "12px 16px",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          zIndex: 40,
        }}
      >
        <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", gap: "10px" }}>
          <Link
            href={katalog}
            style={{
              flex: "1 1 auto",
              background: "var(--sq-ink)",
              color: "var(--sq-cream)",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: "15px",
              padding: "15px 20px",
              borderRadius: "999px",
              textAlign: "center",
            }}
          >
            Lihat Katalog
          </Link>
          <WaLink
            href={waHref}
            ariaLabel="Chat WhatsApp"
            style={{
              flex: "0 0 52px",
              height: "52px",
              borderRadius: "999px",
              border: "1px solid var(--sq-ink)",
              color: "var(--sq-ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.4A9 9 0 1 1 21 12z" />
            </svg>
          </WaLink>
        </div>
      </div>
    </>
  );
}
