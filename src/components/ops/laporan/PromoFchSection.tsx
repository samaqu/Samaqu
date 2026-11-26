"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Clock, Coins, Gift, Loader2, Package, Wallet } from "lucide-react";

/**
 * Kartu "Promo Free Cover Hanger" di Laporan Office (di atas peringkat Produk Terlaris, gaya sama dengan kartu
 * Jasa Potong Panjang). Cover & Hanger tidak lagi masuk peringkat; semua angka cover ada di sini.
 *
 * Angka dari `/api/ops/promo-fch` (hanya pesanan sah; satu bulan WIB). Hanya membaca.
 */

type Origin = "bot" | "admin" | "website";

type PromoFchData = {
  period: { month: string; label: string; isPartial: boolean; hariBerjalan: number };
  keluar: number;
  nilaiDigratiskan: number;
  modal: number;
  modalTanpaData: number;
  menunggu: { draft: number; unit: number };
  dibeli: { unit: number; omzet: number };
  perAsal: Record<Origin, number>;
  perVarian: Array<{ varian: string; gratis: number; dibeli: number; omzetDibeli: number }>;
  perHari: Array<{ hari: string; unit: number }>;
  rinci: Array<{
    tanggal: string;
    nomorPesanan: string;
    pelanggan: string;
    unit: number;
    varian: string;
    asal: Origin;
    status: string;
  }>;
  stok: Array<{ varian: string; stok: number | null }>;
  stokTotal: number | null;
  perkiraanHariCukup: number | null;
};

const ORIGIN_META: Record<Origin, { label: string; bar: string; dot: string; badge: string }> = {
  bot: { label: "Bot WA", bar: "bg-emerald-500", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  admin: { label: "Input admin", bar: "bg-sky-500", dot: "bg-sky-500", badge: "bg-sky-100 text-sky-800" },
  website: { label: "Website", bar: "bg-violet-500", dot: "bg-violet-500", badge: "bg-violet-100 text-violet-800" },
};
const ORIGIN_ORDER: Origin[] = ["bot", "admin", "website"];
const DETAIL_LIMIT = 50;

const nfmt = (value: number | null | undefined) =>
  (Number(value) || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
const rp = (value: number | null | undefined) => `Rp ${nfmt(value)}`;

function tanggalWaktu(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function tanggalPendek(key: string) {
  const [, month, day] = key.split("-").map(Number);
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${day} ${bulan[(month || 1) - 1] || ""}`;
}

async function fetchPromoFch(month: string): Promise<PromoFchData> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api/ops/promo-fch?month=${encodeURIComponent(month)}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Gagal memuat promo free cover hanger (${res.status})`);
  return json as PromoFchData;
}

function Tile({
  icon,
  label,
  value,
  note,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="rounded-xl bg-white/75 p-3 ring-1 ring-emerald-100">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/70">{label}</p>
      </div>
      <p className="mt-1.5 text-2xl font-black tabular-nums text-emerald-950">{value}</p>
      {note ? <p className="mt-0.5 text-[11px] font-semibold leading-snug text-emerald-900/70">{note}</p> : null}
    </div>
  );
}

export default function PromoFchSection({ month }: { month: string }) {
  const [showDetail, setShowDetail] = useState(false);
  const { data, isLoading, isError, error, isFetching } = useQuery<PromoFchData>({
    queryKey: ["ops-promo-fch", month],
    queryFn: () => fetchPromoFch(month),
    staleTime: 30_000,
  });

  const keluar = data?.keluar ?? 0;
  const maxHari = Math.max(1, ...(data?.perHari || []).map((row) => row.unit));
  const maxVarian = Math.max(1, ...(data?.perVarian || []).map((row) => row.gratis));
  const hariAda = (data?.perHari || []).length;

  return (
    <div data-testid="promo-fch-card" className="mt-3 flex overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
      <span aria-hidden className="w-1.5 shrink-0 bg-emerald-500" />
      <div className="min-w-0 flex-1 px-4 py-4 md:px-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
            <Gift size={17} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-emerald-950">Promo Free Cover Hanger</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-emerald-900/75">
              Cover & hanger gratis untuk pelanggan baru, dari bot WA, input admin, dan website. Tidak masuk peringkat di
              bawah; uangnya sudah ikut dihitung di Total Omset Laporan, dan modalnya sudah ada di Modal Barang Terjual.
            </p>
          </div>
          {isFetching ? <Loader2 size={14} className="mt-1 shrink-0 animate-spin text-emerald-600" /> : null}
        </div>

        {isLoading ? (
          <p className="mt-3 text-xs font-semibold text-emerald-900/70">Memuat promo free cover hanger…</p>
        ) : isError || !data ? (
          <p className="mt-3 text-xs font-semibold text-rose-700">
            {error instanceof Error ? error.message : "Gagal memuat promo free cover hanger."}
          </p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <Tile
                testId="promo-fch-keluar"
                icon={<Gift size={14} strokeWidth={2.1} />}
                label="Keluar"
                value={`${nfmt(data.keluar)} cover`}
                note={`dari ${nfmt(data.rinci.length)} pesanan, ${data.period.label}`}
              />
              <Tile
                icon={<Coins size={14} strokeWidth={2.1} />}
                label="Nilai digratiskan"
                value={rp(data.nilaiDigratiskan)}
                note="harga toko Rp35.000 per cover"
              />
              <Tile
                icon={<Wallet size={14} strokeWidth={2.1} />}
                label="Modal sebenarnya"
                value={rp(data.modal)}
                note={
                  data.modalTanpaData > 0
                    ? `${nfmt(data.modalTanpaData)} cover belum punya data modal`
                    : "uang yang benar-benar keluar (HPP)"
                }
              />
              <Tile
                icon={<Clock size={14} strokeWidth={2.1} />}
                label="Menunggu review"
                value={`${nfmt(data.menunggu.draft)} draft`}
                note={
                  data.menunggu.draft > 0
                    ? `${nfmt(data.menunggu.unit)} cover belum dihitung`
                    : "tidak ada antrean sekarang"
                }
              />
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/70">Asal pesanan</p>
                <p className="text-[11px] font-semibold text-emerald-900/70">
                  dari {nfmt(keluar)} cover yang keluar
                </p>
              </div>
              {keluar > 0 ? (
                <>
                  <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-white/80 ring-1 ring-emerald-100">
                    {ORIGIN_ORDER.map((origin) =>
                      data.perAsal[origin] > 0 ? (
                        <span
                          key={origin}
                          title={`${ORIGIN_META[origin].label}: ${data.perAsal[origin]}`}
                          className={ORIGIN_META[origin].bar}
                          style={{ width: `${(data.perAsal[origin] / keluar) * 100}%` }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {ORIGIN_ORDER.map((origin) => (
                      <span key={origin} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-950">
                        <span className={`h-2 w-2 rounded-full ${ORIGIN_META[origin].dot}`} />
                        {ORIGIN_META[origin].label}
                        <span className="tabular-nums text-emerald-900/70">
                          {nfmt(data.perAsal[origin])} ({Math.round((data.perAsal[origin] / keluar) * 100)}%)
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-1.5 text-xs font-semibold text-emerald-900/70">
                  Belum ada cover gratis yang keluar di {data.period.label}.
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/70">Per varian</p>
                <div className="mt-1.5 space-y-2">
                  {data.perVarian.length ? (
                    data.perVarian.map((row) => (
                      <div key={row.varian}>
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="font-black text-emerald-950">{row.varian}</span>
                          <span className="tabular-nums font-semibold text-emerald-900/75">
                            gratis {nfmt(row.gratis)} · dibeli {nfmt(row.dibeli)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/80">
                          <span
                            className="block h-full rounded-full bg-emerald-500"
                            style={{ width: `${(row.gratis / maxVarian) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs font-semibold text-emerald-900/70">Belum ada cover di periode ini.</p>
                  )}
                  <p className="text-[11px] font-semibold text-emerald-900/75">
                    Dibeli (berbayar, termasuk add-on Open Order): {nfmt(data.dibeli.unit)} cover ·{" "}
                    {rp(data.dibeli.omzet)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/70">Sisa stok cover</p>
                <div className="mt-1.5 space-y-1.5">
                  {data.stok.map((row) => (
                    <div key={row.varian} className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-black text-emerald-950">
                        <Package size={13} strokeWidth={2} className="text-emerald-600" />
                        {row.varian}
                      </span>
                      <span className="tabular-nums font-black text-emerald-950">
                        {row.stok === null ? "tidak terbaca" : nfmt(row.stok)}
                      </span>
                    </div>
                  ))}
                  <p className="text-[11px] font-semibold text-emerald-900/75">
                    {data.perkiraanHariCukup !== null
                      ? `Cukup sekitar ${nfmt(data.perkiraanHariCukup)} hari lagi (kira-kira, dari rata-rata keluar per hari).`
                      : data.stokTotal === null
                        ? "Stok belum bisa dibaca."
                        : "Belum ada pemakaian untuk memperkirakan."}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/70">Keluar per hari</p>
              <div className="mt-1.5 flex h-16 items-end gap-[3px]">
                {data.perHari.map((row) => (
                  <span
                    key={row.hari}
                    title={`${tanggalPendek(row.hari)}: ${row.unit} cover`}
                    className={`min-w-[3px] flex-1 rounded-t ${row.unit > 0 ? "bg-emerald-500" : "bg-emerald-200/70"}`}
                    style={{ height: `${row.unit > 0 ? Math.max(10, (row.unit / maxHari) * 100) : 4}%` }}
                  />
                ))}
              </div>
              {hariAda > 1 ? (
                <div className="mt-1 flex justify-between text-[10px] font-semibold text-emerald-900/70">
                  <span>{tanggalPendek(data.perHari[0].hari)}</span>
                  <span>puncak {nfmt(maxHari === 1 && keluar === 0 ? 0 : maxHari)} cover/hari</span>
                  <span>{tanggalPendek(data.perHari[hariAda - 1].hari)}</span>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setShowDetail((value) => !value)}
              aria-expanded={showDetail}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-black text-emerald-900 ring-1 ring-emerald-200 transition hover:bg-white"
            >
              <ChevronDown size={14} className={`transition-transform ${showDetail ? "rotate-180" : ""}`} />
              {showDetail ? "Sembunyikan daftar rinci" : `Lihat daftar rinci (${nfmt(data.rinci.length)} pesanan)`}
            </button>

            {showDetail ? (
              <div className="mt-2 overflow-x-auto rounded-xl bg-white/80 ring-1 ring-emerald-100">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-emerald-900/70">
                      <th className="px-3 py-2">Tanggal</th>
                      <th className="px-3 py-2">Pesanan</th>
                      <th className="px-3 py-2">Pelanggan</th>
                      <th className="px-3 py-2">Varian</th>
                      <th className="px-3 py-2 text-right">Cover</th>
                      <th className="px-3 py-2">Asal</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rinci.slice(0, DETAIL_LIMIT).map((row) => (
                      <tr key={`${row.nomorPesanan}-${row.tanggal}`} className="border-t border-emerald-100">
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600">{tanggalWaktu(row.tanggal)}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-black text-slate-800">{row.nomorPesanan}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700">{row.pelanggan}</td>
                        <td className="px-3 py-2 font-semibold text-slate-600">{row.varian}</td>
                        <td className="px-3 py-2 text-right font-black tabular-nums text-slate-800">{nfmt(row.unit)}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ORIGIN_META[row.asal].badge}`}>
                            {ORIGIN_META[row.asal].label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-600">{row.status}</td>
                      </tr>
                    ))}
                    {!data.rinci.length ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-center font-semibold text-slate-500">
                          Belum ada pesanan dengan cover gratis di periode ini.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                {data.rinci.length > DETAIL_LIMIT ? (
                  <p className="border-t border-emerald-100 px-3 py-2 text-[11px] font-semibold text-slate-500">
                    Menampilkan {DETAIL_LIMIT} pesanan terbaru dari {nfmt(data.rinci.length)}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
