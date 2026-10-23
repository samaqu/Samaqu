"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCustomerOrders } from "@/lib/customer-auth";
import { useAkunCustomer } from "@/components/akun/AkunContext";
import { resolveItemPhotos } from "@/lib/order-photo";
import { itemProductIds, loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { useSafeLocale } from "@/lib/safe-i18n";
import { AkunHeader } from "@/components/akun/AkunShell";
import CustomerOrderDrawer from "@/components/akun/CustomerOrderDrawer";
import { statusInfo, tglID, rupiah } from "@/lib/akun-format";
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

const TABS = [
  { key: "semua", label: "Semua" },
  { key: "pending", label: "Belum Bayar" },
  { key: "diproses", label: "Diproses" },
  { key: "dikirim", label: "Dikirim" },
  { key: "selesai", label: "Selesai" },
];

export default function PesananPage() {
  const locale = useSafeLocale();
  const to = (href: string) => `/${locale}${href}`;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("semua");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const { customer, ready } = useAkunCustomer();

  useEffect(() => {
    if (!ready) return;
    if (!customer) {
      setLoading(false);
      return;
    }
    const customerId = customer.id;
    let alive = true;
    async function init() {
      try {
        if (!alive) return;
        const o = await getCustomerOrders(customerId);
        const list = (o as Order[]) || [];
        // Foto item: snapshot di baris pesanan dipakai lebih dulu; query katalog hanya untuk
        // item yang fotonya memang kosong.
        const missing = list.flatMap((order) =>
          (order.order_items || []).filter((item) => !item.product_image)
        );
        const lookup = missing.length ? await loadOrderPhotoLookup(itemProductIds(missing)) : null;
        if (!alive) return;
        setOrders(list.map((order) => ({ ...order, order_items: resolveItemPhotos(order.order_items || [], lookup) })));
      } catch (error) {
        console.error("[akun/pesanan] gagal memuat pesanan:", error);
      } finally {
        if (alive) setLoading(false);
      }
    }
    init();
    return () => { alive = false; };
  }, [customer, ready]);

  const filtered = useMemo(() => {
    if (tab === "semua") return orders;
    // Tiap tab = satu status pesanan; "pending" punya tabnya sendiri ("Belum Bayar"), jadi
    // "Diproses" tidak lagi ikut menampung pesanan yang belum dibayar.
    return orders.filter((o) => orderStatusKey(o) === tab);
  }, [orders, tab]);

  return (
    <>
      <AkunHeader title="Pesanan Saya" back="/akun" />

      {/* Baris tab dibuat wrap (pola sama seperti tab tahap di admin) supaya lima tab tetap
          muat utuh & rapih di layar sempit tanpa scroll samping. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 sm:gap-x-6 border-b border-[#e6dfd2] mb-5 md:mb-7 text-sm md:text-base">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-3 whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key ? "font-extrabold border-[#000000]" : "font-semibold text-[#8b9793] border-transparent"
            }`}
            style={tab === t.key ? { color: "#000000" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <>
          {/* Mobile: skeleton kartu (tampilan lama) */}
          <div className="grid gap-3 md:hidden">
            {[0, 1].map((i) => <div key={i} className="akun-card h-36 animate-pulse" />)}
          </div>
          {/* Desktop: skeleton tabel */}
          <div className="hidden md:block akun-card overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] animate-pulse border-b border-[#f0f0f0] last:border-0" />
            ))}
          </div>
        </>
      ) : filtered.length > 0 ? (
        <>
          {/* ═══ DESKTOP: TABEL ═══ */}
          <div className="hidden md:block akun-card overflow-hidden">
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
                {filtered.map((o) => {
                  const item = o.order_items?.[0];
                  const sc = statusInfo(orderStatusKey(o));
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      className="cursor-pointer border-b border-[#f0f0f0] last:border-0 transition-colors hover:bg-[#fafafa]"
                    >
                      <td className="px-5 py-4 align-middle whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedOrder(o);
                          }}
                          className="font-bold text-sm hover:underline"
                          style={{ color: "#000000" }}
                        >
                          #{o.order_number}
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
                            <p className="text-xs text-[#6c7a75] mt-0.5">{o.order_items?.length || 0} item</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-middle text-sm text-[#6c7a75] whitespace-nowrap">{tglID(o.created_at)}</td>
                      <td className="px-5 py-4 align-middle text-sm font-bold text-right whitespace-nowrap" style={{ color: "#000000" }}>{rupiah(o.total)}</td>
                      <td className="px-5 py-4 align-middle"><span className={sc.pill}>{sc.label}</span></td>
                      <td className="px-5 py-4 align-middle text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedOrder(o);
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

          {/* ═══ MOBILE: KARTU (tampilan lama, tidak diubah) ═══ */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((o) => {
              const item = o.order_items?.[0];
              const sc = statusInfo(o.status);
              return (
                <button key={o.id} type="button" onClick={() => setSelectedOrder(o)} className="akun-card block w-full p-4 text-left transition hover:shadow-lg active:scale-[.99]">
                  <div className="flex items-center justify-between text-[11px] text-[#7c8b85] font-semibold">
                    <span>#{o.order_number}</span><span>{tglID(o.created_at)}</span>
                  </div>
                  <div className="flex gap-3 mt-3">
                    <div className="akun-thumb w-16 h-16 shrink-0 overflow-hidden">
                      {item?.product_image ? (
                        <img src={item.product_image} alt={item.product_name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="#000000" strokeWidth="1.2"><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /></svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate" style={{ color: "#000000" }}>{item?.product_name || "Produk"}</p>
                      <p className="text-[12px] text-[#6c7a75] mt-0.5">{o.order_items?.length || 0} item • {rupiah(o.total)}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className={sc.pill}>{sc.label}</span>
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#9aa5a1]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="akun-card p-8 md:p-12 text-center md:max-w-[520px] md:mx-auto">
          <div className="mx-auto w-16 h-16 rounded-2xl grid place-items-center" style={{ background: "#e3ede9" }}>
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="#000000" strokeWidth="1.5"><path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" /><path d="M3 8.5v7L12 20l9-4.5v-7" /></svg>
          </div>
          <p className="mt-4 font-extrabold" style={{ color: "#000000" }}>Belum ada pesanan di tab ini</p>
          <p className="text-sm text-[#6c7a75] mt-1">Coba pilih filter lain ya.</p>
        </div>
      )}

      <CustomerOrderDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />
    </>
  );
}
