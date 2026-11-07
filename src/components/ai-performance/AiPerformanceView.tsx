"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MessageSquare, RefreshCw, Sparkles, Users, Wallet } from "lucide-react";
import { opsGet } from "@/app/(internal)/panel-admin/panel-api";

type Activity = {
  sender: string;
  sender_name: string | null;
  message: string;
  reply_text: string | null;
  status: string | null;
  created_at: string;
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
  handledRate: number;
  closingRate: number;
  closingSource?: "wa_closings" | "drafts";
  activity: Activity[];
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
const phone = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
};
const shortTime = (value: string) =>
  new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  });

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
}: {
  label: string;
  value: string;
  hint?: string;
  secondary?: string;
  delta?: number | null;
  tone?: string;
  icon: React.ReactNode;
}) {
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
        {delta !== undefined ? <Delta value={delta} /> : hint}
      </p>
      {delta !== undefined && hint ? <p className="mt-0.5 text-[10px]" style={{ color: "#9aacb8" }}>{hint}</p> : null}
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
              hint={`${number(stats.conversations)} percakapan dari ${number(stats.messages)} pesan WhatsApp`}
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
              hint={`${percent(stats.closingRate)} dari total chat`}
              icon={<Check size={16} />}
              tone="#8a5a12"
            />
            <KpiCard
              label="Nominal closing"
              value={money(stats.nominal)}
              delta={stats.growth.nominal}
              hint="Nilai transaksi"
              icon={<Wallet size={16} />}
              tone="#7a4a8a"
            />
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5" style={{ borderColor: "#e3ebf1" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black" style={{ color: "#2a1a22" }}>Aktivitas percakapan</h3>
                <p className="mt-0.5 text-xs" style={{ color: "#8a7d83" }}>Percakapan terbaru pada periode ini.</p>
              </div>
              <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "#e8f3fb", color: "#2f6f9e" }}>{stats.activity.length} terbaru</span>
            </div>
            <div className="mt-3 divide-y" style={{ borderColor: "#edf1f4" }}>
              {stats.activity.length === 0 ? (
                <p className="py-4 text-sm" style={{ color: "#8a7d83" }}>Belum ada percakapan pada periode ini.</p>
              ) : stats.activity.map((item, index) => (
                <div key={`${item.sender}-${item.created_at}-${index}`} className="flex items-start gap-3 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black" style={{ background: "#fdf0f4", color: "#8a4c62" }}>
                    {(item.sender_name || phone(item.sender) || "C").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <p className="truncate text-xs font-bold" style={{ color: "#2a1a22" }}>{item.sender_name || phone(item.sender)}</p>
                      <span className="text-[10px]" style={{ color: "#9aacb8" }}>{shortTime(item.created_at)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px]" style={{ color: "#6B6A64" }}>{item.message || "—"}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: item.reply_text ? "#e7f5eb" : "#f2f4f6", color: item.reply_text ? "#1f8a58" : "#7c8a93" }}>
                    {item.reply_text ? "Dibalas" : "Belum"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: "#8a7d83" }}>
            {stats.closingSource === "wa_closings" ? (
              <>Closing diambil dari <b>catatan closing AI</b> (wa_closings) pada periode ini; nominal memakai nominal bukti transfer.</>
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
