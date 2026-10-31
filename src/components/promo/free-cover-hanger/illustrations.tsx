/**
 * Ilustrasi SVG landing Free Cover Hanger.
 *
 * Semua path, warna, dan atribut diambil apa adanya dari mockup referensi
 * (`public/promo/ini html yg bener/Main.dc.html`). Animasi digerakkan oleh kelas
 * `fch-*` di `free-cover-hanger-styles.ts`; saat `prefers-reduced-motion` aktif semua
 * animasi dimatikan oleh CSS, jadi SVG tetap menampilkan kondisi akhir.
 */

/** Animasi utama hero: thobe bergoyang, Cover Hanger turun menutup, resleting tertutup, stempel muncul. */
export function HeroStageSvg() {
  return (
    <svg
      viewBox="0 0 400 520"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      role="img"
      aria-label="Animasi Cover Hanger SAMAQU menutup thobe, lalu stempel gratis muncul"
    >
      <g className="fch-sway">
        <path d="M200 46 q0 -16 14 -16 q14 0 14 14 q0 11 -14 16 L200 82" fill="none" stroke="#000000" strokeWidth="5" strokeLinecap="round" />
        <path d="M118 122 L200 80 L282 122" fill="none" stroke="#000000" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M150 114 L250 114 L312 172 L292 198 L272 184 L282 482 L118 482 L128 184 L108 198 L88 172 Z" fill="#FFFFFF" stroke="#000000" strokeWidth="4" strokeLinejoin="round" />
        <path d="M178 114 Q200 146 222 114" fill="none" stroke="#000000" strokeWidth="4" strokeLinecap="round" />
        <path d="M200 134 L200 240" stroke="#000000" strokeWidth="3" />
        <circle cx="208" cy="156" r="3" fill="#000000" />
        <circle cx="208" cy="184" r="3" fill="#000000" />
        <circle cx="208" cy="212" r="3" fill="#000000" />
        <g className="fch-dust">
          <circle cx="96" cy="250" r="3" fill="#8A8A85" />
          <circle cx="312" cy="300" r="2.5" fill="#8A8A85" />
          <circle cx="150" cy="340" r="2.5" fill="#8A8A85" />
          <circle cx="262" cy="230" r="3" fill="#8A8A85" />
          <circle cx="300" cy="420" r="3" fill="#8A8A85" />
          <circle cx="84" cy="400" r="2.5" fill="#8A8A85" />
        </g>
      </g>
      <g className="fch-cover">
        <rect x="76" y="98" width="248" height="398" rx="22" fill="#000000" />
        <path d="M200 102 L200 492" className="fch-zip" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="392" strokeLinecap="round" />
        <rect x="194" y="104" width="12" height="18" rx="3" fill="#FFFFFF" />
        <text x="200" y="330" textAnchor="middle" fontFamily="'Big Shoulders Display', Impact, sans-serif" fontWeight="900" fontSize="38" letterSpacing="6" fill="#FFFFFF">SAMAQU</text>
        <text x="200" y="356" textAnchor="middle" fontFamily="'Instrument Sans', sans-serif" fontWeight="500" fontSize="13" letterSpacing="2" fill="#BDBDB8">COVER HANGER</text>
      </g>
      <path d="M200 46 q0 -16 14 -16 q14 0 14 14 q0 11 -14 16 L200 82" fill="none" stroke="#000000" strokeWidth="5" strokeLinecap="round" />
      <g className="fch-stamp">
        <circle cx="318" cy="172" r="56" fill="#FFFFFF" stroke="#000000" strokeWidth="3" />
        <circle cx="318" cy="172" r="48" fill="none" stroke="#000000" strokeWidth="1.5" strokeDasharray="3 4" />
        <text x="318" y="170" textAnchor="middle" fontFamily="'Big Shoulders Display', Impact, sans-serif" fontWeight="900" fontSize="30" fill="#000000">GRATIS</text>
        <text x="318" y="192" textAnchor="middle" fontFamily="'Instrument Sans', sans-serif" fontWeight="700" fontSize="14" fill="#000000">Rp35.000</text>
      </g>
    </svg>
  );
}

/** Ilustrasi "sesudah": thobe tersimpan di dalam Cover Hanger. */
export function AfterIllustrationSvg() {
  return (
    <svg viewBox="0 0 240 320" style={{ width: "72%", height: "auto" }} role="img" aria-label="Thobe tersimpan rapi di dalam Cover Hanger SAMAQU">
      <ellipse cx="120" cy="314" rx="70" ry="5" fill="#000000" opacity="0.08" />
      <rect x="40" y="12" width="160" height="7" rx="3.5" fill="#000000" />
      <path d="M120 19 q-11 0 -11 10 q0 9 11 10 L120 52" fill="none" stroke="#000000" strokeWidth="3" strokeLinecap="round" />
      <path d="M120 50 L188 82 Q194 85 194 93 L194 298 Q194 308 184 308 L56 308 Q46 308 46 298 L46 93 Q46 85 52 82 Z" fill="#000000" />
      <path d="M120 50 L188 82 Q194 85 194 93 L194 120 L46 120 L46 93 Q46 85 52 82 Z" fill="#FFFFFF" opacity="0.06" />
      <rect x="80" y="92" width="80" height="66" rx="10" fill="#EEEDE8" />
      <path d="M90 158 L94 112 L112 104 L128 104 L146 112 L150 158 Z" fill="#FFFFFF" stroke="#000000" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M110 104 Q120 120 130 104" fill="none" stroke="#000000" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M120 114 L120 158" stroke="#000000" strokeWidth="1.2" />
      <circle cx="124" cy="124" r="1.6" fill="#000000" />
      <circle cx="124" cy="136" r="1.6" fill="#000000" />
      <circle cx="124" cy="148" r="1.6" fill="#000000" />
      <rect x="80" y="92" width="80" height="66" rx="10" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.5" />
      <path d="M120 166 L120 300" stroke="#FFFFFF" strokeWidth="1.6" strokeDasharray="2 3" />
      <rect x="115.5" y="164" width="9" height="14" rx="2.5" fill="#FFFFFF" />
      <text x="120" y="236" textAnchor="middle" fontFamily="'Big Shoulders Display', Impact, sans-serif" fontSize="26" fontWeight="900" fill="#FFFFFF" letterSpacing="4">SAMAQU</text>
      <text x="120" y="252" textAnchor="middle" fontFamily="'Instrument Sans', sans-serif" fontSize="8" fontWeight="600" fill="#BDBDB8" letterSpacing="2.5">COVER HANGER</text>
      <path d="M60 130 L60 290" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.08" />
    </svg>
  );
}

/** Ilustrasi "sebelum": thobe digantung asal, kusut, bahu melar, berdebu. */
export function BeforeIllustrationSvg() {
  return (
    <svg viewBox="0 0 240 320" style={{ width: "72%", height: "auto" }} role="img" aria-label="Thobe digantung asal, kusut, bahu melar, dan berdebu">
      <ellipse cx="120" cy="314" rx="64" ry="5" fill="#000000" opacity="0.08" />
      <rect x="40" y="12" width="160" height="7" rx="3.5" fill="#3D3D3D" />
      <g transform="rotate(7 120 20)">
        <path d="M120 19 q-11 0 -11 10 q0 9 11 10 L120 50" fill="none" stroke="#3D3D3D" strokeWidth="2" strokeLinecap="round" />
        <path d="M62 76 L120 50 L178 76" fill="none" stroke="#3D3D3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M98 62 L142 62 L186 92 Q190 95 188 100 L176 124 L166 118 L172 302 L68 300 L74 118 L64 124 L52 100 Q50 95 54 90 L66 84 Q58 74 70 70 Z" fill="#B3B2AC" stroke="#3D3D3D" strokeWidth="2" strokeLinejoin="round" />
        <path d="M106 62 Q120 80 134 62" fill="none" stroke="#3D3D3D" strokeWidth="2" strokeLinecap="round" />
        <path d="M120 74 L121 150" stroke="#3D3D3D" strokeWidth="1.5" />
        <circle cx="125" cy="88" r="1.8" fill="#3D3D3D" />
        <circle cx="126" cy="104" r="1.8" fill="#3D3D3D" />
        <circle cx="126" cy="120" r="1.8" fill="#3D3D3D" />
        <path d="M66 84 q6 4 10 -2" fill="none" stroke="#3D3D3D" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M84 132 q8 7 18 0 q6 -5 12 1" fill="none" stroke="#5E5D58" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M128 168 q10 9 22 -1" fill="none" stroke="#5E5D58" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M82 196 q12 6 22 -3 q6 -4 14 2" fill="none" stroke="#5E5D58" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M130 232 q8 8 20 0" fill="none" stroke="#5E5D58" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M88 262 q10 6 18 -2" fill="none" stroke="#5E5D58" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M96 150 L92 290 M146 150 L150 288" stroke="#5E5D58" strokeWidth="1" opacity="0.5" />
        <ellipse cx="146" cy="96" rx="14" ry="9" fill="#8A8A85" opacity="0.35" />
        <ellipse cx="100" cy="226" rx="12" ry="8" fill="#8A8A85" opacity="0.3" />
      </g>
      <circle cx="40" cy="70" r="2.4" fill="#5E5D58" />
      <circle cx="206" cy="58" r="1.8" fill="#5E5D58" />
      <circle cx="30" cy="160" r="2.2" fill="#5E5D58" />
      <circle cx="212" cy="196" r="2" fill="#5E5D58" />
      <circle cx="198" cy="132" r="1.6" fill="#5E5D58" />
      <circle cx="44" cy="262" r="2.4" fill="#5E5D58" />
      <circle cx="206" cy="276" r="1.8" fill="#5E5D58" />
      <circle cx="58" cy="210" r="1.4" fill="#5E5D58" />
      <path d="M150 40 l6 2 M36 112 l5 -3 M214 240 l-5 3" stroke="#5E5D58" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
