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
.fch-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;align-items:center}
.fch-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.fch-coll{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);grid-template-rows:auto auto;gap:20px}
.fch-coll-big{grid-row:span 2}
.fch-coll-big-box{min-height:560px}
/* Judul bagian memakai clamp(), bukan ukuran tetap, supaya tidak dominan.
   (Judul hero punya skala sendiri di blok .fchh-* — mengikuti mockup hero.) */
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

@keyframes fch-fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.fch-fu{animation:fch-fadeUp .8s ease both;animation-delay:.5s}
.fch-fu2{animation:fch-fadeUp .8s ease both;animation-delay:.65s}

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
.fch-two{grid-template-columns:minmax(0,1fr) !important;gap:40px !important}
.fch-steps{grid-template-columns:minmax(0,1fr) !important}
.fch-h-sec{font-size:52px}
.fch-sec{padding-top:88px;padding-bottom:88px}
/* Tablet: grid 2 kolom masih dipakai, tapi nama koleksi 52px terlalu besar untuk
   kolom kiri yang cuma ~45% lebar layar — judulnya pecah jadi 3 baris. */
.fch-tile-name{font-size:clamp(30px,5vw,40px) !important}
.fch-hide-m{display:none !important}
.fch-wrap{padding-left:32px;padding-right:32px}
}

/* phone: app-like */
@container fch (max-width:640px){
.fch-wrap{padding-left:24px;padding-right:24px}
.fch-h-sec{font-size:46px;line-height:.95 !important;margin-bottom:4px}
.fch-sec{padding-top:72px;padding-bottom:72px}
.fch-only-m{display:block}
.fch-nav{height:60px !important}
/* Logo kini aset gambar (logo.svg), bukan teks — jadi yang diatur tingginya. */
.fch-nav-logo{height:24px !important;width:auto !important}
.fch-nav-btn{height:40px !important;padding:0 16px !important;font-size:14px !important}
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
/* Kartu carousel: satu kartu = 86% layar supaya tepi kartu berikutnya tetap terlihat
   (tanda bisa digeser), dan isi kartu diskalakan mengikuti lebar itu. Sebelumnya
   teks tetap ukuran desktop (38px + deskripsi 15px) sehingga nama & deskripsi
   memakan hampir seluruh tinggi kartu dan fotonya terasa sempit. */
.fch-coll>a{flex:0 0 86%;scroll-snap-align:start}
.fch-coll-big-box{min-height:0 !important;aspect-ratio:4 / 5}
.fch-tile-box{aspect-ratio:4 / 5 !important}
.fch-tile-name{font-size:clamp(26px,8vw,34px) !important;line-height:.95 !important}
.fch-tile-pill{display:none !important}
/* Foto: fokus ke bagian atas (dada & wajah model), bukan terpotong di tengah. */
.fch-tile-img img{object-position:center top !important}
/* Baris judul + deskripsi di bawah foto: rapat, tidak mendorong kartu jadi tinggi. */
.fch-coll>a>div:last-child{margin-top:-4px !important}
.fch-coll .fch-tile-name + div{font-size:13.5px !important;line-height:1.45 !important}
.fch-tag{transform:none !important}
.fch-faq-q{font-size:16px !important;padding:20px 0 !important}
.fch-faq-a{padding:0 0 22px 0 !important;font-size:15px !important}
.fch-sticky-cta{display:flex;position:sticky;bottom:0;z-index:30;animation:fch-slideIn .5s ease 1.2s both}
.fch-footer-pad{padding-bottom:28px !important}
}

/* ── Hero (port 1:1 dari mockup "Hero Promo Gratis Cover Hanger - SAMAQU") ──
   Tata letak, ukuran, dan semua keyframe di bawah ini disalin dari index.html mockup.
   Elemen hero diberi awalan .fchh- supaya tidak bentrok dengan aturan .fch-* milik
   bagian halaman lain. Judul memakai Anton (--font-anton, dimuat di layout promo). */
.fchh-hero{max-width:1240px;margin:0 auto;padding:20px 16px 32px;display:grid;grid-template-columns:1fr;gap:18px;align-items:center;box-sizing:border-box}
.fchh-title{margin:0;font-family:var(--font-anton),Anton,Impact,sans-serif;font-weight:400;font-size:clamp(34px,10.6vw,46px);line-height:1;letter-spacing:.3px;text-transform:uppercase}
.fchh-title .fchh-nw{white-space:nowrap}
.fchh-title .fchh-outline{-webkit-text-stroke:1.6px #111111;color:transparent}
.fchh-sub{margin:0;font-size:14px;line-height:1.55;color:#3D3D3D;max-width:560px}
.fchh-ctas{display:flex;flex-direction:column;gap:8px}
.fchh-btn{height:50px;border-radius:25px;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 28px;box-sizing:border-box;white-space:nowrap}
/* Warna teks WAJIB ditulis di kelas, bukan hanya style inline: aturan .fch-root a
   (hitam) lebih kuat daripada atribut style, sehingga tombol hitam sempat menulis
   hitam di atas hitam. Selector .fch-root .fchh-btn--ink juga menang atas aturan itu. */
.fch-root .fchh-btn{text-decoration:none;color:#111111}
.fch-root .fchh-btn--ink{background:#111111;color:#FFFFFF}
.fch-root .fchh-btn--line{background:#FFFFFF;border:1.5px solid #111111;color:#111111;height:48px}
.fch-root .fchh-btn--ink:hover{color:#FFFFFF}
.fchh-text{display:contents}
.fchh-title{order:1}
.fchh-visual{order:2}
.fchh-sub{order:3}
.fchh-ctas{order:4}
@media (min-width:900px){
.fchh-hero{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:56px;padding:64px 40px 72px}
.fchh-text{display:flex;flex-direction:column;gap:28px;order:1}
.fchh-visual{order:2}
.fchh-title{font-size:clamp(52px,5.4vw,78px)}
.fchh-title .fchh-outline{-webkit-text-stroke:2.5px #111111}
.fchh-sub{font-size:17px;line-height:1.65}
.fchh-ctas{flex-direction:row;gap:14px}
.fchh-btn{height:56px;font-size:16px;padding:0 34px}
.fchh-btn--line{height:56px}
}
/* Stage dirancang pada 358x400 lalu diskalakan mengikuti lebar wadah (lihat PromoHero). */
.fchh-stage{position:relative;width:100%;aspect-ratio:358/400;border-radius:22px;background:#F3F1EC;overflow:hidden}
@media (min-width:900px){.fchh-stage{border-radius:32px;max-width:540px;margin-left:auto}}
.fchh-inner{position:absolute;left:0;top:0;width:358px;height:400px;transform-origin:0 0}
.fchh-abs{position:absolute}
@keyframes fchhBaju{0%,28%{opacity:1}42%,86%{opacity:0}96%,100%{opacity:1}}
@keyframes fchhSway{0%{transform:rotate(0)}6%{transform:rotate(1.8deg)}12%{transform:rotate(-1.4deg)}18%{transform:rotate(.8deg)}24%,100%{transform:rotate(0)}}
@keyframes fchhSet{0%,28%{transform:translateY(0) scale(1);opacity:1}40%,46%{transform:translateY(-50px) scale(1);opacity:1}58%{transform:translateY(122px) scale(.34);opacity:1}60%{transform:translateY(126px) scale(.32);opacity:0}84%{transform:translateY(-22px) scale(1);opacity:0}96%,100%{transform:translateY(0) scale(1);opacity:1}}
@keyframes fchhBox{0%,28%{opacity:0;transform:translateY(40px) scale(.85)}34%{opacity:1;transform:translateY(-6px) scale(1.02)}37%,82%{opacity:1;transform:translateY(0) scale(1)}90%,100%{opacity:0;transform:translateY(30px) scale(.9)}}
@keyframes fchhLid{0%,42%{transform:translateY(0) rotate(0)}48%,56%{transform:translateY(-66px) rotate(-16deg)}61%{transform:translateY(4px) rotate(0)}63%,100%{transform:translateY(0) rotate(0)}}
@keyframes fchhBounce{0%,36%{transform:rotate(0) scale(1,1)}37.5%{transform:rotate(-4deg)}39%{transform:rotate(4deg)}40.5%{transform:rotate(-2.5deg)}42%,60%{transform:rotate(0) scale(1,1)}63%{transform:scale(1.08,.88)}67%{transform:scale(.96,1.06)}71%,100%{transform:scale(1,1)}}
@keyframes fchhRays{0%,60%{opacity:0;transform:rotate(0) scale(.5)}66%{opacity:1;transform:rotate(25deg) scale(1)}82%{opacity:.8;transform:rotate(70deg) scale(1.05)}90%,100%{opacity:0;transform:rotate(90deg) scale(1.1)}}
@keyframes fchhConf{0%,61%{opacity:0;transform:translate(0,0) rotate(0)}63%{opacity:1;transform:translate(0,0) rotate(0)}80%,100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(var(--r))}}
@keyframes fchhSpark{0%,62%{opacity:0;transform:scale(.2) rotate(0)}67%{opacity:1;transform:scale(1.15) rotate(45deg)}76%,100%{opacity:0;transform:scale(.5) rotate(90deg)}}
@keyframes fchhStamp{0%,63%{opacity:0;transform:scale(1.8) rotate(-18deg)}67%{opacity:1;transform:scale(.9) rotate(-10deg)}70%{transform:scale(1.04) rotate(-10deg)}72%{transform:scale(1) rotate(-10deg)}76%{transform:scale(1.07) rotate(-10deg)}79%,84%{opacity:1;transform:scale(1) rotate(-10deg)}89%,100%{opacity:0;transform:scale(1) rotate(-10deg)}}
@keyframes fchhShine{0%,63%{transform:translateX(-60px)}75%,100%{transform:translateX(190px)}}
@keyframes fchhWord{0%,52%{opacity:0;transform:translateY(16px) scale(.96)}57%,84%{opacity:1;transform:translateY(0) scale(1)}90%,100%{opacity:0;transform:translateY(-10px) scale(1)}}
@keyframes fchhChip{0%,24%{opacity:1;transform:translateY(0)}30%,90%{opacity:0;transform:translateY(12px)}96%,100%{opacity:1;transform:translateY(0)}}
@keyframes fchhCta{0%,63%{box-shadow:0 0 0 0 rgba(201,168,102,0)}68%{box-shadow:0 0 0 6px rgba(201,168,102,.55)}76%{box-shadow:0 0 0 12px rgba(201,168,102,0)}80%{box-shadow:0 0 0 0 rgba(201,168,102,.5)}88%,100%{box-shadow:0 0 0 12px rgba(201,168,102,0)}}
.fchh-baju{animation:fchhBaju 8s ease-in-out infinite}
.fchh-sway{transform-origin:179px 46px;animation:fchhSway 8s ease-in-out infinite}
.fchh-set{transform-origin:50% 50%;animation:fchhSet 8s cubic-bezier(.65,0,.35,1) infinite}
.fchh-box{animation:fchhBox 8s cubic-bezier(.3,1.2,.5,1) infinite}
.fchh-lid{transform-origin:12% 100%;animation:fchhLid 8s cubic-bezier(.5,0,.3,1.3) infinite}
.fchh-bouncer{transform-origin:50% 100%;animation:fchhBounce 8s ease-out infinite}
.fchh-rays{animation:fchhRays 8s ease-out infinite}
.fchh-conf{animation:fchhConf 8s cubic-bezier(.2,.7,.4,1) infinite}
.fchh-spark{animation:fchhSpark 8s ease-out infinite}
.fchh-stamp{animation:fchhStamp 8s ease-out infinite}
.fchh-shine{animation:fchhShine 8s ease-in-out infinite}
.fchh-word{display:inline-block;animation:fchhWord 8s cubic-bezier(.3,1.3,.5,1) infinite both}
.fchh-chip{animation:fchhChip 8s ease-in-out infinite}
.fchh-cta{animation:fchhCta 8s ease-out infinite}
.fchh-paused *{animation-play-state:paused !important}

@media (prefers-reduced-motion:reduce){
.fch-root *,.fch-root *::before,.fch-root *::after{animation:none !important;transition:none !important}
.fchh-box,.fchh-rays,.fchh-conf,.fchh-spark,.fchh-stamp,.fchh-word{opacity:0}
}
`;
