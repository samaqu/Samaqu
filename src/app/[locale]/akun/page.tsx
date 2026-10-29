"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCustomerOrders } from "@/lib/customer-auth";
import { resolveItemPhotos } from "@/lib/order-photo";
import type { OrderPhotoLookup } from "@/lib/order-photo";
import OrderItemThumb from "@/components/akun/OrderItemThumb";
import { itemProductIds, loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { useAkunCustomer } from "@/components/akun/AkunContext";
import { useSafeLocale } from "@/lib/safe-i18n";
import CustomerOrderDrawer from "@/components/akun/CustomerOrderDrawer";
import { ReviewFormModal, type OrderItem as ReviewItem } from "@/components/akun/UlasanPesananSection";
import DashboardProductSection from "@/components/akun/DashboardProductSection";

import { statusInfo, rupiah, tglID } from "@/lib/akun-format";
import { orderStatusKey } from "@/lib/order-flow";
import { getMyReviews } from "@/lib/ulasan-client";

interface OrderItem {
  id?: string;
  product_id?: string | null;
  product_name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  product_image?: string;
  series?: string | null;
}

/** Bentuk item yang dipakai ReviewFormModal (butuh `id` item pesanan). */
function toReviewItem(item: OrderItem): ReviewItem {
  return {
    id: String(item.id),
    product_id: item.product_id ?? null,
    product_name: item.product_name,
    product_image: item.product_image ?? null,
    series: item.series ?? null,
    color: item.color,
    size: item.size,
    quantity: item.quantity,
  };
}
interface Order {
  id: string;
  order_number: string;
  total: number;
  status: string;
  created_at: string;
  awb_no?: string | null;
  shipping_status?: string | null;
  tracking_status_code?: number | null;
  order_items: OrderItem[];
}
interface Cust {
  id: string;
  name: string;
  whatsapp: string;
}

export default function DashboardAkunPage() {
  const locale = useSafeLocale();
  const to = (href: string) => `/${locale}${href}`;
  // Customer sudah dimuat oleh AkunProvider (layout) — pakai itu daripada query ulang.
  const { customer: cust, ready } = useAkunCustomer() as { customer: Cust | null; ready: boolean };
  const [orders, setOrders] = useState<Order[]>([]);
  const [wishCount, setWishCount] = useState(0);
  // status ulasan per item pesanan: pending / published / rejected
  const [reviewStatus, setReviewStatus] = useState<Map<string, string>>(new Map());
  /** Lookup foto katalog untuk thumbnail 5 pesanan terakhir (dipakai OrderItemThumb). */
  const [photoLookup, setPhotoLookup] = useState<OrderPhotoLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  // Langsung buka form ulasan dari dashboard (tanpa pindah halaman / fetch ulang).
  const [reviewItem, setReviewItem] = useState<ReviewItem | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!cust) {
      setLoading(false);
      return;
    }
    const id = cust.id;
    let alive = true;
    async function init() {
      try {
        const [o, w, r] = await Promise.all([
          getCustomerOrders(id),
          supabase.from("wishlists").select("product_id", { count: "exact", head: true }).eq("customer_id", id),
          getMyReviews(),
        ]);
        if (!alive) return;
        const list = (o as Order[]) || [];
        // Dashboard cuma menampilkan 5 pesanan terakhir — jangan resolve foto semua order.
        const recent = list.slice(0, 5);
        // Lookup dimuat untuk SEMUA item di 5 pesanan itu (bukan hanya yang snapshot-nya kosong):
        // snapshot bisa menunjuk aset yang sudah dihapus (404), dan thumb butuh kandidat cadangan
        // untuk pindah saat <img> gagal. Tetap SATU query batch per tabel.
        const visible = recent.flatMap((order) => order.order_items || []);
        const lookup = visible.length ? await loadOrderPhotoLookup(itemProductIds(visible)) : null;
        if (!alive) return;
        setPhotoLookup(lookup);
        setOrders(
          list.map((order, index) =>
            index < 5
              ? { ...order, order_items: resolveItemPhotos(order.order_items || [], lookup) }
              : order
          )
        );
        setWishCount(w.count || 0);
        const statusMap = new Map<string, string>();
        for (const row of r || []) {
          if (row.order_item_id) statusMap.set(String(row.order_item_id), String(row.status));
        }
        setReviewStatus(statusMap);
      } catch (error) {
        console.error("[dashboard-akun] gagal memuat data:", error);
      } finally {
        if (alive) setLoading(false);
      }
    }
    init();
    return () => { alive = false; };
  }, [cust, ready]);

  const firstName = (cust?.name || "Pelanggan").split(" ")[0];
  const initials = (cust?.name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const activeOrders = orders.filter((o) => {
    const key = orderStatusKey(o);
    return key === "pending" || key === "diproses" || key === "dikirim";
  }).length;
  const totalSpend = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const recentOrders = orders.slice(0, 5);

  return (
    <>
      {/* ═══ MOBILE: hero ═══ */}
      <div
        className="md:hidden text-white rounded-b-[32px] pb-16 shadow-[0_10px_30px_rgba(0,0,0,.18)] -mx-4 -mt-4"
        style={{ background: "linear-gradient(165deg,#000000,#000000 70%)" }}
      >
        <div className="px-5 pt-2">
          <p className="text-[17px] font-extrabold tracking-wide">SAMAQU</p>
        </div>
        <div className="px-5 pt-4 flex items-start gap-3">
          {/* Avatar = pintasan ke pengaturan profil (nama/WA/tanggal lahir, alamat, keluar). */}
          <Link
            href={to("/akun/profil")}
            aria-label="Pengaturan profil"
            className="w-11 h-11 shrink-0 rounded-2xl grid place-items-center text-[13px] font-extrabold bg-white/15 border border-white/15 transition active:scale-95"
          >
            {initials}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[20px] font-extrabold leading-tight">Hai, {firstName}</p>
            <p className="text-[13px] text-white/60 mt-0.5">Selamat datang kembali di Samaqu.</p>
          </div>
        </div>
        <div className="px-5 mt-5 flex gap-2">
          <span className="flex-1 rounded-2xl bg-white/10 border border-white/10 px-3.5 py-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-white/50 font-bold">Pesanan aktif</span>
            <span className="block text-[15px] font-extrabold mt-0.5">{activeOrders} pesanan</span>
          </span>
          <span className="flex-1 rounded-2xl bg-white/10 border border-white/10 px-3.5 py-2.5">
            <span className="block text-[10px] uppercase tracking-wider text-white/50 font-bold">Wishlist</span>
            <span className="block text-[15px] font-extrabold mt-0.5">{wishCount} produk</span>
          </span>
        </div>
      </div>

      <div className="-mt-10 md:mt-0 pb-10">
        {/* ═══ DESKTOP: greeting ═══ */}
        <header className="hidden md:block mb-6">
          <h1 className="text-[22px] md:text-3xl font-extrabold" style={{ color: "#000000" }}>Hai, {firstName}</h1>
          <p className="text-sm md:text-base text-[#777777] mt-1">Selamat datang kembali di Samaqu.</p>
        </header>

        {/* ═══ Stat cards (desktop) ═══ */}
        {loading ? (
          <div className="text-center text-sm text-[#777777] py-8">Memuat…</div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-3 gap-3.5 mb-5">
              <div className="bg-white rounded-[16px] border border-[rgba(0,0,0,0.07)] px-[18px] py-4 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: "#f1f0ec" }}>
                  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="#000000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[22px] font-black leading-none" style={{ color: "#000000" }}>{activeOrders}</p>
                  <p className="text-[12px] text-[#8b9793] mt-1.5 font-semibold">Pesanan Aktif</p>
                </div>
              </div>
              <div className="bg-white rounded-[16px] border border-[rgba(0,0,0,0.07)] px-[18px] py-4 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: "#f1f0ec" }}>
                  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="#000000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[22px] font-black leading-none" style={{ color: "#000000" }}>{wishCount}</p>
                  <p className="text-[12px] text-[#8b9793] mt-1.5 font-semibold">Wishlist</p>
                </div>
              </div>
              <div className="bg-white rounded-[16px] border border-[rgba(0,0,0,0.07)] px-[18px] py-4 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: "#f1f0ec" }}>
                  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="#000000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[22px] font-black leading-none truncate" style={{ color: "#000000" }}>Rp{totalSpend.toLocaleString("id-ID")}</p>
                  <p className="text-[12px] text-[#8b9793] mt-1.5 font-semibold">Total Belanja</p>
                </div>
              </div>
            </div>

            {/* ═══ Recent orders ═══ */}
            <div className="bg-white rounded-[20px] border border-[rgba(0,0,0,0.06)] shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_2px_6px,rgba(0,0,0,0.06)_0px_4px_8px] overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-[#EBEBEB] flex items-center justify-between gap-3" style={{ background: "#faf8f4" }}>
                <h2 className="font-bold text-sm flex items-center gap-2" style={{ color: "#000000" }}>
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#000000" strokeWidth="1.7"><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /></svg>
                  PESANAN TERAKHIR
                </h2>
                <Link href={to("/akun/pesanan")} className="text-xs font-semibold transition hover:opacity-80" style={{ color: "#000000" }}>
                  Lihat semua <svg viewBox="0 0 24 24" className="w-3 h-3 inline ml-0.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 6 6 6-6 6" /></svg>
                </Link>
              </div>

              {recentOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "#f2f2f2" }}>
                    <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8" stroke="#000000" strokeWidth="1.5"><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /><path d="M12 13v7" /></svg>
                  </div>
                  <p className="text-sm font-semibold mb-1" style={{ color: "#000000" }}>Belum ada pesanan</p>
                  <p className="text-xs text-[#8b9793]">Yuk temukan koleksi yang cocok untukmu.</p>
                  <Link href={to("/katalog")} className="mt-4 inline-block px-6 py-2.5 rounded-full text-xs font-bold text-white transition hover:opacity-90" style={{ background: "#C5C5C5", color: "#000000" }}>
                    LIHAT KOLEKSI
                  </Link>
                </div>
              ) : (
                <>
                  {/* Desktop: tabel pesanan — table-layout fixed, TANPA scroll horizontal.
                      Tanggal pindah jadi baris kecil di bawah nomor pesanan. */}
                  <div className="hidden md:block">
                    <table className="akun-table">
                      <colgroup>
                        <col style={{ width: "24%" }} />
                        <col />
                        <col style={{ width: "15%" }} />
                        <col style={{ width: "17%" }} />
                        <col style={{ width: "56px" }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>No. Pesanan</th>
                          <th>Produk</th>
                          <th className="is-right">Total</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.map((order) => {
                          const item = order.order_items?.[0];
                          const sc = statusInfo(orderStatusKey(order));
                          return (
                            <tr
                              key={order.id}
                              onClick={() => setSelectedOrder(order)}
                              className="cursor-pointer"
                            >
                              <td>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedOrder(order);
                                  }}
                                  className="akun-order-no"
                                >
                                  #{order.order_number}
                                </button>
                                <span className="akun-order-date">{tglID(order.created_at)}</span>
                              </td>
                              <td>
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="akun-cell-thumb shrink-0 overflow-hidden">
                                    <OrderItemThumb
                                      item={item || {}}
                                      lookup={photoLookup}
                                      className="w-full h-full"
                                      fallback={<svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#000000" strokeWidth="1.2"><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /></svg>}
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="akun-cell-name">{item?.product_name || "Produk"}</p>
                                    <p className="akun-cell-sub">{order.order_items?.length || 0} item</p>
                                  </div>
                                </div>
                              </td>
                              <td className="is-right"><span className="akun-cell-total">{rupiah(order.total)}</span></td>
                              <td><span className={`akun-pill ${sc.pill}`}>{sc.label}</span></td>
                              <td className="is-right">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedOrder(order);
                                  }}
                                  aria-label={`Buka pesanan ${order.order_number}`}
                                  className="akun-row-go"
                                >
                                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: kartu */}
                  <div className="md:hidden divide-y divide-[#EBEBEB]">
                    {recentOrders.map((order) => {
                      const state = statusInfo(orderStatusKey(order));
                      const finished = String(order.status || "").toLowerCase() === "selesai";
                      const items = order.order_items || [];
                      const reviewOf = (item: OrderItem) => (item.id ? reviewStatus.get(String(item.id)) || null : null);
                      const pendingItem = finished ? items.find((item) => item.id && !reviewOf(item)) : undefined;
                      const rejectedItem = finished ? items.find((item) => item.id && reviewOf(item) === "rejected") : undefined;
                      const actionItem = pendingItem || rejectedItem;
                      const reviewPending = finished && items.some((item) => reviewOf(item) === "pending");
                      const reviewPublished = finished && items.some((item) => reviewOf(item) === "published");
                      return (
                        <div key={order.id} className="p-4 transition hover:bg-[#faf8f4]">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="block w-full cursor-pointer text-left"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-[10px] overflow-hidden shrink-0 flex items-center justify-center" style={{ background: "#f2f2f2" }}>
                                <OrderItemThumb
                                  item={order.order_items?.[0] || {}}
                                  lookup={photoLookup}
                                  className="w-full h-full flex items-center justify-center"
                                  fallback={<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#000000" strokeWidth="1.5"><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /></svg>}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13.5px] font-bold truncate" style={{ color: "#000000" }}>{order.order_items?.[0]?.product_name || "Produk"}</p>
                                <p className="text-[11.5px] text-[#8b9793] font-mono mt-0.5 truncate">#{order.order_number} &middot; {tglID(order.created_at)}</p>
                              </div>
                              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="#CCCCCC" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
                            </div>
                          </button>
                          <div className="mt-3 flex items-end justify-between gap-3">
                            <div className="min-w-0">
                              <span className="block text-[13.5px] font-black" style={{ color: "#000000" }}>Rp{order.total.toLocaleString("id-ID")}</span>
                              {finished ? (
                                <span className="mt-0.5 block text-[10.5px] font-semibold text-[#8b9793]">{state.label}</span>
                              ) : null}
                            </div>
                            {actionItem ? (
                              <button
                                type="button"
                                onClick={() => setReviewItem(toReviewItem(actionItem))}
                                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-black px-4 text-[11.5px] font-extrabold text-white transition active:scale-[.98]"
                              >
                                {pendingItem ? "Beri Ulasan" : "Kirim ulang"}
                                <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 6 6 6-6 6" /></svg>
                              </button>
                            ) : reviewPending ? (
                              <Link href={to("/akun/ulasan")} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                                Menunggu
                                <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 6 6 6-6 6" /></svg>
                              </Link>
                            ) : reviewPublished ? (
                              <Link href={to("/akun/ulasan")} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                                Tayang
                                <svg viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 6 6 6-6 6" /></svg>
                              </Link>
                            ) : (
                              <span className={state.pill}>{state.label}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <DashboardProductSection />

            {/* ═══ Akses Cepat (mobile grid) ═══ */}
            <div className="md:hidden mt-8">
              <h2 className="akun-sect mb-3">Akses Cepat</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { href: "/akun/wishlist", title: "Wishlist", sub: "Koleksi favorit", icon: <path d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z" /> },
                  { href: "/akun/pesanan", title: "Pesanan Saya", sub: "Lacak status", icon: <><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /></> },
                  { href: "/akun/ulasan", title: "Ulasan Saya", sub: "Beri nilai pesanan", full: true, icon: <path d="M12 3l2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.3l5.9-.9Z" /> },
                  { href: "/akun/panduan-ukuran", title: "Panduan Ukuran", sub: "Cari size pas", icon: <><path d="M3 14 14 3l7 7L10 21z" /><path d="M7.5 12.5 9 14M10.5 9.5 12 11M13.5 6.5 15 8" /></> },
                  { href: "/akun/bantuan", title: "Hubungi Admin", sub: "Chat tim admin", icon: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h2.5A1.5 1.5 0 0 1 8 15.5v3A1.5 1.5 0 0 1 6.5 20H6a2 2 0 0 1-2-2v-4Z" /><path d="M20 14h-2.5A1.5 1.5 0 0 0 16 15.5v3A1.5 1.5 0 0 0 17.5 20h.5a2 2 0 0 0 2-2v-4Z" /></> },
                ].map((it) => (
                  <Link key={it.href} href={to(it.href)} className={`akun-card p-3.5 min-h-[112px] flex flex-col gap-3 transition hover:shadow-lg active:scale-[.99] ${"full" in it && it.full ? "col-span-2" : ""}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="shrink-0 w-9 h-9 rounded-[12px] grid place-items-center" style={{ background: "#f2f2f2" }}>
                        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="#000000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
                      </span>
                      <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-[#9aa5a1]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
                    </span>
                    <span className="min-w-0 mt-auto">
                      <span className="block font-bold text-[13px] leading-snug" style={{ color: "#000000" }}>{it.title}</span>
                      <span className="block text-[11px] text-[#777777] mt-0.5">{it.sub}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <CustomerOrderDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />

      {reviewItem ? (
        <ReviewFormModal
          item={reviewItem}
          onClose={() => setReviewItem(null)}
          onSaved={(review) => {
            if (review.order_item_id) {
              setReviewStatus((prev) => {
                const next = new Map(prev);
                next.set(String(review.order_item_id), String(review.status || "pending"));
                return next;
              });
            }
            setReviewItem(null);
          }}
        />
      ) : null}
    </>
  );
}
