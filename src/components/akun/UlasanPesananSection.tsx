"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon, Loader2, Star, X } from "lucide-react";
import { validateMediaFile } from "@/lib/cloudinary";
import { useSafeLocale } from "@/lib/safe-i18n";
import {
  getMyReviews,
  submitMyReview,
  uploadReviewPhoto,
  type MyReview,
} from "@/lib/ulasan-client";

export type OrderItem = {
  id: string;
  product_id?: string | null;
  product_name?: string | null;
  product_image?: string | null;
  series?: string | null;
  color?: string | null;
  size?: string | null;
  quantity?: number | null;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu moderasi",
  published: "Tayang",
  rejected: "Ditolak",
};

function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={size}
          fill={index < value ? "#000000" : "none"}
          stroke="#000000"
          strokeWidth={1.4}
        />
      ))}
    </span>
  );
}

export default function UlasanPesananSection({
  items,
  compact = false,
}: {
  items: OrderItem[];
  compact?: boolean;
}) {
  const locale = useSafeLocale();
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<OrderItem | null>(null);

  useEffect(() => {
    let alive = true;
    getMyReviews()
      .then((rows) => {
        if (alive) setReviews(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const byItem = useMemo(() => {
    const map = new Map<string, MyReview>();
    for (const review of reviews) {
      if (review.order_item_id) map.set(review.order_item_id, review);
    }
    return map;
  }, [reviews]);

  if (items.length === 0) return null;

  return (
    <>
      <section className={compact ? "border-t border-slate-200 pt-4" : "border-t border-slate-200 px-5 py-4"}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">Ulasan Produk</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              Ulasan tampil di halaman Testimoni setelah disetujui admin.
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {items.map((item) => {
            const review = byItem.get(item.id);
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {item.product_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.product_image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400">SAMAQU</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-slate-900">
                    {item.product_name || "Produk"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {[item.series, item.color, item.size].filter(Boolean).join(" · ") || "—"}
                    {item.quantity ? ` · ${item.quantity} pcs` : ""}
                  </p>
                  {review ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Stars value={review.rating} />
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold ${STATUS_STYLE[review.status] || STATUS_STYLE.pending}`}
                      >
                        {STATUS_LABEL[review.status] || review.status}
                      </span>
                    </div>
                  ) : null}
                  {review?.status === "rejected" && review.admin_note ? (
                    <p className="mt-1 text-[10.5px] leading-relaxed text-red-600">
                      Catatan admin: {review.admin_note}
                    </p>
                  ) : null}
                </div>

                <div className="w-full shrink-0 sm:w-auto">
                  {!review ? (
                    <button
                      type="button"
                      onClick={() => setActiveItem(item)}
                      disabled={loading}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-black px-3.5 py-2 text-[11px] font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
                    >
                      Beri Ulasan
                    </button>
                  ) : review.status === "pending" ? (
                    <span className="text-[10px] font-semibold text-amber-600">Menunggu</span>
                  ) : review.status === "published" ? (
                    <Link
                      href={`/${locale}/testimoni`}
                      className="text-[10px] font-bold text-emerald-700 underline underline-offset-2"
                    >
                      Lihat
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveItem(item)}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-300 px-3.5 py-2 text-[10.5px] font-bold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
                    >
                      Kirim ulang
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {activeItem ? (
        <ReviewFormModal
          item={activeItem}
          existing={byItem.get(activeItem.id)}
          onClose={() => setActiveItem(null)}
          onSaved={(review) => {
            setReviews((current) => {
              const rest = current.filter((row) => row.order_item_id !== review.order_item_id);
              return [review, ...rest];
            });
            setActiveItem(null);
          }}
        />
      ) : null}
    </>
  );
}

export function ReviewFormModal({
  item,
  existing,
  onClose,
  onSaved,
}: {
  item: OrderItem;
  existing?: MyReview;
  onClose: () => void;
  onSaved: (review: MyReview) => void;
}) {
  const [rating, setRating] = useState(existing?.rating || 5);
  const [content, setContent] = useState(existing?.content || "");
  const [file, setFile] = useState<File | null>(null);
  const [keepPhoto, setKeepPhoto] = useState(Boolean(existing?.image_url));
  const [preview, setPreview] = useState(existing?.image_url || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  // Tombol Escape menutup sheet, sama seperti app native (tidak saat sedang mengirim).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function pickFile(next: File | null) {
    setError("");
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      setError("Foto harus JPG, PNG, atau WebP.");
      return;
    }
    try {
      await validateMediaFile(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Foto tidak valid.");
      return;
    }
    setFile(next);
    setKeepPhoto(false);
  }

  async function save() {
    if (saving) return;
    setError("");
    const text = content.trim();
    if (text.length < 5) return setError("Ulasan minimal 5 karakter.");
    if (text.length > 1000) return setError("Ulasan maksimal 1000 karakter.");

    setSaving(true);
    try {
      let imageUrl = file ? "" : keepPhoto ? existing?.image_url || "" : "";
      if (file) imageUrl = await uploadReviewPhoto(file);
      const review = await submitMyReview({
        order_item_id: item.id,
        rating,
        content: text,
        image_url: imageUrl || null,
      });
      const now = new Date().toISOString();
      onSaved({
        id: review.id,
        product_id: item.product_id || existing?.product_id || null,
        series_name: item.series || existing?.series_name || null,
        order_item_id: item.id,
        status: review.status,
        rating,
        content: text,
        image_url: imageUrl || null,
        admin_note: null,
        created_at: review.created_at || now,
        updated_at: now,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim ulasan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <button type="button" aria-label="Tutup" className="absolute inset-0" onClick={() => !saving && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Beri Ulasan"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-3xl"
      >
        {/* Header sementara (tidak ikut scroll) */}
        <div className="shrink-0 border-b border-slate-100 px-5 pb-3 pt-3 sm:pt-5">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Beri Ulasan</p>
              <h3 className="mt-0.5 truncate text-base font-extrabold text-slate-900">
                {item.product_name || "Produk"}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {[item.series, item.color, item.size].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => !saving && onClose()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Isi bisa di-scroll */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Rating</p>
              <span className="text-[11px] font-extrabold tabular-nums text-slate-900">{rating}/5</span>
            </div>
            <div className="mt-1.5 flex items-center gap-0.5">
              {Array.from({ length: 5 }, (_, index) => {
                const value = index + 1;
                const active = value <= rating;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    aria-label={`${value} bintang`}
                    aria-pressed={active}
                    className="grid h-12 w-12 place-items-center rounded-xl transition hover:bg-slate-50 active:scale-95"
                  >
                    <Star
                      size={30}
                      fill={active ? "#111113" : "none"}
                      stroke={active ? "#111113" : "#cbd5e1"}
                      strokeWidth={1.6}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ulasan</p>
              <span className="text-[10px] tabular-nums text-slate-400">{content.length}/1000</span>
            </div>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value.slice(0, 1000))}
              rows={4}
              placeholder="Ceritakan bahan, ukuran, jahitan, dan pengalamanmu memakai produk ini."
              className="mt-1.5 w-full resize-none rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-900 outline-none focus:border-slate-400"
            />
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Foto (opsional)</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              {preview ? (
                <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setKeepPhoto(false);
                      setPreview("");
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                    className="absolute right-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white"
                    aria-label="Hapus foto"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600"
                >
                  <ImageIcon size={18} />
                  <span className="text-[9px] font-bold">Pilih</span>
                </button>
              )}
              <p className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-slate-400">
                JPG/PNG/WebP, maks 10 MB. Foto otomatis diperkecil dan dikompres.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => pickFile(event.target.files?.[0] || null)}
              />
            </div>
          </div>

          {error ? (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        {/* Aksi tetap di bawah, aman dari home bar */}
        <div className="shrink-0 border-t border-slate-100 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:pb-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-11 flex-1 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {saving ? "Mengirim…" : "Kirim Ulasan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
