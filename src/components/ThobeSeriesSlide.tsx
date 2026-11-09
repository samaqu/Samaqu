"use client";

import { useState } from "react";
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

export default function ThobeSeriesSlide({ item }: { item: ThobeSeriesItem }) {
  const [photoFailed, setPhotoFailed] = useState(false);

  return (
    <div className="snap-center shrink-0 w-full h-full relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #2b2b2b 0%, #141414 100%)" }} />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,10,10,.86) 0%, rgba(12,12,12,.6) 32%, rgba(10,10,10,.8) 100%)",
        }}
      />

      <div className="relative h-full overflow-y-auto scrollbar-hide px-6 sm:px-8 pt-[210px] pb-[132px] sm:pt-5 sm:pb-5 flex flex-col justify-center md:grid md:grid-cols-[190px_minmax(0,1fr)] md:gap-x-8 md:items-center">
        <div className="mx-auto w-full max-w-[240px] md:mx-0 md:w-[190px] md:max-w-none">
          <div
            className="relative aspect-square w-full overflow-hidden rounded-2xl"
            style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)" }}
          >
            {!photoFailed ? (
              <img
                src={item.image}
                alt={`Closeup ${item.name}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center" style={{ color: "rgba(255,255,255,.45)" }}>
                <ShirtIcon size={34} strokeWidth={1.4} />
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 min-w-0 md:mt-0">
          <p
            className="text-[34px] sm:text-[38px] lg:text-[44px] leading-none"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "white" }}
          >
            {item.name}
          </p>
          <span
            className="inline-block mt-2.5 rounded-full px-3 py-1 text-[11px] font-ui"
            style={{ background: "rgba(255,255,255,.14)", color: "#FFFFFF" }}
          >
            {item.tag}
          </span>

          <div className="mt-3.5 h-px w-12" style={{ background: "#ffffff" }} />

          <div className="mt-4 space-y-3 sm:space-y-3.5">
            {item.points.map((p) => {
              const Icon = POINT_ICON[p.icon];
              return (
                <div key={p.title} className="flex gap-3.5">
                  <span
                    className="mt-0.5 w-9 h-9 shrink-0 rounded-xl grid place-items-center"
                    style={{ background: "rgba(255,255,255,.1)", color: "#FFFFFF" }}
                  >
                    <Icon size={16} strokeWidth={1.6} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium leading-snug font-ui" style={{ color: "white" }}>{p.title}</p>
                    <p className="mt-0.5 text-[12px] leading-snug font-ui" style={{ color: "rgba(255,255,255,.6)" }}>{p.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="mt-4 rounded-2xl p-3.5 flex gap-3"
            style={{ background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.1)" }}
          >
            <span style={{ color: "#FFFFFF" }}>✦</span>
            <div>
              <p className="text-[12px] font-ui" style={{ color: "#FFFFFF" }}>Cocok untuk</p>
              <p className="text-[12px] leading-snug font-ui" style={{ color: "rgba(255,255,255,.7)" }}>{item.fit}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
