"use client";

import { useCallback, useEffect, useState } from "react";
import { opsResellerApi, type QueuePayload, type ResellerAdminRow, type ResellerStats } from "./api";
import { rupiah } from "@/lib/reseller/format";
import QueueTab from "./QueueTab";
import ResellersTab from "./ResellersTab";
import ResellerDrawer from "./ResellerDrawer";
import LedgerTab from "./LedgerTab";
import SettingsTab from "./SettingsTab";

type TabKey = "perlu-dicek" | "data" | "mutasi" | "pengaturan";

const TABS: { key: TabKey; label: string }[] = [
  { key: "perlu-dicek", label: "Perlu Dicek" },
  { key: "data", label: "Data Reseller" },
  { key: "mutasi", label: "Mutasi Saldo" },
  { key: "pengaturan", label: "Pengaturan" },
];

/**
 * Halaman admin Reseller — dipakai dashboard ops (`/ops/reseller`) DAN panel
 * admin (`/panel-admin/reseller`) lewat prop `variant`, sama seperti Transaksi.
 */
export default function ResellerAdminPage({ variant = "ops" }: { variant?: "ops" | "panel" }) {
  const [tab, setTab] = useState<TabKey>("perlu-dicek");
  const [stats, setStats] = useState<ResellerStats | null>(null);
  const [queue, setQueue] = useState<QueuePayload | null>(null);
  const [resellers, setResellers] = useState<ResellerAdminRow[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [detail, setDetail] = useState<ResellerAdminRow | null>(null);
  const [error, setError] = useState("");

  // Tab awal bisa dari URL (?tab=data) — dipakai kartu dashboard ops.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some((item) => item.key === param)) setTab(param as TabKey);
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setStats(await opsResellerApi.stats());
    } catch {
      /* kartu ringkasan bukan jalur kritis */
    }
  }, []);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      setQueue(await opsResellerApi.queue());
      setError("");
    } catch {
      setError("Gagal memuat antrean. Coba lagi.");
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  const loadResellers = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await opsResellerApi.resellers();
      setResellers(res.data);
    } catch {
      setError("Gagal memuat daftar reseller.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadQueue();
    loadResellers();
  }, [loadStats, loadQueue, loadResellers]);

  const refreshAll = useCallback(() => {
    loadStats();
    loadQueue();
    loadResellers();
  }, [loadStats, loadQueue, loadResellers]);

  const cards = [
    { label: "Reseller aktif", value: stats ? String(stats.aktif) : "…" },
    { label: "Total saldo reseller (titipan)", value: stats ? rupiah(stats.total_saldo) : "…" },
    { label: "Pesanan reseller bulan ini", value: stats ? String(stats.pesanan_bulan_ini) : "…" },
    { label: "Perlu dicek", value: stats ? String(stats.perlu_dicek) : "…", accent: (stats?.perlu_dicek ?? 0) > 0 },
  ];

  return (
    <div className="max-w-[1280px] mx-auto" data-variant={variant}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Reseller</h1>
          <p className="text-[12.5px] text-slate-500">Kelola akun reseller, saldo titipan, dan antrean konfirmasi.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-200 px-4 py-3.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">{card.label}</p>
            <p className={`text-[18px] font-extrabold ${card.accent ? "text-amber-600" : "text-slate-900"}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-bold border transition-all ${
              tab === item.key
                ? "bg-[#18181b] text-white border-[#18181b]"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {item.label}
            {item.key === "perlu-dicek" && (stats?.perlu_dicek ?? 0) > 0 ? (
              <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black px-1">
                {stats?.perlu_dicek}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold">{error}</div>
      ) : null}

      {tab === "perlu-dicek" ? (
        <QueueTab queue={queue} loading={loadingQueue} onChanged={refreshAll} />
      ) : tab === "data" ? (
        <ResellersTab rows={resellers} loading={loadingList} onChanged={refreshAll} onOpenDetail={setDetail} />
      ) : tab === "mutasi" ? (
        <LedgerTab resellers={resellers} onChanged={refreshAll} />
      ) : (
        <SettingsTab onChanged={loadStats} />
      )}

      {detail ? <ResellerDrawer row={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
