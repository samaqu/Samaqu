"use client";

import { useCallback, useRef, useState } from "react";
import { CYP_ASSETS } from "@/lib/campaign/create-your-price-content";
import s from "../campaign.module.css";

/**
 * Video utama section "Kenapa kami membuat ini".
 *
 * - TIDAK autoplay; poster tampil sebagai cover.
 * - Klik di mana pun pada cover → play DENGAN suara (`muted = false`).
 * - Saat selesai → kembali ke awal (`currentTime = 0`, `load()`) dan cover muncul lagi.
 *
 * `preload="metadata"` supaya halaman tetap ringan. Kontrol bawaan browser tetap aktif
 * setelah video mulai, sama seperti mockup.
 */
export default function StoryVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showCover, setShowCover] = useState(true);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    const promise = video.play();
    // Autoplay dengan suara bisa ditolak browser; jangan sampai error mentah ke console.
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
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div style={{ position: "relative", width: "min(380px, 86vw)" }}>
        <div
          aria-hidden="true"
          style={{ position: "absolute", inset: "-16px", border: "1px solid #CFCAC0", borderRadius: "30px" }}
        />
        <div
          style={{
            position: "relative",
            aspectRatio: "9 / 16",
            borderRadius: "22px",
            overflow: "hidden",
            background: "var(--cyp-black)",
            boxShadow: "0 30px 70px rgba(14,14,14,0.25)",
          }}
        >
          <video
            ref={videoRef}
            src={CYP_ASSETS.storyVideo}
            poster={CYP_ASSETS.storyPoster}
            onEnded={handleEnded}
            controls
            playsInline
            preload="metadata"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          {showCover ? (
            <button
              type="button"
              aria-label="Putar video Create Your Price"
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
        </div>
      </div>
    </div>
  );
}
