"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, MapPin, Truck } from "lucide-react";
import { bagiPersen } from "@/lib/promo-fch-report";

/**
 * "Promo Ongkir" — Laporan Office (di bawah kartu Rincian Biaya Free Gift).
 *
 * Susunan (dari atas, bahasa sederhana untuk bos):
 *  1. Dua blok besar: Jabodetabek (Gratis Ongkir) dan Luar Jabodetabek (Potongan N%) — pesanan + Rp.
 *  2. Satu ringkasan total: pesanan dan Rp yang diberikan ke customer.
 *  3. Satu baris kecil: uang yang benar-benar keluar dari SAMAQU.
 *  4. Rincian (bisa dilipat): asal pesanan, grafik harian, daftar pesanan.
 *
 * Angka dari `/api/ops/promo-ongkir` (hanya pesanan sah; satu bulan WIB). Hanya membaca.
 * Gaya zinc/abu seperti kartu Free Cover Hanger. Rumus omset dan laba tidak disentuh.
 */

type Origin = "bot" | "admin" | "website";

type PromoOngkirData = {
  period: { month: string; label: string; isPartial: boolean; hariBerjalan: number };
  luarPersen: number;
  jntDiskonPersen: number;
  belumAktif: boolean;
  jabodetabek: { pesanan: number; rupiah: number };
  luar: { pesanan: number; rupiah: number };
  total: { pesanan: number; diberikan: number; dibayarCustomer: number };
  uangKeluar: { samaqu: number; ditanggungJnt: number };
  perAsal: Record<Origin, number>;
  perHari: Array<{ hari: string; pesanan: number }>;
  rinci: Array<{
    tanggal: string;
    nomorPesanan: string;
    pelanggan: string;
    tujuan: string;
    jenis: "jabo" | "luar";
    asal: Origin;
    ongkirJnt: number;
    potongan: number;
    dibayar: number;
    status: string;
  }>;
};

const ORIGIN_META: Record<Origin, { label: string; bar: string; badge: string }> = {
  bot: { label: "Bot WA", bar: "bg-zinc-900", badge: "bg-zinc-900 text-white" },
  admin: { label: "Input admin", bar: "bg-zinc-500", badge: "bg-zinc-200 text-zinc-800" },
  website: { label: "Website", bar: "bg-zinc-300", badge: "bg-white text-zinc-600 ring-1 ring-zinc-300" },
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

async function fetchPromoOngkir(month: string): Promise<PromoOngkirData> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api/ops/promo-ongkir?month=${encodeURIComponent(month)}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Gagal memuat promo ongkir (${res.status})`);
  return json as PromoOngkirData;
}

function Blok({
  judul,
  pesanan,
  rupiah,
  keterangan,
  testId,
  dark,
}: {
  judul: string;
  pesanan: number;
  rupiah: number;
  keterangan: string;
  testId: string;
  dark?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-2xl p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${dark ? "bg-zinc-900 text-white" : "bg-white text-zinc-900"}`}
    >
      <p className={`text-[11px] font-bold uppercase tracking-wider ${dark ? "text-zinc-300" : "text-zinc-500"}`}>{judul}</p>
      <p className="mt-3 text-3xl font-black tabular-nums tracking-tight">
        {nfmt(pesanan)} <span className={`text-sm font-bold ${dark ? "text-zinc-300" : "text-zinc-500"}`}>pesanan</span>
      </p>
      <p className={`mt-0.5 text-[11px] font-semibold ${dark ? "text-zinc-300" : "text-zinc-500"}`}>yang mendapat promo ini</p>
      <div className={`mt-4 border-t pt-3 ${dark ? "border-white/15" : "border-zinc-100"}`}>
        <p className={`text-[11px] font-semibold ${dark ? "text-zinc-300" : "text-zinc-500"}`}>{keterangan}</p>
        <p className="mt-0.5 text-xl font-black tabular-nums tracking-tight">{rp(rupiah)}</p>
      </div>
    </div>
  );
}

export default function PromoOngkirSection({ month }: { month: string }) {
  const [showDetail, setShowDetail] = useState(false);
  const { data, isLoading, isError, error, isFetching } = useQuery<PromoOngkirData>({
    queryKey: ["ops-promo-ongkir", month],
    queryFn: () => fetchPromoOngkir(month),
    staleTime: 30_000,
  });

  const maxHari = Math.max(1, ...(data?.perHari || []).map((row) => row.pesanan));
  const hariAda = (data?.perHari || []).length;
  const totalPesanan = data?.total.pesanan ?? 0;
  const persen = data ? bagiPersen(ORIGIN_ORDER.map((origin) => data.perAsal[origin])) : [];

  return (
    <section data-testid="promo-ongkir-card" className="lpr-rise rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-zinc-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <Truck size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h2 className="text-sm font-black tracking-tight text-zinc-900">Promo Ongkir</h2>
            <p className="mt-0.5 text-xs font-medium text-zinc-500">
              Berapa pesanan customer yang dapat free ongkir atau potongan ongkir bulan ini, dan berapa rupiah ongkir yang diberikan.
              Angka ini tidak mengubah omset maupun laba.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#F9FAFB] px-3 py-1.5 text-[11px] font-bold text-zinc-600">{data?.period.label || month}</span>
          {isFetching ? <Loader2 size={14} className="animate-spin text-zinc-400" /> : null}
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 text-xs font-semibold text-zinc-500">Memuat promo ongkir…</p>
      ) : isError || !data ? (
        <p className="mt-4 text-xs font-semibold text-rose-700">
          {error instanceof Error ? error.message : "Gagal memuat promo ongkir."}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {/* 1. Dua blok besar */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Blok
              dark
              testId="promo-ongkir-jabo"
              judul="Jabodetabek (Gratis Ongkir)"
              pesanan={data.jabodetabek.pesanan}
              rupiah={data.jabodetabek.rupiah}
              keterangan="Total ongkir yang digratiskan"
            />
            <Blok
              testId="promo-ongkir-luar"
              judul={`Luar Jabodetabek (Potongan ${data.luarPersen}%)`}
              pesanan={data.luar.pesanan}
              rupiah={data.luar.rupiah}
              keterangan="Total ongkir yang dipotong"
            />
          </div>

          {/* 2. Ringkasan total */}
          <div data-testid="promo-ongkir-total" className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Total semua promo ongkir</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold text-zinc-500">Total pesanan yang dapat promo ongkir</p>
                <p className="text-xl font-black tabular-nums text-zinc-900">{nfmt(data.total.pesanan)} pesanan</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-zinc-500">Total ongkir yang diberikan ke customer</p>
                <p className="text-xl font-black tabular-nums text-zinc-900">{rp(data.total.diberikan)}</p>
              </div>
            </div>
          </div>

          {/* 3. Uang yang benar-benar keluar */}
          <div data-testid="promo-ongkir-uang-keluar" className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <p className="text-[13px] font-black text-zinc-900">
              Uang yang benar-benar keluar dari SAMAQU: <span className="tabular-nums">{rp(data.uangKeluar.samaqu)}</span>
            </p>
            <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-zinc-500">
              Bagian potongan yang ditanggung SAMAQU. Sisanya ({rp(data.uangKeluar.ditanggungJnt)}) sudah ditanggung diskon akun J&amp;T {data.jntDiskonPersen}%.
            </p>
          </div>

          {data.belumAktif ? (
            <p className="text-[11px] font-semibold text-zinc-500">Fitur promo ongkir belum aktif di database, jadi belum ada angka.</p>
          ) : totalPesanan === 0 ? (
            <p className="text-xs font-semibold text-zinc-500">Belum ada pesanan yang dapat promo ongkir di {data.period.label}.</p>
          ) : null}

          {/* 4. Rincian (bisa dilipat) */}
          <div>
            <button
              type="button"
              onClick={() => setShowDetail((value) => !value)}
              aria-expanded={showDetail}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[11px] font-black text-zinc-800 shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition hover:bg-zinc-50"
            >
              <ChevronDown size={14} className={`transition-transform ${showDetail ? "rotate-180" : ""}`} />
              {showDetail ? "Sembunyikan rincian" : `Lihat rincian (${nfmt(data.rinci.length)} pesanan)`}
            </button>

            {showDetail ? (
              <div className="mt-2 space-y-3">
                {/* Asal pesanan */}
                <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Asal pesanan</p>
                    <p className="text-[11px] font-semibold text-zinc-500">dari {nfmt(totalPesanan)} pesanan</p>
                  </div>
                  {totalPesanan > 0 ? (
                    <>
                      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-zinc-100">
                        {ORIGIN_ORDER.map((origin) =>
                          data.perAsal[origin] > 0 ? (
                            <span
                              key={origin}
                              title={`${ORIGIN_META[origin].label}: ${data.perAsal[origin]} pesanan`}
                              className={ORIGIN_META[origin].bar}
                              style={{ width: `${(data.perAsal[origin] / totalPesanan) * 100}%` }}
                            />
                          ) : null,
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                        {ORIGIN_ORDER.map((origin, index) => (
                          <span key={origin} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-900">
                            <span className={`h-2.5 w-2.5 rounded-full ring-1 ring-zinc-300 ${ORIGIN_META[origin].bar}`} />
                            {ORIGIN_META[origin].label}
                            <span className="tabular-nums text-zinc-500">
                              {nfmt(data.perAsal[origin])} pesanan ({persen[index]}%)
                            </span>
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-zinc-500">Belum ada pesanan berpromo di {data.period.label}.</p>
                  )}
                </div>

                {/* Per hari */}
                <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Pesanan dapat promo per hari</p>
                  <div className="mt-2 flex h-16 items-end gap-[3px]">
                    {data.perHari.map((row) => (
                      <span
                        key={row.hari}
                        title={`${tanggalPendek(row.hari)}: ${row.pesanan} pesanan`}
                        className={`min-w-[3px] flex-1 rounded-t ${row.pesanan > 0 ? "bg-zinc-800" : "bg-zinc-200"}`}
                        style={{ height: `${row.pesanan > 0 ? Math.max(10, (row.pesanan / maxHari) * 100) : 4}%` }}
                      />
                    ))}
                  </div>
                  {hariAda > 1 ? (
                    <div className="mt-1 flex justify-between text-[10px] font-semibold text-zinc-500">
                      <span>{tanggalPendek(data.perHari[0].hari)}</span>
                      <span>paling ramai {nfmt(totalPesanan === 0 ? 0 : maxHari)} pesanan/hari</span>
                      <span>{tanggalPendek(data.perHari[hariAda - 1].hari)}</span>
                    </div>
                  ) : null}
                </div>

                {/* Daftar rinci */}
                <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        <th className="px-3 py-2.5">Tanggal</th>
                        <th className="px-3 py-2.5">Pesanan</th>
                        <th className="px-3 py-2.5">Pelanggan</th>
                        <th className="px-3 py-2.5">Tujuan</th>
                        <th className="px-3 py-2.5 text-right">Ongkir J&amp;T</th>
                        <th className="px-3 py-2.5 text-right">Dipotong</th>
                        <th className="px-3 py-2.5 text-right">Dibayar customer</th>
                        <th className="px-3 py-2.5">Asal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rinci.slice(0, DETAIL_LIMIT).map((row) => (
                        <tr key={`${row.nomorPesanan}-${row.tanggal}`} className="border-t border-zinc-100">
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-600">{tanggalWaktu(row.tanggal)}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-black text-zinc-900">{row.nomorPesanan}</td>
                          <td className="px-3 py-2 font-semibold text-zinc-700">{row.pelanggan}</td>
                          <td className="px-3 py-2 font-semibold text-zinc-600">
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={11} strokeWidth={2} />
                              {row.tujuan}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-zinc-600">{rp(row.ongkirJnt)}</td>
                          <td className="px-3 py-2 text-right font-black tabular-nums text-zinc-900">{rp(row.potongan)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-zinc-700">{rp(row.dibayar)}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ORIGIN_META[row.asal].badge}`}>
                              {ORIGIN_META[row.asal].label}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!data.rinci.length ? (
                        <tr>
                          <td colSpan={8} className="px-3 py-4 text-center font-semibold text-zinc-500">
                            Belum ada pesanan dengan promo ongkir di periode ini.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                  {data.rinci.length > DETAIL_LIMIT ? (
                    <p className="border-t border-zinc-100 px-3 py-2 text-[11px] font-semibold text-zinc-500">
                      Menampilkan {DETAIL_LIMIT} pesanan terbaru dari {nfmt(data.rinci.length)}.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
