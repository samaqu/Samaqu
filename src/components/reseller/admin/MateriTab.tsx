"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, FileText, Images, Play, Plus } from "lucide-react";
import { AdminApiError, opsResellerApi } from "./api";
import { ConfirmActionModal } from "./Modal";
import MateriFormModal from "./MateriFormModal";
import {
  MATERI_KATEGORI,
  MATERI_TIPE,
  parseYoutubeId,
  youtubeThumb,
  type MateriRow,
} from "@/lib/reseller/materi";

const TIPE_ICON = { video: Play, artikel: BookOpen, teks: FileText, galeri: Images } as const;
const kategoriLabel = (key: string) => MATERI_KATEGORI.find((item) => item.key === key)?.label ?? key;
const tipeLabel = (key: string) => MATERI_TIPE.find((item) => item.key === key)?.label ?? key;

/** Tab "Materi" panel admin reseller: daftar materi, tambah/ubah, terbit/draft cepat, hapus. */
export default function MateriTab() {
  const [rows, setRows] = useState<MateriRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [belumSiap, setBelumSiap] = useState(false);
  const [error, setError] = useState("");
  const [kategori, setKategori] = useState("semua");
  const [status, setStatus] = useState("semua");
  const [form, setForm] = useState<{ open: boolean; row: MateriRow | null }>({ open: false, row: null });
  const [hapus, setHapus] = useState<MateriRow | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await opsResellerApi.materi();
      setRows(res.data);
      setBelumSiap(Boolean(res.belum_siap));
      setError("");
    } catch {
      setError("Gagal memuat materi. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(
    () => rows.filter((row) => (kategori === "semua" || row.category === kategori) && (status === "semua" || row.status === status)),
    [rows, kategori, status]
  );
  const terbit = rows.filter((row) => row.status === "terbit").length;

  const ubahStatus = async (row: MateriRow) => {
    setBusyId(row.id);
    setError("");
    try {
      await opsResellerApi.updateMateri(row.id, {
        category: row.category,
        type: row.type,
        title: row.title,
        summary: row.summary ?? "",
        body: row.body ?? "",
        video_url: row.video_url ?? "",
        images: row.images,
        sort_order: row.sort_order,
        status: row.status === "terbit" ? "draft" : "terbit",
      });
      await load();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal mengubah status.");
    } finally {
      setBusyId("");
    }
  };

  const hapusMateri = async (row: MateriRow) => {
    setBusyId(row.id);
    setError("");
    try {
      await opsResellerApi.deleteMateri(row.id);
      setHapus(null);
      await load();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menghapus materi.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
          value={kategori}
          onChange={(e) => setKategori(e.target.value)}
          aria-label="Filter kategori"
        >
          <option value="semua">Semua kategori</option>
          {MATERI_KATEGORI.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          className="px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter status"
        >
          <option value="semua">Semua status</option>
          <option value="terbit">Terbit</option>
          <option value="draft">Draft</option>
        </select>
        <span className="text-[12px] text-slate-500">
          {rows.length} materi · {terbit} terbit
        </span>
        <button
          type="button"
          onClick={() => setForm({ open: true, row: null })}
          disabled={belumSiap}
          className="ml-auto px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Plus size={15} /> Tambah materi
        </button>
      </div>

      {belumSiap ? (
        <div className="px-4 py-3 rounded-xl bg-amber-50 text-amber-800 text-sm font-semibold">
          Tabel materi belum dibuat di database (migrasi 20261114_reseller_materials.sql belum dijalankan).
        </div>
      ) : null}
      {error ? <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold">{error}</div> : null}

      <div className="space-y-2.5">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">Memuat materi…</div>
        ) : shown.length === 0 && !belumSiap ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <p className="font-bold text-slate-700">{rows.length === 0 ? "Belum ada materi." : "Tidak ada materi yang cocok."}</p>
            <p className="text-sm text-slate-500 mt-1">
              {rows.length === 0 ? 'Klik "Tambah materi" untuk membuat materi pertama.' : "Ubah filter kategori atau status."}
            </p>
          </div>
        ) : (
          shown.map((row) => {
            const Icon = TIPE_ICON[row.type];
            const ytId = row.type === "video" ? parseYoutubeId(row.video_url) : null;
            const thumb = ytId ? youtubeThumb(ytId) : row.type === "galeri" ? row.images[0] : null;
            return (
              <div key={row.id} className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap sm:flex-nowrap items-center gap-3">
                <div className="flex-none w-14 h-[76px] rounded-xl overflow-hidden bg-slate-100 grid place-items-center text-slate-400">
                  {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <Icon size={22} />}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold ${
                        row.status === "terbit" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {row.status === "terbit" ? "Terbit" : "Draft"}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {tipeLabel(row.type)} · {kategoriLabel(row.category)} · urutan {row.sort_order}
                    </span>
                  </div>
                  <p className="font-extrabold text-slate-900 text-[14px] leading-snug">{row.title}</p>
                  {row.summary ? <p className="text-[12px] text-slate-500 line-clamp-1">{row.summary}</p> : null}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5 ml-auto">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => ubahStatus(row)}
                    className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold disabled:opacity-50 ${
                      row.status === "terbit" ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    {row.status === "terbit" ? "Jadikan draft" : "Terbitkan"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ open: true, row })}
                    className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-slate-100 hover:bg-slate-200"
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    onClick={() => setHapus(row)}
                    className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {form.open ? <MateriFormModal row={form.row} onClose={() => setForm({ open: false, row: null })} onSaved={load} /> : null}

      {hapus ? (
        <ConfirmActionModal
          title="Hapus materi"
          description={`Hapus "${hapus.title}"? Materi hilang dari portal reseller dan tidak bisa dikembalikan. Video di YouTube tidak ikut terhapus.`}
          confirmLabel="Hapus"
          tone="danger"
          busy={busyId === hapus.id}
          onClose={() => setHapus(null)}
          onConfirm={() => hapusMateri(hapus)}
        />
      ) : null}
    </div>
  );
}
