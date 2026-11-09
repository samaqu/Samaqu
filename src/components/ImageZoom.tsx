"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { cloudinaryUrl } from "@/lib/cloudinary";

export interface ZoomMedia {
  src: string;
  type: "image" | "video";
}

interface ImageZoomProps {
  media: ZoomMedia[];
  initialIndex: number;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
  /** Kelas z-index overlay; default cocok untuk halaman biasa, dinaikkan saat dipakai di dalam modal. */
  zClassName?: string;
}

export default function ImageZoom({ media, initialIndex, alt, isOpen, onClose, zClassName = "z-[100]" }: ImageZoomProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastDistRef = useRef(0);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeXRef = useRef(0);
  const isSwipingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, initialIndex]);

  const currentItem = media[currentIndex];

  const goNext = useCallback(() => {
    if (scale > 1) return;
    if (currentIndex < media.length - 1) {
      setCurrentIndex((i) => i + 1);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [currentIndex, media.length, scale]);

  const goPrev = useCallback(() => {
    if (scale > 1) return;
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [currentIndex, scale]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, goNext, goPrev, onClose]);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.5, 4)), []);
  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(s - 0.5, 1);
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);
  const resetZoom = useCallback(() => { setScale(1); setPosition({ x: 0, y: 0 }); }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) setScale((s) => Math.min(s + 0.2, 4));
    else setScale((s) => { const next = Math.max(s - 0.2, 1); if (next === 1) setPosition({ x: 0, y: 0 }); return next; });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDistRef.current = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1) {
      if (scale > 1) {
        setIsDragging(true);
        dragStartRef.current = { x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y };
      } else if (media.length > 1) {
        swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        isSwipingRef.current = false;
        swipeXRef.current = 0;
      }
    }
  }, [scale, position, media.length]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastDistRef.current > 0) setScale((s) => Math.max(1, Math.min(4, s * (dist / lastDistRef.current))));
      lastDistRef.current = dist;
    } else if (isDragging && e.touches.length === 1) {
      setPosition({ x: e.touches[0].clientX - dragStartRef.current.x, y: e.touches[0].clientY - dragStartRef.current.y });
    } else if (swipeStartRef.current && e.touches.length === 1 && scale === 1) {
      const dx = e.touches[0].clientX - swipeStartRef.current.x;
      const dy = e.touches[0].clientY - swipeStartRef.current.y;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        isSwipingRef.current = true;
        swipeXRef.current = dx;
      }
    }
  }, [isDragging, scale]);

  const handleTouchEnd = useCallback(() => {
    lastDistRef.current = 0;
    setIsDragging(false);
    if (isSwipingRef.current && scale === 1) {
      if (swipeXRef.current < -60) goNext();
      else if (swipeXRef.current > 60) goPrev();
    }
    swipeStartRef.current = null;
    isSwipingRef.current = false;
    swipeXRef.current = 0;
  }, [scale, goNext, goPrev]);

  const handleDoubleClick = useCallback(() => {
    if (scale > 1) { setScale(1); setPosition({ x: 0, y: 0 }); }
    else setScale(2.5);
  }, [scale]);

  if (!isOpen || !currentItem) {
    if (isOpen) console.log("[ImageZoom] isOpen but no currentItem:", { isOpen, currentIndex, mediaLen: media.length, currentItem });
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`fixed inset-0 ${zClassName} flex flex-col`}
          style={{ background: "rgba(26,18,14,.95)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <p className="text-[12px] tracking-wide truncate max-w-[35%]" style={{ color: "rgba(248,246,242,.6)" }}>{alt}</p>
            {media.length > 1 && (
              <p className="text-[12px] tracking-wide" style={{ color: "rgba(248,246,242,.5)" }}>{currentIndex + 1} / {media.length}</p>
            )}
            <div className="flex items-center gap-1">
              {currentItem.type === "image" && (
                <>
                  <button onClick={zoomOut} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/10" style={{ color: "var(--ivory)" }} aria-label="Zoom out"><ZoomOut size={18} /></button>
                  <span className="text-[11px] w-10 text-center" style={{ color: "rgba(248,246,242,.5)" }}>{Math.round(scale * 100)}%</span>
                  <button onClick={zoomIn} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/10" style={{ color: "var(--ivory)" }} aria-label="Zoom in"><ZoomIn size={18} /></button>
                  <button onClick={resetZoom} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/10" style={{ color: "var(--ivory)" }} aria-label="Reset zoom"><RotateCcw size={16} /></button>
                </>
              )}
              <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/10 ml-1" style={{ color: "var(--ivory)" }} aria-label="Tutup"><X size={20} /></button>
            </div>
          </div>

          {/* Image area */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            {/* Left arrow — desktop */}
            {media.length > 1 && currentIndex > 0 && scale === 1 && (
              <button onClick={goPrev} className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full items-center justify-center transition-all hover:scale-110 hidden sm:flex" style={{ background: "rgba(248,246,242,.15)", backdropFilter: "blur(6px)" }} aria-label="Sebelumnya">
                <ChevronLeft size={22} style={{ color: "var(--ivory)" }} />
              </button>
            )}

            <div
              className="w-full h-full flex items-center justify-center"
              onWheel={handleWheel}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onDoubleClick={handleDoubleClick}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  {currentItem.type === "video" ? (
                    <video
                      src={currentItem.src}
                      className="max-w-full max-h-full object-contain select-none"
                      controls
                      loop
                      playsInline
                    />
                  ) : (
                    <img
                      src={cloudinaryUrl(currentItem.src, { width: 1600 })}
                      alt={alt}
                      className="max-w-full max-h-full object-contain select-none"
                      style={{
                        transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                        transition: isDragging ? "none" : "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
                        cursor: scale > 1 ? "grab" : "default",
                      }}
                      draggable={false}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Right arrow — desktop */}
            {media.length > 1 && currentIndex < media.length - 1 && scale === 1 && (
              <button onClick={goNext} className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full items-center justify-center transition-all hover:scale-110 hidden sm:flex" style={{ background: "rgba(248,246,242,.15)", backdropFilter: "blur(6px)" }} aria-label="Berikutnya">
                <ChevronRight size={22} style={{ color: "var(--ivory)" }} />
              </button>
            )}
          </div>

          {/* Thumbnail strip */}
          {media.length > 1 && (
            <div className="shrink-0 flex justify-center gap-2 px-4 py-3 overflow-x-auto">
              {media.map((item, i) => (
                <button
                  key={i}
                  onClick={() => { setCurrentIndex(i); setScale(1); setPosition({ x: 0, y: 0 }); }}
                  className="relative shrink-0 w-11 h-14 sm:w-13 sm:h-[68px] rounded-lg overflow-hidden transition-all duration-200"
                  style={{ border: currentIndex === i ? "2px solid #ffffff" : "1px solid rgba(248,246,242,.15)", opacity: currentIndex === i ? 1 : 0.45 }}
                >
                  {item.type === "video" ? (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(248,246,242,.08)" }}>
                      <span className="text-[9px] font-medium" style={{ color: "#ffffff" }}>VID</span>
                    </div>
                  ) : (
                    <img src={cloudinaryUrl(item.src, { width: 160 })} alt="" className="w-full h-full object-cover" loading="lazy" />
                  )}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
