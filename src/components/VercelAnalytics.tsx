"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Web Analytics Vercel — HANYA menghitung pengunjung publik.
 *
 * Kenapa perlu `beforeSend`: komponen `Analytics` mengirim SEMUA pageview, termasuk dashboard
 * internal dan deployment preview (build-nya juga production), sehingga angka "visitor" jadi
 * lebih besar dari pengunjung sebenarnya. Event yang tidak lolos filter di-drop sebelum dikirim.
 *
 * Aturan:
 *  - host harus domain produksi (preview `*.vercel.app` dan localhost tidak dihitung);
 *  - path yang punya segmen internal (ops / panel-admin / admin / affiliate / api) dibuang,
 *    termasuk versi ber-locale (`/id/admin/...`, `/en/admin/...`).
 */
const COUNTED_HOSTS = new Set(["samaqu.id", "www.samaqu.id", "samaqu-flax.vercel.app"]);
const INTERNAL_SEGMENTS = new Set(["ops", "panel-admin", "admin", "affiliate", "api"]);

function shouldCount(event: BeforeSendEvent): boolean {
  try {
    const { hostname, pathname } = new URL(event.url);
    if (!COUNTED_HOSTS.has(hostname.toLowerCase())) return false;
    return !pathname
      .split("/")
      .filter(Boolean)
      .some((segment) => INTERNAL_SEGMENTS.has(segment.toLowerCase()));
  } catch {
    return false;
  }
}

const beforeSend = (event: BeforeSendEvent) => (shouldCount(event) ? event : null);

export default function VercelAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
