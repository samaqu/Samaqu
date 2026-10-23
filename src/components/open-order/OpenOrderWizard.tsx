"use client";

/**
 * Alur pesanan Open Order (/open-order) — 6 langkah dalam satu halaman:
 * daftar produk → detail produk → keranjang → data pemesan → review → pesanan berhasil.
 *
 * Produk, warna, series, dan harga diturunkan dari katalog (lihat `open-order-offering.ts`) —
 * bukan daftar hardcode. Submit ke /api/open-order (route yang sama dengan form sebelumnya)
 * supaya pesanan tetap masuk ke dashboard admin sebagai pesanan `CYO-`.
 *
 * Periode & status buka/tutup datang dari store_settings (menu admin "Open Order").
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronLeft, X } from "lucide-react";
import { getCatalogProducts } from "@/lib/db";
import type { Product } from "@/lib/katalog-data";
import { OPEN_ORDER_ADDON, OPEN_ORDER_PERIOD, resolveAddonWeight } from "@/lib/open-order-config";
import { sumWeightGramsBySize, variantWeightMapFromRows } from "@/lib/shipping-weight";
import {
  buildOpenOrderProducts,
  findOpenOrderProduct,
  openOrderVariantFor,
  type OpenOrderProduct,
  type OpenOrderStockRow,
} from "@/lib/open-order-offering";
import {
  formatDateLabel,
  formatOpenOrderMoment,
  formatOpenOrderPeriod,
  formatOpenOrderPeriodCompact,
  resolveOpenOrderState,
  type OpenOrderState,
} from "@/lib/open-order-window";
import { useSafeLocale } from "@/lib/safe-i18n";
import { useStoreSettings } from "@/lib/store-settings";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { localPhone } from "@/lib/whatsapp";
import { fetchActivePaymentMethods, isOnlinePaymentMethod, type PaymentMethodRow } from "@/lib/payment-methods";
import { startOnlinePayment } from "@/lib/mayar-client";
import { sendCAPIEvent, trackAddToCart, trackPurchaseOnce } from "@/lib/meta-pixel";
import { supabase } from "@/lib/supabase";
import StepAuth, { type AuthAccount } from "./StepAuth";
import StepCart from "./StepCart";
import StepCatalog from "./StepCatalog";
import StepCustomer from "./StepCustomer";
import StepProduct from "./StepProduct";
import StepReview from "./StepReview";
import StepSuccess from "./StepSuccess";
import Countdown, { type OpenOrderPhase } from "./Countdown";
import { EMPTY_CUSTOMER, type CartLine, type CustomerData, type DraftShipping, type ProductDraft, type SavedAddress } from "./types";
import { INK, LINE, MUTED } from "./ui";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_TITLES: Record<Step, string> = {
  1: "Open Order",
  2: "Detail Produk",
  3: "Pesanan Kamu",
  4: "Data Pemesanan",
  5: "Review Pesanan",
  6: "Order Berhasil",
};

/** Tombol kembali di header per langkah. */
const BACK_TO: Partial<Record<Step, Step>> = { 2: 1, 3: 1, 4: 3, 5: 4 };

/* ── Cache ongkir J&T ──
   Panggilan pertama ke API tarif J&T memang ~3 detik (yang berikutnya ~0,1 detik karena
   di-cache server 10 menit). Cache di klien (memori + localStorage) bikin kombinasi yang pernah
   dihitung tampil seketika — mis. customer buka lagi wizardnya atau bolak-balik ubah jumlah. */
const ONGKIR_CACHE_KEY = "samaqu:open-order:ongkir";
const ONGKIR_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
type OngkirResult = { service: string; cost: number };

function readOngkirCache(cacheKey: string): OngkirResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = JSON.parse(window.localStorage.getItem(ONGKIR_CACHE_KEY) || "{}") as Record<
      string,
      OngkirResult & { ts: number }
    >;
    const hit = raw[cacheKey];
    if (!hit || Date.now() - hit.ts > ONGKIR_CACHE_TTL_MS) return null;
    return { service: hit.service, cost: hit.cost };
  } catch {
    return null;
  }
}

function writeOngkirCache(cacheKey: string, value: OngkirResult): void {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.parse(window.localStorage.getItem(ONGKIR_CACHE_KEY) || "{}") as Record<
      string,
      OngkirResult & { ts: number }
    >;
    raw[cacheKey] = { ...value, ts: Date.now() };
    window.localStorage.setItem(ONGKIR_CACHE_KEY, JSON.stringify(raw));
  } catch {
    /* localStorage penuh / diblokir → abaikan, hitungan tetap jalan */
  }
}

function defaultDraft(products: OpenOrderProduct[], productId: string, color: string): ProductDraft | null {
  const product = findOpenOrderProduct(products, productId) ?? products[0];
  if (!product) return null;
  // Series pertama (kalau produknya punya series) — produk tanpa series pakai "".
  const seriesName = product.series[0]?.name ?? "";
  const chosenColor = product.colors.includes(color) ? color : product.colors[0] ?? "";
  const sizes = openOrderVariantFor(product, chosenColor, seriesName)?.sizes ?? [];
  const size = sizes.includes("M") ? "M" : sizes[0] ?? "M";
  const price = product.series[0]?.price ?? product.minimumPrice ?? product.price;
  return {
    productId: product.id,
    color: chosenColor,
    size,
    series: seriesName,
    quantity: 1,
    price,
  };
}

export default function OpenOrderWizard({
  initialState,
  startDeadline,
  endDeadline,
  period: periodProp,
  startDate: startDateProp,
  endDate: endDateProp,
}: {
  /** Status jendela Open Order — dibaca di server (route halaman) supaya tidak pop-in. */
  initialState: OpenOrderState;
  /** 00:00:00 WIB tanggal mulai (epoch ms) — untuk hitung mundur "Buka dalam". */
  startDeadline: number | null;
  /** 23:59:59.999 WIB tanggal tutup (epoch ms) — untuk hitung mundur "Berakhir dalam". */
  endDeadline: number | null;
  /** Teks periode — dikirim dari server supaya SSR tidak nampilin teks fallback lama. */
  period?: string;
  /** Tanggal mulai (YYYY-MM-DD) — untuk caption "Buka <tanggal>", dikirim dari server. */
  startDate?: string | null;
  /** Tanggal tutup (YYYY-MM-DD) — untuk label "Berakhir …", dikirim dari server. */
  endDate?: string | null;
}) {
  const [step, setStep] = useState<Step>(1);
  const [catalog, setCatalog] = useState<Product[]>([]);
  /** Baris `product_variants` — sumber daftar ukuran per warna (produk lintas kategori). */
  const [stockRows, setStockRows] = useState<OpenOrderStockRow[]>([]);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [customer, setCustomer] = useState<CustomerData>(EMPTY_CUSTOMER);
  const [extraCover, setExtraCover] = useState(false);
  const [shipping, setShipping] = useState<DraftShipping | null>(null);
  const [loadingOngkir, setLoadingOngkir] = useState(false);
  const [ongkirError, setOngkirError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ orderNumber: string; total: number } | null>(null);
  /** Akun customer — langkah 4 hanya terbuka untuk yang sudah masuk/daftar (gerbang `StepAuth`). */
  const [account, setAccount] = useState<AuthAccount | null>(null);
  /** Alamat tersimpan akun (tabel `saved_addresses`) — dipakai langsung kalau ada. */
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  /** Metode pembayaran dari dashboard admin (tabel `payment_methods`). */
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("");

  const locale = useSafeLocale();
  // Periode & status Open Order diatur dari dashboard admin (store_settings).
  const settings = useStoreSettings();
  // Periode & status datang dari tanggal yang diatur admin; teks periode lama jadi fallback
  // selama tanggalnya belum diisi.
  // Periode: versi server (route halaman) yang jadi acuan awal — hook `useStoreSettings()`
  // baru terisi setelah hydration, jadi tanpa ini SSR sempat nampilin teks fallback lama
  // ("8-15 Agustus 2026") padahal tanggal jendelanya sudah lain.
  const period = periodProp ?? formatOpenOrderPeriod(settings, settings.open_order_period || OPEN_ORDER_PERIOD);
  const periodCompact = formatOpenOrderPeriodCompact(settings, settings.open_order_period || OPEN_ORDER_PERIOD);

  // Status jendela: server (route halaman) yang jadi acuan awal supaya tidak "pop-in" —
  // hook `useStoreSettings()` baru terisi setelah hydration, dan selama itu statusnya masih
  // default (dibuka), jadi tombol yang seharusnya terkunci sempat bisa diklik.
  const [openState, setOpenState] = useState<OpenOrderState>(initialState);
  // Begitu setting-nya termuat (tanggalnya berubah dari default), status dihitung ulang
  // di klien — jadi kalau admin mengubah jendela tanpa customer me-refresh, halamannya
  // ikut menyesuaikan. Kalau admin belum pernah mengisi tanggal, status server yang dipakai.
  useEffect(() => {
    if (!settings.open_order_start_date && !settings.open_order_end_date) return;
    setOpenState(resolveOpenOrderState(settings));
  }, [settings.open_order_start_date, settings.open_order_end_date, settings.open_order_active]);

  // Produk + varian dibaca dari katalog yang sama dengan halaman detail (harga, warna, series,
  // stok). Produk yang diikutkan admin (`open_order_enabled`) yang tampil di sini.
  useEffect(() => {
    let active = true;
    getCatalogProducts()
      .then((products) => {
        if (active) setCatalog(products);
      })
      .catch(() => {});
    supabase
      .from("product_variants")
      .select("product_id, color, size, stock, weight")
      .then(({ data }) => {
        if (active && data) setStockRows(data as OpenOrderStockRow[]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Metode pembayaran aktif dibaca dari tabel `payment_methods` (diatur admin di dashboard).
  // Kalau cuma ada satu metode, langsung dipilih supaya customer tidak perlu klik lagi.
  useEffect(() => {
    let active = true;
    fetchActivePaymentMethods().then((methods) => {
      if (!active) return;
      setPaymentMethods(methods);
      if (methods.length === 1) setPaymentMethod(methods[0].id);
    });
    return () => {
      active = false;
    };
  }, []);

  // Sesi customer dibaca sekali di awal: kalau sudah masuk, gerbang di langkah 4 dilewati dan
  // form data pemesan langsung terisi dari akun.
  useEffect(() => {
    let active = true;
    getCurrentCustomer()
      .then((customer) => {
        if (!active || !customer) return;
        applyAccount({
          id: customer.id,
          name: customer.name || "",
          whatsapp: customer.whatsapp || "",
          email: customer.email || "",
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // Penawaran (produk/warna/series/harga) diturunkan dari baris katalog — bukan hardcode —
  // semuanya yang diikutkan admin (`open_order_enabled`), lintas kategori.
  const products = useMemo(() => buildOpenOrderProducts(catalog, stockRows), [catalog, stockRows]);

  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const total = subtotal + (extraCover ? OPEN_ORDER_ADDON.price : 0) + (shipping?.cost ?? 0);

  // Berat add-on Extra Cover & Hanger (gram) — diatur admin di menu "Open Order".
  const addonWeight = resolveAddonWeight(settings.open_order_addon_weight);

  // Berat kirim (gram) memakai FUNGSI PUSAT `sumWeightGramsBySize`: berat varian per ukuran →
  // berat produk → default wizard. Tiap series (termasuk turunan) memakai beratnya SENDIRI.
  const { productWeights, variantWeights } = useMemo(() => {
    const pw: Record<string, number> = {};
    for (const product of products) {
      for (const variant of product.variants) {
        if (product.weight > 0) pw[variant.productId] = product.weight;
      }
    }
    return {
      productWeights: pw,
      variantWeights: variantWeightMapFromRows(stockRows),
    };
  }, [products, stockRows]);

  // Berat barang saja (tanpa add-on) — untuk rincian "berat produk vs cover & hanger".
  const itemsWeight = useMemo(() => {
    const weightLines = lines.map((line) => {
      const product = findOpenOrderProduct(products, line.productId);
      const variant = product ? openOrderVariantFor(product, line.color, line.series) : undefined;
      return {
        productId: variant?.productId ?? line.productId,
        color: line.color,
        size: line.size,
        quantity: line.quantity,
      };
    });
    const { grams, missingQty } = sumWeightGramsBySize(weightLines, productWeights, variantWeights);
    return grams + missingQty * 1200;
  }, [lines, products, productWeights, variantWeights]);

  // Total berat kirim = minimum 300 g + add-on bila dipilih (formula sama persis dengan server).
  const totalWeight = useMemo(
    () => Math.max(300, itemsWeight + (extraCover ? addonWeight : 0)),
    [itemsWeight, extraCover, addonWeight]
  );

  /**
   * Ongkir yang sudah pernah dihitung (kunci: kota|kecamatan|berat). Menghindari menunggu
   * panggilan J&T (~3 detik) dua kali untuk kombinasi yang sama — mis. saat customer bolak-balik
   * ubah jumlah lalu kembali ke jumlah sebelumnya.
   */
  const ongkirCacheRef = useRef<Map<string, { service: string; cost: number }>>(new Map());
  /**
   * Ongkir dihitung LEBIH DULU kalau kota/kecamatan datang dari pilihan (alamat tersimpan /
   * dropdown wilayah), bukan dari ketikan — jadi tidak perlu menunggu debounce 1 detik.
   */
  const immediateOngkirRef = useRef(false);

  // Ongkir J&T dihitung otomatis begitu kota/kecamatan tujuan terisi (perilaku form sebelumnya).
  useEffect(() => {
    const district = customer.district.trim();

    // Tunggu katalog selesai dimuat dulu: berat kirim dihitung dari berat produk, dan sebelum
    // katalog siap angkanya masih default — kalau dihitung sekarang, hasilnya dihitung ulang.
    if (district.length < 3 || products.length === 0) {
      if (district.length < 3) {
        setShipping(null);
        setOngkirError(false);
        setLoadingOngkir(false);
      }
      immediateOngkirRef.current = false;
      return;
    }

    const cacheKey = `${customer.city.trim()}|${district}|${totalWeight}`;
    const cached = ongkirCacheRef.current.get(cacheKey) ?? readOngkirCache(cacheKey);
    if (cached) {
      ongkirCacheRef.current.set(cacheKey, cached);
      setShipping(cached);
      setOngkirError(false);
      setLoadingOngkir(false);
      immediateOngkirRef.current = false;
      return;
    }

    // Pilihan (bukan ketikan) → hitung langsung; ketikan manual → tunggu 1 detik supaya tidak
    // membanjiri API J&T saat customer masih menulis nama kecamatan.
    const delay = immediateOngkirRef.current ? 0 : 1000;
    immediateOngkirRef.current = false;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingOngkir(true);
      setOngkirError(false);
      try {
        const res = await fetch("/api/shipping/jnt-cost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: customer.city.trim(), district, weight: totalWeight }),
          signal: controller.signal,
        });
        const json = await res.json();
        // J&T belum dikonfigurasi (kredensial belum diisi): bukan error, cukup tampilkan
        // pesan fallback tanpa console.error.
        if (json.configured === false) {
          setShipping(null);
          setOngkirError(true);
          return;
        }
        if (!res.ok || !Array.isArray(json.data) || json.data.length === 0) {
          throw new Error(json.error || "ongkir gagal dihitung");
        }
        // Route J&T sudah mengurutkan opsi dari yang termurah.
        const cheapest = json.data[0];
        const next = { service: cheapest.service || "J&T", cost: cheapest.cost || 0 };
        ongkirCacheRef.current.set(cacheKey, next);
        writeOngkirCache(cacheKey, next);
        setShipping(next);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("[OPEN-ORDER] hitung ongkir gagal:", err);
        setShipping(null);
        setOngkirError(true);
      } finally {
        setLoadingOngkir(false);
      }
    }, delay);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [customer.district, customer.city, totalWeight, products.length]);

  function openDetail(productId: string, color: string) {
    const next = defaultDraft(products, productId, color);
    if (!next) return;
    setDraft(next);
    setStep(2);
  }

  function addDraftToCart(line: ProductDraft) {
    setLines((prev) => [...prev, { ...line, key: nextKey }]);
    setNextKey((key) => key + 1);
    setDraft(null);
    setStep(3);

    // Meta Pixel: AddToCart — setelah baris benar-benar masuk keranjang wizard.
    trackAddToCart({
      id: line.productId,
      name: findOpenOrderProduct(products, line.productId)?.name || "Open Order",
      price: line.price,
      quantity: line.quantity,
      contents: [{ id: line.productId, quantity: line.quantity, item_price: line.price }],
    });
  }

  function updateQuantity(key: number, quantity: number) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, quantity } : line)));
  }

  function removeLine(key: number) {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }

  function setCustomerField(field: keyof CustomerData, value: string) {
    // Kecamatan dipilih dari dropdown RajaOngkir (bukan diketik) → hitung ongkir langsung,
    // tanpa menunggu debounce 1 detik.
    if (field === "districtId" && value) immediateOngkirRef.current = true;
    setCustomer((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * Pakai alamat tersimpan customer — sama seperti halaman checkout: pilih alamat default
   * (atau yang dipilih customer) lalu isi data pemesan dari alamat itu, dan hitung ulang ongkir
   * dari kecamatan/kota yang tersimpan.
   */
  function applySavedAddress(addr: SavedAddress) {
    setSelectedAddressId(addr.id);
    // Alamat tersimpan = pilihan, bukan ketikan → ongkir dihitung langsung (tanpa debounce).
    immediateOngkirRef.current = true;
    setCustomer((prev) => ({
      ...prev,
      name: addr.recipient_name || prev.name,
      whatsapp: localPhone(addr.phone) || prev.whatsapp,
      address: addr.address || "",
      postalCode: addr.postal_code || "",
      district: addr.kecamatan || "",
      city: addr.city || "",
      districtId: addr.district_id != null ? String(addr.district_id) : "",
    }));
    setShipping(null);
    setOngkirError(false);
  }

  /** "Gunakan alamat baru" — kosongkan lokasi supaya pemilih wilayah mulai dari nol. */
  function startNewAddress() {
    setSelectedAddressId(null);
    setCustomer((prev) => ({
      ...prev,
      address: "",
      provinceId: "",
      cityId: "",
      districtId: "",
      district: "",
      city: "",
      postalCode: "",
    }));
    setShipping(null);
    setOngkirError(false);
  }

  // Alamat tersimpan dibaca begitu akun customer diketahui; kalau ada, alamat utama langsung
  // dipakai supaya form tidak perlu diisi ulang.
  useEffect(() => {
    const customerId = account?.id;
    if (!customerId) return;
    let active = true;
    supabase
      .from("saved_addresses")
      .select("*")
      .eq("customer_id", customerId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!active || !data || data.length === 0) return;
        const list = data as SavedAddress[];
        setSavedAddresses(list);
        applySavedAddress(list.find((address) => address.is_default) ?? list[0]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  /**
   * Selesai masuk/daftar (gerbang langkah 4): simpan akunnya lalu isi data pemesan dari akun —
   * hanya field yang masih kosong, supaya isian customer tidak tertimpa.
   */
  function applyAccount(next: AuthAccount) {
    setAccount(next);
    setCustomer((prev) => ({
      ...prev,
      name: prev.name || next.name,
      whatsapp: prev.whatsapp || next.whatsapp,
    }));
  }

  async function submitOrder() {
    setError("");
    if (paymentMethods.length > 0 && !paymentMethod) {
      setError("Pilih metode pembayaran dulu ya.");
      return;
    }
    setSubmitting(true);
    try {
      // Pesanan Open Order selalu milik akun customer: token sesi dikirim ke route, yang
      // memverifikasinya lalu menyimpan `customer_id` (lihat /api/open-order).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setAccount(null);
        setError("Sesi login berakhir. Masuk lagi ya supaya pesananmu tersimpan di akun.");
        return;
      }
      const res = await fetch("/api/open-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          customer: {
            name: customer.name,
            whatsapp: customer.whatsapp,
            address: customer.address,
            district: customer.district,
            city: customer.city,
            postalCode: customer.postalCode,
            notes: customer.notes,
          },
          extraCover,
          paymentMethod,
          shipping: shipping ? { method: `J&T - ${shipping.service}`, cost: shipping.cost } : null,
          items: lines.map((line) => ({
            productId: line.productId,
            series: line.series,
            color: line.color,
            size: line.size,
            quantity: line.quantity,
            price: line.price,
          })),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Pesanan gagal dikirim. Coba lagi ya.");
        return;
      }
      setResult({ orderNumber: data.orderNumber, total: data.total });
      setStep(6);

      // Meta Pixel: Purchase — hanya setelah server benar-benar menyimpan pesanan.
      // Nilai = semua item produk (termasuk add-on Cover & Hanger), TANPA ongkir.
      const contents = lines.map((line) => ({
        id: line.productId,
        quantity: line.quantity,
        item_price: line.price,
      }));
      const contentIds = Array.from(new Set(contents.map((item) => item.id)));
      const numItems = contents.reduce((sum, item) => sum + item.quantity, 0);
      const productTotal =
        Number(data.productTotal) || subtotal + (extraCover ? OPEN_ORDER_ADDON.price : 0);
      const purchase = trackPurchaseOnce({
        orderId: String(data.orderNumber),
        value: productTotal,
        contentIds,
        contents,
        numItems,
      });
      if (purchase.isNew) {
        sendCAPIEvent("Purchase", purchase.eventId, {
          value: productTotal,
          currency: "IDR",
          content_ids: contentIds,
          contents,
          content_type: "product",
          num_items: numItems,
          order_id: String(data.orderNumber),
        }, {
          phone: customer.whatsapp,
          externalId: String(data.orderNumber),
        });
      }
      // Pembayaran online (Mayar): link bayar dibuat server saat pesanan dibuat, jadi customer
      // langsung diarahkan ke halaman Mayar. Gagal → tetap di halaman sukses; link bayar juga bisa
      // dibuka dari detail pesanan.
      if (isOnlinePaymentMethod(paymentMethods.find((m) => m.id === paymentMethod) || null)) {
        const payUrl = data.paymentUrl || (await startOnlinePayment(String(data.orderNumber)));
        if (payUrl) window.location.href = payUrl;
      }
    } catch (err) {
      console.error("[OPEN-ORDER] submit error:", err);
      setError("Pesanan gagal dikirim. Coba lagi ya.");
    } finally {
      setSubmitting(false);
    }
  }

  const backTo = BACK_TO[step];
  // Langkah 4 menampilkan gerbang masuk/daftar dulu selama belum ada akun yang masuk.
  const stepTitle = step === 4 && !account ? "Masuk / Daftar" : STEP_TITLES[step];

  /**
   * **Pemesanan terkunci** — jendela Open Order belum dibuka (hari ini masih sebelum tanggal
   * mulai). Katalog tetap bisa dilihat (produk, harga, Create Your Price), tapi "Tambah ke
   * Pesanan" mati dan yang tampil instead-of-tombol adalah hitung mundur "Dibuka dalam …".
   */
  const locked = openState === "before";
  // Fase event untuk tampilan (mockup): belum dibuka / sedang berjalan / sudah berakhir.
  const phase: OpenOrderPhase = openState === "open" ? "live" : openState === "before" ? "upcoming" : "ended";

  // Toast lokal ala mockup (pengingat / kabari periode berikutnya / klik tombol terkunci).
  const [toast, setToast] = useState("");
  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  // Tanggal mulai & tutup (label "21 Oktober 2026 · 10.00 WIB" di bawah timer).
  const startLabel = formatDateLabel(startDateProp ?? settings.open_order_start_date);

  /**
   * Jendela yang sudah lewat TIDAK lagi memakai layar pesan terpisah — sesuai mockup,
   * katalognya tetap tampil dengan overlay kunci dan tombol yang mati ("OPEN ORDER
   * DITUTUP"). Pemesanan tetap terkunci, dan server juga menolak dengan 403.
   */

  return (
    <section
      className="min-h-screen bg-[#f6f5f2] text-[#111]"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      {/* Header + progres langkah */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f4f4f2]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          {backTo ? (
            <button
              type="button"
              onClick={() => setStep(backTo)}
              aria-label="Kembali"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 transition hover:bg-white"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
          ) : (
            <Link
              href="/"
              aria-label="Tutup"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/15 transition hover:bg-white"
            >
              <X size={16} strokeWidth={2} />
            </Link>
          )}

          <span className="text-xs font-semibold uppercase tracking-[.25em]">{stepTitle}</span>

          <span className="w-9 shrink-0 text-right text-xs text-neutral-500">
            {step}/6
          </span>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-2.5">
          <div className="h-[2px] overflow-hidden rounded bg-black/10">
            <div
              className="h-full rounded bg-black transition-all duration-1000"
              style={{ width: `${(step / 6) * 100}%` }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20">
        {step === 1 && (
          <StepCatalog
            products={products}
            period={period}
            phase={phase}
            countdownTarget={phase === "ended" ? null : phase === "upcoming" ? startDeadline : endDeadline}
            startInfo={formatOpenOrderMoment(startDateProp ?? settings.open_order_start_date, settings.open_order_start_time)}
            startInfoShort={formatOpenOrderMoment(startDateProp ?? settings.open_order_start_date, settings.open_order_start_time, true)}
            endInfo={formatOpenOrderMoment(endDateProp ?? settings.open_order_end_date, settings.open_order_end_time, true)}
            onRemind={() => showToast(phase === "ended" ? "Siap! Kami kabari periode berikutnya" : "Siap! Kami ingatkan saat Open Order dibuka")}
            cartCount={lines.reduce((sum, line) => sum + line.quantity, 0)}
            onOpen={(product, color) => openDetail(product.id, color)}
            onViewCart={() => setStep(3)}
          />
        )}

        {(step === 2 || step === 3 || step === 4 || step === 5) && (
          <div className={step === 2 ? "mx-auto max-w-6xl" : "mx-auto max-w-2xl"}>
            {step === 2 && draft && (
              <StepProduct
                draft={draft}
                products={products}
                phase={phase}
                countdownTarget={phase === "ended" ? null : phase === "upcoming" ? startDeadline : endDeadline}
                endInfo={formatOpenOrderMoment(endDateProp ?? settings.open_order_end_date, settings.open_order_end_time, true)}
                onChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
                onAdd={addDraftToCart}
              />
            )}

            {step === 3 && (
              <StepCart
                lines={lines}
                products={products}
                subtotal={subtotal}
                extraCover={extraCover}
                onToggleExtra={setExtraCover}
                itemsWeight={itemsWeight}
                addonWeight={addonWeight}
                totalWeight={totalWeight}
                onQuantity={updateQuantity}
                onRemove={removeLine}
                onContinue={() => setStep(4)}
                onShopMore={() => setStep(1)}
              />
            )}

            {step === 4 &&
              (account ? (
                <StepCustomer
                  customer={customer}
                  onChange={setCustomerField}
                  onContinue={() => setStep(5)}
                  shipping={shipping}
                  loadingOngkir={loadingOngkir}
                  ongkirError={ongkirError}
                  savedAddresses={savedAddresses}
                  selectedAddressId={selectedAddressId}
                  onSelectAddress={applySavedAddress}
                  onUseNewAddress={startNewAddress}
                />
              ) : (
                <StepAuth onAuthenticated={applyAccount} />
              ))}

            {step === 5 && (
              <StepReview
                lines={lines}
                products={products}
                subtotal={subtotal}
                totalWeight={totalWeight}
                extraCover={extraCover}
                shipping={shipping}
                loadingOngkir={loadingOngkir}
                ongkirError={ongkirError}
                notes={customer.notes}
                onNotes={(value) => setCustomerField("notes", value)}
                paymentMethods={paymentMethods}
                selectedPayment={paymentMethod}
                onSelectPayment={setPaymentMethod}
                onSubmit={submitOrder}
                submitting={submitting}
                error={error}
              />
            )}
          </div>
        )}

        {step === 6 && result && (
          <div className="mx-auto max-w-2xl">
            <StepSuccess
              orderNumber={result.orderNumber}
              total={result.total}
              customerName={customer.name}
              paymentMethod={paymentMethods.find((method) => method.id === paymentMethod) ?? null}
              itemCount={lines.reduce((sum, line) => sum + line.quantity, 0)}
            />
          </div>
        )}
      </main>

      {/* Toast ala mockup (pengingat / kabari periode berikutnya / klik tombol terkunci). */}
      <div
        className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black px-5 py-3 text-sm text-white shadow-xl transition-all duration-500 ${
          toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-24 opacity-0"
        }`}
      >
        {toast}
      </div>
    </section>
  );
}
