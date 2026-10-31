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
.fch-hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,0.9fr);gap:48px;align-items:center}
.fch-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;align-items:center}
.fch-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.fch-coll{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);grid-template-rows:auto auto;gap:20px}
.fch-coll-big{grid-row:span 2}
.fch-coll-big-box{min-height:560px}
.fch-h-hero{font-size:118px}
.fch-h-sec{font-size:76px}
.fch-sec{padding-top:120px;padding-bottom:120px}
.fch-only-m{display:none}
.fch-sticky-cta{display:none}
.fch-btn-ink{transition:background .2s ease,transform .2s ease}
.fch-btn-ink:hover{background:#2B2B2B;color:#FFFFFF;transform:translateY(-2px)}
.fch-btn-ink:active,.fch-btn-line:active,.fch-tap:active{transform:scale(0.97)}
.fch-btn-line{transition:background .2s ease,transform .15s ease}
.fch-btn-line:hover{background:#EEEDE8}
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

/* ── Halaman pesan (/promo/free-cover-hanger/pesan) ──
   Katalog langkah 1 memakai token mockup: garis hitam 1.5px, radius besar, pil hitam,
   judul Display. Hanya berlaku di alur pesan, landing tidak terpengaruh. */
.fch-order{border-bottom:1.5px solid #000000;background:#FFFFFF}
.fch-order-wrap{max-width:1240px;margin:0 auto;padding:0 24px;box-sizing:border-box}
.fch-order-log{font-family:var(--font-big-shoulders),Impact,sans-serif;font-size:28px;letter-spacing:.14em;line-height:1;text-transform:uppercase}
.fch-order-head{display:flex;align-items:center;justify-content:space-between;height:68px;gap:16px}
.fch-order-step{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;letter-spacing:.02em}
.fch-order-track{height:2px;background:#D6D5CF;overflow:hidden}
.fch-order-track>span{display:block;height:100%;background:#000000;transition:width .6s cubic-bezier(.2,.8,.2,1)}
.fch-hero-2{padding-top:44px;padding-bottom:36px;border-bottom:1.5px solid #000000}
.fch-eyebrow{font-size:11px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:#3D3D3D;margin:0 0 14px}
.fch-title-xl{font-size:76px;font-weight:900;margin:0}
.fch-lead{margin:16px 0 0;font-size:17px;line-height:1.65;color:#3D3D3D;max-width:34em}
.fch-quota-line{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:22px;max-width:520px}
.fch-quota-line span{font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px}
.fch-quota-line b{font-family:var(--font-big-shoulders),Impact,sans-serif;font-size:34px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums}
.fch-quota-line em{font-style:normal;font-size:14px;color:#3D3D3D}
.fch-quota-track{height:10px;margin-top:10px;max-width:520px;background:#EEEDE8;border-radius:999px;overflow:hidden}
.fch-quota-track>i{display:block;height:100%;background:#000000;border-radius:999px;transition:width .8s cubic-bezier(.2,.8,.2,1)}
.fch-body{padding-top:32px;padding-bottom:56px}
.fch-chips{display:flex;flex-wrap:wrap;gap:8px;padding:20px 0 28px;border-bottom:1.5px solid #000000}
.fch-chip{height:42px;padding:0 20px;border-radius:999px;border:1.5px solid #000000;background:#FFFFFF;font:inherit;font-size:14px;font-weight:600;color:#000000;display:inline-flex;align-items:center;gap:8px;cursor:pointer;transition:background .2s ease,color .2s ease}
.fch-chip:hover{background:#EEEDE8}
.fch-chip[data-active="true"]{background:#000000;color:#FFFFFF}
.fch-chip[data-active="true"]:hover{background:#2B2B2B}
.fch-chip:disabled{opacity:.45;cursor:not-allowed}
.fch-chip:disabled:hover{background:#FFFFFF}
.fch-chip em{font-style:normal;font-size:12px;color:#3D3D3D;font-weight:500}
.fch-chip[data-active="true"] em{color:#BDBDB8}
.fch-count{font-size:13px;color:#3D3D3D;margin:22px 0 0;display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.fch-count b{color:#000000;font-weight:600}
.fch-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-top:24px}
.fch-card{display:flex;flex-direction:column;border:1.5px solid #000000;border-radius:24px;overflow:hidden;background:#FFFFFF;text-align:left;padding:0;font:inherit;color:#000000;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease}
.fch-card:hover{transform:translateY(-3px);box-shadow:8px 8px 0 #000000}
.fch-card:active{transform:scale(.99)}
.fch-card[data-locked="true"]{cursor:not-allowed}
.fch-card[data-locked="true"]:hover{transform:none;box-shadow:none}
.fch-card-media{position:relative;aspect-ratio:3/4;background:#EEEDE8;overflow:hidden}
.fch-card-media img{width:100%;height:100%;object-fit:contain;padding:6px;display:block;transition:transform .6s cubic-bezier(.2,.7,.2,1)}
.fch-card:hover .fch-card-media img{transform:scale(1.03)}
.fch-card-flag{position:absolute;top:12px;left:12px;background:#000000;color:#FFFFFF;font-size:11px;font-weight:600;letter-spacing:.02em;padding:7px 12px;border-radius:999px}
.fch-card-lock{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.28)}
.fch-card-lock span{display:inline-flex;align-items:center;gap:7px;background:#FFFFFF;color:#000000;font-size:12px;font-weight:600;padding:8px 14px;border-radius:999px;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.fch-card-body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:4px;flex:1}
.fch-card-name{font-family:var(--font-big-shoulders),Impact,sans-serif;font-size:30px;font-weight:900;text-transform:uppercase;line-height:.9;letter-spacing:.005em;margin:0}
.fch-card-sub{font-size:13px;color:#3D3D3D;line-height:1.45;margin:0}
.fch-card-price{margin-top:auto;padding-top:14px;display:flex;align-items:baseline;justify-content:space-between;gap:10px;border-top:1px solid #D6D5CF}
.fch-card-price small{font-size:11px;color:#3D3D3D;text-transform:uppercase;letter-spacing:.12em;font-weight:600}
.fch-card-price b{font-size:0;line-height:0}
.fch-card-price strong{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.fch-card-cta{margin-top:12px;height:44px;border-radius:999px;background:#000000;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:13px;font-weight:600}
.fch-card[data-locked="true"] .fch-card-cta{background:#FFFFFF;color:#3D3D3D;border:1.5px solid #D6D5CF}
.fch-empty{border:1.5px dashed #000000;border-radius:24px;padding:56px 24px;text-align:center;margin-top:24px}
.fch-empty b{display:block;font-family:var(--font-big-shoulders),Impact,sans-serif;font-size:34px;font-weight:900;text-transform:uppercase;line-height:.9}
.fch-empty span{display:block;margin-top:10px;font-size:14px;color:#3D3D3D}
.fch-cart-bar{margin-top:40px;border:1.5px solid #000000;border-radius:999px;padding:10px 10px 10px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;background:#000000;color:#FFFFFF}
.fch-cart-bar span{font-size:14px;font-weight:600}
.fch-cart-bar button{height:48px;padding:0 26px;border-radius:999px;background:#FFFFFF;color:#000000;border:none;font:inherit;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:background .2s ease}
.fch-cart-bar button:hover{background:#EEEDE8}

/* tablet */
@container fch (max-width:900px){
.fch-hero,.fch-two{grid-template-columns:minmax(0,1fr) !important;gap:40px !important}
.fch-steps{grid-template-columns:minmax(0,1fr) !important}
.fch-h-hero{font-size:84px}
.fch-h-sec{font-size:58px}
.fch-sec{padding-top:88px;padding-bottom:88px}
.fch-hide-m{display:none !important}
.fch-wrap{padding-left:32px;padding-right:32px}
.fch-title-xl{font-size:58px}
.fch-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
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
.fch-cta-row a{flex:1 1 100%;justify-content:center;height:56px !important}
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
.fch-order-wrap{padding-left:18px;padding-right:18px}
.fch-order-head{height:60px}
.fch-order-log{font-size:22px !important}
.fch-hero-2{padding-top:28px;padding-bottom:26px}
.fch-title-xl{font-size:44px}
.fch-lead{font-size:15px}
.fch-quota-line b{font-size:28px}
.fch-body{padding-top:20px;padding-bottom:40px}
.fch-chips{gap:6px;padding:14px 0 18px;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none;margin:0 -18px;padding-left:18px;padding-right:18px}
.fch-chips::-webkit-scrollbar{display:none}
.fch-chip{height:38px;padding:0 16px;font-size:13px;flex-shrink:0}
.fch-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}
.fch-card{border-radius:18px}
.fch-card-body{padding:12px 12px 14px}
.fch-card-name{font-size:23px}
.fch-card-sub{font-size:11.5px}
.fch-card-price{padding-top:10px}
.fch-card-price small{font-size:9.5px}
.fch-card-price strong{font-size:14px}
.fch-card-cta{height:38px;font-size:12px;margin-top:10px}
.fch-cart-bar{border-radius:20px;padding:10px;flex-direction:column;align-items:stretch;gap:10px;text-align:center}
.fch-cart-bar button{width:100%;justify-content:center}
}
@media (prefers-reduced-motion:reduce){
.fch-root *,.fch-root *::before,.fch-root *::after{animation:none !important;transition:none !important}
}
`;
