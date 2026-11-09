"use client";

import { useState } from "react";
import { ZoomIn } from "lucide-react";
import type { ThobeSeriesItem, ThobeSeriesPointIcon } from "@/lib/thobe-series";

type IconProps = { size?: number; strokeWidth?: number };

function IconBase({ size = 16, strokeWidth = 1.6, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function CollarIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 4.5c0 2.2 1.8 3.5 4 5 2.2-1.5 4-2.8 4-5" />
      <path d="M6 4.5 12 9.5l6-5" />
    </IconBase>
  );
}

function PlacketIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 4h6v16H9z" />
      <path d="M12 8h.01M12 12h.01M12 16h.01" />
    </IconBase>
  );
}

function ShirtIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 4 12 7l4-3 3 2v14H5V6l3-2Z" />
      <path d="M12 7v14" />
    </IconBase>
  );
}

const POINT_ICON: Record<ThobeSeriesPointIcon, (props: IconProps) => React.JSX.Element> = {
  collar: CollarIcon,
  placket: PlacketIcon,
  general: ShirtIcon,
};

interface ThobeSeriesSlideProps {
  item: ThobeSeriesItem;
  onZoom?: () => void;
}

export default function ThobeSeriesSlide({ item, onZoom }: ThobeSeriesSlideProps) {
  const [photoFailed, setPhotoFailed] = useState(false);

  return (
    <div className="snap-center shrink-0 w-full h-full relative overflow-hidden">
      {/* Latar mobile (tampilan lama) */}
      <div className="absolute inset-0 sm:hidden" style={{ background: "linear-gradient(160deg, #2b2b2b 0%, #141414 100%)" }} />
      <div
        className="absolute inset-0 sm:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,10,10,.86) 0%, rgba(12,12,12,.6) 32%, rgba(10,10,10,.8) 100%)",
        }}
      />
      {/* Latar desktop sesuai mockup */}
      <div className="absolute inset-0 hidden sm:block" style={{ background: "linear-gradient(180deg, #4a4540 0%, #2d2a27 100%)" }} />

      <div className="relative h-full overflow-y-auto scrollbar-hide px-5 sm:px-[52px] pt-4 pb-4 sm:py-[22px] flex flex-col sm:grid sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-x-5 sm:items-stretch sm:min-h-[280px]">
        <div className="my-auto flex w-full flex-col sm:contents">
          <div className="mx-auto w-full max-w-[168px] sm:mx-0 sm:h-full sm:w-[190px] sm:max-w-none">
            <button
              type="button"
              onClick={() => { if (!photoFailed) onZoom?.(); }}
              aria-label={`Zoom in on ${item.name} photo`}
              className="relative block aspect-square w-full overflow-hidden rounded-2xl cursor-zoom-in focus:outline-none focus-visible:ring-2 sm:aspect-auto sm:h-full sm:min-h-[210px] sm:rounded-xl"
              style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" }}
            >
              {!photoFailed ? (
                <>
                  <img
                    src={item.image}
                    alt={`Closeup ${item.name}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={() => setPhotoFailed(true)}
                  />
                  <span
                    className="absolute bottom-2 right-2 w-7 h-7 rounded-full grid place-items-center"
                    style={{ background: "rgba(0,0,0,.55)", border: "1px solid rgba(255,255,255,.25)", color: "white" }}
                  >
                    <ZoomIn size={14} />
                  </span>
                </>
              ) : (
                <span className="absolute inset-0 grid place-items-center" style={{ color: "rgba(255,255,255,.45)" }}>
                  <ShirtIcon size={34} strokeWidth={1.4} />
                </span>
              )}
            </button>
          </div>
  
          <div className="mt-4 min-w-0 sm:mt-0">
            <p
              className="mb-2 text-[30px] leading-[1.1]"
              style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "white" }}
            >
              {item.name}
            </p>
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-ui sm:mb-3 sm:px-[11px] sm:py-[5px] sm:text-[12px]"
              style={{ background: "rgba(255,255,255,.14)", color: "#FFFFFF" }}
            >
              {item.tag}
            </span>

            <div className="mt-3 h-px w-10 sm:hidden" style={{ background: "#ffffff" }} />

            <div className="mt-3 space-y-2.5 sm:mt-0 sm:space-y-3">
              {item.points.map((p) => {
                const Icon = POINT_ICON[p.icon];
                return (
                  <div key={p.title} className="flex gap-3 sm:gap-[10px]">
                    <span
                      className="mt-0.5 w-8 h-8 sm:w-[34px] sm:h-[34px] shrink-0 rounded-xl sm:rounded-[9px] grid place-items-center bg-[rgba(255,255,255,.1)] sm:bg-[rgba(255,255,255,.12)]"
                      style={{ color: "#FFFFFF" }}
                    >
                      <Icon size={16} strokeWidth={1.6} />
                    </span>
                    <div>
                      <p className="text-[12.5px] sm:text-[13px] font-medium leading-snug font-ui" style={{ color: "white" }}>{p.title}</p>
                      <p className="mt-0.5 text-[11.5px] sm:text-[12px] leading-snug font-ui text-[rgba(255,255,255,.6)] sm:text-[#c9c4bd]">{p.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              className="mt-3.5 rounded-2xl p-3 sm:mt-3 sm:rounded-xl sm:px-3 sm:py-2.5 flex gap-3 border-[1px] border-[rgba(255,255,255,.1)] sm:border-[0.5px] sm:border-[rgba(255,255,255,.2)]"
              style={{ background: "rgba(255,255,255,.07)" }}
            >
              <span className="sm:hidden" style={{ color: "#FFFFFF" }}>✦</span>
              <div>
                <p className="text-[11.5px] sm:text-[13px] font-ui sm:font-medium sm:mb-0.5" style={{ color: "#FFFFFF" }}>Perfect for</p>
                <p className="text-[11.5px] sm:text-[12px] leading-snug sm:leading-[1.45] font-ui text-[rgba(255,255,255,.7)] sm:text-[#d6d1ca]">{item.fit}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
