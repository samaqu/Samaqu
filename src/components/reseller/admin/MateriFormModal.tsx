"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { AdminApiError, opsResellerApi } from "./api";
import { Modal } from "./Modal";
import { supabase } from "@/lib/supabase";
import { MEDIA_LIMITS, uploadToCloudinary } from "@/lib/cloudinary";
import {
  MATERI_KATEGORI,
  MATERI_LIMITS,
  MATERI_TIPE,
  parseYoutubeId,
  validateMateri,
  youtubeThumb,
  type MateriRow,
  type MateriStatus,
  type MateriTipe,
} from "@/lib/reseller/materi";

const FIELD =
  "w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-semibold text-slate-900";
const LABEL = "text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5";

type Form = {
  category: string;
  type: MateriTipe;
  title: string;
  summary: string;
  body: string;
  video_url: string;
  images: string[];
  sort_order: string;
  status: MateriStatus;
};

function initial(row?: MateriRow | null): Form {
  return {
    category: row?.category ?? "panduan",
    type: row?.type ?? "video",
    title: row?.title ?? "",
    summary: row?.summary ?? "",
    body: row?.body ?? "",
    video_url: row?.video_url ?? "",
    images: row?.images ? [...row.images] : [],
    sort_order: String(row?.sort_order ?? 0),
    status: row?.status ?? "draft",
  };
}

/** Form tambah / ubah satu materi. Isian menyesuaikan jenis materi; video disematkan dari YouTube (unlisted). */
export default function MateriFormModal({
  row,
  onClose,
  onSaved,
}: {
  row: MateriRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form>(() => initial(row));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [urlBaru, setUrlBaru] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const ytId = form.type === "video" ? parseYoutubeId(form.video_url) : null;

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    setUploading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name}: bukan gambar (JPG, PNG, atau WebP).`);
        if (file.size > MEDIA_LIMITS.imageMaxBytes) throw new Error(`${file.name}: maksimal 10MB.`);
        urls.push(await uploadToCloudinary(file, { scope: "reseller", token: data.session?.access_token }));
      }
      setForm((prev) => ({ ...prev, images: [...prev.images, ...urls].slice(0, MATERI_LIMITS.images) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload foto gagal. Coba lagi.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const payload = { ...form, sort_order: form.sort_order };
    const checked = validateMateri(payload);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    try {
      const data: Record<string, unknown> = { ...checked.value };
      if (row) await opsResellerApi.updateMateri(row.id, data);
      else await opsResellerApi.createMateri(data);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menyimpan materi.");
    } finally {
      setBusy(false);
    }
  };

  const bodyLabel =
    form.type === "artikel" ? "Isi artikel" : form.type === "teks" ? "Teks siap salin" : "Deskripsi (opsional)";

  return (
    <Modal title={row ? "Ubah materi" : "Tambah materi"} onClose={onClose} width={600}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <span className={LABEL}>Jenis materi</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MATERI_TIPE.map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => set("type", item.key)}
                className={`px-3 py-2.5 rounded-xl text-[13px] font-bold border-2 transition-colors ${
                  form.type === item.key ? "bg-[#18181b] text-white border-[#18181b]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-[1fr_120px] gap-3">
          <div>
            <label className={LABEL} htmlFor="mt-kategori">Kategori</label>
            <select id="mt-kategori" className={FIELD} value={form.category} onChange={(e) => set("category", e.target.value)}>
              {MATERI_KATEGORI.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="mt-urutan">Urutan</label>
            <input
              id="mt-urutan"
              className={FIELD}
              inputMode="numeric"
              value={form.sort_order}
              onChange={(e) => set("sort_order", e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-500 -mt-1">Urutan kecil tampil lebih dulu di kategorinya (0 = paling awal).</p>

        <div>
          <label className={LABEL} htmlFor="mt-judul">Judul <span className="text-red-500">*</span></label>
          <input id="mt-judul" className={FIELD} maxLength={MATERI_LIMITS.title} value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <label className={LABEL} htmlFor="mt-ringkasan">Ringkasan (tampil di kartu)</label>
          <input id="mt-ringkasan" className={FIELD} maxLength={MATERI_LIMITS.summary} value={form.summary} onChange={(e) => set("summary", e.target.value)} />
        </div>

        {form.type === "video" ? (
          <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
            <label className={LABEL} htmlFor="mt-video">Tautan video YouTube <span className="text-red-500">*</span></label>
            <input
              id="mt-video"
              className="w-full px-3 py-2.5 bg-white border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
              placeholder="https://youtu.be/xxxxxxxxxxx"
              value={form.video_url}
              onChange={(e) => set("video_url", e.target.value)}
            />
            {form.video_url.trim() ? (
              ytId ? (
                <div className="flex items-center gap-3 mt-2.5">
                  <img src={youtubeThumb(ytId)} alt="Pratinjau video" className="w-16 h-[88px] object-cover rounded-lg bg-black" />
                  <p className="text-[12px] text-emerald-700 font-semibold">Tautan valid. Pastikan video diatur "Tidak publik" dan "Izinkan penyematan" aktif di YouTube.</p>
                </div>
              ) : (
                <p className="text-[12px] text-red-600 font-semibold mt-2">Bukan tautan YouTube yang dikenali.</p>
              )
            ) : (
              <p className="text-[11px] text-slate-500 mt-1.5">Boleh tautan watch, youtu.be, atau shorts.</p>
            )}
          </div>
        ) : null}

        {form.type === "galeri" ? (
          <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-3 space-y-2.5">
            <span className={LABEL}>Foto ({form.images.length}/{MATERI_LIMITS.images}) <span className="text-red-500">*</span></span>
            {form.images.length > 0 ? (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {form.images.map((url, index) => (
                  <div key={url + index} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-white">
                    <img src={url} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      aria-label={`Hapus foto ${index + 1}`}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white grid place-items-center"
                      onClick={() => set("images", form.images.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => upload(e.target.files)} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={uploading || form.images.length >= MATERI_LIMITS.images}
                onClick={() => fileRef.current?.click()}
                className="px-3 py-2 rounded-lg text-[12px] font-bold bg-white border-2 border-slate-200 hover:bg-slate-100 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? "Mengunggah…" : "Upload foto"}
              </button>
              <div className="flex flex-1 min-w-[200px] gap-2">
                <input
                  className="flex-1 min-w-0 px-3 py-2 bg-white border-2 border-slate-200 rounded-lg text-[12px] font-semibold text-slate-900"
                  placeholder="atau tempel alamat foto (https://…)"
                  value={urlBaru}
                  onChange={(e) => setUrlBaru(e.target.value)}
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg text-[12px] font-bold bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                  disabled={!urlBaru.trim().startsWith("https://") || form.images.length >= MATERI_LIMITS.images}
                  onClick={() => {
                    set("images", [...form.images, urlBaru.trim()]);
                    setUrlBaru("");
                  }}
                >
                  Tambah
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <label className={LABEL} htmlFor="mt-isi">
            {bodyLabel} {form.type === "artikel" || form.type === "teks" ? <span className="text-red-500">*</span> : null}
          </label>
          <textarea
            id="mt-isi"
            className={FIELD}
            rows={form.type === "artikel" || form.type === "teks" ? 9 : 4}
            maxLength={MATERI_LIMITS.body}
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            {form.type === "teks"
              ? "Beberapa pilihan teks boleh dipisah baris berisi --- (tiap pilihan punya tombol Salin sendiri)."
              : "Format: baris \"## Judul\" = subjudul, baris berawalan \"- \" = poin, baris kosong = paragraf baru."}
          </p>
        </div>

        <div>
          <span className={LABEL}>Status</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["draft", "Draft", "Belum terlihat reseller"],
                ["terbit", "Terbit", "Tampil di portal reseller"],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                type="button"
                key={value}
                onClick={() => set("status", value)}
                className={`text-left px-3 py-2.5 rounded-xl border-2 transition-colors ${
                  form.status === value
                    ? value === "terbit"
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-400 bg-slate-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <b className="block text-[13px] text-slate-900">{label}</b>
                <small className="text-[11px] text-slate-500">{hint}</small>
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="text-sm text-red-600 font-semibold">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">
            Batal
          </button>
          <button type="submit" disabled={busy || uploading} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Menyimpan…" : row ? "Simpan perubahan" : "Tambah materi"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
