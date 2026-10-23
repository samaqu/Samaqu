"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCustomerOrders } from "@/lib/customer-auth";
import { resolveItemPhotos } from "@/lib/order-photo";
import { itemProductIds, loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { useAkunCustomer } from "@/components/akun/AkunContext";
import { useSafeLocale } from "@/lib/safe-i18n";
import CustomerOrderDrawer from "@/components/akun/CustomerOrderDrawer";
import DashboardProductSection from "@/components/akun/DashboardProductSection";

import { statusInfo, rupiah, tglID } from "@/lib/akun-format";
import { orderStatusKey } from "@/lib/order-flow";

interface OrderItem {
  product_id?: string | null;
  product_name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  product_image?: string;
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
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

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
        const [o, w] = await Promise.all([
          getCustomerOrders(id),
          supabase.from("wishlists").select("product_id", { count: "exact", head: true }).eq("customer_id", id),
        ]);
        if (!alive) return;
        const list = (o as Order[]) || [];
        // Dashboard cuma menampilkan 5 pesanan terakhir — jangan resolve foto semua order.
        const recent = list.slice(0, 5);
        const missing = recent.flatMap((order) =>
          (order.order_items || []).filter((item) => !item.product_image)
        );
        const lookup = missing.length ? await loadOrderPhotoLookup(itemProductIds(missing)) : null;
        if (!alive) return;
        setOrders(
          list.map((order, index) =>
            index < 5
              ? { ...order, order_items: resolveItemPhotos(order.order_items || [], lookup) }
              : order
          )
        );
        setWishCount(w.count || 0);
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
            <div className="hidden sm:grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-[20px] border border-[rgba(0,0,0,0.06)] shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_2px_6px,rgba(0,0,0,0.06)_0px_4px_8px] p-5">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center mb-3" style={{ background: "#e3ede9" }}>
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#000000" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /></svg>
                </div>
                <p className="text-2xl font-black" style={{ color: "#000000" }}>{activeOrders}</p>
                <p className="text-xs text-[#8b9793] mt-1">Pesanan Aktif</p>
              </div>
              <div className="bg-white rounded-[20px] border border-[rgba(0,0,0,0.06)] shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_2px_6px,rgba(0,0,0,0.06)_0px_4px_8px] p-5">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center mb-3" style={{ background: "#e3ede9" }}>
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#000000" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z" /></svg>
                </div>
                <p className="text-2xl font-black" style={{ color: "#000000" }}>{wishCount}</p>
                <p className="text-xs text-[#8b9793] mt-1">Wishlist</p>
              </div>
              <div className="bg-white rounded-[20px] border border-[rgba(0,0,0,0.06)] shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.04)_0px_2px_6px,rgba(0,0,0,0.06)_0px_4px_8px] p-5">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center mb-3" style={{ background: "#e3ede9" }}>
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#000000" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                </div>
                <p className="text-2xl font-black" style={{ color: "#000000" }}>Rp{totalSpend.toLocaleString("id-ID")}</p>
                <p className="text-xs text-[#8b9793] mt-1">Total Belanja</p>
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
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "#e3ede9" }}>
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
                  {/* Desktop: tabel transaksi */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#e6dfd2] text-[11px] uppercase tracking-[0.12em] text-[#8a8a8a]">
                          <th className="px-5 py-3.5 font-bold">No. Pesanan</th>
                          <th className="px-5 py-3.5 font-bold">Produk</th>
                          <th className="px-5 py-3.5 font-bold">Tanggal</th>
                          <th className="px-5 py-3.5 font-bold text-right">Total</th>
                          <th className="px-5 py-3.5 font-bold">Status</th>
                          <th className="px-5 py-3.5" />
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
                              className="cursor-pointer border-b border-[#f0f0f0] last:border-0 transition-colors hover:bg-[#fafafa]"
                            >
                              <td className="px-5 py-4 align-middle whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedOrder(order);
                                  }}
                                  className="font-bold text-sm hover:underline"
                                  style={{ color: "#000000" }}
                                >
                                  #{order.order_number}
                                </button>
                              </td>
                              <td className="px-5 py-4 align-middle">
                                <div className="flex items-center gap-3">
                                  <div className="akun-thumb w-11 h-11 shrink-0 overflow-hidden">
                                    {item?.product_image ? (
                                      <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                    ) : (
                                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#000000" strokeWidth="1.2"><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /></svg>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm truncate" style={{ color: "#000000" }}>{item?.product_name || "Produk"}</p>
                                    <p className="text-xs text-[#6c7a75] mt-0.5">{order.order_items?.length || 0} item</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4 align-middle text-sm text-[#6c7a75] whitespace-nowrap">{tglID(order.created_at)}</td>
                              <td className="px-5 py-4 align-middle text-sm font-bold text-right whitespace-nowrap" style={{ color: "#000000" }}>{rupiah(order.total)}</td>
                              <td className="px-5 py-4 align-middle"><span className={sc.pill}>{sc.label}</span></td>
                              <td className="px-5 py-4 align-middle text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedOrder(order);
                                  }}
                                  className="inline-flex items-center gap-1 text-[12px] font-bold hover:underline"
                                  style={{ color: "#000000" }}
                                >
                                  Detail
                                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
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
                    {recentOrders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className="block w-full p-4 text-left hover:bg-[#faf8f4] transition cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-[10px] overflow-hidden shrink-0 flex items-center justify-center" style={{ background: "#e3ede9" }}>
                            {order.order_items?.[0]?.product_image ? (
                              <img src={order.order_items[0].product_image} alt={order.order_items[0].product_name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                            ) : (
                              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#000000" strokeWidth="1.5"><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /></svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-bold truncate" style={{ color: "#000000" }}>{order.order_items?.[0]?.product_name || "Produk"}</p>
                            <p className="text-[11.5px] text-[#8b9793] font-mono mt-0.5 truncate">#{order.order_number} &middot; {tglID(order.created_at)}</p>
                          </div>
                          <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="#CCCCCC" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-[13.5px] font-black" style={{ color: "#000000" }}>Rp{order.total.toLocaleString("id-ID")}</span>
                          <span className={statusInfo(orderStatusKey(order)).pill}>{statusInfo(orderStatusKey(order)).label}</span>
                        </div>
                      </button>
                    ))}
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
                  { href: "/akun/panduan-ukuran", title: "Panduan Ukuran", sub: "Cari size pas", icon: <><path d="M3 14 14 3l7 7L10 21z" /><path d="M7.5 12.5 9 14M10.5 9.5 12 11M13.5 6.5 15 8" /></> },
                  { href: "/akun/bantuan", title: "Hubungi Admin", sub: "Chat tim admin", icon: <><path d="M21 12a8 8 0 1 1-3.2-6.4" /><path d="M8 11h8M8 15h5" /></> },
                ].map((it) => (
                  <Link key={it.href} href={to(it.href)} className="akun-card p-3.5 min-h-[112px] flex flex-col gap-3 transition hover:shadow-lg active:scale-[.99]">
                    <span className="flex items-center justify-between gap-2">
                      <span className="shrink-0 w-9 h-9 rounded-[12px] grid place-items-center" style={{ background: "#e3ede9" }}>
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
    </>
  );
}
