"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { strukStatus, strukSteps, tglJamID, rupiah } from "@/lib/akun-format";
import type { TrackHistoryItem } from "@/lib/jnt/types";
import {
  censorReceiverPII,
  formatTrackingTime,
  sortHistoryDesc,
  trackingRow,
  trackingSummary,
} from "@/lib/jnt/track-status";
import { orderStatusKey, shippingStatusOf, SHIPPING_STATUS_LABEL } from "@/lib/order-flow";
import { jntServiceCodeFromShippingMethod } from "@/lib/jnt/layanan";
import { useSafeTranslations } from "@/lib/safe-i18n";
import { PaymentMethodValue } from "@/components/admin/PaymentMethodsManager";
import OrderDetailPanel from "@/components/ops/transaksi/OrderDetailPanel";
import { RINCIAN_CSS } from "@/components/akun/RincianPesanan";
import { NEUTRAL_ITEM_PHOTO, resolveItemPhotos, type OrderPhotoLookup } from "@/lib/order-photo";
import { itemProductIds, loadOrderPhotoLookup } from "@/lib/order-photo-data";
import { waNumber, waLink, pesanPembayaran } from "@/lib/whatsapp";
import { supabase } from "@/lib/supabase";
import {
  formatWeightExact,
  productWeightMapFromRows,
  resolveLineWeight,
  variantWeightMapFromRows,
  type ResolvedLineWeight,
} from "@/lib/shipping-weight";
import { OPEN_ORDER_ADDON, resolveAddonWeight } from "@/lib/open-order-config";
import { useStoreSettings } from "@/lib/store-settings";

/**
 * Isi detail pesanan untuk dashboard admin — memakai susunan & gaya yang sama dengan
 * halaman detail pesanan customer (`RincianPesanan`), supaya yang dilihat admin seragam
 * dengan yang dilihat customer:
 *   banner status → Info Pengiriman → Alamat Pengiriman → produk + Total Pesanan →
 *   Status Pesanan (linimasa) → aksi.
 * Kelas `rp-` beserta CSS-nya diimpor dari komponen customer (satu sumber gaya); kontrol
 * khusus admin (ubah status, WhatsApp, cetak label, batalkan J&T, hapus) memakai kelas `od-`
 * yang didefinisikan di OD_CSS. Dipakai kedua dashboard admin (`/admin` dan `/[locale]/admin`).
 */

export interface AdminDetailItem {
  product_id?: string | null;
  product_name: string;
  color: string;
  size: string;
  kain?: string | null;
  series?: string | null;
  quantity: number;
  price: number;
  customer_price: number | null;
  minimum_price: number | null;
  product_image?: string | null;
}

export interface AdminDetailOrder {
  order_number: string;
  status: string;
  created_at: string;
  /** Jam pembatalan yang akurat (kolom `orders.cancelled_at`), dibaca `strukSteps`. */
  cancelled_at?: string | null;
  /** Jam perubahan terakhir; cadangan jam pembatalan kalau `cancelled_at` masih kosong. */
  updated_at?: string;
  total: number;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  shipping_method?: string | null;
  payment_method?: string | null;
  /** Channel gateway (mayar), mis. "qris" / "va/bni" — rincian metode pembayaran online. */
  payment_channel?: string | null;
  /** Pembayaran online (Mayar): provider, link bayar, status, dan jam lunas. */
  payment_provider?: string | null;
  payment_url?: string | null;
  payment_status?: string | null;
  paid_at?: string | null;
  awb_no?: string | null;
  /** Berat kirim pesanan (gram) — kolom `orders.weight`. */
  weight?: number | null;
  /** Status pengiriman terpisah dari status pesanan (menunggu_pickup | dikirim | selesai). */
  shipping_status?: string | null;
  /** `voided` = resi sudah dibatalkan di J&T (kolom `orders.jnt_void_status`). */
  jnt_void_status?: string | null;
  source?: string | null;
  tracking_status_text?: string | null;
  /** Kode pemindaian terakhir — dipakai mendeteksi status tertunda (badge "Tertunda"). */
  tracking_status_code?: number | null;
  tracking_city?: string | null;
  tracking_updated_at?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_whatsapp?: string | null;
  shipping_address?: string | null;
  shipping_city?: string | null;
  shipping_postal_code?: string | null;
  shipping_notes?: string | null;
  order_items?: AdminDetailItem[];
}

const OD_CSS = `
/* Tombol/aksi admin, ditempel di area aksi lembar struk. */
.od-root .rp-root{min-height:0;padding:0;background:transparent}
.od-root .rp-wrap{max-width:none;padding:0;background:transparent}
.od-root .rp-sheet{padding:0;background:transparent;border:0;border-radius:0;box-shadow:none}
.od-root .rp-act{position:static;background:none;padding:16px}
.od-title{font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:700;color:#757575;margin-bottom:10px}
.od-chips{display:flex;flex-wrap:wrap;gap:10px}
.od-chip{flex:1 1 0;min-width:0;font-size:13px;font-weight:700;padding:10px 12px;border-radius:12px;border:1px solid #E1E3E5;background:#fff;color:#5A6067;text-align:center;cursor:pointer;transition:background .2s,color .2s,border-color .2s}
.od-chip:hover{background:#F5F6F7}
.od-chip.is-on{background:#0f172a;border-color:#0f172a;color:#fff}
.od-acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;padding-top:16px;border-top:1px solid #F2F3F4}
.od-a{display:inline-flex;align-items:center;justify-content:center;gap:7px;flex:1 1 calc(50% - 5px);min-width:0;min-height:44px;font-size:14px;font-weight:600;padding:13px 14px;border-radius:12px;border:1px solid #E1E3E5;background:#fff;color:#5A6067;text-align:center;line-height:1.2;white-space:normal;text-decoration:none;cursor:pointer;transition:background .2s}
.od-a:hover{background:#F5F6F7}
.od-a.is-on{background:#f1f5f9;border-color:#cbd5e1;color:#0f172a}
/* Aksi utama drawer: pembuatan resi J&T ("Atur Pesanan"). */
.od-a-primary{background:#0f172a;border-color:#0f172a;color:#fff}
.od-a-primary:hover{background:#1e293b;border-color:#1e293b}
.od-a-primary:disabled{opacity:.6;cursor:default}
.od-a-primary:disabled:hover{background:#0f172a;border-color:#0f172a}
.od-a-danger{border-color:#f6c9ce;color:#d63340}
.od-a-danger:hover{background:#fff5f5}
.od-email{display:block;font-size:12.5px;color:#8D9297;font-weight:500;margin-top:2px}
/* Pelacakan J&T di dalam drawer (tombol "Lacak Paket"). */
.od-track{margin-top:14px;padding-top:14px;border-top:1px solid #F2F3F4}
.od-tnote{margin:0;font-size:12.5px;font-weight:600;color:#8D9297}
.od-ups{display:flex;flex-direction:column;gap:12px}
.od-up{display:flex;gap:10px}
.od-up-dot{width:10px;height:10px;border-radius:50%;background:#D9DCE0;flex:none;margin-top:4px}
.od-up.is-first .od-up-dot{background:#0f172a;box-shadow:0 0 0 3px rgba(15,23,42,.14)}
.od-up b{display:block;font-size:12.5px;font-weight:700;color:#3F454B}
.od-up i{display:block;font-size:11.5px;font-style:normal;color:#8D9297;margin-top:2px}
/* Mobile: drawer admin bukan halaman customer — latar abu (dan ruangnya) dibuang supaya
   isi struk duduk langsung di kertas drawer, dan banner status menempel rapi di bawah
   header drawer (tanpa celah + sudut). Kartu putih di bawahnya jadi sama seperti kartu
   dashboard admin. */
@media (max-width:767.98px){
 .od-root .rp-root{background:transparent;padding-bottom:0}
 .od-root .rp-banner{margin-top:0;border-radius:0;padding:15px 16px}
 /* Panel aksi: chip status rata 2×2 dan tombol aksi 2 kolom — sama seperti footer
    drawer panel admin di layar sempit. */
 .od-chips{display:grid;grid-template-columns:1fr 1fr;gap:10px}
 .od-chip{padding:11px 10px}
 .od-acts{flex-wrap:wrap;gap:10px}
 .od-a{flex:1 1 calc(50% - 5px);justify-content:center;padding:12px 10px}
}
@media (min-width:768px){
 .od-root .rp-root{background:transparent}
 /* Drawer = kertasnya sendiri. Dulu struk di sini masih jadi "lembar 600px terpusat" dengan
    sisa ruang krem di kiri-kanannya — di dalam drawer itu bikin panel terasa lebar & tampak
    bertumpuk. Sekarang isi struk mengisi lebar drawer; pemisah putus-putusnya tetap memberi
    rasa struk. */
 .od-root .rp-wrap{max-width:none}
 .od-root .rp-sheet{background:transparent;border:0;border-radius:0;box-shadow:none}
 .od-root .rp-act{padding:16px 20px 20px}
 .od-acts{border-top-color:rgba(42,33,27,.09)}
}
/* Resi HBO: form input nomor resi manual — gaya sama dengan chip/tombol admin di atas. */
.od-manual{margin-top:16px}
.od-hint{font-size:12px;font-weight:600;color:#757575;line-height:1.5;margin:-4px 0 10px}
.od-input{width:100%;margin-bottom:8px;font-size:13px;font-weight:600;padding:11px 12px;border-radius:12px;border:1px solid #E1E3E5;background:#fff;color:#1B1B1B}
.od-input:focus{outline:none;border-color:#0f172a}
.od-input:disabled{opacity:.6}
.od-error{font-size:12px;font-weight:700;color:#c0392b;margin:2px 0 8px}
.od-link{width:100%;background:none;border:0;padding:8px 0 0;font-size:12px;font-weight:700;color:#757575;cursor:pointer}
.od-link:hover{color:#1B1B1B}
`;

function Pin() {
  return (
    <svg className="rp-ico" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
  );
}

/** Status yang berarti paket sudah jalan (dikirim) atau sudah sampai (selesai). */
const SHIPPED_STATES = ["dikirim", "selesai"];

const WHATSAPP_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.548 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.885 3.488";

export default function OrderDetailContent({
  order,
  onStatusChange,
  onCancelJnt,
  onDelete,
  onArrangeOrder,
  onSynced,
}: {
  order: AdminDetailOrder;
  onStatusChange: (status: string) => void;
  onCancelJnt?: () => void;
  onDelete: () => void;
  /** "Atur Pesanan": buat resi J&T setelah pembayaran diverifikasi (ala Shopee). */
  onArrangeOrder?: () => Promise<void> | void;
  /** Dipanggil setelah "Lacak Paket" menyinkronkan status dari J&T (server). */
  onSynced?: (patch: {
    status?: string;
    shipping_status?: string | null;
    awb_no?: string;
    shipping_method?: string;
  }) => void;
}) {
  const effectiveStatus = orderStatusKey(order);
  const sc = strukStatus(effectiveStatus);
  const steps = strukSteps({ ...order, status: effectiveStatus });
  const items = order.order_items || [];
  const resi = order.awb_no || "";
  // Resi yang sudah di-void tidak boleh ditawari cetak label/batalkan lagi. Sumbernya kolom
  // `jnt_void_status`; pesanan `dibatalkan` yang dibuat sebelum kolom itu ada tetap tertangkap
  // lewat statusnya (semua jalur pembatalan memang mem-void resi lebih dulu).
  const resiVoided = !!resi && (order.jnt_void_status === "voided" || order.status === "dibatalkan");
  const wa = waNumber(order.customer_whatsapp);
  // Pesan chat sudah terisi (satu teks standar untuk semua pesanan) supaya admin tinggal
  // kirim — teksnya di `pesanPembayaran`, hanya nama panggilan pelanggan dan nomor
  // pesanan yang berubah.
  const waPesan = pesanPembayaran(order.customer_name, order.order_number);
  const alamat = [order.shipping_address, order.shipping_city, order.shipping_postal_code].filter(Boolean).join(", ");

  const [showAlamat, setShowAlamat] = useState(false);

  // Rincian berat (internal admin): pesanan Open Order bisa memuat add-on "Extra Cover & Hanger"
  // — satu baris `order_items` ber-id "addon-cover-hanger". Berat add-on mengikuti setting admin
  // (`store_settings.open_order_addon_weight`), dipakai memisah berat produk vs berat add-on.
  const settings = useStoreSettings();
  const addonWeight = resolveAddonWeight(settings.open_order_addon_weight);
  const hasAddon = items.some((it) => it.product_id === OPEN_ORDER_ADDON.id);

  // "Atur Pesanan" — pembuatan resi J&T manual, dan hanya untuk pesanan yang sudah diproses
  // admin (chip status → Diproses, ala Shopee): pesanan yang masih menunggu pembayaran belum
  // boleh menerbitkan resi. Selama proses, tombolnya dikunci supaya admin tidak menekan dua
  // kali (dua kali klik = dua pesanan J&T).
  const [arranging, setArranging] = useState(false);
  const canArrange = !resi && !!onArrangeOrder && order.status === "diproses";

  async function handleArrange() {
    if (!onArrangeOrder || arranging) return;
    setArranging(true);
    try {
      await onArrangeOrder();
    } finally {
      setArranging(false);
    }
  }

  // Pelacakan J&T — dibuka dari tombol "Lacak Paket". Data diambil sekali per drawer.
  const [showTrack, setShowTrack] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [trackHistory, setTrackHistory] = useState<TrackHistoryItem[] | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  /** Respons J&T apa adanya (untuk tombol "Lihat data mentah"). */
  const [trackRaw, setTrackRaw] = useState<unknown>(null);
  const [showRaw, setShowRaw] = useState(false);
  const t = useSafeTranslations("tracking");

  /** Status terbaru J&T (read-only) — diambil otomatis saat drawer dibuka. */
  const [liveTrack, setLiveTrack] = useState<{ status: string; location?: string; dateTime?: string; serviceCode?: string } | null>(null);
  useEffect(() => {
    if (!resi) {
      setLiveTrack(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/jnt/track?awb=${encodeURIComponent(resi)}&refresh=1`, {
          cache: "no-store",
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) return;
        const history = Array.isArray(json.data?.history) ? json.data.history : [];
        const latest = sortHistoryDesc(history)[0];
        if (!latest || cancelled) return;
        const row = trackingRow(latest);
        setLiveTrack({
          status: row.status,
          location: row.location,
          dateTime: row.dateTime,
          serviceCode: String(json.data?.detail?.services_code || "").toUpperCase(),
        });
      } catch {
        // Diam saja — snapshot tersimpan tetap dipakai sebagai cadangan.
      }
    })();
    return () => { cancelled = true; };
  }, [resi, order.order_number]);

  // Berat per ITEM (gram) — dihitung dari `product_variants.weight` (per produk + warna + ukuran);
  // `products.weight` hanya cadangan. `order_items` tidak menyimpan berat, jadi dihitung saat dibuka.
  const [itemWeights, setItemWeights] = useState<Record<string, ResolvedLineWeight>>({});
  useEffect(() => {
    const items = order.order_items || [];
    const ids = Array.from(new Set(items.map((it) => it.product_id).filter((x): x is string => !!x)));
    if (ids.length === 0) return;
    let active = true;
    Promise.all([
      supabase.from("products").select("id, weight").in("id", ids),
      supabase.from("product_variants").select("product_id, color, size, weight").in("product_id", ids),
    ]).then(([pRes, vRes]) => {
      if (!active) return;
      const productWeights = productWeightMapFromRows(pRes.data);
      const variantWeights = variantWeightMapFromRows(vRes.data);
      const map: Record<string, ResolvedLineWeight> = {};
      for (const it of items) {
        const resolved = resolveLineWeight(
          { productId: it.product_id, color: it.color, size: it.size },
          productWeights,
          variantWeights
        );
        map[`${it.product_id}|${it.color}|${it.size}`] = resolved;
        // Fallback TIDAK boleh diam-diam: catat di log supaya ketahuan.
        if (resolved.source !== "variant") {
          console.warn("[BERAT] berat per ukuran tidak ditemukan → fallback:", {
            order: order.order_number,
            product: it.product_id,
            color: it.color,
            size: it.size,
            source: resolved.source,
          });
        }
      }
      setItemWeights(map);
    });
    return () => { active = false; };
  }, [order.order_items, order.order_number]);

  // Foto item: snapshot dari baris pesanan dipakai lebih dulu; kalau kosong (mis. item Open Order
  // yang dibuat sebelum snapshot dipasang) fotonya diambil dari katalog lewat SATU fungsi pusat
  // yang juga dipakai dashboard customer — supaya admin & customer selalu melihat foto yang sama.
  const [photoLookup, setPhotoLookup] = useState<OrderPhotoLookup | null>(null);
  useEffect(() => {
    const ids = itemProductIds(order.order_items || []);
    if (ids.length === 0) return;
    let active = true;
    loadOrderPhotoLookup(ids).then((lookup) => {
      if (active) setPhotoLookup(lookup);
    });
    return () => { active = false; };
  }, [order.order_items]);

  const itemsWithPhotos = useMemo(
    () => resolveItemPhotos(order.order_items || [], photoLookup),
    [order.order_items, photoLookup]
  );

  /**
   * Total berat pesanan. Pesanan yang BELUM punya resi J&T dihitung ulang dari berat per ukuran
   * (data terbaru); pesanan yang sudah punya resi memakai berat tersimpan (jangan diubah).
   */
  const totalWeight = useMemo(() => {
    const items = order.order_items || [];
    const stored = order.weight && order.weight > 0 ? Number(order.weight) : null;
    if (order.awb_no || items.length === 0) return { grams: stored, fallback: false, recomputed: false };

    let grams = 0;
    let fallback = false;
    let incomplete = false;
    for (const it of items) {
      const w = itemWeights[`${it.product_id}|${it.color}|${it.size}`];
      const qty = Number(it.quantity) || 1;
      if (!w || w.source === "missing") { incomplete = true; continue; }
      if (w.source === "product") fallback = true;
      grams += w.grams * qty;
    }
    // Kalau ada item yang beratnya belum diketahui, jangan menebak — pakai berat tersimpan.
    if (incomplete || grams <= 0) return { grams: stored, fallback, recomputed: false };
    return { grams, fallback, recomputed: true };
  }, [itemWeights, order]);

  async function openTrack(force = false) {
    if (showTrack && !force) {
      setShowTrack(false);
      return;
    }
    setShowTrack(true);
    if (!force && (trackHistory || !resi)) return;

    setTracking(true);
    setTrackError(null);
    try {
      // Server yang menyinkronkan status (ambil tracking + transisi maju-saja, lihat
      // src/lib/jnt/tracking-sync.ts) supaya logikanya satu tempat dengan cron. Klien tidak
      // lagi menulis status sendiri.
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ orderNumber: order.order_number, action: "syncTracking" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setTrackError(json?.error || "Data pelacakan J&T belum bisa diambil.");
        return;
      }
      const data = json?.track as { history?: TrackHistoryItem[] } | null;
      setTrackHistory(data?.history ?? []);
      setTrackRaw(data ?? null);
      if (!data && json?.trackError) setTrackError(json.trackError);
      // Kalau server menaikkan status, beri tahu induk supaya daftar & drawer ikut segar.
      if (json?.changed) onSynced?.({ status: json.status, shipping_status: json.shippingStatus ?? null });
    } catch {
      setTrackError("Tidak bisa menghubungi layanan J&T. Coba lagi sebentar lagi.");
    } finally {
      setTracking(false);
    }
  }

  // Riwayat terbaru di atas — diurut dari waktu asli J&T (bukan urutan array).
  const trackUpdates = sortHistoryDesc(trackHistory);
  const trackSummary = trackingSummary(trackHistory);

  // "Dikirim" dibaca dari kolom database (`orders.shipping_status`, cadangan `orders.status`),
  // bukan dari teks label: paket sudah diserahkan ke kurir dan perjalanannya dikabarkan otomatis
  // oleh sinkronisasi tracking J&T.
  // "Sudah jalan" termasuk paket yang sudah SAMPAI (`selesai`): pesanan yang sudah diterima
  // tidak boleh lagi menampilkan tombol pembatalan/cetak label/hapus.
  const shipped = SHIPPED_STATES.includes(shippingStatusOf(order) || "") || SHIPPED_STATES.includes(order.status);

  // ── Resi HBO ── dibuat admin langsung di J&T VIP (di luar sistem), jadi nomor resinya
  // diinput manual di sini. Alur statusnya sama dengan resi EZ/ECO: resi tersimpan → menunggu
  // pickup → "Tandai Dikirim" (notifikasi "dikirim" memakai klaim atomik yang sama, jadi
  // menyimpan ulang nomor resi tidak pernah mengirim pesan dobel).
  // Layanan tersimpan menang untuk HBO: resi HBO dibuat di J&T VIP, jadi bukan dari API J&T
  // yang dipakai jalur tracking ini.
  const storedService = jntServiceCodeFromShippingMethod(order.shipping_method);
  const serviceCode = storedService === "HBO" ? "HBO" : liveTrack?.serviceCode || storedService;
  const isHbo = serviceCode === "HBO";
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAwb, setManualAwb] = useState("");
  const [manualShipped, setManualShipped] = useState("belum");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState("");
  const manualFormOpen = manualOpen || (isHbo && !resi);
  const canMarkShipped =
    !!resi &&
    !shipped &&
    order.status !== "dibatalkan" &&
    order.status !== "dikirim" &&
    order.status !== "selesai" &&
    shippingStatusOf(order) !== "dikirim" &&
    shippingStatusOf(order) !== "selesai";

  async function patchOrder(body: Record<string, unknown>) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
      body: JSON.stringify({ orderNumber: order.order_number, ...body }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "Gagal menyimpan perubahan.");
    return json as { status?: string; shippingStatus?: string | null; awbNo?: string };
  }

  async function submitManualResi() {
    if (manualBusy) return;
    const nomor = manualAwb.trim();
    setManualError("");
    if (!nomor) {
      setManualError("Nomor resi wajib diisi.");
      return;
    }
    setManualBusy(true);
    try {
      const json = await patchOrder({ action: "manualResi", awbNo: nomor, shipped: manualShipped === "sudah" });
      setManualOpen(false);
      onSynced?.({
        awb_no: json?.awbNo || nomor,
        shipping_method: "J&T HBO",
        ...(json?.status ? { status: json.status } : {}),
        ...(json?.shippingStatus ? { shipping_status: json.shippingStatus } : {}),
      });
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "Gagal menyimpan nomor resi. Coba lagi.");
    } finally {
      setManualBusy(false);
    }
  }

  async function markShipped() {
    if (manualBusy) return;
    setManualBusy(true);
    setManualError("");
    try {
      const json = await patchOrder({ action: "markShipped" });
      onSynced?.({
        ...(json?.status ? { status: json.status } : {}),
        shipping_status: json?.shippingStatus || "dikirim",
      });
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "Gagal menandai dikirim. Coba lagi.");
    } finally {
      setManualBusy(false);
    }
  }

  // Pesanan yang sudah selesai tidak lagi menampilkan tombol "Lacak Paket" (lihat area aksi).
  // Riwayat pengirimannya dibuka otomatis SEKALI supaya informasi penerimaan — termasuk
  // "Diterima oleh" dari J&T — tetap terlihat tanpa menambah tombol.
  const autoOpenedTrack = useRef(false);
  useEffect(() => {
    if (autoOpenedTrack.current) return;
    if (!resi || order.status !== "selesai") return;
    autoOpenedTrack.current = true;
    openTrack(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resi, order.status]);

  // Tombol aksi admin dipecah jadi variabel supaya bisa disusun ulang per kondisi (dua aksi saat
  // paket dikirim, aksi lengkap sebelum dikirim) tanpa menyalin markahnya.
  const arrangeAction = canArrange && !isHbo ? (
    <button type="button" className="od-a od-a-primary" onClick={handleArrange} disabled={arranging}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
        <path d="m3 8 9 5 9-5" />
        <path d="M12 13v8" />
      </svg>
      {arranging ? "Memproses…" : "Atur Pesanan"}
    </button>
  ) : null;

  const whatsappAction = wa ? (
    <a href={waLink(order.customer_whatsapp, waPesan)} target="_blank" rel="noopener noreferrer" className="od-a">
      <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d={WHATSAPP_PATH} /></svg>
      Hubungi via WhatsApp
    </a>
  ) : null;

  const lacakAction = resi ? (
    <button type="button" className={`od-a${showTrack ? " is-on" : ""}`} onClick={() => openTrack()}>
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>
      {showTrack ? "Tutup Lacak" : "Lacak Paket"}
    </button>
  ) : null;

  const cancelJntAction = resi && !resiVoided && onCancelJnt ? (
    <button type="button" className="od-a od-a-danger" onClick={onCancelJnt}>
      Batalkan J&amp;T
    </button>
  ) : null;

  // Label resi yang sudah di-void tidak ditawari lagi: kalau tercetak, label mati itu bisa
  // ditempel ke paket. Nomor resinya tetap disimpan (jejak audit) dan tetap terlihat di atas.
  const labelAction = resi && !resiVoided ? (
    <a href={`/admin/label/${order.order_number}`} target="_blank" rel="noopener noreferrer" className="od-a">
      Cetak Label
    </a>
  ) : null;

  const voidNote = resiVoided ? (
    <p className="od-hint">
      Resi {resi} sudah dibatalkan di J&amp;T, jadi labelnya tidak bisa dicetak lagi.
    </p>
  ) : null;

  const deleteAction = (
    <button type="button" className="od-a od-a-danger" onClick={onDelete}>
      Hapus Pesanan
    </button>
  );

  // Layout detail disamakan dengan panel admin. Dashboard admin memakai tema mono
  // (hitam/slate), bukan pink.
  const panelOrder = {
    ...order,
    items: itemsWithPhotos.map((item) => ({
      ...item,
      weight: itemWeights[`${item.product_id}|${item.color}|${item.size}`],
    })),
    kota: order.shipping_city,
    notes: order.shipping_notes,
    shipping_kecamatan: (order as any).shipping_kecamatan,
    shipping_province: (order as any).shipping_province,
  };
  const panelTracking = liveTrack
    ? liveTrack
    : order.tracking_status_text
      ? {
          status: trackingRow({ status: order.tracking_status_text, status_code: order.tracking_status_code }).status,
          location: order.tracking_city,
          dateTime: "",
        }
      : null;

  return (
    <div className="od-root">
      <style>{RINCIAN_CSS}</style>
      <style>{OD_CSS}</style>

      {/* Sama seperti drawer ops: panel langsung di body, tanpa wrapper struk customer. */}
      <OrderDetailPanel
        order={panelOrder}
        theme="mono"
        latestTracking={panelTracking}
        trackingState={tracking ? "loading" : "done"}
        serviceCode={liveTrack?.serviceCode}
      />

      {/* Kontrol admin — bagian yang tidak ada di halaman customer. */}
      <div className="rp-act">
              {/* Pesanan yang paketnya sudah dikirim ("Dikirim") tidak lagi menampilkan kontrol
                  ubah status manual: pada tahap itu status pesanan dikabarkan otomatis oleh
                  sinkronisasi tracking J&T, jadi chip manual bisa bertentangan dengannya. */}
              {!shipped ? (
                <>
                  <p className="od-title">Ubah Status</p>
                  <div className="od-chips">
                    {["pending", "diproses", "selesai", "dibatalkan"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`od-chip${order.status === s ? " is-on" : ""}`}
                        onClick={() => onStatusChange(s)}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {/* Resi HBO — pesanan dibuat admin di J&T VIP, resinya diinput manual di sini. */}
              {order.status !== "dibatalkan" && (isHbo || manualFormOpen) ? (
                <div className="od-manual">
                  <p className="od-title">Resi J&amp;T HBO</p>
                  <p className="od-hint">Pesanan HBO dibuat manual di J&amp;T VIP, masukkan nomor resi di sini.</p>
                  {manualFormOpen ? (
                    <>
                      <input
                        className="od-input"
                        type="text"
                        value={manualAwb}
                        onChange={(event) => setManualAwb(event.target.value)}
                        placeholder="Nomor resi HBO"
                        disabled={manualBusy}
                      />
                      <select
                        className="od-input"
                        value={manualShipped}
                        onChange={(event) => setManualShipped(event.target.value)}
                        disabled={manualBusy}
                      >
                        <option value="belum">Baru dibuat, belum dijemput</option>
                        <option value="sudah">Sudah dikirim</option>
                      </select>
                      {manualError ? <p className="od-error">{manualError}</p> : null}
                      <div className="od-acts">
                        {resi ? (
                          <button
                            type="button"
                            className="od-a"
                            onClick={() => {
                              setManualOpen(false);
                              setManualError("");
                            }}
                            disabled={manualBusy}
                          >
                            Batal
                          </button>
                        ) : null}
                        <button type="button" className="od-a od-a-primary" onClick={submitManualResi} disabled={manualBusy}>
                          {manualBusy ? "Menyimpan…" : "Simpan Resi"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="od-acts">
                      {canMarkShipped ? (
                        <button type="button" className="od-a od-a-primary" onClick={markShipped} disabled={manualBusy}>
                          {manualBusy ? "Memproses…" : "Tandai Dikirim"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="od-a"
                        onClick={() => {
                          setManualOpen(true);
                          setManualAwb(resi);
                          setManualError("");
                          // Pesanan yang paketnya sudah jalan jangan dimundurkan saat resinya diedit.
                          setManualShipped(
                            shippingStatusOf(order) === "dikirim" || shippingStatusOf(order) === "selesai"
                              ? "sudah"
                              : "belum",
                          );
                        }}
                        disabled={manualBusy}
                      >
                        Ubah Nomor Resi
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {voidNote}

              <div className="od-acts">
                {/* Paket sudah dikirim → hanya dua aksi utama (Lacak Paket + Hubungi via
                    WhatsApp). Pembatalan J&T, cetak label, dan hapus pesanan dikeluarkan dari
                    area aksi utama; kemampuan backend-nya tetap ada di /api/admin/orders &
                    /admin/label untuk kondisi khusus yang lolos validasi status. */}
                {order.status === "selesai" ? (
                  // Pesanan sudah selesai (diterima): cukup SATU aksi — hubungi pelanggan.
                  // Riwayat pengiriman tetap tampil di bawah (dibuka otomatis untuk kasus ini).
                  <>{whatsappAction}</>
                ) : shipped ? (
                  <>
                    {lacakAction}
                    {whatsappAction}
                  </>
                ) : (
                  <>
                    {arrangeAction}
                    {whatsappAction}
                    {lacakAction}
                    {cancelJntAction}
                    {labelAction}
                    {deleteAction}
                  </>
                )}
              </div>

              {/* Pesanan EZ/ECO yang ternyata dikirim lewat HBO: resinya diinput manual. */}
              {!resi && !isHbo && !manualOpen && order.status === "diproses" ? (
                <button
                  type="button"
                  className="od-link"
                  onClick={() => {
                    setManualOpen(true);
                    setManualError("");
                  }}
                >
                  Input resi manual (HBO)
                </button>
              ) : null}
              {!manualFormOpen && manualError ? <p className="od-error">{manualError}</p> : null}

              {/* Pelacakan J&T: riwayat perjalanan paket. Begitu J&T melaporkan paket
                  diterima (status_code 200), status pesanan otomatis diubah ke selesai. */}
              {showTrack ? (
                <div className="od-track">
                  <div className="flex items-center gap-2">
                    <p className="od-title" style={{ margin: 0 }}>{t("history")}</p>
                    {/* Tombol "Perbarui" tidak perlu kalau paketnya sudah final (diterima) —
                        riwayatnya sudah lengkap dan statusnya tidak akan berubah lagi. */}
                    {order.status === "selesai" || shippingStatusOf(order) === "selesai" ? null : (
                      <button
                        type="button"
                        onClick={() => openTrack(true)}
                        disabled={tracking}
                        className="ml-auto text-[11px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap"
                        style={{ border: "1px solid #d4d4d8", color: "#475569" }}
                      >
                        {tracking ? t("loading") : t("refresh")}
                      </button>
                    )}
                    {trackRaw ? (
                      <button
                        type="button"
                        onClick={() => setShowRaw((v) => !v)}
                        className="text-[11px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap"
                        style={{ border: "1px solid #d4d4d8", color: "#475569" }}
                      >
                        {t("rawData")}
                      </button>
                    ) : null}
                  </div>

                  {/* Ringkasan status: teks & keterangan diambil apa adanya dari event J&T terbaru. */}
                  {trackSummary ? (
                    <div style={{ marginTop: 10 }}>
                      <p
                        className="text-[10.5px] font-bold uppercase"
                        style={{ margin: 0, color: "#8D9297", letterSpacing: "0.06em" }}
                      >
                        {t("currentStatusTitle")}
                      </p>
                      <p
                        className="text-[13.5px] font-bold"
                        style={{ margin: "6px 0 0", color: "#1c1c1c", lineHeight: 1.35 }}
                      >
                        {trackSummary.status}
                      </p>
                      <p className="text-[12px]" style={{ margin: "2px 0 0", color: "#8D9297" }}>
                        {formatTrackingTime(trackSummary.updatedAt)}
                      </p>
                      {trackSummary.note ? (
                        <p className="text-[12px]" style={{ margin: "8px 0 0", color: "#8D9297" }}>
                          {t("noteLabel")}: <span style={{ color: "#1c1c1c" }}>{trackSummary.note}</span>
                        </p>
                      ) : null}
                      {/* Nama penerima dari J&T (biasanya terisi pada scan serah terima). */}
                      {trackSummary.receiver ? (
                        <p className="text-[12px]" style={{ margin: "8px 0 0", color: "#8D9297" }}>
                          {t("receivedBy")}: <span style={{ color: "#1c1c1c" }}>{trackSummary.receiver}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {tracking ? (
                    <p className="od-tnote">{t("loading")}</p>
                  ) : trackError ? (
                    <p className="od-tnote">{trackError}</p>
                  ) : trackUpdates.length > 0 ? (
                    <div className="od-ups">
                      {trackUpdates.map((u, i) => {
                        // Teks status & catatan J&T ditampilkan APA ADANYA. Admin juga melihat nama kurir.
                        const row = trackingRow(u);
                        return (
                          <div key={`${row.dateTime}-${i}`} className={`od-up${i === 0 ? " is-first" : ""}`}>
                            <span className="od-up-dot" style={row.warning ? { background: "#d97706" } : undefined} />
                            <div>
                              <b style={row.warning ? { color: "#b45309" } : undefined}>{row.status}</b>
                              <i>{[row.location, formatTrackingTime(row.dateTime)].filter(Boolean).join(" • ")}</i>
                              {row.note ? (
                                <i style={{ display: "block", marginTop: 2 }}>{t("note")}: {row.note}</i>
                              ) : null}
                              {row.driver ? (
                                <i style={{ display: "block", marginTop: 2 }}>{t("driver")}: {row.driver}</i>
                              ) : null}
                              {/* Nama penerima dari J&T (`receiver`) — mis. siapa yang menerima paket. */}
                              {row.receiver ? (
                                <i style={{ display: "block", marginTop: 2 }}>{t("receivedBy")}: {row.receiver}</i>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="od-tnote">{t("noUpdate")}</p>
                  )}

                  {/* Respons J&T apa adanya (data pribadi penerima disembunyikan). */}
                  {showRaw && trackRaw ? (
                    <pre
                      style={{
                        marginTop: 10, padding: 12, borderRadius: 10, background: "#f7f7f8",
                        border: "1px solid #E1E3E5", fontSize: 11, lineHeight: 1.5,
                        maxHeight: 320, overflow: "auto",
                      }}
                    >
{JSON.stringify(censorReceiverPII(trackRaw), null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : null}
      </div>
    </div>
  );
}
