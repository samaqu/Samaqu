"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getCustomerOrders } from "@/lib/customer-auth";
import { useAkunCustomer } from "@/components/akun/AkunContext";
import { getProducts } from "@/lib/db";
import { resolveItemPhotos, type OrderPhotoLookup } from "@/lib/order-photo";
import { itemProductIds, loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { useSafeLocale } from "@/lib/safe-i18n";
import { orderSourceLabel } from "@/lib/transaksi";
import OrderDetailPanel from "@/components/ops/transaksi/OrderDetailPanel";
import "@/app/panel-admin/panel-transaksi.css";
import "@/app/panel-admin/panel-mono.css";

/**
 * Detail pesanan customer — layout sama dengan detail di dashboard admin:
 * OrderDetailPanel (tema mono) di body, header sumber + nomor, footer aksi.
 */

type CustomerOrder = Record<string, any>;

export default function DetailPesananPage() {
  const params = useParams();
  const orderNo = decodeURIComponent(String(params.orderNo));
  const locale = useSafeLocale();
  const to = (href: string) => `/${locale}${href}`;
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
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

        const orders = await getCustomerOrders(customerId);
        const found = (orders as CustomerOrder[]).find((row) => row.order_number === orderNo);
        if (!found) {
          if (alive) setNotFound(true);
          return;
        }

        const items = found.order_items || [];
        // Katalog + foto hanya diambil kalau ada item yang belum punya snapshot.
        const missing = items.filter((item: any) => !item.product_image);
        let lookup: OrderPhotoLookup | null = null;
        if (missing.length > 0) {
          const catalog = await getProducts();
          lookup = await loadOrderPhotoLookup(itemProductIds(missing), catalog);
        }
        if (!alive) return;
        setOrder({ ...found, order_items: resolveItemPhotos(items, lookup) });
      } catch (error) {
        console.error("[akun/detail-pesanan] gagal memuat pesanan:", error);
      } finally {
        if (alive) setLoading(false);
      }
    }
    init();
    return () => { alive = false; };
  }, [orderNo, customer, ready]);

  if (loading) {
    return (
      <div className="-mx-4 -mt-4 min-h-screen bg-[#F7F5F0] px-4 py-6 md:mx-0 md:mt-0 md:px-0">
        <div className="mx-auto w-full max-w-[520px]">
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="-mx-4 -mt-4 min-h-screen bg-[#F7F5F0] px-4 py-6 md:mx-0 md:mt-0 md:px-0">
        <div className="mx-auto w-full max-w-[520px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-base font-extrabold text-slate-900">Pesanan tidak ditemukan</p>
            <p className="mt-1 text-sm text-slate-500">
              Pastikan akun email/WhatsApp yang dipakai sama dengan pesanan ini.
            </p>
            <Link
              href={to("/akun/pesanan")}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
            >
              Kembali ke Pesanan Saya
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const panelOrder = {
    ...order,
    items: order.order_items || [],
    kota: order.shipping_city,
    notes: order.shipping_notes,
    shipping_kecamatan: order.shipping_kecamatan,
    shipping_province: order.shipping_province,
  };

  const latestTracking = order.tracking_status_text
    ? {
        status: order.tracking_status_text,
        location: order.tracking_city,
        dateTime: order.tracking_updated_at || "",
      }
    : null;

  return (
    <div className="-mx-4 -mt-4 min-h-screen bg-[#F7F5F0] px-4 py-6 md:mx-0 md:mt-0 md:px-0">
      <div className="mx-auto w-full max-w-[520px]">
        <Link
          href={to("/akun/pesanan")}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B6257] hover:text-[#1F1B16]"
        >
          ← Pesanan Saya
        </Link>

        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                {orderSourceLabel(order)}
              </p>
              <h1 className="mt-0.5 text-lg font-extrabold text-slate-900">Detail Pesanan</h1>
              <p className="mt-0.5 font-mono text-xs font-semibold text-slate-500">{order.order_number}</p>
            </div>
          </header>

          <div className="px-5 py-4">
            <OrderDetailPanel
              order={panelOrder}
              theme="mono"
              latestTracking={latestTracking}
              trackingState="done"
            />
          </div>

          <footer className="flex flex-wrap gap-2 border-t border-slate-200 px-5 py-4">
            <Link
              href={to(`/akun/pesanan/${orderNo}/lacak`)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
            >
              Lacak Resi
            </Link>
            <Link
              href={to("/akun/pesanan")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Kembali
            </Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
