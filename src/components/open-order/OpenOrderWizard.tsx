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
import { supabase } from "@/lib/supabase";
import StepAuth, { type AuthAccount } from "./StepAuth";
import StepCart from "./StepCart";
import StepCatalog from "./StepCatalog";
import StepCustomer from "./StepCustomer";
import StepProduct from "./StepProduct";
import StepReview from "./StepReview";
import StepSuccess from "./StepSuccess";
import Countdown from "./Countdown";
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
   * Pesanan" mati dan yang tampil instead-of-tombol adalah hitung mundur "Buka dalam …".
   */
  const locked = openState === "before";
  // Tanggal mulai untuk caption "Buka <tanggal>" — versi server dulu (client hook-nya
  // masih kosong saat SSR, jadi tanpa ini caption-nya nampilin "Segera dibuka").
  const startLabel = formatDateLabel(startDateProp ?? settings.open_order_start_date);

  /**
   * Jendela Open Order ditutup (tanggal sudah lewat): halaman publik hanya menampilkan
   * pesannya, bukan wizardnya.
   *
   * Kasus "belum dibuka" TIDAKhandled di sini — katalognya tetap bisa dilihat (customer bisa
   * lihat produk & harga), tapi pemesanan dikunci sampai tanggal mulai. Kuncinya dipakai di
   * `StepCatalog` (banner "Buka dalam") dan `StepProduct` (tombol "Tambah ke Pesanan" mati).
   */
  if (openState === "closed") {
    return (
      <section
        className="grid min-h-screen place-items-center px-5"
        style={{ background: "#F3F3F3", color: INK, fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        <div className="w-full max-w-md text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em]" style={{ color: "var(--gold)" }}>
            Create Your Price
          </p>
          <h1
            className="mt-3 text-[1.9rem] font-semibold leading-tight"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}
          >
            Open Order <span style={{ color: "var(--gold)" }}>Samaqu</span>
          </h1>

          <div
            className="mt-7 rounded-3xl px-6 py-8"
            style={{ background: "var(--cream-bright)", border: "1px solid rgba(0,0,0,.3)" }}
          >
            <span
              className="mx-auto grid h-12 w-12 place-items-center rounded-full"
              style={{ background: "rgba(0,0,0,.12)", color: "var(--gold)" }}
            >
              <Calendar size={20} />
            </span>
            <p className="mt-4 text-[15px] font-semibold" style={{ color: "var(--espresso)" }}>
              Periode Open Order Telah Berakhir
            </p>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: MUTED }}>
              Periode Open Order {periodCompact} telah berakhir. Nantikan informasi periode Open Order berikutnya melalui Instagram SAMAQU.
            </p>
          </div>

          <div className="mt-7 flex justify-center gap-2.5">
            <Link
              href={`/${locale}/katalog`}
              className="rounded-xl px-5 py-3 text-[13px] font-medium"
              style={{ background: "var(--espresso)", color: "var(--cream)" }}
            >
              Lihat Katalog
            </Link>
            <Link
              href={`/${locale}`}
              className="rounded-xl px-5 py-3 text-[13px] font-medium"
              style={{ border: `1px solid ${LINE}`, color: INK }}
            >
              Beranda
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen" style={{ background: "#F3F3F3", color: INK, fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
      {/* Header + progres langkah */}
      <header
        className="sticky top-0 z-30"
        style={{ borderBottom: "1px solid rgba(0,0,0,.28)", background: "rgba(248,245,241,.95)", backdropFilter: "blur(8px)" }}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 pt-3.5 pb-3 sm:px-8">
          {backTo ? (
            <button
              type="button"
              onClick={() => setStep(backTo)}
              aria-label="Kembali"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors duration-200 hover:bg-[rgba(0,0,0,.09)]"
              style={{ border: `1px solid ${LINE}` }}
            >
              <ChevronLeft size={16} />
            </button>
          ) : (
            <Link
              href="/"
              aria-label="Tutup"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors duration-200 hover:bg-[rgba(0,0,0,.09)]"
              style={{ border: `1px solid ${LINE}` }}
            >
              <X size={16} />
            </Link>
          )}

          <p className="flex-1 text-center text-[12px] font-medium uppercase tracking-[0.2em]">{stepTitle}</p>

          <span className="w-9 shrink-0 text-right text-[11.5px] font-medium" style={{ color: MUTED }}>
            {step}/6
          </span>
        </div>
        <div className="mx-auto max-w-5xl px-5 pb-3 sm:px-8">
          <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,.28)" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ background: INK, width: `${(step / 6) * 100}%` }}
            />
          </div>
          {/* Timer ringkas di header lengket — kelihatan di semua langkah (langkah 1 sudah
              punya banner besar, jadi di sini disembunyikan biar tidak dobel). */}
          {step !== 1 && (
            <div className="mt-2 flex justify-center">
              <Countdown
                deadline={locked ? startDeadline : endDeadline}
                variant="compact"
                label={locked ? "Buka dalam" : "Berakhir dalam"}
              />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        {step === 1 && (
          <StepCatalog
            products={products}
            period={period}
            deadline={locked ? startDeadline : endDeadline}
            countdownLabel={locked ? "Buka dalam" : "Berakhir dalam"}
            countdownCaption={locked ? (startLabel ? `Buka ${startLabel}` : "Segera dibuka") : undefined}
            countdownTone={locked ? "soon" : "live"}
            locked={locked}
            cartCount={lines.reduce((sum, line) => sum + line.quantity, 0)}
            onOpen={(product, color) => openDetail(product.id, color)}
            onViewCart={() => setStep(3)}
          />
        )}

        {(step === 2 || step === 3 || step === 4 || step === 5) && (
          <div className={step === 2 ? "mx-auto max-w-5xl" : "mx-auto max-w-2xl"}>
            {step === 2 && draft && (
              <StepProduct
                draft={draft}
                products={products}
                locked={locked}
                lockDeadline={startDeadline}
                lockCaption={
                  locked
                    ? `Tombol pesanan aktif otomatis saat Open Order dimulai${startLabel ? ` (${startLabel})` : ""}.`
                    : undefined
                }
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
    </section>
  );
}
