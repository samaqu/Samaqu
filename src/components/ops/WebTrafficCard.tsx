"use client";

import { useQuery } from "@tanstack/react-query";
import * as LucideIcons from "lucide-react";
import { base44 } from "@/lib/ops-api";

/**
 * Kartu "Trafik Web" di dashboard ops.
 *
 * Sumbernya pencatat SISI SERVER (`web_visits` lewat `/api/ops/analytics`), bukan script
 * browser — jadi ad blocker tidak mengurangi angkanya. Halaman internal (/ops, /panel-admin,
 * /admin, /affiliate) tidak pernah dicatat, jadi angka ini murni pengunjung publik.
 */

// Ikon diambil lewat namespace (pola sama dengan dashboard) supaya tidak bentrok dengan
// definisi tipe lucide versi ini.
const IconEye: any = (LucideIcons as any).Eye ?? (LucideIcons as any).Users;
const IconAlert: any = (LucideIcons as any).AlertTriangle ?? (LucideIcons as any).TriangleAlert;

const nfmt = (value: number) => new Intl.NumberFormat("id-ID").format(value);

const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(new Date(`${day}T00:00:00+07:00`));

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-900 whitespace-nowrap">{value}</p>
    </div>
  );
}

export default function WebTrafficCard() {
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["ops-web-traffic", 7],
    queryFn: () => base44.entities.Analytics.traffic(7),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const series = data?.series ?? [];
  const top = data?.top ?? [];
  const max = Math.max(1, ...series.map((row) => row.visitors));

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 grid place-items-center shrink-0">
            <IconEye size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 leading-tight">Trafik Web</h2>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 truncate">
              7 hari terakhir · dihitung di server
            </p>
          </div>
        </div>
        <span className="shrink-0 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold whitespace-nowrap">
          {isFetching ? "memperbarui…" : "tanpa cookie"}
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-[74px] rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-800">
          <IconAlert size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold">Trafik belum bisa dibaca.</p>
            <p className="text-xs font-semibold mt-0.5">
              {error instanceof Error ? error.message : "Coba muat ulang halaman."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Pengunjung hari ini" value={nfmt(data?.today.visitors ?? 0)} />
            <Metric label="Pageview hari ini" value={nfmt(data?.today.pageviews ?? 0)} />
            <Metric label="Pengunjung 7 hari" value={nfmt(data?.totals.visitors ?? 0)} />
            <Metric label="Pageview 7 hari" value={nfmt(data?.totals.pageviews ?? 0)} />
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">Pengunjung per hari</p>
              <div className="flex items-end gap-2 h-[104px]">
                {series.map((row) => (
                  <div
                    key={row.day}
                    className="flex-1 flex flex-col items-center justify-end gap-1 h-full"
                    title={`${row.day}: ${nfmt(row.visitors)} pengunjung · ${nfmt(row.pageviews)} pageview`}
                  >
                    <div
                      className="w-full max-w-[46px] rounded-t-md bg-slate-900/80"
                      style={{ height: `${Math.max(3, Math.round((row.visitors / max) * 84))}px` }}
                    />
                    <span className="text-[10px] font-semibold text-slate-400">{dayLabel(row.day)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">Halaman teratas</p>
              {top.length === 0 ? (
                <p className="text-xs text-slate-500">Belum ada kunjungan tercatat.</p>
              ) : (
                <ol className="space-y-1.5">
                  {top.map((row, index) => (
                    <li key={row.path} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-semibold text-slate-700" title={row.path}>
                        <span className="mr-1 text-slate-400">{index + 1}.</span>
                        {row.path}
                      </span>
                      <span className="shrink-0 font-bold text-slate-900">{nfmt(row.pageviews)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <p className="mt-4 text-[11px] text-slate-400">
            Tanpa cookie · tanpa IP mentah · halaman internal (ops, panel-admin, admin, affiliate) tidak dihitung.
          </p>
        </>
      )}
    </div>
  );
}
