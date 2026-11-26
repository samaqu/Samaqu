"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Coins, Gift, Loader2, Package, Wallet } from "lucide-react";
import { bagiPersen, VARIAN_KOKO, VARIAN_THOBE } from "@/lib/promo-fch-report";

/**
 * "Rincian Biaya Free Gift" — Promo Free Cover Hanger, di Laporan Office (di bawah Perhitungan Laba).
 *
 * Menggantikan tabel Rincian Biaya Free Gift lama dan kartu cover di Produk Terlaris: semua angka cover ada di
 * sini. Urutan baca (dari yang terpenting ke yang rinci): empat angka utama, peringatan stok, asal pesanan,
 * per varian (gratis, dibeli, stok), grafik harian, daftar rinci.
 *
 * Angka dari `/api/ops/promo-fch` (hanya pesanan sah; satu bulan WIB). Hanya membaca.
 * Palet monokrom brand Samaqu (zinc/grafit) seperti bagian laporan lain; amber/rose hanya untuk peringatan stok.
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
  stok: Array<{ varian: string; stok: number | null; perkiraanHari: number | null }>;
};

const ORIGIN_META: Record<Origin, { label: string; bar: string; badge: string }> = {
  bot: { label: "Bot WA", bar: "bg-zinc-900", badge: "bg-zinc-900 text-white" },
  admin: { label: "Input admin", bar: "bg-zinc-500", badge: "bg-zinc-200 text-zinc-800" },
  website: { label: "Website", bar: "bg-zinc-300", badge: "bg-white text-zinc-600 ring-1 ring-zinc-300" },
};
const ORIGIN_ORDER: Origin[] = ["bot", "admin", "website"];
const DETAIL_LIMIT = 50;
/** Stok dianggap perlu diperhatikan kalau diperkirakan habis dalam sekian hari. */
const HARI_WASPADA = 14;
const HARI_GENTING = 7;

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

/** Warna teks perkiraan hari stok: genting (rose), waspada (amber), aman (abu). */
function toneHari(hari: number | null, stok: number | null) {
  if (stok === 0) return "text-rose-700";
  if (hari === null) return "text-zinc-500";
  if (hari <= HARI_GENTING) return "text-rose-700";
  if (hari <= HARI_WASPADA) return "text-amber-700";
  return "text-zinc-500";
}

function Tile({
  icon,
  label,
  value,
  note,
  dark,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
  dark?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-2xl p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${dark ? "bg-zinc-900 text-white" : "bg-white text-zinc-900"}`}
    >
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${dark ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-700"}`}>
          {icon}
        </span>
        <p className={`text-[10px] font-bold uppercase tracking-wider ${dark ? "text-zinc-300" : "text-zinc-500"}`}>{label}</p>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums tracking-tight">{value}</p>
      {note ? <p className={`mt-0.5 text-[11px] font-semibold leading-snug ${dark ? "text-zinc-300" : "text-zinc-500"}`}>{note}</p> : null}
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
  const hariAda = (data?.perHari || []).length;

  // Satu baris per varian: gratis, dibeli, stok, dan perkiraan hari (varian tanpa pemakaian tetap tampil).
  const nama = [VARIAN_THOBE, VARIAN_KOKO];
  for (const row of data?.perVarian || []) if (!nama.includes(row.varian)) nama.push(row.varian);
  const varianRows = nama.map((varian) => {
    const pakai = data?.perVarian.find((row) => row.varian === varian);
    const stok = data?.stok.find((row) => row.varian === varian);
    return {
      varian,
      gratis: pakai?.gratis ?? 0,
      dibeli: pakai?.dibeli ?? 0,
      stok: stok ? stok.stok : null,
      hari: stok ? stok.perkiraanHari : null,
    };
  });
  const maxGratis = Math.max(1, ...varianRows.map((row) => row.gratis));
  const waspada = varianRows.filter((row) => row.stok === 0 || (row.hari !== null && row.hari <= HARI_WASPADA));
  const persen = data ? bagiPersen(ORIGIN_ORDER.map((origin) => data.perAsal[origin])) : [];

  return (
    <section data-testid="promo-fch-card" className="lpr-rise rounded-3xl border border-[#E4E4E7] bg-[#EFEFF1] p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-zinc-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <Gift size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h2 className="text-sm font-black tracking-tight text-zinc-900">Rincian Biaya Free Gift</h2>
            <p className="mt-0.5 text-xs font-medium text-zinc-500">
              Promo Free Cover Hanger: berapa cover & hanger gratis yang keluar, dari mana asalnya, dan sisa stoknya.
              Uangnya sudah ikut Total Omset, modalnya sudah ada di Modal Barang Terjual, jadi tidak mengurangi laba lagi.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#F9FAFB] px-3 py-1.5 text-[11px] font-bold text-zinc-600">
            {data?.period.label || month}
          </span>
          {isFetching ? <Loader2 size={14} className="animate-spin text-zinc-400" /> : null}
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 text-xs font-semibold text-zinc-500">Memuat promo free cover hanger…</p>
      ) : isError || !data ? (
        <p className="mt-4 text-xs font-semibold text-rose-700">
          {error instanceof Error ? error.message : "Gagal memuat promo free cover hanger."}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {/* 1. Tiga angka utama */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile
              dark
              testId="promo-fch-keluar"
              icon={<Gift size={14} strokeWidth={2.1} />}
              label="Total diberikan"
              value={`${nfmt(data.keluar)} cover`}
              note={`dari ${nfmt(data.rinci.length)} pesanan`}
            />
            <Tile
              icon={<Coins size={14} strokeWidth={2.1} />}
              label="Total nilai bonus"
              value={rp(data.nilaiDigratiskan)}
              note="Harga jual normal"
            />
            <Tile
              icon={<Wallet size={14} strokeWidth={2.1} />}
              label="Total modal digunakan"
              value={rp(data.modal)}
              note={
                data.modalTanpaData > 0
                  ? `${nfmt(data.modalTanpaData)} cover belum punya data modal`
                  : "uang yang benar-benar keluar (HPP)"
              }
            />
          </div>

          {/* 2. Peringatan stok (hanya kalau perlu) */}
          {waspada.length ? (
            <div data-testid="promo-fch-peringatan" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
                <AlertTriangle size={15} strokeWidth={2.1} />
              </span>
              <div className="text-xs font-semibold leading-relaxed text-amber-950">
                <p className="font-black">Perhatian: stok cover hampir habis</p>
                {waspada.map((row) => (
                  <p key={row.varian}>
                    {row.varian}: tinggal {nfmt(row.stok)}
                    {row.stok === 0 ? ", sudah habis." : `, cukup sekitar ${nfmt(row.hari)} hari lagi.`}
                  </p>
                ))}
                <p className="text-amber-900/80">Perkiraan kasar dari rata-rata keluar per hari bulan ini. Siapkan tambahan stok.</p>
              </div>
            </div>
          ) : null}

          {/* 3. Asal pesanan */}
          <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Asal pesanan</p>
              <p className="text-[11px] font-semibold text-zinc-500">dari {nfmt(keluar)} cover yang keluar</p>
            </div>
            {keluar > 0 ? (
              <>
                <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-zinc-100">
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
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                  {ORIGIN_ORDER.map((origin, index) => (
                    <span key={origin} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-900">
                      <span className={`h-2.5 w-2.5 rounded-full ring-1 ring-zinc-300 ${ORIGIN_META[origin].bar}`} />
                      {ORIGIN_META[origin].label}
                      <span className="tabular-nums text-zinc-500">
                        {nfmt(data.perAsal[origin])} ({persen[index]}%)
                      </span>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs font-semibold text-zinc-500">Belum ada cover gratis yang keluar di {data.period.label}.</p>
            )}
          </div>

          {/* 4. Per varian: gratis, dibeli, stok, perkiraan hari */}
          <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Per varian</p>
            <div className="mt-2 divide-y divide-zinc-100">
              {varianRows.map((row) => (
                <div key={row.varian} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-xs font-black text-zinc-900">{row.varian}</span>
                    <span className="text-[11px] font-semibold tabular-nums text-zinc-500">
                      gratis {nfmt(row.gratis)} · dibeli {nfmt(row.dibeli)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <span className="block h-full rounded-full bg-zinc-800" style={{ width: `${(row.gratis / maxGratis) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
                    <Package size={12} strokeWidth={2} />
                    Sisa stok{" "}
                    <span className="font-black tabular-nums text-zinc-900">{row.stok === null ? "tidak terbaca" : nfmt(row.stok)}</span>
                    {row.stok !== null && row.hari !== null ? (
                      <span className={`font-black ${toneHari(row.hari, row.stok)}`}>· cukup ±{nfmt(row.hari)} hari</span>
                    ) : row.stok === 0 ? (
                      <span className="font-black text-rose-700">· habis</span>
                    ) : null}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-zinc-100 pt-2.5 text-[11px] font-semibold text-zinc-500">
              Dibeli (berbayar, termasuk add-on Open Order): {nfmt(data.dibeli.unit)} cover · {rp(data.dibeli.omzet)}
            </p>
          </div>

          {/* 5. Keluar per hari */}
          <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Keluar per hari</p>
            <div className="mt-2 flex h-16 items-end gap-[3px]">
              {data.perHari.map((row) => (
                <span
                  key={row.hari}
                  title={`${tanggalPendek(row.hari)}: ${row.unit} cover`}
                  className={`min-w-[3px] flex-1 rounded-t ${row.unit > 0 ? "bg-zinc-800" : "bg-zinc-200"}`}
                  style={{ height: `${row.unit > 0 ? Math.max(10, (row.unit / maxHari) * 100) : 4}%` }}
                />
              ))}
            </div>
            {hariAda > 1 ? (
              <div className="mt-1 flex justify-between text-[10px] font-semibold text-zinc-500">
                <span>{tanggalPendek(data.perHari[0].hari)}</span>
                <span>puncak {nfmt(keluar === 0 ? 0 : maxHari)} cover/hari</span>
                <span>{tanggalPendek(data.perHari[hariAda - 1].hari)}</span>
              </div>
            ) : null}
          </div>

          {/* 6. Daftar rinci (buka-tutup) */}
          <div>
            <button
              type="button"
              onClick={() => setShowDetail((value) => !value)}
              aria-expanded={showDetail}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[11px] font-black text-zinc-800 shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition hover:bg-zinc-50"
            >
              <ChevronDown size={14} className={`transition-transform ${showDetail ? "rotate-180" : ""}`} />
              {showDetail ? "Sembunyikan daftar rinci" : `Lihat daftar rinci (${nfmt(data.rinci.length)} pesanan)`}
            </button>

            {showDetail ? (
              <div className="mt-2 overflow-x-auto rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      <th className="px-3 py-2.5">Tanggal</th>
                      <th className="px-3 py-2.5">Pesanan</th>
                      <th className="px-3 py-2.5">Pelanggan</th>
                      <th className="px-3 py-2.5">Varian</th>
                      <th className="px-3 py-2.5 text-right">Cover</th>
                      <th className="px-3 py-2.5">Asal</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rinci.slice(0, DETAIL_LIMIT).map((row) => (
                      <tr key={`${row.nomorPesanan}-${row.tanggal}`} className="border-t border-zinc-100">
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-600">{tanggalWaktu(row.tanggal)}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-black text-zinc-900">{row.nomorPesanan}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-700">{row.pelanggan}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-600">{row.varian}</td>
                        <td className="px-3 py-2 text-right font-black tabular-nums text-zinc-900">{nfmt(row.unit)}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ORIGIN_META[row.asal].badge}`}>
                            {ORIGIN_META[row.asal].label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-zinc-600">{row.status}</td>
                      </tr>
                    ))}
                    {!data.rinci.length ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-center font-semibold text-zinc-500">
                          Belum ada pesanan dengan cover gratis di periode ini.
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
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
