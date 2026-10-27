"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Star } from "lucide-react";
import { AkunHeader } from "@/components/akun/AkunShell";
import { useAkunCustomer } from "@/components/akun/AkunContext";
import {
  ReviewFormModal,
  type OrderItem,
} from "@/components/akun/UlasanPesananSection";
import { getCustomerOrders } from "@/lib/customer-auth";
import { getMyReviews, type MyReview } from "@/lib/ulasan-client";
import { useSafeLocale } from "@/lib/safe-i18n";

type Order = {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  order_items?: OrderItem[];
};

type PendingTask = { order: Order; item: OrderItem };

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
        <Star key={index} size={size} fill={index < value ? "#000000" : "none"} stroke="#000000" strokeWidth={1.4} />
      ))}
    </span>
  );
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function UlasanSayaPage() {
  const locale = useSafeLocale();
  const { customer, ready } = useAkunCustomer();
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [activeItem, setActiveItem] = useState<OrderItem | null>(null);
  const [activeExisting, setActiveExisting] = useState<MyReview | undefined>(undefined);

  useEffect(() => {
    if (!ready) return;
    if (!customer) {
      setLoading(false);
      return;
    }
    const customerId = customer.id;
    let alive = true;
    async function load() {
      try {
        const [orderRows, reviewRows] = await Promise.all([
          getCustomerOrders(customerId),
          getMyReviews(),
        ]);
        if (!alive) return;
        setOrders((orderRows as Order[]) || []);
        setReviews(reviewRows || []);
      } catch (error) {
        console.error("[akun/ulasan] gagal memuat:", error);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [customer, ready]);

  const reviewedIds = useMemo(
    () => new Set(reviews.map((review) => review.order_item_id).filter(Boolean) as string[]),
    [reviews],
  );

  const pending = useMemo<PendingTask[]>(() => {
    const tasks: PendingTask[] = [];
    for (const order of orders) {
      if (String(order.status || "").toLowerCase() !== "selesai") continue;
      for (const item of order.order_items || []) {
        if (!item.id || reviewedIds.has(item.id)) continue;
        tasks.push({ order, item });
      }
    }
    return tasks;
  }, [orders, reviewedIds]);

  const rejectedCount = reviews.filter((review) => review.status === "rejected").length;

  function findItem(review: MyReview): OrderItem {
    for (const order of orders) {
      const found = (order.order_items || []).find((item) => item.id === review.order_item_id);
      if (found) return found;
    }
    return {
      id: String(review.order_item_id || review.id),
      product_id: review.product_id,
      series: review.series_name,
    };
  }

  function openReview(item: OrderItem, existing?: MyReview) {
    setActiveItem(item);
    setActiveExisting(existing);
  }

  if (!ready || loading) {
    return (
      <>
        <AkunHeader title="Ulasan Saya" back="/akun" />
        <div className="flex items-center justify-center py-20">
          <Loader2 size={22} className="animate-spin text-[#8b9793]" />
        </div>
      </>
    );
  }

  return (
    <>
      <AkunHeader title="Ulasan Saya" back="/akun" />

      <section className="rounded-2xl bg-black px-5 py-4 text-white">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Ulasan produk</p>
            <p className="mt-1 text-2xl font-extrabold leading-none">{pending.length}</p>
            <p className="mt-1 text-[12px] text-white/60">
              {pending.length > 0 ? "pesanan selesai belum kamu nilai" : "semua pesanan selesai sudah dinilai"}
            </p>
          </div>
          {rejectedCount > 0 ? (
            <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-[10px] font-bold text-red-200">
              {rejectedCount} perlu diperbaiki
            </span>
          ) : (
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/70">
              {reviews.filter((review) => review.status === "published").length} tayang
            </span>
          )}
        </div>
      </section>

      <div className="mt-4 flex gap-1.5 rounded-xl bg-[#ebe7df] p-1">
        {[
          { key: "pending" as const, label: `Belum Diulas (${pending.length})` },
          { key: "history" as const, label: `Riwayat (${reviews.length})` },
        ].map((option) => {
          const active = tab === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setTab(option.key)}
              className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-[12px] font-bold transition ${
                active ? "bg-white text-black shadow-sm" : "text-[#6c7a75]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-2.5">
        {tab === "pending" ? (
          pending.length === 0 ? (
            <div className="akun-card px-5 py-10 text-center">
              <p className="text-sm font-extrabold text-black">Tidak ada yang menunggu</p>
              <p className="mt-1 text-[12px] text-[#777777]">
                Ulasan bisa dikirim setelah pesanan berstatus Selesai.
              </p>
              <Link href={`/${locale}/akun/pesanan`} className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-black underline underline-offset-4">
                Lihat Pesanan <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            pending.map(({ order, item }) => (
              <article key={`${order.id}-${item.id}`} className="akun-card flex flex-wrap items-center gap-3 p-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f2efe8]">
                  {item.product_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.product_image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-bold text-[#9aa5a1]">SAMAQU</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-extrabold text-black">{item.product_name || "Produk"}</p>
                  <p className="mt-0.5 text-[11px] text-[#777777]">
                    {[item.series, item.color, item.size].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-[#9aa5a1]">
                    {order.order_number} · {dateLabel(order.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openReview(item)}
                  className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-full bg-black px-3.5 py-2 text-[11px] font-extrabold text-white transition active:scale-[.98] sm:w-auto"
                >
                  Beri Ulasan
                </button>
              </article>
            ))
          )
        ) : reviews.length === 0 ? (
          <div className="akun-card px-5 py-10 text-center">
            <p className="text-sm font-extrabold text-black">Belum ada ulasan</p>
            <p className="mt-1 text-[12px] text-[#777777]">Ulasan yang sudah dikirim akan muncul di sini.</p>
          </div>
        ) : (
          reviews.map((review) => (
            <article key={review.id} className="akun-card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={review.rating} />
                    <span className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold ${STATUS_STYLE[review.status] || STATUS_STYLE.pending}`}>
                      {STATUS_LABEL[review.status] || review.status}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-[#333333]">
                    {review.content}
                  </p>
                  {review.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={review.image_url} alt="" className="mt-2 h-20 w-20 rounded-lg object-cover" />
                  ) : null}
                  {review.status === "rejected" && review.admin_note ? (
                    <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[10.5px] font-semibold text-red-600">
                      Catatan admin: {review.admin_note}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[10px] text-[#9aa5a1]">{dateLabel(review.updated_at || review.created_at)}</p>
                </div>
                <div className="shrink-0">
                  {review.status === "published" ? (
                    <Link href={`/${locale}/testimoni`} className="text-[10.5px] font-bold text-emerald-700 underline underline-offset-2">
                      Lihat
                    </Link>
                  ) : review.status === "rejected" ? (
                    <button
                      type="button"
                      onClick={() => openReview(findItem(review), review)}
                      className="rounded-full border border-[#d8d2c6] px-3 py-1.5 text-[10.5px] font-bold text-black"
                    >
                      Kirim ulang
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {activeItem ? (
        <ReviewFormModal
          item={activeItem}
          existing={activeExisting}
          onClose={() => { setActiveItem(null); setActiveExisting(undefined); }}
          onSaved={(review) => {
            setReviews((current) => [review, ...current.filter((row) => row.order_item_id !== review.order_item_id)]);
            setActiveItem(null);
            setActiveExisting(undefined);
          }}
        />
      ) : null}
    </>
  );
}
