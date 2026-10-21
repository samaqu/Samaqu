import type { BioPageContent } from "@/lib/bio-page-content";
import BioLinkEffects from "@/components/BioLinkEffects";
import BioOpenOrderBanner, { type BioOpenOrderPhase } from "@/components/BioOpenOrderBanner";

const ICON_PATHS: Record<string, string[]> = {
  ruler: [
    "M3 16.5L16.5 3 21 7.5 7.5 21z",
    "M7 12.5l1.5 1.5M9.5 10l2 2M12 7.5l1.5 1.5M14.5 5l2 2",
  ],
  link: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
  shield: ["M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6zM9 12l2 2 4-4"],
  refund: [
    "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 8v8M14.5 9.5h-3.2a1.5 1.5 0 0 0 0 3h1.4a1.5 1.5 0 0 1 0 3H9.5",
  ],
  exchange: ["M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13"],
  chat: [
    "M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.7A8 8 0 1 1 21 12zM9 11h.01M12 11h.01M15 11h.01",
  ],
  whatsapp: [
    "M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z",
    "M9 8.8c0 3.3 2.9 6.2 6.2 6.2l1.3-1.6-2-1-1 .8a4.4 4.4 0 0 1-2.4-2.4l.8-1-1-2z",
  ],
};

const WHATSAPP_FILLED =
  "M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.24 9.43-9.44 9.43m8.03-17.46A11.27 11.27 0 0 0 12.05.72C5.8.72.7 5.8.7 12.07c0 2 .52 3.95 1.52 5.67L.6 23.6l6-1.57a11.3 11.3 0 0 0 5.43 1.38h.01c6.25 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.32-8.02";

function Icon({
  name,
  size,
  filled = false,
}: {
  name: string;
  size?: number;
  filled?: boolean;
}) {
  const style = size ? { width: size, height: size } : undefined;

  if (name === "globe" || name === "website") {
    return (
      <svg viewBox="0 0 24 24" style={style}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    );
  }
  if (name === "instagram") {
    return (
      <svg viewBox="0 0 24 24" style={style}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r=".6" fill="currentColor" />
      </svg>
    );
  }
  if (name === "whatsapp" && filled) {
    return (
      <svg viewBox="0 0 24 24" className="bio-fill" style={style}>
        <path d={WHATSAPP_FILLED} />
      </svg>
    );
  }

  const paths = ICON_PATHS[name] ?? ICON_PATHS.link;
  return (
    <svg viewBox="0 0 24 24" style={style}>
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/**
 * Poster dari video Cloudinary: ganti ekstensi video → .jpg (frame pertama).
 * URL non-Cloudinary memakai foto hero sebagai fallback latar blur.
 */
function videoPosterUrl(videoUrl: string, fallback: string): string {
  const url = String(videoUrl || "").trim();
  if (!url) return fallback;
  if (url.includes("res.cloudinary.com") && url.includes("/video/upload/")) {
    return url.replace(/\.(mp4|webm|m4v|mov)(\?.*)?$/i, ".jpg");
  }
  return fallback;
}

/**
 * Varian 720p untuk layar kecil (hemat bandwidth di HP). Hanya untuk URL
 * Cloudinary; URL lain dikembalikan apa adanya.
 */
function videoMobileUrl(videoUrl: string): string {
  const url = String(videoUrl || "").trim();
  if (!url) return "";
  if (url.includes("res.cloudinary.com") && url.includes("/video/upload/")) {
    return url.replace("/video/upload/", "/video/upload/w_720,q_auto:eco/");
  }
  return url;
}

function ArrowUpRight({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      <path d="M7 17L17 7M8 7h9v9" />
    </svg>
  );
}

export default function BioLinkPage({
  content,
  openOrder,
}: {
  content: BioPageContent;
  /**
   * Jendela Open Order — dibaca dari server. Kalau `null`, tidak ada event yang sedang
   * berjalan/p upcoming, jadi bar pengumuman nggak dirender sama sekali.
   */
  openOrder?: { phase: BioOpenOrderPhase; target: number; href: string } | null;
}) {
  const { logo_url, eyebrow, description, hero, categories, belanja, rows, guarantee, socials, footer, marquee } = content;
  const hasVideo = Boolean(hero.video_url?.trim());
  const videoPoster = videoPosterUrl(hero.video_url, hero.image_url);
  const mobileVideo = hasVideo ? videoMobileUrl(hero.video_url) : "";
  const waItem = belanja.items.find((item) => item.icon === "whatsapp");

  return (
    <>
      <main
        className="bio-root relative min-h-screen"
        style={{
          fontFamily: "var(--font-plus-jakarta), system-ui, sans-serif",
          color: "#0B0B0B",
          background:
            "radial-gradient(70% 45% at 50% 0%, #fff 0%, rgba(255,255,255,0) 70%), linear-gradient(#EDEDEA,#E4E4E0)",
        }}
      >
        <div className="bio-dots pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

        <div className="relative mx-auto max-w-md px-5 pt-6 pb-[110px]">
          <header className="bio-up text-center">
            <img
              src={logo_url}
              alt="SAMAQU"
              className="bio-float mx-auto mt-2 mb-3 w-48 h-auto object-contain"
            />
            <p className="text-[11px] font-bold uppercase tracking-[.35em] text-black/45">
              {eyebrow}
            </p>
            <p className="mt-2 text-sm leading-snug text-black/65">{description}</p>
          </header>

          {/* Pengumuman Open Order — hanya muncul kalau memang ada event (dibaca server). */}
          {openOrder && (
            <div className="rv mt-5">
              <BioOpenOrderBanner
                phase={openOrder.phase}
                target={openOrder.target}
                href={openOrder.href}
              />
            </div>
          )}

          {/* Hero — Best seller */}
          <div id="bio-hero" className="rv relative mt-5">
            <a
              href={hero.href}
              className="tilt group relative block aspect-[4/5] overflow-hidden rounded-[28px] bg-[#0B0B0B] text-white shadow-[0_24px_50px_-24px_rgba(0,0,0,.6)]"
            >
              {hasVideo ? (
                <video
                  id="bio-reel"
                  className="bio-kb h-full w-full object-cover"
                  style={{ objectPosition: "50% 12%" }}
                  poster={videoPoster || undefined}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  aria-hidden="true"
                >
                  {mobileVideo && mobileVideo !== hero.video_url ? (
                    <>
                      <source src={mobileVideo} media="(max-width: 640px)" type="video/mp4" />
                      <source src={hero.video_url} type="video/mp4" />
                    </>
                  ) : (
                    <source src={hero.video_url} type="video/mp4" />
                  )}
                </video>
              ) : (
                <img
                  src={hero.image_url}
                  alt={hero.title}
                  className="bio-kb h-full w-full object-cover object-top transition duration-700 group-hover:scale-105"
                />
              )}
              <div
                className="absolute inset-0 z-20"
                style={{
                  background:
                    "linear-gradient(to top, #000 0%, rgba(0,0,0,.3) 50%, transparent 100%)",
                }}
              />
              {hero.badge && (
                <span className="absolute left-5 top-5 z-20 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold tracking-[.2em] text-black backdrop-blur">
                  <span className="bio-live-dot" />
                  {hero.badge}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 z-20 p-6">
                <p className="text-[40px] font-extrabold leading-[.95] tracking-[-.04em]">
                  {hero.title}
                  <br />
                  <span className="text-white/55">{hero.title_accent}</span>
                </p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[.2em] text-white/50">
                      {hero.price_label}
                    </p>
                    <p className="text-xl font-bold">{hero.price}</p>
                  </div>
                  <span className="bio-shop inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-black">
                    {hero.cta} <ArrowUpRight />
                  </span>
                </div>
              </div>
            </a>

            {hasVideo && (
              <>
                <button
                  type="button"
                  id="bio-sound"
                  className="bio-vidbtn"
                  aria-label="Aktifkan suara video"
                  aria-pressed="false"
                >
                  <svg viewBox="0 0 24 24" className="bio-ico-muted">
                    <path d="M11 5 6.5 8.8H3v6.4h3.5L11 19z" />
                    <path d="M16 9.5l4.5 5M20.5 9.5l-4.5 5" />
                  </svg>
                  <svg viewBox="0 0 24 24" className="bio-ico-sound" style={{ display: "none" }}>
                    <path d="M11 5 6.5 8.8H3v6.4h3.5L11 19z" />
                    <path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18.4 6a8.5 8.5 0 0 1 0 12" />
                  </svg>
                </button>
                <div className="bio-pbar" aria-hidden="true">
                  <i id="bio-pfill" />
                </div>
              </>
            )}
          </div>

          {/* Kategori */}
          <section className="rv mt-8">
            <div className="flex items-end justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[.3em] text-black/45">
                {categories.heading}
              </p>
              {categories.link_label && (
                <a
                  href={categories.link_href}
                  className="text-xs font-semibold underline underline-offset-4"
                >
                  {categories.link_label}
                </a>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {categories.items.map((cat, i) => (
                <a
                  key={`${cat.label}-${i}`}
                  href={cat.href}
                  className="rv group relative block aspect-square overflow-hidden rounded-2xl bg-white"
                >
                  <img
                    src={cat.image_url}
                    alt={cat.label}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                    style={{ objectPosition: cat.position || "50% 50%" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute inset-x-3 bottom-3 flex items-center justify-between text-white">
                    <span className="font-bold">{cat.label}</span>
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 backdrop-blur">
                      <ArrowUpRight />
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </section>

          {/* Belanja */}
          <p className="mt-8 text-[11px] font-bold uppercase tracking-[.3em] text-black/45">
            {belanja.heading}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {belanja.items.map((item, i) => (
              <a
                key={`${item.label}-${i}`}
                href={item.href}
                className={`rv bio-tilt-btn flex min-h-[132px] flex-col justify-between gap-4 rounded-2xl p-4 font-semibold transition hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,.5)] ${
                  item.icon === "whatsapp" ? "bg-[#0B0B0B] text-white" : "bg-white"
                }`}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-xl ${
                      item.icon === "whatsapp" ? "bg-white/10 bio-pulse-wa" : "bg-black/5"
                    }`}
                  >
                    <Icon name={item.icon} />
                  </span>
                  <span className="opacity-60">
                    <ArrowUpRight />
                  </span>
                </div>
                <span className="leading-tight text-[15px]">
                  {item.label}
                  {item.subtitle && (
                    <span className="mt-1 block text-xs font-normal opacity-60">
                      {item.subtitle}
                    </span>
                  )}
                </span>
              </a>
            ))}
          </div>

          {/* Baris link */}
          <nav className="mt-2.5 space-y-2.5">
            {rows.map((row, i) => (
              <a
                key={`${row.label}-${i}`}
                href={row.href}
                className="rv bio-row flex items-center gap-4 rounded-2xl bg-white p-2.5 pr-3 font-semibold"
              >
                <span className="bio-ic grid h-12 w-12 place-items-center rounded-xl bg-black/5 transition-colors">
                  <Icon name={row.icon} />
                </span>
                <span className="flex-1 leading-tight">
                  {row.label}
                  {row.subtitle && (
                    <span className="mt-0.5 block text-xs font-normal opacity-55">
                      {row.subtitle}
                    </span>
                  )}
                </span>
                <span className="bio-ar grid h-9 w-9 place-items-center rounded-full bg-black/5">
                  <ArrowUpRight />
                </span>
              </a>
            ))}
          </nav>

          {/* Garansi */}
          {guarantee.items.length > 0 && (
            <section className="rv mt-8 rounded-[24px] border border-white bg-white/60 p-5 backdrop-blur">
              <p className="text-[11px] font-bold uppercase tracking-[.3em] text-black/40">
                {guarantee.heading}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                {guarantee.items.map((item, i) => (
                  <div key={`${item.title}-${i}`} className="flex gap-3">
                    <Icon name={item.icon} />
                    <div>
                      <p className="font-bold leading-tight">{item.title}</p>
                      <p className="text-xs text-black/50">{item.subtitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Social */}
          {socials.length > 0 && (
            <div className="mt-8 flex justify-center gap-3">
              {socials.map((social, i) => (
                <a
                  key={`${social.platform}-${i}`}
                  href={social.href}
                  aria-label={social.platform}
                  className="grid h-11 w-11 place-items-center rounded-full bg-white transition hover:bg-black hover:text-white"
                >
                  <Icon
                    name={social.platform}
                    filled={social.platform === "whatsapp"}
                    size={social.platform === "whatsapp" ? 20 : 18}
                  />
                </a>
              ))}
            </div>
          )}

          <p className="mt-6 text-center text-[11px] tracking-[.25em] text-black/35">
            {footer}
          </p>
        </div>

        {/* CTA mengambang — muncul setelah hero ter-scroll (dikontrol di BioLinkEffects) */}
        {waItem && (
          <div className="bio-cta" id="bio-cta">
            <a href={waItem.href}>
              <span className="bio-cta-wa">
                <Icon name="whatsapp" filled size={19} />
              </span>
              <span className="bio-cta-label">
                {waItem.label}
                {waItem.subtitle && <span className="bio-cta-sub">{waItem.subtitle}</span>}
              </span>
              <span className="bio-cta-chev">
                <ArrowUpRight size={15} />
              </span>
            </a>
          </div>
        )}
      </main>

      {/* Marquee */}
      {marquee.length > 0 && (
        <div
          data-bio-end
          className="overflow-hidden bg-[#0B0B0B] py-2.5 text-[11px] font-bold tracking-[.25em] text-white"
        >
          <div className="bio-mq flex w-max gap-10 whitespace-nowrap">
            {[0, 1, 2, 3].map((copy) => (
              <span key={copy} className="flex gap-10">
                {marquee.map((item, i) => (
                  <span key={i}>{item}</span>
                ))}
              </span>
            ))}
          </div>
        </div>
      )}

      <BioLinkEffects />
      <noscript>
        <style>{`.bio-root .rv { opacity: 1; transform: none; }`}</style>
      </noscript>

      <style>{`
        .bio-root svg { width: 22px; height: 22px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
        .bio-root .bio-fill { fill: currentColor; stroke: none; }
        .bio-dots { background-image: radial-gradient(rgba(0,0,0,.08) 1px, transparent 1px); background-size: 18px 18px; -webkit-mask-image: linear-gradient(#000, transparent 60%); mask-image: linear-gradient(#000, transparent 60%); }
        .bio-up { opacity: 0; transform: translateY(14px); animation: bio-up .7s cubic-bezier(.2,.8,.2,1) forwards; }
        @keyframes bio-up { to { opacity: 1; transform: none; } }
        .bio-float { animation: bio-fl 5s ease-in-out infinite; }
        @keyframes bio-fl { 50% { transform: translateY(-6px); } }
        .bio-kb { animation: bio-kb 14s ease-in-out infinite alternate; }
        @keyframes bio-kb { to { transform: scale(1.08) translateY(-2%); } }
        .bio-live-dot { display: inline-block; width: 6px; height: 6px; margin-right: 7px; border-radius: 999px; background: #0B0B0B; vertical-align: middle; animation: bio-blink 1.6s ease-in-out infinite; }
        @keyframes bio-blink { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .25; transform: scale(.7); } }
        .bio-vidbtn { position: absolute; right: 14px; top: 14px; z-index: 30; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 999px; background: rgba(0,0,0,.42); color: #fff; border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); cursor: pointer; transition: transform .25s cubic-bezier(.2,.8,.2,1), background .25s; }
        .bio-vidbtn:hover { transform: scale(1.08); background: rgba(0,0,0,.66); }
        .bio-vidbtn:active { transform: scale(.94); }
        .bio-vidbtn svg { width: 18px; height: 18px; stroke-width: 2; }
        .bio-pbar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; height: 3px; background: rgba(255,255,255,.28); pointer-events: none; }
        .bio-pbar i { display: block; height: 100%; width: 0%; background: #fff; transition: width .25s linear; }
        .bio-shop { transition: background .25s, color .25s; }
        .bio-shop:hover { background: #0B0B0B; color: #fff; }
        .bio-shop svg { transition: transform .25s; }
        .bio-shop:hover svg { transform: translate(2px, -2px); }
        .bio-cta { position: fixed; z-index: 60; left: 16px; right: 16px; bottom: 14px; margin: 0 auto; max-width: 416px; transform: translateY(160%); opacity: 0; pointer-events: none; transition: transform .5s cubic-bezier(.2,.8,.2,1), opacity .35s ease; }
        .bio-cta.on { transform: translateY(0); opacity: 1; pointer-events: auto; }
        .bio-cta a { display: flex; align-items: center; gap: 8px; border-radius: 999px; background: #0B0B0B; color: #fff; padding: 10px 12px 10px 10px; box-shadow: 0 20px 44px -16px rgba(0,0,0,.6); transition: transform .25s cubic-bezier(.2,.8,.2,1); }
        .bio-cta a:hover { transform: translateY(-2px); }
        .bio-cta-wa { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 999px; background: #25D366; color: #fff; flex: none; }
        .bio-cta-wa svg { width: 19px; height: 19px; }
        .bio-cta-label { flex: 1; padding-left: 2px; font-size: 14px; font-weight: 700; line-height: 1.15; }
        .bio-cta-sub { display: block; font-size: 11px; font-weight: 500; opacity: .55; }
        .bio-cta-chev { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; background: #fff; color: #0B0B0B; flex: none; }
        .bio-cta-chev svg { width: 15px; height: 15px; }
        .bio-pulse-wa { animation: bio-pw 2.4s infinite; }
        @keyframes bio-pw { 0% { box-shadow: 0 0 0 0 rgba(37,211,102,.5); } 70% { box-shadow: 0 0 0 14px rgba(37,211,102,0); } 100% { box-shadow: 0 0 0 0 rgba(37,211,102,0); } }
        .bio-row { transition: transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s, background .25s, color .25s; }
        .bio-row:hover { transform: translateY(-3px); background: #0B0B0B; color: #fff; box-shadow: 0 18px 40px -18px rgba(0,0,0,.55); }
        .bio-row:hover .bio-ic { background: #fff; color: #0B0B0B; }
        .bio-row:hover .bio-ar { transform: translate(3px,-3px); background: #fff; color: #0B0B0B; }
        .bio-ar { transition: transform .25s; }
        /* ── Bar pengumuman Open Order (halaman bio) ──
           Satu-satunya elemen "live" di halaman ini: titik amber berdenyut + angka detik
           yang berdetak + satu sapuan shimmer lambat. Akson amber dipakai supaya bedanya
           jelas dari hijau WhatsApp di CTA mengambang. */
        .bio-oo { box-shadow: 0 22px 46px -24px rgba(0,0,0,.6); transition: transform .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s; }
        .bio-oo:hover { transform: translateY(-3px); box-shadow: 0 30px 58px -22px rgba(0,0,0,.65); }
        .bio-oo-dot { width: 10px; height: 10px; border-radius: 999px; background: #F5A524; animation: bio-oo-blink 1.8s ease-in-out infinite; }
        @keyframes bio-oo-blink { 0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(245,165,36,.5); } 50% { opacity: .55; transform: scale(.82); box-shadow: 0 0 0 7px rgba(245,165,36,0); } }
        .bio-oo-dot-live { background: #34D399; animation-name: bio-oo-blink-live; }
        @keyframes bio-oo-blink-live { 0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(52,211,153,.5); } 50% { opacity: .55; transform: scale(.82); box-shadow: 0 0 0 7px rgba(52,211,153,0); } }
        .bio-oo-box { display: inline-block; min-width: 1.9ch; padding: 4px 5px; border-radius: 8px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.14); font-size: 11px; font-weight: 800; line-height: 1; text-align: center; font-variant-numeric: tabular-nums; }
        @media (min-width: 640px) { .bio-oo-box { min-width: 2.1ch; padding: 5px 6px; border-radius: 9px; font-size: 12px; } }
        .bio-oo-sweep { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(105deg, transparent 38%, rgba(245,165,36,.16) 50%, transparent 62%); transform: translateX(-100%); animation: bio-oo-sw 7s ease-in-out infinite; }
        @keyframes bio-oo-sw { 0% { transform: translateX(-100%); } 55%, 100% { transform: translateX(100%); } }
        .bio-oo-arrow { transition: transform .25s cubic-bezier(.2,.8,.2,1); }
        .bio-oo:hover .bio-oo-arrow { transform: translate(2px, -2px); }
        .rv { opacity: 0; transform: translateY(28px) scale(.98); transition: opacity .8s cubic-bezier(.2,.8,.2,1), transform .8s cubic-bezier(.2,.8,.2,1); will-change: transform, opacity; }
        .rv.in { opacity: 1; transform: none; }
        /* Bar pengumuman Open Order: masuk dengan reveal yang sama seperti section lain. */
        .tilt { transition: transform .3s; }
        .bio-mq { animation: bio-mq 24s linear infinite; }
        @keyframes bio-mq { to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .bio-root *, .bio-mq, .bio-oo * { animation: none !important; transition: none !important; } .bio-up, .rv { opacity: 1; transform: none; } .bio-cta { transition: none; } .bio-oo-sweep { display: none; } }
      `}</style>
    </>
  );
}
