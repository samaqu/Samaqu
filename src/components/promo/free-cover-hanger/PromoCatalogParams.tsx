"use client";

import { useEffect, useRef } from "react";

/** Nama parameter URL halaman yang dibawa ke tautan katalog. */
const KATALOG_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"];

/**
 * Menambahkan UTM/fbclid dari URL halaman promo ke setiap tautan katalog
 * (`a[data-katalog-link]`), supaya atribusi iklan tetap terbawa sampai katalog.
 *
 * Hanya membaca `window.location.search` di browser — tidak ada data server/DB.
 */
export function PromoCatalogParams() {
  const done = useRef(false);

  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    const carried = new URLSearchParams();
    for (const key of KATALOG_PARAMS) {
      const value = current.get(key);
      if (value) carried.set(key, value);
    }

    if (!done.current) {
      done.current = true;
      if (carried.size > 0) {
        const links = document.querySelectorAll<HTMLAnchorElement>("a[data-katalog-link]");
        links.forEach((link) => {
          try {
            const url = new URL(link.href, window.location.origin);
            carried.forEach((value, key) => url.searchParams.set(key, value));
            link.href = url.toString();
          } catch {
            /* tautan tidak valid — biarkan apa adanya */
          }
        });
      }
    }

    // Scroll reveal: elemen `.fch-rv` mulai transparan; kelas `fch-in` dipasang saat
    // masuk viewport. Bila pengguna minta "kurangi gerakan", semua langsung tampil.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = document.querySelectorAll<HTMLElement>(".fch-rv:not(.fch-in)");
    if (reduce) {
      items.forEach((el) => el.classList.add("fch-in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("fch-in");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    items.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return null;
}
