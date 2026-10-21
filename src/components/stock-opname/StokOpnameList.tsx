"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  OPNAME_STATUS,
  formatRupiah,
  type OpnameStatus,
} from "@/lib/stock-opname";

/**
 * Daftar sesi Stok Opname + panduan singkat.
 *
 * Bahasa sengaja awam ("Stok di sistem", "Hitungan di rak", "Selisih") karena dipakai
 * staf gudang. Tampilan memakai pola kartu & tabel panel admin (lihat Laporan Stok).
 */

type SessionRow = {
  id: string;
  code: string;
  status: OpnameStatus;
  created_at: string;
  created_by_name?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  total: number;
  dihitung: number;
  selisih: number;
  nilai: number;
};

const STEPS = [
  { n: 1, title: "Mulai sesi", desc: "Buat sesi baru, stok sistem dikunci sebagai pembanding." },
  { n: 2, title: "Input hitungan fisik", desc: "Isi jumlah barang yang benar-benar ada di rak." },
  { n: 3, title: "Isi penyebab selisih", desc: "Kalau beda, pilih penyebabnya supaya tercatat." },
  { n: 4, title: "Terapkan ke stok", desc: "Stok langsung berubah setelah kamu menekan tombolnya." },
];

const HOW_TO = [
  "Klik “+ Mulai opname” untuk membuat sesi baru. Stok di sistem otomatis dicatat sebagai pembanding.",
  "Hitung barang di rak, lalu isi angkanya di kotak “Hitungan di rak”. Selisih muncul otomatis.",
  "Kalau ada selisih, pilih penyebabnya (salah hitung, rusak, hilang, dan seterusnya).",
  "Klik “Terapkan ke stok” lalu konfirmasi. Stok langsung berubah dan sesi jadi Selesai.",
];

function statusPill(status: OpnameStatus) {
  const tone = OPNAME_STATUS[status]?.tone || "draft";
  const style: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-200",
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  };
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${style[tone]}`}>
      {OPNAME_STATUS[status]?.label || status}
    </span>
  );
}

export default function StokOpnameList({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [items, setItems] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [howToOpen, setHowToOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ops/stock-opname", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Gagal memuat daftar sesi.");
      setItems(json?.items || []);
      // Pertama kali membuka halaman (belum ada sesi): panduan langsung terbuka.
      if ((json?.items || []).length === 0) setHowToOpen(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar sesi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const draftCount = useMemo(() => items.filter((i) => i.status === "draft").length, [items]);

  const startSession = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ops/stock-opname", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Gagal membuat sesi.");
      router.push(`${basePath}/${json.session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat sesi.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Judul + tombol utama */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-inter text-2xl md:text-3xl font-black text-slate-900 dark:text-white">Stok Opname</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Cocokkan stok sistem dengan hitungan fisik. Stok berubah setelah kamu menekan Terapkan ke stok.
          </p>
        </div>
        <button
          type="button"
          onClick={startSession}
          disabled={busy || draftCount > 0}
          title={draftCount > 0 ? "Selesaikan dulu sesi draft yang masih terbuka" : "Buat sesi hitung baru"}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold shadow-sm hover:bg-[#16304f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <span className="text-lg leading-none">+</span> {busy ? "Menyiapkan…" : "Mulai opname"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {/* Cara pakai (bisa dibuka-tutup) */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28] overflow-hidden">
        <button
          type="button"
          onClick={() => setHowToOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
          aria-expanded={howToOpen}
        >
          <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <span className="grid place-items-center h-6 w-6 rounded-full bg-[#1e3a5f] text-white text-xs font-black">?</span>
            Cara pakai
          </span>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{howToOpen ? "Tutup" : "Buka"}</span>
        </button>
        {howToOpen ? (
          <ol className="px-4 pb-4 space-y-2">
            {HOW_TO.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                <span className="shrink-0 grid place-items-center h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-700 text-[11px] font-black text-slate-700 dark:text-slate-200">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {/* 4 kartu langkah */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STEPS.map((step) => (
          <div key={step.n} className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28] p-3.5">
            <span className="grid place-items-center h-7 w-7 rounded-full bg-[#1e3a5f] text-white text-xs font-black">{step.n}</span>
            <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white leading-tight">{step.title}</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{step.desc}</p>
          </div>
        ))}
      </div>

      {/* Riwayat sesi */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28] overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
          <p className="text-sm font-bold text-slate-900 dark:text-white">Riwayat sesi</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-[#1e3a5f]">
                {["No", "Tanggal", "Baris Dihitung", "Baris Selisih", "Nilai Selisih", "Status", "Diterapkan oleh", "Waktu", ""].map((h) => (
                  <th key={h} className="px-3 py-3 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f] last:border-r-0 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">Memuat…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                    Belum ada sesi. Klik “+ Mulai opname” untuk memulai hitungan pertama.
                  </td>
                </tr>
              ) : (
                items.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`${index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-blue-50/30 dark:bg-[#1a1d28]"} border-b border-gray-100 dark:border-slate-800/50`}
                  >
                    <td className="px-3 py-3 text-sm font-black text-slate-900 dark:text-white whitespace-nowrap">{row.code}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {row.dihitung} <span className="text-[11px] font-medium text-slate-400">dari {row.total}</span>
                    </td>
                    <td className="px-3 py-3 text-sm font-bold whitespace-nowrap">
                      <span className={row.selisih > 0 ? "text-orange-600 dark:text-orange-400" : "text-slate-500 dark:text-slate-400"}>
                        {row.selisih}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm font-bold whitespace-nowrap">
                      <span className={row.nilai < 0 ? "text-red-600 dark:text-red-400" : row.nilai > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>
                        {row.nilai === 0 ? "-" : `${row.nilai < 0 ? "−" : "+"}Rp ${formatRupiah(row.nilai)}`}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{statusPill(row.status)}</td>
                    <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {row.reviewed_by_name || "-"}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {row.reviewed_at
                        ? new Date(row.reviewed_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
                        : "-"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`${basePath}/${row.id}`}
                        className="inline-flex px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-white text-xs font-bold hover:bg-[#16304f] transition-colors"
                      >
                        Lihat
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Angka “Stok di sistem” dikunci saat sesi dimulai. Kalau ada transaksi masuk selama proses hitung, sistem
        menghitung penyesuaian dari stok terbaru supaya tidak salah timpa.
      </p>
    </div>
  );
}
