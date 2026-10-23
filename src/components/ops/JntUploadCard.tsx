"use client";

import { useRef, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle, Loader2, Sparkles } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { base44 } from "@/lib/ops-api";
import { JNT_INVOICE_SQL_FILE, formatPeriode, formatRp, type JntUploadResult } from "@/lib/jnt-invoice";

/**
 * Upload ekspor "Resi Saya" dari portal J&T (Ekspor → Data semua halaman).
 *
 * Idempoten: kuncinya nomor resi, jadi file yang sama boleh diupload berkali-kali —
 * baris yang sudah ada cuma dihitung "sudah ada" dan beban tidak bertambah.
 * Bulan tagihan diambil dari TANGGAL PENGIRIMAN tiap baris (bukan dari pilihan bulan
 * di layar), karena beban ongkir harus masuk ke bulan pengiriman.
 */

const IconUpload: any = (LucideIcons as any).CloudUpload ?? (LucideIcons as any).Upload;

export default function JntUploadCard({
  period,
  monthLabel,
  onDone,
}: {
  period: string;
  monthLabel: string;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<JntUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function kirim(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const json = await base44.entities.OngkirJnt.upload(file, period);
      setResult(json);
      onDone();
    } catch (e) {
      setError((e as Error).message || "Upload gagal.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void kirim(event.dataTransfer?.files?.[0]);
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
      className="rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div className="flex items-start gap-2">
        <IconUpload size={16} className="mt-0.5 text-slate-400" />
        <div>
          <h2 className="text-sm font-black text-slate-900">Upload Rincian Resi (Excel J&T)</h2>
          <p className="text-xs text-slate-500">
            Portal J&T → <span className="font-semibold text-slate-600">Resi Saya</span> → filter tanggal → Ekspor →{" "}
            <span className="font-semibold text-slate-600">Data semua halaman (EXCEL)</span>.
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${
          dragging ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-slate-50/60"
        }`}
      >
        <motion.div animate={busy ? { rotate: [0, 8, -8, 0] } : {}} transition={{ repeat: busy ? Infinity : 0, duration: 1.1 }}>
          {busy ? <Loader2 size={22} className="animate-spin text-slate-400" /> : <IconUpload size={22} className="text-slate-400" />}
        </motion.div>
        <p className="text-sm font-semibold text-slate-700">{busy ? "Membaca file…" : "Tarik file .xlsx ke sini"}</p>
        <p className="text-xs text-slate-500">atau</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
        >
          Pilih File Excel
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void kirim(e.target.files?.[0])}
        />
        <p className="mt-1 max-w-md text-[11px] leading-relaxed text-slate-400">
          Aman diupload berkali-kali: satu nomor resi cuma dihitung sekali, jadi beban tidak pernah dobel. Bulan tagihan
          diambil dari tanggal pengiriman tiap baris.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              {result.saved ? (
                <CheckCircle size={14} className="text-emerald-600" />
              ) : (
                <AlertTriangle size={14} className="text-amber-600" />
              )}
              {result.saved ? "Hasil upload" : "Pratinjau file (belum disimpan)"}
            </div>

            {!result.saved && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-700">
                Tabel tagihan J&T belum dibuat di database, jadi angka di bawah ini hanya hasil baca file — belum ada satu
                baris pun yang tersimpan. Jalankan <span className="font-mono">{JNT_INVOICE_SQL_FILE}</span> di Supabase SQL
                Editor, lalu upload lagi.
              </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(result.saved
                ? [
                    { label: "Resi Baru", value: result.new, tone: "text-emerald-600" },
                    { label: "Sudah Ada", value: result.existing, tone: "text-slate-600" },
                    { label: "Gagal", value: result.failed, tone: result.failed ? "text-red-600" : "text-slate-400" },
                    { label: "Total di File", value: result.total, tone: "text-slate-900" },
                  ]
                : [
                    { label: "Resi di File", value: result.total, tone: "text-slate-900" },
                    { label: "Gagal", value: result.failed, tone: result.failed ? "text-red-600" : "text-slate-400" },
                    { label: "Bulan Terdeteksi", value: result.byPeriod.length, tone: "text-slate-600" },
                    { label: "Belum Disimpan", value: result.total, tone: "text-amber-600" },
                  ]
              ).map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
                  <p className={`text-xl font-black ${stat.tone}`}>{stat.value.toLocaleString("id-ID")}</p>
                </motion.div>
              ))}
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Nilai dari file: bruto {formatRp(result.totals.gross)} · diskon {formatRp(result.totals.discount)} · net{" "}
              <span className="font-bold text-slate-700">{formatRp(result.totals.net)}</span>
            </p>

            {result.byPeriod.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {result.byPeriod.map((row) => (
                  <span key={row.period} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    <Sparkles size={11} className="text-slate-400" />
                    {formatPeriode(row.period)}: {row.new} baru · {row.existing} sudah ada
                  </span>
                ))}
              </div>
            )}

            {result.outsidePeriod > 0 && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                {result.outsidePeriod} baris tanggal pengirimannya di luar {monthLabel} — barisnya tetap masuk ke bulan
                pengirimannya sendiri, jadi cek apakah filter tanggal portal J&T sudah sesuai.
              </p>
            )}

            {result.failedRows.length > 0 && (
              <div className="mt-2 rounded-xl bg-red-50 px-3 py-2">
                <p className="text-[11px] font-bold text-red-700">Baris yang dilewati:</p>
                <ul className="mt-1 space-y-0.5 text-[11px] text-red-700">
                  {result.failedRows.slice(0, 8).map((row, index) => (
                    <li key={`${row.row}-${index}`}>
                      Baris {row.row}
                      {row.awb ? ` (${row.awb})` : ""}: {row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
