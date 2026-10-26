"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { requestRevalidate } from "@/lib/admin-revalidate";
import { useToast } from "@/components/AdminToast";
import AdminShell from "@/components/AdminShell";
import { INSTAGRAM_DEFAULT_PHOTOS, INSTAGRAM_PROFILE, INSTAGRAM_SLOTS } from "@/lib/instagram-defaults";
import { squareResizeImage } from "@/lib/image-square";
import { uploadToCloudinary, validateMediaFile } from "@/lib/cloudinary";

type Slot = { posisi: number; image_url: string; link: string; alt: string };

const emptySlots = (): Slot[] =>
  Array.from({ length: INSTAGRAM_SLOTS }, (_, i) => ({ posisi: i + 1, image_url: "", link: "", alt: "" }));

/**
 * Kelola Foto Instagram — mengatur foto section Instagram di Home.
 * Slot 1..N persis mengikuti urutan grid di website; perubahan langsung tampil
 * di website setelah disimpan (website membaca DB tanpa cache).
 */
export default function InstagramPhotosManager() {
  const [slots, setSlots] = useState<Slot[]>(emptySlots);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const toast = useToast();

  async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token || ""}` };
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/instagram-photos", { headers: await authHeaders() });
        if (res.ok) {
          const rows: Slot[] = await res.json();
          if (!cancelled) {
            const next = emptySlots();
            (rows || []).forEach((r) => {
              const i = r.posisi - 1;
              if (i >= 0 && i < next.length) {
                next[i] = { posisi: r.posisi, image_url: r.image_url || "", link: r.link || "", alt: r.alt || "" };
              }
            });
            setSlots(next);
          }
        }
      } catch {
        // Tabel belum ada / offline → biarkan slot kosong (admin bisa isi lalu simpan).
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(i: number, updates: Partial<Slot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...updates } : s)));
    setDirty(true);
  }

  async function handleUpload(i: number, file: File) {
    try {
      await validateMediaFile(file);
    } catch (e) {
      toast.showToast("error", e instanceof Error ? e.message : "File tidak valid");
      return;
    }
    setBusy(i);
    try {
      // Dinormalkan dulu jadi persegi 1080×1080 (crop tengah, JPEG) supaya semua
      // slot seragam dan ringan, baru diunggah ke Cloudinary akun utama
      // (signed upload — sama seperti Foto Carousel / produk).
      const blob = await squareResizeImage(file);
      const square = new File([blob], "instagram.jpg", { type: "image/jpeg" });
      const url = await uploadToCloudinary(square, { scope: "product" });
      if (!url) throw new Error("Upload gagal");
      patch(i, { image_url: url });
      toast.showToast("success", `Foto slot ${i + 1} diperbarui`);
    } catch (e) {
      toast.showToast("error", e instanceof Error ? e.message : "Gagal upload foto");
    } finally {
      setBusy(null);
    }
  }

  /** Tukar isi slot dengan tetangganya (posisi tetap 1..N). */
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= slots.length) return;
    setSlots((prev) => {
      const next = [...prev];
      const a = next[i];
      const b = next[j];
      next[i] = { ...a, image_url: b.image_url, link: b.link, alt: b.alt };
      next[j] = { ...b, image_url: a.image_url, link: a.link, alt: a.alt };
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/instagram-photos", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ slots }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan");
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
      toast.showToast("success", "Perubahan tersimpan");
      // Best-effort: segarkan halaman Home yang mungkin ter-cache.
      void requestRevalidate();
    } catch (e) {
      toast.showToast("error", e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--bd)",
    background: "white",
    color: "var(--espresso)",
  };

  return (
    <AdminShell>
      <section className="p-5 lg:p-8 max-w-5xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "var(--espresso)" }}>Kelola Foto Instagram</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Atur {INSTAGRAM_SLOTS} foto di section &quot;Ikuti perjalanan kami di Instagram @samaqu.id&quot; pada Home.
              Urutan slot 1–{INSTAGRAM_SLOTS} sama dengan urutan di website.
            </p>
          </div>
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg"
            style={{ color: "var(--gold)", border: "1px solid var(--bd)" }}
          >
            <ExternalLink size={14} /> Lihat di Website
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: "var(--gold)" }} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {slots.map((s, i) => (
                <div key={i} className="rounded-2xl p-3" style={{ background: "#ffffff", border: "1px solid var(--bd)", boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: "var(--espresso)" }}>Slot {i + 1}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="p-1 rounded disabled:opacity-30"
                        style={{ color: "var(--text-muted)", border: "1px solid var(--bd)" }}
                        title="Naik"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === slots.length - 1}
                        className="p-1 rounded disabled:opacity-30"
                        style={{ color: "var(--text-muted)", border: "1px solid var(--bd)" }}
                        title="Turun"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="relative aspect-square rounded-xl overflow-hidden" style={{ background: "#f4f4f5" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.image_url || INSTAGRAM_DEFAULT_PHOTOS[i].src}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {busy === i && (
                      <div className="absolute inset-0 grid place-items-center" style={{ background: "rgba(0,0,0,.45)" }}>
                        <Loader2 size={20} className="animate-spin text-white" />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-2.5">
                    <label
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-2 rounded-lg cursor-pointer transition-colors"
                      style={{ background: "var(--gold)", color: "#fff" }}
                    >
                      <Upload size={13} /> Ganti Foto
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={busy === i}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(i, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      onClick={() => patch(i, { image_url: "" })}
                      disabled={!s.image_url}
                      className="inline-flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-2 rounded-lg disabled:opacity-40"
                      style={{ color: "#dc2626", border: "1px solid rgba(231,76,60,.25)" }}
                      title="Kembalikan ke foto bawaan"
                    >
                      <Trash2 size={13} /> Kosongkan
                    </button>
                  </div>

                  {/* Link + alt */}
                  <div className="mt-3 space-y-2">
                    <div>
                      <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Link tujuan (opsional)</label>
                      <input
                        value={s.link}
                        onChange={(e) => patch(i, { link: e.target.value })}
                        placeholder={INSTAGRAM_PROFILE}
                        className="w-full rounded-lg px-3 py-2 text-[12px] outline-none"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Alt text (opsional)</label>
                      <input
                        value={s.alt}
                        onChange={(e) => patch(i, { alt: e.target.value })}
                        placeholder="Deskripsi singkat foto"
                        className="w-full rounded-lg px-3 py-2 text-[12px] outline-none"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Save bar */}
            <div
              className="sticky bottom-0 mt-6 flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "#ffffff", border: "1px solid var(--bd)", boxShadow: "0 -8px 24px -16px rgba(0,0,0,.35)" }}
            >
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--gold)" }}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? "Menyimpan…" : "Simpan Perubahan"}
              </button>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {dirty
                  ? "Belum disimpan"
                  : savedAt
                    ? `Tersimpan ${savedAt}`
                    : "Semua perubahan tersimpan"}
              </span>
            </div>
          </>
        )}
      </section>
    </AdminShell>
  );
}
