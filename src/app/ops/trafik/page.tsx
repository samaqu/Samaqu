"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import * as LucideIcons from "lucide-react";
import { base44 } from "@/lib/ops-api";

/**
 * Halaman Trafik Web (/ops/trafik) — versi lengkap dari kartu di dashboard.
 *
 * Sumber: pencatat SISI SERVER (`web_visits`) lewat `/api/ops/analytics`.
 *  - tanpa cookie, tanpa IP mentah (hanya hash harian)
 *  - hanya halaman publik; dashboard internal tidak pernah dicatat
 *  - tidak bisa diblokir ad blocker
 *
 * Rincian (referrer/negara/kota/browser/OS/UTM) butuh migrasi
 * `supabase/migrations/20261026_web_analytics_detail.sql`.
 */

const IconChart: any = (LucideIcons as any).ChartNoAxesCombined ?? (LucideIcons as any).ChartLine ?? (LucideIcons as any).LineChart;
const IconRefresh: any = (LucideIcons as any).RefreshCw;
const IconAlert: any = (LucideIcons as any).AlertTriangle ?? (LucideIcons as any).TriangleAlert;

const RANGES = [7, 30, 90] as const;
const UNKNOWN = "(tidak diketahui)";

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

const countryName = (code: string) => (regionNames && code.length === 2 ? regionNames.of(code.toUpperCase()) || code : code);

const deviceLabel = (value: string) => ({ desktop: "Desktop", mobile: "Ponsel", tablet: "Tablet" })[value] || value;

function Kpi({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900 whitespace-nowrap">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{caption}</p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  format,
  emptyLabel,
}: {
  title: string;
  rows: Array<{ value: string; pageviews: number; visitors: number }>;
  format?: (value: string) => string;
  emptyLabel?: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.pageviews, 0);
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-bold text-slate-900 leading-tight">{title}</h2>
        <span className="text-[11px] font-semibold text-slate-400">kunjungan</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">Belum ada data.</p>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((row) => {
            const label = row.value === UNKNOWN && emptyLabel ? emptyLabel : format ? format(row.value) : row.value;
            const share = total > 0 ? Math.max(2, Math.round((row.pageviews / total) * 100)) : 0;
            return (
              <li key={`${row.value}-${row.pageviews}`} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-semibold text-slate-700" title={label}>
                    {label}
                  </span>
                  <span className="shrink-0 font-bold text-slate-900">
                    {nfmt(row.pageviews)}
                    <span className="ml-1 font-semibold text-slate-400">· {nfmt(row.visitors)} org</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-slate-900/70" style={{ width: `${share}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
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
  const max = Math.max(1, ...series.map((row) => row.visitors));
  const labelEvery = days <= 7 ? 1 : days <= 30 ? 5 : 15;
  const barGap = days <= 7 ? "gap-2" : days <= 30 ? "gap-1" : "gap-px";
  const visitors = data?.totals.visitors ?? 0;
  const pageviews = data?.totals.pageviews ?? 0;
  const perVisitor = visitors > 0 ? (pageviews / visitors).toFixed(1) : "0";

  const breakdowns = data?.breakdowns ?? {};
  const hourly = data?.hourly ?? [];
  const hourlyMax = Math.max(1, ...hourly.map((row) => row.pageviews));

  return (
    <div className="space-y-5">
      {/* Header + KPI */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200 shrink-0">
              <IconChart size={26} className="text-slate-900" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Trafik Web</h1>
              <p className="text-slate-500 font-medium mt-1">Pengunjung publik · dihitung di server, tanpa cookie</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-slate-50 border border-slate-200 p-1">
              {RANGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDays(value)}
                  aria-pressed={days === value}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    days === value
                      ? "bg-white border border-slate-200 text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {value} hari
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-all"
            >
              <IconRefresh size={16} className={isFetching ? "animate-spin" : ""} />
              Muat ulang
            </button>
            <Link
              href="/ops"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              ← Dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <Kpi label="Pengunjung" value={nfmt(visitors)} caption={`unik ${days} hari terakhir`} />
          <Kpi label="Pageview" value={nfmt(pageviews)} caption={`${days} hari terakhir`} />
          <Kpi label="Halaman / pengunjung" value={perVisitor} caption="rata-rata" />
          <Kpi
            label="Hari ini"
            value={nfmt(data?.today.visitors ?? 0)}
            caption={`${nfmt(data?.today.pageviews ?? 0)} pageview`}
          />
        </div>
      </div>

      {data?.advancedError ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <IconAlert size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Rincian lanjutan belum aktif.</p>
            <p className="text-xs font-semibold mt-0.5">
              Jalankan `supabase/migrations/20261026_web_analytics_detail.sql` di Supabase, lalu deploy ulang.
            </p>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-52 rounded-xl bg-white border border-gray-200 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-56 rounded-xl bg-white border border-gray-200 animate-pulse" />
            ))}
          </div>
        </div>
      ) : isError ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 grid place-items-center mx-auto mb-3">
            <IconAlert size={24} />
          </div>
          <p className="font-bold text-slate-900">Trafik belum bisa dimuat.</p>
          <p className="text-sm text-gray-500 mt-1">{error instanceof Error ? error.message : "Coba lagi."}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-all"
          >
            <IconRefresh size={14} /> Coba Lagi
          </button>
        </div>
      ) : (
        <>
          {/* Tren */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="font-bold text-slate-900 leading-tight">Tren Pengunjung</h2>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {days} hari terakhir · 1 batang = 1 hari
                </p>
              </div>
              <span className="text-[11px] font-semibold text-slate-400">
                puncak {nfmt(Math.max(...series.map((row) => row.visitors), 0))} pengunjung
              </span>
            </div>
            <div className={`flex items-end ${barGap} h-[150px]`}>
              {series.map((row, index) => (
                <div
                  key={row.day}
                  className="flex-1 flex flex-col items-center justify-end gap-1 h-full"
                  title={`${row.day}: ${nfmt(row.visitors)} pengunjung · ${nfmt(row.pageviews)} pageview`}
                >
                  <div
                    className="w-full max-w-[46px] rounded-t-md bg-slate-900/80"
                    style={{ height: `${Math.max(3, Math.round((row.visitors / max) * 126))}px` }}
                  />
                  <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">
                    {index % labelEvery === 0 || index === series.length - 1 ? shortDay(row.day, days > 7) : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Jam sibuk (hari ini) */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="font-bold text-slate-900 leading-tight">Jam Sibuk</h2>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Hari ini · WIB</p>
              </div>
              <span className="text-[11px] font-semibold text-slate-400">{nfmt(hourly.reduce((sum, row) => sum + row.pageviews, 0))} pageview</span>
            </div>
            <div className="flex items-end gap-1 h-[100px]">
              {Array.from({ length: 24 }, (_, hour) => {
                const row = hourly.find((item) => item.hour === hour);
                return (
                  <div key={hour} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${String(hour).padStart(2, "0")}:00 · ${nfmt(row?.pageviews ?? 0)} pageview`}>
                    <div
                      className={`w-full rounded-t-sm ${row ? "bg-slate-900/70" : "bg-slate-100"}`}
                      style={{ height: `${Math.max(2, Math.round(((row?.pageviews ?? 0) / hourlyMax) * 74))}px` }}
                    />
                    <span className="text-[9px] font-semibold text-slate-400">
                      {hour % 4 === 0 ? String(hour).padStart(2, "0") : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rincian */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Breakdown title="Halaman teratas" rows={breakdowns.path ?? []} />
            <Breakdown title="Sumber kunjungan" rows={breakdowns.referrer ?? []} emptyLabel="Langsung / tanpa referrer" />
            <Breakdown title="Negara" rows={breakdowns.country ?? []} format={countryName} />
            <Breakdown title="Kota" rows={breakdowns.city ?? []} />
            <Breakdown title="Perangkat" rows={breakdowns.device ?? []} format={deviceLabel} />
            <Breakdown title="Browser" rows={breakdowns.browser ?? []} />
            <Breakdown title="Sistem operasi" rows={breakdowns.os ?? []} />
            <Breakdown title="Sumber UTM" rows={breakdowns.utm_source ?? []} emptyLabel="Tanpa UTM" />
          </div>

          <p className="text-[11px] text-slate-400">
            Tanpa cookie · tanpa IP mentah (hash harian) · halaman internal (ops, panel-admin, admin, affiliate) tidak dihitung.
          </p>
        </>
      )}
    </div>
  );
}
