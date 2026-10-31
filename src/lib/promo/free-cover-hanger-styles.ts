/**
 * Gaya landing "Free Cover Hanger".
 *
 * Nilai (ukuran, spasi, radius, warna, gradasi animasi) diport langsung dari mockup
 * referensi di `public/promo/ini html yg bener/Main.dc.html` — jangan diubah tanpa
 * membandingkan tampilan dengan mockup. Semua selector diberi awalan `fch-` supaya
 * tidak bertabrakan dengan gaya global aplikasi.
 *
 * Breakpoint memakai `@container` pada `.fch-cq` (sama seperti referensi) agar
 * `clamp(…, 10cqw, …)` pada judul penutup tetap mengikuti lebar halaman.
 */

export const FREE_COVER_HANGER_CSS = `
.fch-root{font-family:'Instrument Sans',system-ui,sans-serif;color:#000000;background:#FFFFFF;width:100%;overflow-x:clip}
.fch-root a{color:#000000}
.fch-root a:hover{color:#3D3D3D}
.fch-root a:focus-visible,.fch-root button:focus-visible,.fch-root input:focus-visible{outline:3px solid #000000;outline-offset:3px}
.fch-cq{container-type:inline-size;container-name:fch;width:100%}
.fch-wrap{max-width:1240px;margin:0 auto;padding:0 28px;box-sizing:border-box}
.fch-disp{font-family:'Big Shoulders Display',Impact,sans-serif;text-transform:uppercase;letter-spacing:0.005em;line-height:0.88;margin:0}
.fch-hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,0.85fr);gap:56px;align-items:center}
.fch-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;align-items:center}
.fch-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.fch-coll{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);grid-template-rows:auto auto;gap:20px}
.fch-coll-big{grid-row:span 2}
.fch-coll-big-box{min-height:560px}
/* Judul hero & judul bagian memakai clamp(), bukan ukuran tetap.
   118px sebelumnya membuat headline meledak di desktop dan memakan layar.
   Batas bawah tetap tegas; batas atas 86/64px terbaca sebagai display tanpa
   mendominasi. Nilai di breakpoint mobile/tablet TIDAK berubah. */
.fch-h-hero{font-size:clamp(68px, 6.2vw, 86px)}
.fch-h-sec{font-size:clamp(44px, 4.4vw, 64px)}
.fch-sec{padding-top:120px;padding-bottom:120px}
.fch-only-m{display:none}
.fch-sticky-cta{display:none}
.fch-btn-ink{transition:background .2s ease,transform .2s ease}
.fch-btn-ink:hover{background:#2B2B2B;color:#FFFFFF;transform:translateY(-2px)}
.fch-btn-ink:active,.fch-btn-line:active,.fch-tap:active{transform:scale(0.97)}
.fch-btn-line{transition:background .2s ease,transform .15s ease}
.fch-btn-line:hover{background:#EEEDE8}

/* ── Baris CTA (hero & closing) ──
   Dirapikan jadi satu aturan supaya dua tombol selalu sejajar rapi dan tidak
   melebar sendiri-sendiri saat ruang sempit. Sebelumnya tombol memakai padding
   kiri-kanan berbeda dan flex-wrap tanpa penguncian lebar, sehingga di layar
   sedang salah satu tombol bisa turun sendirian dengan lebar aneh. */
.fch-cta-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.fch-cta-row>a{
  display:inline-flex;align-items:center;justify-content:center;
  white-space:nowrap;box-sizing:border-box;
  min-height:56px;padding:0 30px;border-radius:999px;
  font-size:17px;font-weight:600;line-height:1;
  transition:background .2s ease,transform .2s ease;
}
.fch-cta-row>a:hover{transform:translateY(-2px)}
.fch-cta-row>a:active{transform:scale(.97)}
.fch-tile-img{transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.fch-tile:hover .fch-tile-img{transform:scale(1.03)}

@keyframes fch-rise{from{transform:translateY(105%)}to{transform:translateY(0)}}
@keyframes fch-fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.fch-line{display:block;overflow:hidden;padding-bottom:4px}
.fch-line>span{display:block;animation:fch-rise .9s cubic-bezier(.2,.8,.2,1) both}
.fch-l2>span{animation-delay:.1s}.fch-l3>span{animation-delay:.2s}
.fch-fu{animation:fch-fadeUp .8s ease both;animation-delay:.5s}
.fch-fu2{animation:fch-fadeUp .8s ease both;animation-delay:.65s}
.fch-fu3{animation:fch-fadeUp .8s ease both;animation-delay:.8s}

@keyframes fch-sway{0%,100%{transform:rotate(0deg)}6%{transform:rotate(1.8deg)}12%{transform:rotate(-1.4deg)}18%{transform:rotate(0deg)}}
@keyframes fch-coverDrop{0%,18%{transform:translateY(-520px)}38%{transform:translateY(8px)}42%{transform:translateY(0)}86%{transform:translateY(0)}100%{transform:translateY(-520px)}}
@keyframes fch-zip{0%,42%{stroke-dashoffset:392}56%,86%{stroke-dashoffset:0}100%{stroke-dashoffset:392}}
@keyframes fch-stamp{0%,54%{transform:scale(0) rotate(-40deg);opacity:0}60%{transform:scale(1.18) rotate(-10deg);opacity:1}64%,84%{transform:scale(1) rotate(-12deg);opacity:1}90%,100%{transform:scale(.6) rotate(-12deg);opacity:0}}
@keyframes fch-dust{0%,18%{opacity:.9;transform:translateY(0)}36%,100%{opacity:0;transform:translateY(30px)}}
.fch-sway{transform-box:fill-box;transform-origin:50% 0%;animation:fch-sway 8s ease-in-out infinite}
.fch-cover{animation:fch-coverDrop 8s cubic-bezier(.65,0,.25,1) infinite}
.fch-zip{stroke-dasharray:392;animation:fch-zip 8s ease-in-out infinite}
.fch-stamp{transform-box:fill-box;transform-origin:50% 50%;animation:fch-stamp 8s ease-out infinite}
.fch-dust{animation:fch-dust 8s ease-out infinite}

@keyframes fch-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes fch-blink{0%,100%{opacity:1}50%{opacity:.25}}
.fch-qfill{transform-origin:left center;animation:fch-fill 1.6s cubic-bezier(.2,.8,.2,1) .9s both}
.fch-live{animation:fch-blink 1.6s ease-in-out infinite}
@keyframes fch-ring{0%{box-shadow:0 0 0 0 rgba(0,0,0,.35)}100%{box-shadow:0 0 0 18px rgba(0,0,0,0)}}
.fch-knob{animation:fch-ring 1.8s ease-out infinite}
@keyframes fch-slideIn{from{transform:translateY(100%)}to{transform:translateY(0)}}

/* Scroll reveal — baseline SAMA dengan isi blok @supports di bawah: elemen mulai
   transparan, lalu kelas fch-in mengembalikannya. Aturan .fch-in sengaja di luar
   @supports supaya pemicu scroll tetap bekerja di browser tanpa scroll-timeline. */
@keyframes fch-in{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
.fch-rv{opacity:0}
.fch-rv.fch-in{opacity:1;animation:fch-in .7s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--fch-in-delay,0s)}

@supports (animation-timeline: view()){
@keyframes fch-reveal{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
.fch-rv{animation:fch-reveal linear both;animation-timeline:view();animation-range:entry 0% cover 28%}
}

/* tablet */
@container fch (max-width:900px){
.fch-hero,.fch-two{grid-template-columns:minmax(0,1fr) !important;gap:40px !important}
.fch-steps{grid-template-columns:minmax(0,1fr) !important}
/* Tangga ukuran 640 → 60px, 900 → 68px, desktop clamp (68–86px) tetap mulus.
   Sebelumnya 900px melompat ke 84px lalu turun tajam ke 60px di 640px. */
.fch-h-hero{font-size:68px}
.fch-h-sec{font-size:52px}
.fch-sec{padding-top:88px;padding-bottom:88px}
.fch-hide-m{display:none !important}
.fch-wrap{padding-left:32px;padding-right:32px}
}

/* phone: app-like */
@container fch (max-width:640px){
.fch-wrap{padding-left:24px;padding-right:24px}
.fch-h-hero{font-size:60px}
.fch-h-sec{font-size:46px;line-height:.95 !important;margin-bottom:4px}
.fch-sec{padding-top:72px;padding-bottom:72px}
.fch-only-m{display:block}
.fch-nav{height:60px !important}
.fch-nav-logo{font-size:26px !important}
.fch-nav-btn{height:40px !important;padding:0 16px !important;font-size:14px !important}
.fch-hero-pad{padding-top:28px !important;padding-bottom:40px !important}
.fch-hero-copy{gap:22px !important}
.fch-hero-sub{font-size:17px !important}
.fch-stage{max-width:340px !important}
/* Dua tombol jadi setumpuk penuh-lebar di HP: lebih mudah dijangkau jempol dan
   tidak ada tombol yang melebar setengah. min-height 52px = target sentuh nyaman. */
.fch-cta-row{flex-direction:column;align-items:stretch;width:100%}
.fch-cta-row>a{width:100%;min-height:52px;font-size:16px;padding:0 20px;}
.fch-quota{padding:16px 18px !important;border-radius:20px !important}
.fch-sheet{border-radius:28px 28px 0 0;margin-top:-28px;position:relative}
.fch-sheet-gap{padding-bottom:28px}
.fch-vid{max-width:300px !important}
.fch-ba{border-radius:22px !important}
.fch-step{flex-direction:row !important;align-items:center !important;gap:18px !important;padding:22px 0 !important;border-left:none !important;border-top:1.5px solid #000000}
.fch-step:first-child{border-top:none}
.fch-step-n{font-size:72px !important;width:52px;flex-shrink:0;text-align:center}
.fch-step-t{font-size:19px !important}
.fch-coll{display:flex !important;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-left:24px;gap:14px !important;margin:0 -24px;padding:0 24px 6px;scrollbar-width:none}
.fch-coll::-webkit-scrollbar{display:none}
.fch-coll>a{flex:0 0 80%;scroll-snap-align:start}
.fch-coll-big-box{min-height:0 !important;aspect-ratio:4 / 5}
.fch-tile-box{aspect-ratio:4 / 5 !important}
.fch-tile-name{font-size:38px !important}
.fch-tile-pill{display:none !important}
.fch-tag{transform:none !important}
.fch-faq-q{font-size:16px !important;padding:20px 0 !important}
.fch-faq-a{padding:0 0 22px 0 !important;font-size:15px !important}
.fch-sticky-cta{display:flex;position:sticky;bottom:0;z-index:30;animation:fch-slideIn .5s ease 1.2s both}
.fch-footer-pad{padding-bottom:28px !important}
}
@media (prefers-reduced-motion:reduce){
.fch-root *,.fch-root *::before,.fch-root *::after{animation:none !important;transition:none !important}
}
`;
