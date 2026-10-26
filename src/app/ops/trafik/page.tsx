"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as LucideIcons from "lucide-react";
import { base44 } from "@/lib/ops-api";

/**
 * Trafik Web (/ops/trafik).
 *
 * Komposisi: strip angka pokok → grafik tren + jam sibuk → papan peringkat per dimensi
 * (halaman, sumber, negara/kota, perangkat/browser, OS/bahasa). Bentuknya mengikuti papan
 * analitik yang sudah dikenal operator: satu kolom angka di kanan, bar proporsional di kiri,
 * tab underline untuk dimensi yang berpasangan.
 *
 * Sumber: pencatat SISI SERVER (`web_visits`) lewat `/api/ops/analytics` — tanpa cookie,
 * tanpa IP mentah, halaman internal tidak pernah dihitung, dan tidak bisa diblokir ad blocker.
 */

const IconRefresh: any = (LucideIcons as any).RefreshCw;
const IconAlert: any = (LucideIcons as any).AlertTriangle ?? (LucideIcons as any).TriangleAlert;
const IconArrowLeft: any = (LucideIcons as any).ArrowLeft;

const RANGES = [7, 30, 90] as const;
const UNKNOWN = "(tidak diketahui)";

type TrafficRow = { value: string; pageviews: number; visitors: number };
type BreakdownKey =
  | "path"
  | "referrer"
  | "country"
  | "city"
  | "device"
  | "browser"
  | "os"
  | "utm_source"
  | "language";
type Breakdowns = Partial<Record<BreakdownKey, TrafficRow[]>>;

const nfmt = (value: number) => new Intl.NumberFormat("id-ID").format(value);

const shortDay = (day: string, long: boolean) =>
  new Intl.DateTimeFormat("id-ID", long ? { day: "2-digit", month: "short" } : { weekday: "short" }).format(
    new Date(`${day}T00:00:00+07:00`),
  );

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["id"], { type: "region" });
  } catch {
    return null;
  }
})();

const countryName = (code: string) =>
  regionNames && code.length === 2 ? regionNames.of(code.toUpperCase()) || code : code;

const deviceLabel = (value: string) =>
  ({ desktop: "Desktop", mobile: "Ponsel", tablet: "Tablet" } as Record<string, string>)[value] || value;

const languageLabel = (value: string) => (value === UNKNOWN ? value : value.toUpperCase());

type TabDef = {
  key: BreakdownKey;
  label: string;
  /** "count" = angka pengunjung; "share" = persentase (seperti kartu negara/perangkat). */
  mode: "count" | "share";
  format?: (value: string) => string;
  emptyLabel?: string;
};

/* ── Satu daftar peringkat: label kiri, angka kanan, bar proporsional di belakang ── */
function RankedList({ rows, tab }: { rows: TrafficRow[]; tab: TabDef }) {
  const max = Math.max(1, ...rows.map((row) => row.visitors));
  const total = rows.reduce((sum, row) => sum + row.visitors, 0) || 1;

  return (
    <ul className="space-y-0.5">
      {rows.slice(0, 6).map((row, index) => {
        const percent = Math.round((row.visitors / total) * 100);
        const width =
          tab.mode === "share"
            ? Math.max(percent, 1)
            : Math.max(2, Math.round((row.visitors / max) * 100));
        const label =
          row.value === UNKNOWN && tab.emptyLabel
            ? tab.emptyLabel
            : tab.format
              ? tab.format(row.value)
              : row.value;
        const display = tab.mode === "share" ? `${percent}%` : nfmt(row.visitors);

        return (
          <li key={`${row.value}-${index}`} className="relative">
            <span
              aria-hidden
              className="absolute inset-y-0.5 left-0 rounded-md bg-slate-100"
              style={{ width: `${width}%` }}
            />
            <div className="relative flex items-center justify-between gap-4 px-2.5 py-[7px]">
              <span className="min-w-0 truncate text-[13px] font-semibold text-slate-700" title={label}>
                {label}
              </span>
              <span
                className="shrink-0 text-[13px] font-bold tabular-nums text-slate-900"
                title={`${nfmt(row.visitors)} pengunjung · ${nfmt(row.pageviews)} pageview`}
              >
                {display}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Kartu dengan tab underline (satu tab pun tetap punya bentuk yang sama) ── */
function TabbedCard({
  title,
  tabs,
  breakdowns,
}: {
  title: string;
  tabs: TabDef[];
  breakdowns: Breakdowns;
}) {
  const [active, setActive] = useState(0);
  const id = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const tab = tabs[Math.min(active, tabs.length - 1)];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (active + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setActive(next);
    buttons.current[next]?.focus();
  };

  const rows = breakdowns[tab.key] ?? [];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-end gap-3 border-b border-slate-100 px-4 pt-3">
        <h2 className="shrink-0 pb-2.5 text-sm font-bold text-slate-900">{title}</h2>

        {tabs.length > 1 ? (
          <div
            role="tablist"
            aria-label={title}
            onKeyDown={onKeyDown}
            className="no-scrollbar flex min-w-0 items-end gap-0.5 overflow-x-auto"
          >
            {tabs.map((item, index) => {
              const selected = index === active;
              return (
                <button
                  key={item.key}
                  ref={(node) => {
                    buttons.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${index}`}
                  aria-selected={selected}
                  aria-controls={`${id}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(index)}
                  className={`-mb-px whitespace-nowrap border-b-2 px-2 pb-2.5 pt-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/25 focus-visible:ring-offset-2 ${
                    selected
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <span className="ml-auto hidden shrink-0 pb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:block">
          Pengunjung
        </span>
      </div>

      <div
        role={tabs.length > 1 ? "tabpanel" : undefined}
        id={`${id}-panel`}
        aria-labelledby={tabs.length > 1 ? `${id}-tab-${active}` : undefined}
        className="p-2.5"
      >
        {rows.length > 0 ? (
          <RankedList rows={rows} tab={tab} />
        ) : (
          <p className="px-2.5 py-6 text-xs text-slate-500">Belum ada kunjungan pada rentang ini.</p>
        )}
      </div>
    </section>
  );
}

export default function OpsTrafficPage() {
  const [days, setDays] = useState<number>(7);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["ops-web-traffic-page", days],
    queryFn: () => base44.entities.Analytics.traffic(days),
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  const series = data?.series ?? [];
  const hourly = data?.hourly ?? [];
  const breakdowns = (data?.breakdowns ?? {}) as Breakdowns;
  const visitors = data?.totals.visitors ?? 0;
  const pageviews = data?.totals.pageviews ?? 0;
  const perVisitor = visitors > 0 ? (pageviews / visitors).toFixed(1) : "0";

  const trendMax = Math.max(1, ...series.map((row) => row.visitors));
  const peak = Math.max(0, ...series.map((row) => row.visitors));
  const labelEvery = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  const barGap = days <= 7 ? "gap-1.5" : days <= 30 ? "gap-1" : "gap-px";

  const hourlyMax = Math.max(1, ...hourly.map((row) => row.pageviews));

  return (
    <div className="space-y-4">
      {/* Header ringkas — bukan hero. Operator butuh kontrol, bukan sambutan. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Trafik Web</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Pengunjung publik · dihitung di server, tanpa cookie &amp; tanpa IP mentah
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
            {RANGES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDays(value)}
                aria-pressed={days === value}
                className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/25 focus-visible:ring-offset-2 ${
                  days === value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {value}H
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Muat ulang data trafik"
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/25 focus-visible:ring-offset-2"
          >
            <IconRefresh size={15} className={isFetching ? "animate-spin" : ""} />
          </button>

          <Link
            href="/ops"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/25 focus-visible:ring-offset-2"
          >
            <IconArrowLeft size={14} /> Dashboard
          </Link>
        </div>
      </div>

      {/* Angka pokok — satu strip, bukan empat kartu yang bersaing. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:grid-cols-4">
        {[
          { label: "Pengunjung", value: nfmt(visitors), caption: `unik ${days} hari` },
          { label: "Pageview", value: nfmt(pageviews), caption: `${days} hari` },
          { label: "Halaman / pengunjung", value: perVisitor, caption: "rata-rata" },
          { label: "Hari ini", value: nfmt(data?.today.visitors ?? 0), caption: `${nfmt(data?.today.pageviews ?? 0)} pageview` },
        ].map((stat) => (
          <div key={stat.label} className="bg-white px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</p>
            <p className="mt-1 text-xl font-black tabular-nums text-slate-900">{stat.value}</p>
            <p className="text-[11px] text-slate-500">{stat.caption}</p>
          </div>
        ))}
      </div>

      {data?.advancedError ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-800">
          <IconAlert size={15} className="mt-0.5 shrink-0" />
          <p className="text-xs font-semibold">
            Rincian lanjutan belum aktif. Jalankan `supabase/migrations/20261026_web_analytics_detail.sql`
            di Supabase, lalu deploy ulang.
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="h-52 animate-pulse rounded-xl border border-slate-200 bg-white xl:col-span-2" />
            <div className="h-52 animate-pulse rounded-xl border border-slate-200 bg-white" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
            <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600">
            <IconAlert size={22} />
          </div>
          <p className="text-sm font-bold text-slate-900">Trafik belum bisa dimuat.</p>
          <p className="mt-1 text-xs text-slate-500">{error instanceof Error ? error.message : "Coba lagi."}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/25 focus-visible:ring-offset-2"
          >
            <IconRefresh size={13} /> Coba lagi
          </button>
        </div>
      ) : (
        <>
          {/* Grafik: tren pengunjung + jam sibuk hari ini. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Pengunjung</h2>
                  <p className="text-[11px] text-slate-500">{days} hari terakhir · 1 batang = 1 hari</p>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  puncak {nfmt(peak)}
                </span>
              </div>

              <div
                role="img"
                aria-label={`Grafik pengunjung ${days} hari terakhir, puncak ${nfmt(peak)} pengunjung`}
                className={`mt-4 flex h-[132px] items-end ${barGap}`}
              >
                {series.map((row, index) => (
                  <div
                    key={row.day}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                    title={`${row.day}: ${nfmt(row.visitors)} pengunjung · ${nfmt(row.pageviews)} pageview`}
                  >
                    <div
                      className="w-full max-w-[42px] rounded-t-[3px] bg-slate-900/80 transition-colors hover:bg-slate-900"
                      style={{ height: `${Math.max(2, Math.round((row.visitors / trendMax) * 110))}px` }}
                    />
                    <span className="whitespace-nowrap text-[10px] font-semibold text-slate-400">
                      {index % labelEvery === 0 || index === series.length - 1 ? shortDay(row.day, days > 7) : ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Jam sibuk</h2>
                  <p className="text-[11px] text-slate-500">Hari ini · WIB</p>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  {nfmt(hourly.reduce((sum, row) => sum + row.pageviews, 0))} pageview
                </span>
              </div>

              <div
                role="img"
                aria-label="Grafik pageview per jam hari ini"
                className="mt-4 flex h-[132px] items-end gap-1"
              >
                {Array.from({ length: 24 }, (_, hour) => {
                  const row = hourly.find((item) => item.hour === hour);
                  return (
                    <div
                      key={hour}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                      title={`${String(hour).padStart(2, "0")}:00 · ${nfmt(row?.pageviews ?? 0)} pageview`}
                    >
                      <div
                        className={`w-full rounded-t-[2px] transition-colors ${
                          row ? "bg-slate-900/70 hover:bg-slate-900" : "bg-slate-100"
                        }`}
                        style={{ height: `${Math.max(2, Math.round(((row?.pageviews ?? 0) / hourlyMax) * 110))}px` }}
                      />
                      <span className="text-[9px] font-semibold text-slate-400">
                        {hour % 6 === 0 ? String(hour).padStart(2, "0") : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Papan peringkat — dua kolom lebar, lalu tiga kolom. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TabbedCard
              title="Halaman"
              tabs={[{ key: "path", label: "Halaman", mode: "count" }]}
              breakdowns={breakdowns}
            />
            <TabbedCard
              title="Sumber"
              tabs={[
                { key: "referrer", label: "Referrer", mode: "count", emptyLabel: "Langsung / tanpa referrer" },
                { key: "utm_source", label: "UTM", mode: "count", emptyLabel: "Tanpa UTM" },
              ]}
              breakdowns={breakdowns}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TabbedCard
              title="Negara"
              tabs={[
                { key: "country", label: "Negara", mode: "share", format: countryName },
                { key: "city", label: "Kota", mode: "share" },
              ]}
              breakdowns={breakdowns}
            />
            <TabbedCard
              title="Perangkat"
              tabs={[
                { key: "device", label: "Perangkat", mode: "share", format: deviceLabel },
                { key: "browser", label: "Browser", mode: "share" },
              ]}
              breakdowns={breakdowns}
            />
            <TabbedCard
              title="Sistem operasi"
              tabs={[
                { key: "os", label: "OS", mode: "share" },
                { key: "language", label: "Bahasa", mode: "share", format: languageLabel },
              ]}
              breakdowns={breakdowns}
            />
          </div>

          <p className="text-[11px] text-slate-400">
            Tanpa cookie · tanpa IP mentah (hash harian) · halaman internal (ops, panel-admin, admin,
            affiliate) tidak dihitung.
          </p>
        </>
      )}
    </div>
  );
}
