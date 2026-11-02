"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Video latar yang baru dimuat saat mendekati area tampil.
 *
 * Autoplay + muted + loop + playsinline sesuai desain, TAPI `src` baru dipasang ketika
 * elemen mendekati viewport (IntersectionObserver). Tujuannya: halaman ini punya banyak
 * video, dan memuat semuanya sekaligus di awal membuat halaman berat.
 *
 * `poster` selalu dipasang, jadi tetap ada gambar sebelum video aktif.
 */
export default function LazyVideo({
  src,
  poster,
  style,
  ariaLabel,
  className,
}: {
  src: string;
  poster: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || active) return;

    // Browser tanpa IntersectionObserver → langsung muat (lebih baik daripada tidak tampil).
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      // Mulai memuat sedikit sebelum masuk layar supaya tidak terlihat kosong.
      { rootMargin: "400px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  return (
    <video
      ref={ref}
      src={active ? src : undefined}
      poster={poster}
      autoPlay={active}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={ariaLabel}
      className={className}
      style={style}
    />
  );
}
