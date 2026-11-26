"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MessageSquare, RefreshCw, Sparkles, Users, Wallet, XCircle } from "lucide-react";
import { opsGet } from "@/app/(internal)/panel-admin/panel-api";

type ProdukTerjual = {
  /** Order sah dari closing AI yang dihitung. */
  orders: number;
  units: number;
  revenue: number;
  /** Jumlah produk berbeda (semua series satu produk). */
  products: number;
  rows: { name: string; subname: string; units: number; revenue: number }[];
};

type Stats = {
  conversations: number;
  messages: number;
  handled: number;
  needsAdmin: number;
  aiHandled: number;
  aiShare: number;
  needsAdminShare: number;
  leads: number;
  leadsFromChat: number;
  leadsFromChatShare: number;
  closing: number;
  nominal: number;
  aiCostUsd?: number | null;
  aiCostIdr?: number | null;
  costPerClosing?: number | null;
  usdIdr?: number;
  handledRate: number;
  closingRate: number;
  closingSource?: "wa_closings" | "drafts";
  /** Closing tanpa order/draft yang bisa dibuktikan: tidak masuk angka utama. */
  closingUnlinked?: number;
  /** Nominal bukti transfer closing yang belum tertaut (termasuk ongkir, hanya informasi). */
  nominalUnlinked?: number;
  /** Closing yang order-nya batal atau draft-nya ditolak: tidak dihitung. */
  closingExcluded?: number;
  /** Hanya ada pada bulan terpilih; null/kosong = belum termuat. */
  produkTerjual?: ProdukTerjual | null;
  growth: {
    conversations: number | null;
    handled: number | null;
    leads: number | null;
    closing: number | null;
    nominal: number | null;
  };
};

type Response = {
  period: { value: string; label: string };
  previousPeriod: { value: string; label: string };
  stats: Stats;
  previous: Stats;
};

const wibMonth = () => {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 7);
};

const money = (value: number) => "Rp" + Math.round(Number(value) || 0).toLocaleString("id-ID");
const number = (value: number) => Math.round(Number(value) || 0).toLocaleString("id-ID");
/** Persentase gaya Indonesia (koma desimal); kosong/NaN tetap "0%". */
const percent = (value: number) =>
  `${(Number(value) || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: "#9aacb8" }}>—</span>;
  if (value === 0) return <span style={{ color: "#8a7d83" }}>0%</span>;
  return (
    <span style={{ color: value > 0 ? "#1f8a58" : "#b24a4a" }}>
      {value > 0 ? "+" : ""}{value}% <span style={{ opacity: 0.7 }}>dari periode lalu</span>
    </span>
  );
}

function KpiCard({
  label,
  value,
  hint,
  secondary,
  delta,
  tone = "#2f6f9e",
  icon,
  chips,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  secondary?: string;
  delta?: number | null;
  tone?: string;
  icon: React.ReactNode;
  /** Penanda aturan hitung (pil kecil berikon) di bawah angka. */
  chips?: { label: string; icon: React.ReactNode; color: string }[];
}) {
  const hasDelta = delta !== undefined && delta !== null;
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "#e3ebf1" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#7c93a6" }}>{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${tone}14`, color: tone }}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums" style={{ color: "#2a1a22" }}>{value}</p>
      {secondary ? (
        <p className="mt-0.5 text-sm font-black tabular-nums" style={{ color: tone }}>{secondary}</p>
      ) : null}
      <p className="mt-1 text-[11px] font-semibold" style={{ color: "#8a7d83" }}>
        {hasDelta ? <Delta value={delta as number} /> : hint}
      </p>
      {hasDelta && hint ? <p className="mt-0.5 text-[10px]" style={{ color: "#9aacb8" }}>{hint}</p> : null}
      {chips && chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold leading-none"
              style={{ background: `${chip.color}14`, color: chip.color }}
            >
              {chip.icon}
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AiPerformanceView() {
  const [month, setMonth] = useState(wibMonth);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await opsGet<Response>(`/api/ops/ai-performance?month=${encodeURIComponent(month)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat performa AI.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = data?.stats;

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#7c93a6" }}>SAMAQU Intelligence Overview</p>
          <h1 className="mt-1 text-2xl font-black" style={{ color: "#2a1a22" }}>AI Performance Center</h1>
          <p className="mt-1 text-sm" style={{ color: "#6B6A64" }}>
            Percakapan, closing, dan nilai transaksi yang ditangani AI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value || wibMonth())}
            aria-label="Pilih periode"
            className="h-10 rounded-xl border bg-white px-3 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-[#4a90c2]/40"
            style={{ borderColor: "#d5e3ee", color: "#2a1a22" }}
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-xs font-bold disabled:opacity-50"
            style={{ borderColor: "#d5e3ee", color: "#2f6f9e" }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Muat ulang
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl p-5 shadow-sm sm:p-6" style={{ background: "linear-gradient(120deg,#1f3a4d 0%,#2d5368 60%,#3b687d 100%)", color: "#fff" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/12"><Sparkles size={20} /></span>
            <div>
              <p className="text-sm font-black">AI Performance</p>
              <p className="text-xs text-white/60">SAMAQU Intelligence Overview</p>
            </div>
          </div>
          <span className="rounded-full px-3 py-1 text-[11px] font-bold" style={{ background: "rgba(83,224,145,.14)", color: "#82e6a8" }}>Operational</span>
        </div>
        <h2 className="mt-5 text-2xl font-black sm:text-3xl">Performa AI Agent</h2>
        <p className="mt-1 text-xs text-white/60">Periode: {data?.period.label || month}</p>
      </div>

      {error ? (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: "#FCE8E8", borderColor: "#F3CFCB", color: "#9B2C2C" }}>{error}</div>
      ) : null}

      {loading && !stats ? (
        <div className="flex min-h-[260px] items-center justify-center gap-2 rounded-2xl border bg-white text-sm" style={{ borderColor: "#e3ebf1", color: "#6B6A64" }}>
          <Loader2 className="animate-spin" size={18} /> Memuat performa AI…
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <KpiCard
              label="Chat ditangani AI"
              value={number(stats.aiHandled)}
              secondary={percent(stats.aiShare)}
              hint={
                <>
                  dari {number(stats.conversations)} percakapan
                  <br />
                  {number(stats.messages)} pesan WhatsApp
                </>
              }
              icon={<MessageSquare size={16} />}
            />
            <KpiCard
              label="Leads dicatat AI"
              value={number(stats.leadsFromChat)}
              secondary={percent(stats.leadsFromChatShare)}
              hint={`Dari ${number(stats.leads)} lead baru`}
              icon={<Users size={16} />}
              tone="#1f8a58"
            />
            <KpiCard
              label="Berhasil closing"
              value={number(stats.closing)}
              delta={stats.growth.closing}
              hint={
                stats.leadsFromChat > 0
                  ? `${number(stats.closing)} dari ${number(stats.leadsFromChat)} lead AI (${percent(
                      stats.leadsFromChat > 0
                        ? Math.round((stats.closing / stats.leadsFromChat) * 1000) / 10
                        : 0,
                    )})`
                  : `${percent(stats.closingRate)} dari total chat`
              }
              icon={<Check size={16} />}
              tone="#8a5a12"
              chips={[{ label: "Batal & ditolak tidak dihitung", icon: <XCircle size={11} />, color: "#b24a4a" }]}
            />
            <KpiCard
              label="Nominal closing"
              value={money(stats.nominal)}
              delta={stats.growth.nominal}
              hint={
                stats.closing > 0
                  ? `Rata-rata ${money(stats.nominal / stats.closing)} per closing`
                  : "Belum ada closing bulan ini"
              }
              icon={<Wallet size={16} />}
              tone="#7a4a8a"
              chips={[
                { label: "Hanya harga produk", icon: <Check size={11} />, color: "#1f8a58" },
                { label: "Ongkir tidak dihitung", icon: <XCircle size={11} />, color: "#7a4a8a" },
              ]}
            />
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: "#e3ebf1" }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#7c93a6" }}>Biaya AI bulan ini</p>
                <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: "#2a1a22" }}>
                  {stats.aiCostIdr == null ? "Belum tersedia" : money(stats.aiCostIdr)}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "#8a7d83" }}>
                  {stats.aiCostUsd == null
                    ? "Pencatatan biaya belum aktif."
                    : `$${Number(stats.aiCostUsd).toFixed(2)} · kurs Rp${number(stats.usdIdr ?? 0)}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#7c93a6" }}>Biaya per closing</p>
                <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: "#1f8a58" }}>
                  {stats.costPerClosing == null ? "Belum ada closing" : money(stats.costPerClosing)}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "#8a7d83" }}>
                  dari {number(stats.closing)} closing bulan ini
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5" style={{ borderColor: "#e3ebf1" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black" style={{ color: "#2a1a22" }}>Produk terjual lewat AI</h3>
                <p className="mt-0.5 text-xs" style={{ color: "#8a7d83" }}>
                  Barang di order closing AI bulan ini, urut dari yang paling banyak laku.
                </p>
              </div>
              {stats.produkTerjual && stats.produkTerjual.products > 0 ? (
                <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "#e8f3fb", color: "#2f6f9e" }}>
                  {number(stats.produkTerjual.products)} produk · {number(stats.produkTerjual.units)} pcs
                </span>
              ) : null}
            </div>
            {!stats.produkTerjual || stats.produkTerjual.rows.length === 0 ? (
              <p className="mt-3 py-4 text-sm" style={{ color: "#8a7d83" }}>
                {stats.produkTerjual ? "Belum ada produk terjual lewat AI pada periode ini." : "Daftar produk belum bisa dimuat."}
              </p>
            ) : (
              <ol className="mt-3 divide-y" style={{ borderColor: "#edf1f4" }}>
                {stats.produkTerjual.rows.map((item, index) => {
                  const top = stats.produkTerjual?.rows[0]?.units || 1;
                  return (
                    <li key={`${item.name}-${item.subname}-${index}`} className="flex items-center gap-3 py-3">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                        style={{ background: index === 0 ? "#2f6f9e" : "#e8f3fb", color: index === 0 ? "#ffffff" : "#2f6f9e" }}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <p className="truncate text-xs font-bold" style={{ color: "#2a1a22" }}>
                            {item.name}
                            {item.subname ? <span className="ml-1.5 font-semibold" style={{ color: "#9aacb8" }}>{item.subname}</span> : null}
                          </p>
                          <p className="text-[11px] font-semibold tabular-nums" style={{ color: "#6B6A64" }}>
                            <b style={{ color: "#2a1a22" }}>{number(item.units)} pcs</b> · {money(item.revenue)}
                          </p>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "#edf1f4" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.max(4, Math.round((item.units / top) * 100))}%`, background: "#2f6f9e" }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {stats.produkTerjual && stats.produkTerjual.rows.length > 0 ? (
              <p className="mt-3 text-[11px]" style={{ color: "#8a7d83" }}>
                Total {number(stats.produkTerjual.units)} pcs dari {number(stats.produkTerjual.orders)} order · omzet {money(stats.produkTerjual.revenue)} (setelah diskon, tanpa ongkir). Cover &amp; hanger tidak ikut daftar.
              </p>
            ) : null}
          </div>

          {(stats.closingUnlinked || 0) > 0 || (stats.closingExcluded || 0) > 0 ? (
            <div className="rounded-2xl border px-4 py-3 text-[12px] leading-relaxed" style={{ borderColor: "#f1dfb8", background: "#fff9ec", color: "#7a5a1a" }}>
              {(stats.closingUnlinked || 0) > 0 ? (
                <p>
                  <b>{number(stats.closingUnlinked || 0)} closing belum tertaut order</b> dan tidak masuk angka di atas
                  (nominal transfer {money(stats.nominalUnlinked || 0)}, masih termasuk ongkir). Biasanya draft-nya dihapus tanpa
                  input transaksi, atau closing lama dari sebelum ada draft.
                </p>
              ) : null}
              {(stats.closingExcluded || 0) > 0 ? (
                <p className={(stats.closingUnlinked || 0) > 0 ? "mt-1" : ""}>
                  <b>{number(stats.closingExcluded || 0)} closing tidak dihitung</b> karena order-nya batal atau draft-nya ditolak.
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="text-[11px] leading-relaxed" style={{ color: "#8a7d83" }}>
            {stats.closingSource === "wa_closings" ? (
              <>
                Closing = closing yang dicatat bot dan <b>terbukti lewat order</b>: draft yang di-approve (order sah),
                draft yang menunggu approve, atau transaksi manual yang cocok (nomor HP dan total sama persis).
                Nominal = <b>harga produk saja</b> (setelah diskon, tanpa ongkir). Order batal dan draft ditolak tidak dihitung.
              </>
            ) : (
              <>Closing dihitung dari draft AI yang <b>disetujui admin</b> dan order-nya masih sah (diproses/dikirim/selesai).</>
            )}{" "}
            Chat ditangani AI = percakapan unik periode ini dikurangi yang perlu bantuan admin
            (handover ke Pertanyaan AI atau sudah dibalas admin). Leads dicatat AI = lead periode
            ini yang nomornya ada di percakapan WhatsApp periode ini. Pesan grup dan draft/order
            batal tidak dihitung. 1 percakapan = 1 nomor customer unik; jumlah pesan WhatsApp
            bukan jumlah lead.
          </p>
        </>
      ) : null}
    </section>
  );
}
