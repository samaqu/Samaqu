"use client";

import { useCallback, useRef, useState } from "react";
import { SQ_ASSETS } from "@/lib/campaign/sama-quran-content";

/**
 * Video cerita utama (section "Cerita Sama Quran").
 *
 * - TIDAK autoplay; poster tampil sebagai cover.
 * - Klik di mana pun pada cover → play DENGAN suara.
 * - Saat selesai → kembali ke awal (`currentTime = 0`, `load()`) dan cover muncul lagi.
 *
 * `preload="metadata"` supaya halaman tetap ringan.
 */
export default function StoryVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showCover, setShowCover] = useState(true);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    const promise = video.play();
    if (promise && typeof promise.catch === "function") promise.catch(() => {});
    setShowCover(false);
  }, []);

  const handleEnded = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
        video.currentTime = 0;
        video.load();
      } catch {
        /* abaikan */
      }
    }
    setShowCover(true);
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        src={SQ_ASSETS.storyVideo}
        poster={SQ_ASSETS.storyPoster}
        onEnded={handleEnded}
        controls
        playsInline
        preload="metadata"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {showCover ? (
        <button
          type="button"
          aria-label="Putar video cerita Sama Quran"
          onClick={play}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
          }}
        />
      ) : null}
    </>
  );
}
