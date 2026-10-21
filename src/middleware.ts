import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

/** Subdomain panel admin: admin.samaqu.id/<halaman> → /panel-admin/<halaman> */
const ADMIN_HOST = "admin.samaqu.id";
/** Subdomain dashboard internal: office.samaqu.id/<halaman> → /ops/<halaman> */
const OPS_HOST = "office.samaqu.id";
/** Subdomain portal affiliate: affiliate.samaqu.id/<halaman> → /affiliate/<halaman> */
const AFFILIATE_HOST = "affiliate.samaqu.id";
const LOCALES = ["id", "en"];

export default function middleware(request: NextRequest) {
  // x-pathname dipakai layout/metadata untuk menghitung canonical + hreflang
  // tanpa perlu tahu URL-nya dari sisi klien.
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);

  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (host === AFFILIATE_HOST) {
    // Portal affiliate: tanpa locale, URL bersih (affiliate.samaqu.id/komisi, dst).
    // Semua path diarahkan ke /affiliate/* supaya subdomain ini hanya berisi portal
    // partner — bukan halaman toko.
    const url = request.nextUrl.clone();
    const firstSegment = url.pathname.split("/")[1];
    if (LOCALES.includes(firstSegment)) {
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (!url.pathname.startsWith("/affiliate")) {
      url.pathname = url.pathname === "/" ? "/affiliate" : `/affiliate${url.pathname}`;
    }
    return NextResponse.rewrite(url, { request: { headers } });
  }

  if (host === OPS_HOST) {
    // Dashboard internal: tanpa locale, URL bersih (office.samaqu.id/leads, dst).
    const url = request.nextUrl.clone();
    const firstSegment = url.pathname.split("/")[1];
    // Kalau dibuka pakai prefix bahasa (mis. office.samaqu.id/id) arahkan ke dashboard,
    // bukan 404 — dashboard internal memang tidak pakai locale.
    if (LOCALES.includes(firstSegment)) {
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (!url.pathname.startsWith("/ops")) {
      url.pathname = url.pathname === "/" ? "/ops" : `/ops${url.pathname}`;
    }
    return NextResponse.rewrite(url, { request: { headers } });
  }

  if (host === ADMIN_HOST) {
    // Panel admin: tanpa locale, URL bersih (admin.samaqu.id/produk, dst).
    // Catatan: "panel-admin" sudah dikecualikan di matcher, jadi hasil rewrite ini tidak
    // diproses ulang middleware (tidak ada loop) dan cabang office.samaqu.id tidak tersentuh.
    const url = request.nextUrl.clone();
    const firstSegment = url.pathname.split("/")[1];
    if (LOCALES.includes(firstSegment)) {
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (!url.pathname.startsWith("/panel-admin")) {
      url.pathname = url.pathname === "/" ? "/panel-admin" : `/panel-admin${url.pathname}`;
    }
    return NextResponse.rewrite(url, { request: { headers } });
  }

  // Halaman Bio Link hidup TANPA prefix locale (samaqu.id/bio). Jalur lama /id/bio & /en/bio
  // diarahkan ke /bio supaya cuma ada satu URL untuk satu halaman (kebas double).
  if (/^\/(id|en)\/bio(\/|$)/.test(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.pathname.replace(/^\/(id|en)/, "");
    return NextResponse.redirect(url, 308);
  }

  return intlMiddleware(new NextRequest(request, { headers }));
}

export const config = {
  // Catatan: setiap folder di public/ yang bukan aset aplikasi harus dikecualikan,
  // kalau tidak middleware locale mengalihkannya ke /<locale>/… (404).
  // `.*\..*` mengecualikan semua file statis (robots.txt, sitemap.xml, llms.txt,
  // llms-full.txt, favicon.ico, gambar, .well-known/…) dari redirect locale.
  // `affiliate` = portal partner (tanpa locale), `r/` = halaman tujuan tautan referral,
  // `bio` = halaman Bio Link (tanpa locale — satu-satunya URL: /bio).
  matcher: [
    "/",
    "/(id|en)/:path*",
    "/((?!_next|admin|panel-admin|ops|affiliate|bio|r/|api|opengraph-image|twitter-image|icon|apple-icon|manifest|\\.well-known|.*\\..*).*)",
  ],
};
