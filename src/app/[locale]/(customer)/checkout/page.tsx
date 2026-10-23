"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Truck, Loader2, RefreshCw } from "lucide-react";
import { getProductById } from "@/lib/katalog-data";
import { sumWeightGramsBySize, productWeightMapFromRows, variantWeightMapFromRows, variantWeightKey } from "@/lib/shipping-weight";
import { useCart } from "@/lib/cart-context";
import { supabase } from "@/lib/supabase";
import { getWhatsAppLink } from "@/lib/store-settings";
import { localPhone } from "@/lib/whatsapp";
import { trackInitiateCheckout, sendCAPIEvent, getMetaBrowserIds } from "@/lib/meta-pixel";
import { isPaketItem, isPaketSize, variantName } from "@/lib/item-label";
import { PaymentIcon } from "@/lib/payment-icons";
import { fetchActivePaymentMethods, isOnlinePaymentMethod, normalizeMethodType, paymentMethodLabel, type PaymentMethodRow } from "@/lib/payment-methods";
import { startOnlinePayment } from "@/lib/mayar-client";
import { cloudinaryUrl } from "@/lib/cloudinary";
import WilayahSelect from "@/components/wilayah/WilayahSelect";

interface ShipOpt { courier: string; service: string; description: string; cost: number; etd: string; }

interface SavedAddress {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  is_default: boolean;
  province?: string;
  kecamatan?: string;
  district_id?: number | null;
}

function generateOrderNumber(): string {
  const d = new Date();
  return `SMQ-${d.toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

// ── Shipping: resolve destination_id from address ──
async function resolveDestinationId(addr: SavedAddress, signal?: AbortSignal): Promise<number | null> {
  // 1. If already cached in address record, use it directly
  if (addr.district_id) {
    return addr.district_id;
  }

  if (!addr.kecamatan) {
    return null;
  }

  // 2. Check Supabase destination cache (shared across all users)
  const cacheKey = `${addr.kecamatan}|${addr.city || ""}`.toUpperCase();
  try {
    const { data: cached } = await supabase
      .from("destination_cache")
      .select("district_id")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached?.district_id) {
      console.log("[CHECKOUT] ✅ Destination cache hit:", cacheKey, "→", cached.district_id);
      return cached.district_id;
    }
  } catch { /* table might not exist yet, fall through to API */ }

  // 3. Search RajaOngkir by kecamatan name + city + province
  const params = new URLSearchParams({ search: addr.kecamatan, limit: "10" });
  if (addr.city) params.set("city", addr.city);
  if (addr.province) params.set("province", addr.province);

  const res = await fetch(`/api/shipping/search-destination?${params}`, { signal: signal ?? AbortSignal.timeout(10000) });
  const json = await res.json();

  if (json.match?.id) {
    console.log("[CHECKOUT] ✅ Destination resolved via API:", json.match.id);
    // Cache to Supabase for future lookups (fire-and-forget)
    supabase.from("destination_cache").upsert({
      cache_key: cacheKey,
      district_id: json.match.id,
      kecamatan: addr.kecamatan,
      city: addr.city || null,
      province: addr.province || null,
    }, { onConflict: "cache_key" }).then(() => {});
    return json.match.id;
  }

  return null;
}

// ── Shipping: fetch cost from RajaOngkir ──
async function fetchShippingCost(originId: number, destinationId: number, weight: number, couriers: string[], signal?: AbortSignal): Promise<ShipOpt[]> {
  const courierStr = couriers.length > 0 ? couriers.join(":") : "jne:sicepat:jnt:ninja:tiki:wahana:pos:lion:anteraja";
  console.log("[CHECKOUT] 💰 === RAJAONGKIR REQUEST ===");
  console.log("[CHECKOUT] 💰 origin:", originId, "(toko)");
  console.log("[CHECKOUT] 💰 destination:", destinationId, "(customer)");
  console.log("[CHECKOUT] 💰 weight:", weight, "grams");
  console.log("[CHECKOUT] 💰 couriers:", courierStr);
  console.log("[CHECKOUT] 💰 URL: POST /api/shipping/cost → POST https://rajaongkir.komerce.id/api/v1/calculate/domestic-cost");

  const res = await fetch("/api/shipping/cost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin: originId, destination: destinationId, weight, courier: courierStr }),
    signal: signal ?? AbortSignal.timeout(15000),
  });

  console.log("[CHECKOUT] 💰 shipping/cost status:", res.status);
  const json = await res.json();
  console.log("[CHECKOUT] 💰 Raw response keys:", Object.keys(json));
  console.log("[CHECKOUT] 💰 Raw data type:", typeof json.data, Array.isArray(json.data) ? `array[${json.data.length}]` : "");
  if (json.data?.[0]) console.log("[CHECKOUT] 💰 First item keys:", Object.keys(json.data[0]));
  if (json.data?.[0]) console.log("[CHECKOUT] 💰 First item sample:", JSON.stringify(json.data[0]).slice(0, 500));

  if (json.error) {
    console.error("[CHECKOUT] ❌ shipping/cost error:", json.error);
    throw new Error(json.error);
  }

  const opts: ShipOpt[] = [];
  if (json.data && Array.isArray(json.data)) {
    for (const item of json.data) {
      // Format A: nested — item.costs[].cost[].{value, etd}
      if (item.costs && Array.isArray(item.costs)) {
        for (const svc of item.costs) {
          const costEntry = svc.cost?.[0];
          if (costEntry) {
            opts.push({
              courier: item.name || item.code || "",
              service: svc.service || "",
              description: svc.description || "",
              cost: costEntry.value || 0,
              etd: costEntry.etd || "",
            });
          }
        }
      }
      // Format B: flat — item.{service, cost, etd} directly on each data item
      else if (typeof item.cost === "number" || typeof item.value === "number") {
        opts.push({
          courier: item.name || item.code || item.courier || "",
          service: item.service || "",
          description: item.description || "",
          cost: item.cost || item.value || 0,
          etd: item.etd || item.estimated_delivery || "",
        });
      }
    }
  }
  opts.sort((a, b) => a.cost - b.cost);
  console.log("[CHECKOUT] 💰 Parsed shipping options:", opts.length);
  opts.forEach((o) => console.log(`[CHECKOUT] 💰   ${o.courier} ${o.service}: Rp${o.cost.toLocaleString("id-ID")} (${o.etd})`));
  return opts;
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("id") || "";
  const colorParam = searchParams.get("color") || "";
  const sizeParam = searchParams.get("size") || "M";
  const qtyParam = parseInt(searchParams.get("qty") || "1", 10);
  const product = productId ? getProductById(productId) : null;
  const { items, clearCart, voucher, applyVoucher, removeVoucher } = useCart();
  const isCartMode = !productId && items.length > 0;

  console.log("[CHECKOUT] 🚀 Page loaded:", { productId, isCartMode, itemsCount: items.length, colorParam, sizeParam, qtyParam });

  const [qty, setQty] = useState(qtyParam || 1);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState("");
  const promoApplied = voucher.discount > 0;
  const discount = voucher.discount;
  const voucherCode = voucher.code;
  const voucherId = voucher.id;
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [alamat, setAlamat] = useState("");
  const [kota, setKota] = useState("");
  const [kodepos, setKodepos] = useState("");
  const [catatanKurir, setCatatanKurir] = useState("");
  const [selectedShipping, setSelectedShipping] = useState<ShipOpt | null>(null);
  const [payment, setPayment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);

  // ── Shipping state ──
  const [berat, setBerat] = useState(800);
  // Berat unit tiap produk (gram) dari DATABASE, di-key id produk (slug). Sumber kebenaran
  // berat kirim = `products.weight`, bukan katalog statis.
  const [productWeights, setProductWeights] = useState<Record<string, number>>({});
  /** Berat per varian (produk+warna+ukuran) dari `product_variants.weight` — kosong = pakai berat produk. */
  const [variantWeights, setVariantWeights] = useState<Record<string, number>>({});
  const [shipOptions, setShipOptions] = useState<ShipOpt[]>([]);
  const [loadingCost, setLoadingCost] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [kecamatanName, setKecamatanName] = useState("");
  // Wilayah dipilih dari dataset area J&T (sumber yang sama dengan Open Order & dashboard ops),
  // jadi nama kota/kecamatan yang tersimpan langsung bisa dipakai J&T untuk menghitung tarif.
  const [provinsiName, setProvinsiName] = useState("");
  const [wilayahProvinsi, setWilayahProvinsi] = useState<string[]>([]);
  const [wilayahKota, setWilayahKota] = useState<string[]>([]);
  const [wilayahKecamatan, setWilayahKecamatan] = useState<string[]>([]);
  const [wilayahManual, setWilayahManual] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/shipping/wilayah")
      .then((res) => res.json())
      .then((json) => {
        if (active && Array.isArray(json?.data)) setWilayahProvinsi(json.data.map((o: { name: string }) => o.name));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (wilayahManual || !provinsiName) {
      setWilayahKota([]);
      return undefined;
    }
    let active = true;
    fetch(`/api/shipping/wilayah?province=${encodeURIComponent(provinsiName)}`)
      .then((res) => res.json())
      .then((json) => {
        if (active && Array.isArray(json?.data)) setWilayahKota(json.data.map((o: { name: string }) => o.name));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [provinsiName, wilayahManual]);

  useEffect(() => {
    if (wilayahManual || !kota) {
      setWilayahKecamatan([]);
      return undefined;
    }
    let active = true;
    fetch(`/api/shipping/wilayah?city=${encodeURIComponent(kota)}`)
      .then((res) => res.json())
      .then((json) => {
        if (active && Array.isArray(json?.data)) setWilayahKecamatan(json.data.map((o: { name: string }) => o.name));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [kota, wilayahManual]);
  const [originId, setOriginId] = useState<number | null>(null);
  const [enabledCouriers, setEnabledCouriers] = useState<string[]>([]);
  const [shippingProvider, setShippingProvider] = useState<"rajaongkir" | "jnt">("rajaongkir");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const lastResolvedRef = useRef<string>("");

  // Load store settings (origin + couriers) on mount
  useEffect(() => {
    (async () => {
      console.log("[CHECKOUT] ⚙️ Loading store settings...");
      try {
        const { data: settings, error } = await supabase
          .from("store_settings")
          .select("origin_district_id, origin_province_id, origin_city_id, enabled_couriers, shipping_provider")
          .eq("id", 1)
          .single();

        if (error) console.error("[CHECKOUT] ❌ Store settings error:", error);

        console.log("[CHECKOUT] ⚙️ === STORE SETTINGS ===");
        console.log("[CHECKOUT] ⚙️ origin_province_id:", settings?.origin_province_id);
        console.log("[CHECKOUT] ⚙️ origin_city_id:", settings?.origin_city_id);
        console.log("[CHECKOUT] ⚙️ origin_district_id:", settings?.origin_district_id);
        console.log("[CHECKOUT] ⚙️ enabled_couriers:", settings?.enabled_couriers);

        if (settings?.origin_district_id) {
          setOriginId(settings.origin_district_id);
          console.log("[CHECKOUT] ⚙️ Origin ID:", settings.origin_district_id);
        } else {
          console.warn("[CHECKOUT] ⚠️ No origin_district_id in store_settings!");
        }

        if (settings?.enabled_couriers) {
          try {
            const parsed = typeof settings.enabled_couriers === "string"
              ? JSON.parse(settings.enabled_couriers)
              : settings.enabled_couriers;
            setEnabledCouriers(parsed);
            console.log("[CHECKOUT] ⚙️ Enabled couriers:", parsed);
          } catch (e) {
            console.error("[CHECKOUT] ❌ Failed to parse enabled_couriers:", e);
          }
        }

        if (settings?.shipping_provider) {
          setShippingProvider(settings.shipping_provider);
          console.log("[CHECKOUT] ⚙️ Shipping provider:", settings.shipping_provider);
        }
      } catch (e) {
        console.error("[CHECKOUT] ❌ Gagal load store settings:", e);
      } finally {
        setSettingsLoaded(true);
        console.log("[CHECKOUT] ⚙️ Settings loaded flag set to true");
      }
    })();
  }, []);

  // Fetch payment methods — bank / QRIS / e-wallet / COD semua diatur dari admin
  useEffect(() => {
    async function fetchPayment() {
      const rows = await fetchActivePaymentMethods();
      console.log("[CHECKOUT] 💳 Payment methods:", rows.length);
      setPaymentMethods(rows);
    }
    fetchPayment();
  }, []);

  // Fetch saved addresses + prefill
  useEffect(() => {
    async function fetchAddresses() {
      console.log("[CHECKOUT] 📇 Fetching saved addresses...");
      let user = null;
      try {
        const { data } = await supabase.auth.getUser();
        user = data.user;
      } catch (authErr) {
        console.log("[CHECKOUT] 📇 Auth check error:", authErr);
      }
      if (!user) {
        // Checkout wajib akun: arahkan ke halaman Masuk, lalu kembali ke checkout.
        const localePath = typeof window !== "undefined" ? window.location.pathname.split("/")[1] || "id" : "id";
        router.replace(`/${localePath}/akun/login?redirect=${encodeURIComponent("/checkout")}`);
        return;
      }
      if (user.email) setEmail(user.email);
      console.log("[CHECKOUT] 📇 User ID:", user.id);
      const { data, error } = await supabase
        .from("saved_addresses")
        .select("*")
        .eq("customer_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) console.error("[CHECKOUT] ❌ Addresses fetch error:", error);
      console.log("[CHECKOUT] 📇 Addresses found:", data?.length || 0);

      if (data && data.length > 0) {
        data.forEach((a, i) => console.log(`[CHECKOUT] 📇   [${i}] ${a.label}: ${a.kecamatan || "?"}, ${a.city}, ${a.postal_code} (district_id: ${a.district_id || "null"})`));
        setSavedAddresses(data);
        const defaultAddr = data.find((a) => a.is_default) || data[0];
        console.log("[CHECKOUT] 📇 Default address:", defaultAddr.label, defaultAddr.id);
        setSelectedAddressId(defaultAddr.id);
        setNama(defaultAddr.recipient_name);
        setWhatsapp(localPhone(defaultAddr.phone));
        setAlamat(defaultAddr.address);
        setKota(defaultAddr.city);
        setKodepos(defaultAddr.postal_code);
      }
    }
    fetchAddresses();
  }, []);

  // Ambil berat asli (gram) dari DATABASE: berat produk + berat per VARIAN (produk+warna+ukuran).
  // Berat varian yang kosong otomatis jatuh ke berat produk — perilaku lama tidak berubah.
  useEffect(() => {
    const ids = Array.from(new Set([
      ...(isCartMode ? items.map((i) => i.id) : []),
      ...(productId ? [productId] : []),
    ].filter(Boolean)));
    if (ids.length === 0) return;
    let active = true;
    Promise.all([
      supabase.from("products").select("id, weight").in("id", ids),
      supabase.from("product_variants").select("product_id, color, size, weight").in("product_id", ids),
    ]).then(([prodRes, varRes]) => {
      if (!active) return;
      setProductWeights(productWeightMapFromRows(prodRes.data));
      setVariantWeights(variantWeightMapFromRows(varRes.data));
    });
    return () => { active = false; };
  }, [isCartMode, items, productId]);

  // Berat kirim = Σ (berat VARIAN ukuran → berat produk → 800 g) × qty, satuan gram.
  // Fallback 800 g/unit HANYA untuk item yang beratnya memang belum ada di database.
  useEffect(() => {
    if (isCartMode) {
      const lines = items.map((i) => ({ productId: i.id, color: i.color, size: i.size, quantity: i.qty }));
      const { grams, missingQty } = sumWeightGramsBySize(lines, productWeights, variantWeights);
      const w = Math.max(300, grams + missingQty * 800);
      setBerat(w);
      console.log("[CHECKOUT] ⚖️ Weight (cart mode):", w, "g", { grams, missingQty });
    } else if (productId) {
      const lines = [{ productId, color: colorParam, size: sizeParam, quantity: qty }];
      const { grams, missingQty } = sumWeightGramsBySize(lines, productWeights, variantWeights);
      const w = Math.max(300, grams + missingQty * 800);
      setBerat(w);
      console.log("[CHECKOUT] ⚖️ Weight (product mode):", w, "g");
    }
  }, [isCartMode, items, qty, productId, colorParam, sizeParam, productWeights, variantWeights]);

  // Meta Pixel: InitiateCheckout (fire once on mount)
  useEffect(() => {
    if (isCartMode && items.length > 0) {
      const contentIds = items.map(i => i.id);
      const numItems = items.reduce((sum, item) => sum + item.qty, 0);
      const total = items.reduce((sum, item) => {
        const unitPrice = (item.create_your_price_enabled && item.customer_price) ? item.customer_price : item.price;
        return sum + unitPrice * item.qty;
      }, 0);
      const { eventId } = trackInitiateCheckout(total, numItems, contentIds);
      sendCAPIEvent("InitiateCheckout", eventId, { value: total, currency: "IDR", content_ids: contentIds, num_items: numItems });
    } else if (!isCartMode && product) {
      const { eventId } = trackInitiateCheckout(product.price * qty, qty, [product.id]);
      sendCAPIEvent("InitiateCheckout", eventId, { value: product.price * qty, currency: "IDR", content_ids: [product.id], num_items: qty });
    }
  }, []); // Empty deps = fire once on mount

  // ── Auto-trigger shipping calculation ──
  const calculateShipping = useCallback(async (addr: SavedAddress, signal?: AbortSignal) => {
    const callId = Math.random().toString(36).slice(2, 8);
    console.log(`[CHECKOUT] 🚛 [${callId}] Shipping calc start for: ${addr.label} (${addr.id})`);

    if (!originId) {
      console.error("[CHECKOUT] ❌ Origin toko belum diatur!");
      setShippingError("Origin toko belum diatur. Hubungi admin.");
      return;
    }
    if (!addr.kecamatan) {
      console.error("[CHECKOUT] ❌ Kecamatan tidak tersedia di alamat!");
      setShippingError("Kecamatan tidak tersedia di alamat ini.");
      return;
    }

    const addrKey = `${addr.id}-${addr.district_id || addr.kecamatan}`;
    // Guard: if same address already fully resolved (with results), skip
    if (addrKey === lastResolvedRef.current && shipOptions.length > 0 && !shippingError) {
      return;
    }
    // Guard: if same address is currently being processed (concurrent call), skip
    if (addr.id === lastResolvedRef.current) {
      return;
    }
    // Mark this address as "processing" BEFORE any async work
    lastResolvedRef.current = addr.id;

    console.log("[CHECKOUT] 🚛 Setting loading state...");
    setLoadingCost(true);
    setShipOptions([]);
    setSelectedShipping(null);
    setShippingError(null);

    try {
      let opts: ShipOpt[] = [];

      if (shippingProvider === "jnt") {
        // J&T API: use city/district names directly
        if (!addr.kecamatan) {
          setShippingError("Kecamatan tidak tersedia di alamat ini.");
          setLoadingCost(false);
          return;
        }
        const jntRes = await fetch("/api/shipping/jnt-cost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: addr.city || "DEPOK", district: addr.kecamatan, weight: berat }),
          signal: signal ?? AbortSignal.timeout(15000),
        });
        const jntJson = await jntRes.json();
        if (jntJson.error) throw new Error(jntJson.error);
        opts = jntJson.data || [];
      } else {
        // RajaOngkir sudah tidak dipakai lagi: tarif selalu dari API J&T. Kalau provider toko
        // bukan "jnt", tampilkan pesan yang jelas daripada menghitung ongkir dari sistem lama.
        console.error("[CHECKOUT] ❌ shipping_provider bukan 'jnt' — jalur RajaOngkir sudah dilepas.");
        setShippingError("Metode pengiriman belum disiapkan. Hubungi admin untuk mengaktifkan J&T.");
        setLoadingCost(false);
        return;
      }

      if (opts.length === 0) {
        console.warn("[CHECKOUT] ⚠️ No shipping options returned!");
        setShippingError("Tidak ada opsi pengiriman ditemukan untuk tujuan ini.");
      } else {
        setShipOptions(opts);
        lastResolvedRef.current = addrKey;
        console.log(`[CHECKOUT] ✅ [${callId}] Shipping options set:`, opts.length, "options");
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        console.log(`[CHECKOUT] ⏭️ [${callId}] Shipping calc aborted (effect re-fired or unmounted)`);
        return;
      }
      console.error("[CHECKOUT] ❌ Shipping calculation error:", e);
      setShippingError("Gagal menghitung ongkir. Periksa koneksi Anda dan coba lagi.");
      lastResolvedRef.current = ""; // Clear processing state on error so user can retry
    } finally {
      setLoadingCost(false);
    }
  }, [originId, berat, enabledCouriers, shippingProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-calculate when default address is selected and settings are loaded
  const shippingCalcTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!settingsLoaded || !originId) return;

    // Create a fresh AbortController for this effect lifecycle
    const controller = new AbortController();

    if (selectedAddressId && savedAddresses.length > 0) {
      const addr = savedAddresses.find((a) => a.id === selectedAddressId);
      if (addr) {
        // Debounce: clear previous timer, wait 400ms before triggering
        if (shippingCalcTimerRef.current) clearTimeout(shippingCalcTimerRef.current);
        shippingCalcTimerRef.current = setTimeout(() => {
          calculateShipping(addr, controller.signal);
        }, 400);
      }
    }
    return () => {
      controller.abort();
      if (shippingCalcTimerRef.current) clearTimeout(shippingCalcTimerRef.current);
    };
  }, [settingsLoaded, originId, selectedAddressId, savedAddresses.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-trigger shipping for manual address (non-logged-in) ──
  useEffect(() => {
    // Only trigger for manual address (no saved address selected)
    if (selectedAddressId && savedAddresses.length > 0) return;
    if (!originId || !settingsLoaded) return;
    if (!kecamatanName.trim() || !kota.trim()) return;
    if (loadingCost) return;

    // Debounce: wait 1.5s after user stops typing
    console.log("[CHECKOUT] ⏱️ Debounce: kecamatan/kota changed, waiting 1.5s...");
    const timer = setTimeout(() => {
      console.log("[CHECKOUT] 🔄 Auto-triggering shipping for manual address:", { kecamatan: kecamatanName, city: kota });
      const tempAddr: SavedAddress = {
        id: "manual",
        label: "Manual",
        recipient_name: nama,
        phone: whatsapp,
        address: alamat,
        city: kota,
        postal_code: kodepos,
        is_default: false,
        kecamatan: kecamatanName,
        district_id: null,
      };
      calculateShipping(tempAddr);
    }, 1500);

    return () => clearTimeout(timer);
  }, [kecamatanName, kota]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectAddress(addr: SavedAddress) {
    console.log("[CHECKOUT] 👆 User selected address:", { id: addr.id, label: addr.label, kecamatan: addr.kecamatan, city: addr.city, district_id: addr.district_id });
    setSelectedAddressId(addr.id);
    setNama(addr.recipient_name);
    setWhatsapp(localPhone(addr.phone));
    setAlamat(addr.address);
    setKota(addr.city);
    setProvinsiName(addr.province || "");
    setKodepos(addr.postal_code);
    setShipOptions([]);
    setSelectedShipping(null);
    setShippingError(null);
    // Don't clear lastResolvedRef here — let the guard in calculateShipping handle it
    // The debounce + addr.id guard prevent double-hit for same address
  }

  /** Setiap perubahan wilayah membatalkan hasil ongkir sebelumnya (perilaku lama dipertahankan). */
  function resetOngkirPick() {
    lastResolvedRef.current = "";
    setShipOptions([]);
    setSelectedShipping(null);
    setErrors((p) => ({ ...p, kecamatan: "", kota: "" }));
  }

  function validatePhone(p: string): boolean {
    return /^(\+62|62|0)8[1-9][0-9]{6,10}$/.test(p.replace(/[\s-]/g, ""));
  }

  async function handleSubmit() {
    console.log("[CHECKOUT] 📦 === ORDER SUBMIT START ===");
    const selectedAddr = savedAddresses.find((a) => a.id === selectedAddressId);
    const e: Record<string, string> = {};
    if (!nama.trim()) e.nama = "Nama lengkap wajib diisi";
    if (!whatsapp.trim()) e.whatsapp = "No. WhatsApp wajib diisi";
    else if (!validatePhone(whatsapp)) e.whatsapp = "Nomor WhatsApp tidak valid";
    if (!alamat.trim()) e.alamat = "Alamat lengkap wajib diisi";
    if (!kota.trim()) e.kota = "Kota/Kabupaten wajib diisi";
    // Alamat manual (tanpa alamat tersimpan): kecamatan wajib. Tanpa kecamatan, alamat di
    // pesanan jadi tidak lengkap dan resi J&T ("Atur Pesanan") kehilangan kode area.
    if (!selectedAddr && !kecamatanName.trim()) e.kecamatan = "Kecamatan wajib diisi";
    if (kodepos && !/^\d{5}$/.test(kodepos)) e.kodepos = "Kode pos harus 5 digit";
    if (!selectedShipping) e.shipping = "Pilih metode pengiriman";
    if (!payment || !paymentMethods.some((m) => m.id === payment)) e.payment = "Pilih metode pembayaran";
    if (!isCartMode && !product) e.submit = "Keranjang Anda kosong. Pilih produk terlebih dahulu.";

    if (Object.keys(e).length > 0) {
      console.log("[CHECKOUT] ❌ Validation errors:", e);
      setErrors(e);
      const firstKey = Object.keys(e)[0];
      const el = document.querySelector(`[data-field="${firstKey}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    console.log("[CHECKOUT] 📦 Validation passed");
    console.log("[CHECKOUT] 📦 Shipping:", selectedShipping);
    console.log("[CHECKOUT] 📦 Origin ID:", originId);
    console.log("[CHECKOUT] 📦 Weight:", berat);

    setErrors({});
    setSubmitting(true);

    try {
      const payload = {
        customer: { name: nama, email, whatsapp },
        shipping: {
          address: alamat,
          city: kota,
          // Alamat tersimpan → kecamatan dari address book; alamat manual → kecamatan yang
          // diketik customer. Dulu kecamatan manual terbuang, jadi pesanan masuk tanpa kecamatan.
          district: selectedAddr ? selectedAddr.kecamatan || "" : kecamatanName.trim(),
          // Provinsi ikut dikirim kalau customer memakai alamat tersimpan (data dari address book),
          // supaya pesanan menyimpan provinsi sebagai kolom terpisah — bukan cuma di teks kota.
          province: selectedAddr?.province || provinsiName || "",
          postalCode: kodepos,
          notes: catatanKurir,
          method: `${selectedShipping!.courier} - ${selectedShipping!.service}`,
          cost: selectedShipping!.cost,
          originDistrictId: originId,
          destinationDistrictId: selectedAddr?.district_id,
          weight: berat,
        },
        paymentMethod: payment,
        discount,
        voucherCode: promoApplied ? voucherCode : null,
        voucherId: promoApplied ? voucherId : null,
        // Meta CAPI: identifier browser (fbp/fbc) + URL halaman, dipakai server saat Purchase.
        meta: {
          ...getMetaBrowserIds(),
          eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
        },
        items: isCartMode
          ? items.map((item) => ({
              productId: item.id,
              name: item.name,
              image: item.image,
              color: item.color,
              size: item.size,
              series: item.series || null,
              kain: item.kain || null,
              quantity: item.qty,
              price: item.create_your_price_enabled && item.customer_price ? item.customer_price : item.price,
              customer_price: item.customer_price || null,
              minimum_price: item.minimum_price || null,
              create_your_price_enabled: item.create_your_price_enabled || false,
            }))
          : [{
              productId: product!.id,
              name: product!.name,
              image: product!.image,
              color: selectedColor,
              size: selectedSize,
              series: product!.series || null,
              kain: product!.jenis_kain?.name || product!.kain || null,
              quantity: qty,
              price: product!.price,
              customer_price: null,
              minimum_price: null,
              create_your_price_enabled: false,
            }],
      };

      console.log("[CHECKOUT] 📦 Payload built. Items:", payload.items.length, "Shipping:", payload.shipping.method, "Payment:", payload.paymentMethod);
      console.log("[CHECKOUT] 📦 Sending to /api/orders...");

      const { data: { session: orderSession } } = await supabase.auth.getSession();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${orderSession?.access_token || ""}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      console.log("[CHECKOUT] 📦 /api/orders status:", res.status);
      const data = await res.json();
      console.log("[CHECKOUT] 📦 /api/orders response:", JSON.stringify(data).slice(0, 300));

      if (!res.ok) {
        console.error("[CHECKOUT] ❌ API returned error:", res.status, data.error);
        throw new Error(data.error || "Gagal membuat pesanan");
      }

      console.log("[CHECKOUT] ✅ ORDER SUCCESS:", data.orderNumber);
      setOrderPlaced(true);
      clearCart();
      const orderNum = data.orderNumber || generateOrderNumber();
      // Pembayaran online (Mayar): link bayar dibuat server saat pesanan dibuat, jadi customer
      // (termasuk tamu yang belum masuk) langsung diarahkan ke halaman Mayar. Kalau server tidak
      // mengirim link, coba minta sekali lagi; kalau tetap gagal lanjut ke halaman sukses biasa.
      if (isOnlinePaymentMethod(paymentMethods.find((m) => m.id === payment) || null)) {
        const payUrl = data.paymentUrl || (await startOnlinePayment(orderNum));
        if (payUrl) {
          window.location.href = payUrl;
          return;
        }
      }
      // Token tautan pesanan: dipakai halaman sukses supaya pesanan tetap bisa dibuka walau
      // customer belum login (lihat src/lib/order-token.ts).
      const lookupQuery = data.orderToken ? `&t=${encodeURIComponent(data.orderToken)}` : "";
      console.log("[CHECKOUT] ✅ Redirecting to:", `/checkout/success?order=${orderNum}${lookupQuery}`);
      router.push(`/checkout/success?order=${orderNum}${lookupQuery}`);
    } catch (err) {
      console.error("[CHECKOUT] ❌ Order submit error:", err);
      if (err instanceof Error && err.name === "TimeoutError") {
        console.error("[CHECKOUT] ❌ Request timed out after 30s");
      }
      // Tampilkan pesan error dari server (misal "Stok tidak mencukupi") supaya jelas
      const msg = err instanceof Error && err.message ? err.message : "Terjadi kesalahan. Silakan coba lagi.";
      setErrors({ submit: msg });
    } finally {
      setSubmitting(false);
      console.log("[CHECKOUT] 📦 === ORDER SUBMIT END ===");
    }
  }

  if (orderPlaced) {
    return null;
  }

  const selectedColor = colorParam || product?.colors?.[0] || "-";
  const selectedSize = sizeParam;
  const shippingCost = selectedShipping?.cost || 0;
  const cartSubtotal = isCartMode ? items.reduce((sum, item) => {
    const unitPrice = (item.create_your_price_enabled && item.customer_price) ? item.customer_price : item.price;
    return sum + unitPrice * item.qty;
  }, 0) : (product?.price || 0) * qty;
  const subtotal = cartSubtotal;
  const total = subtotal - discount + shippingCost;

  async function applyPromo() {
    setPromoError("");
    const result = await applyVoucher(promoCode, whatsapp);
    if (result.ok) {
      setPromoCode("");
    } else {
      setPromoError(result.error || "Kode promo tidak valid");
    }
  }

  const selectStyle: React.CSSProperties = { background: "white", border: "1px solid rgba(0,0,0,.25)", color: "var(--espresso)", outline: "none" };

  return (
    <section className="min-h-screen" style={{ background: "var(--cream)" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid rgba(0,0,0,.08)" }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 sm:h-20 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <span className="text-2xl sm:text-3xl tracking-[0.2em] font-medium" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>SAMAQU</span>
          </a>
          <div className="flex items-center gap-2 text-[13px] sm:text-sm font-ui" style={{ color: "var(--text-secondary)" }}>
            <Lock size={15} strokeWidth={1.6} />
            <span>Pembayaran Aman</span>
          </div>
        </div>
      </header>

      {/* Breadcrumb + Title */}
      <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-8 sm:pt-10 pb-2">
        <nav className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-ui" style={{ color: "var(--text-muted)" }}>
          <span style={{ color: orderPlaced ? "var(--text-muted)" : "var(--text-muted)" }}>Keranjang</span>
          <span style={{ color: "rgba(0,0,0,.3)" }}>/</span>
          <span className="font-medium" style={{ color: orderPlaced ? "var(--text-muted)" : "var(--gold)" }}>Checkout</span>
          <span style={{ color: "rgba(0,0,0,.3)" }}>/</span>
          <span className="font-medium" style={{ color: orderPlaced ? "var(--gold)" : "var(--text-muted)" }}>Selesai</span>
        </nav>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl italic mt-3 sm:mt-4" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>
          {orderPlaced ? "Pesanan Terkirim" : "Detail Pemesanan"}
        </h1>
        <p className="mt-2 max-w-xl text-[13px] sm:text-sm font-ui leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {orderPlaced ? "Pesanan Anda sedang menunggu verifikasi admin." : "Lengkapi data di bawah untuk menyelesaikan pesanan Anda. Tim kami siap membantu konsultasi ukuran bila diperlukan."}
        </p>
      </div>

      {/* Main: 2-column */}
      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 lg:gap-12 items-start">
        {/* Left: Form */}
        <form id="checkout-form" className="space-y-8 sm:space-y-10" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          {/* Section 1: Contact */}
          <section>
            <div className="flex items-center gap-3 mb-4 sm:mb-5">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: "var(--espresso)", color: "var(--cream)" }}>1</span>
              <h2 className="text-xl sm:text-2xl italic" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Informasi Kontak</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="sm:col-span-2" data-field="nama">
                <label className="block text-[13px] sm:text-sm font-ui mb-1.5" style={{ color: errors.nama ? "#e74c3c" : "var(--text-secondary)" }}>Nama Lengkap <span style={{ color: "var(--gold)" }}>*</span></label>
                <input type="text" value={nama} onChange={(e) => { setNama(e.target.value); setErrors((p) => ({ ...p, nama: "" })); }} className="w-full rounded-lg px-4 py-3 text-sm font-ui" style={{ ...selectStyle, border: `1px solid ${errors.nama ? "#e74c3c" : "rgba(0,0,0,.25)"}` }} placeholder="Contoh: Ahmad Fauzi" />
                {errors.nama && <p className="text-[11px] font-ui mt-1" style={{ color: "#e74c3c" }}>{errors.nama}</p>}
              </div>
              <div>
                <label className="block text-[13px] sm:text-sm font-ui mb-1.5" style={{ color: "var(--text-secondary)" }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg px-4 py-3 text-sm font-ui" style={selectStyle} placeholder="nama@email.com" />
              </div>
              <div data-field="whatsapp">
                <label className="block text-[13px] sm:text-sm font-ui mb-1.5" style={{ color: errors.whatsapp ? "#e74c3c" : "var(--text-secondary)" }}>Nomor WhatsApp <span style={{ color: "var(--gold)" }}>*</span></label>
                <input type="tel" value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); setErrors((p) => ({ ...p, whatsapp: "" })); }} className="w-full rounded-lg px-4 py-3 text-sm font-ui" style={{ ...selectStyle, border: `1px solid ${errors.whatsapp ? "#e74c3c" : "rgba(0,0,0,.25)"}` }} placeholder="0812 3456 7890" />
                {errors.whatsapp && <p className="text-[11px] font-ui mt-1" style={{ color: "#e74c3c" }}>{errors.whatsapp}</p>}
              </div>
            </div>
          </section>

          {/* Section 2: Shipping Address */}
          <section>
            <div className="flex items-center gap-3 mb-4 sm:mb-5">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: "var(--espresso)", color: "var(--cream)" }}>2</span>
              <h2 className="text-xl sm:text-2xl italic" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Alamat Pengiriman</h2>
            </div>

            {savedAddresses.length > 0 && !showNewAddress && (
              <div className="mb-4 space-y-2">
                {savedAddresses.map((addr) => (
                  <label key={addr.id} className="flex items-start gap-3 rounded-xl p-3 cursor-pointer transition-all" style={{ border: `1.5px solid ${selectedAddressId === addr.id ? "var(--gold)" : "rgba(0,0,0,.15)"}`, background: selectedAddressId === addr.id ? "rgba(0,0,0,.04)" : "white" }}
                    onClick={() => handleSelectAddress(addr)}>
                    <span className="relative w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5" style={{ borderColor: selectedAddressId === addr.id ? "var(--gold)" : "var(--text-muted)" }}>
                      {selectedAddressId === addr.id && <span className="absolute inset-[3px] rounded-full" style={{ background: "var(--gold)" }} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: "var(--espresso)" }}>{addr.label}</span>
                        {addr.is_default && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(0,0,0,.15)", color: "var(--gold)" }}>Utama</span>}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{addr.recipient_name} · {addr.phone}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{addr.address}, {addr.kecamatan ? `${addr.kecamatan}, ` : ""}{addr.city}{addr.province ? `, ${addr.province}` : ""} {addr.postal_code}</p>
                    </div>
                  </label>
                ))}
                <button type="button" onClick={() => { setShowNewAddress(true); setSelectedAddressId(""); lastResolvedRef.current = ""; }} className="text-xs font-medium mt-1" style={{ color: "#8b6f42" }}>+ Gunakan Alamat Baru</button>
              </div>
            )}

            {(savedAddresses.length === 0 || showNewAddress) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {savedAddresses.length > 0 && (
                  <div className="sm:col-span-2">
                    <button type="button" onClick={() => { setShowNewAddress(false); const a = savedAddresses.find((x) => x.is_default) || savedAddresses[0]; if (a) handleSelectAddress(a); }} className="text-xs font-medium" style={{ color: "#8b6f42" }}>← Kembali ke alamat tersimpan</button>
                  </div>
                )}
                <div className="sm:col-span-2" data-field="alamat">
                  <label className="block text-[13px] sm:text-sm font-ui mb-1.5" style={{ color: errors.alamat ? "#e74c3c" : "var(--text-secondary)" }}>Alamat Lengkap <span style={{ color: "var(--gold)" }}>*</span></label>
                  <textarea rows={3} value={alamat} onChange={(e) => { setAlamat(e.target.value); setErrors((p) => ({ ...p, alamat: "" })); }} className="w-full rounded-lg px-4 py-3 text-sm font-ui resize-none" style={{ ...selectStyle, border: `1px solid ${errors.alamat ? "#e74c3c" : "rgba(0,0,0,.25)"}` }} placeholder="Jalan, nomor rumah, RT/RW, kelurahan" />
                  {errors.alamat && <p className="text-[11px] font-ui mt-1" style={{ color: "#e74c3c" }}>{errors.alamat}</p>}
                </div>
                <div className="sm:col-span-2" data-field="provinsi">
                  <WilayahSelect
                    label="Provinsi"
                    variant="store"
                    required={false}
                    value={provinsiName}
                    options={wilayahProvinsi}
                    disabled={wilayahManual}
                    placeholder="Pilih provinsi"
                    onChange={(next: string) => {
                      setProvinsiName(next);
                      setKota("");
                      setKecamatanName("");
                      resetOngkirPick();
                    }}
                  />
                </div>
                <div data-field="kota">
                  {wilayahManual ? (
                    <>
                      <label className="block text-[13px] sm:text-sm font-ui mb-1.5" style={{ color: errors.kota ? "#e74c3c" : "var(--text-secondary)" }}>Kota / Kabupaten <span style={{ color: "var(--gold)" }}>*</span></label>
                      <input type="text" value={kota} onChange={(e) => { setKota(e.target.value); setErrors((p) => ({ ...p, kota: "" })); lastResolvedRef.current = ""; }} className="w-full rounded-lg px-4 py-3 text-sm font-ui" style={{ ...selectStyle, border: `1px solid ${errors.kota ? "#e74c3c" : "rgba(0,0,0,.25)"}` }} placeholder="Contoh: Jakarta Barat" />
                      {errors.kota && <p className="text-[11px] font-ui mt-1" style={{ color: "#e74c3c" }}>{errors.kota}</p>}
                    </>
                  ) : (
                    <WilayahSelect
                      label="Kota / Kabupaten"
                      variant="store"
                      value={kota}
                      options={wilayahKota}
                      disabled={!provinsiName}
                      error={errors.kota}
                      placeholder={provinsiName ? "Pilih kota / kabupaten" : "Pilih provinsi dulu"}
                      onChange={(next: string) => {
                        setKota(next);
                        setKecamatanName("");
                        resetOngkirPick();
                      }}
                    />
                  )}
                </div>
                <div data-field="kecamatan">
                  {wilayahManual ? (
                    <>
                      <label className="block text-[13px] sm:text-sm font-ui mb-1.5" style={{ color: errors.kecamatan ? "#e74c3c" : "var(--text-secondary)" }}>Kecamatan <span style={{ color: "var(--gold)" }}>*</span></label>
                      <input type="text" value={kecamatanName} onChange={(e) => {
                        setKecamatanName(e.target.value);
                        setErrors((p) => ({ ...p, kecamatan: "" }));
                        lastResolvedRef.current = "";
                        setShipOptions([]);
                        setSelectedShipping(null);
                      }} className="w-full rounded-lg px-4 py-3 text-sm font-ui" style={{ ...selectStyle, border: `1px solid ${errors.kecamatan ? "#e74c3c" : "rgba(0,0,0,.25)"}` }} placeholder="Contoh: Cengkareng" />
                      {errors.kecamatan && <p className="text-[11px] font-ui mt-1" style={{ color: "#e74c3c" }}>{errors.kecamatan}</p>}
                    </>
                  ) : (
                    <WilayahSelect
                      label="Kecamatan"
                      variant="store"
                      value={kecamatanName}
                      options={wilayahKecamatan}
                      disabled={!kota}
                      error={errors.kecamatan}
                      placeholder={kota ? "Pilih kecamatan" : "Pilih kota / kabupaten dulu"}
                      hint="Ongkir J&T dihitung otomatis dari kecamatan ini."
                      onChange={(next: string) => {
                        setKecamatanName(next);
                        resetOngkirPick();
                      }}
                    />
                  )}
                </div>
                <div className="sm:col-span-2 -mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setWilayahManual((prev) => !prev);
                      resetOngkirPick();
                    }}
                    className="text-xs font-medium"
                    style={{ color: "#8b6f42" }}
                  >
                    {wilayahManual ? "← Kembali pilih dari daftar" : "Kecamatan tidak ada di daftar? Ketik manual"}
                  </button>
                </div>
                <div data-field="kodepos">
                  <label className="block text-[13px] sm:text-sm font-ui mb-1.5" style={{ color: errors.kodepos ? "#e74c3c" : "var(--text-secondary)" }}>Kode Pos</label>
                  <input type="text" value={kodepos} onChange={(e) => { setKodepos(e.target.value); setErrors((p) => ({ ...p, kodepos: "" })); }} className="w-full rounded-lg px-4 py-3 text-sm font-ui" style={{ ...selectStyle, border: `1px solid ${errors.kodepos ? "#e74c3c" : "rgba(0,0,0,.25)"}` }} placeholder="40123" />
                  {errors.kodepos && <p className="text-[11px] font-ui mt-1" style={{ color: "#e74c3c" }}>{errors.kodepos}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[13px] sm:text-sm font-ui mb-1.5" style={{ color: "var(--text-secondary)" }}>Catatan pesanan (opsional)</label>
                  <input type="text" value={catatanKurir} onChange={(e) => setCatatanKurir(e.target.value)} className="w-full rounded-lg px-4 py-3 text-sm font-ui" style={selectStyle} placeholder="Contoh: packing khusus, tambah nama, dll." />
                </div>
              </div>
            )}
          </section>

          {/* Section 3: Shipping Method — RajaOngkir */}
          <section>
            <div className="flex items-center gap-3 mb-4 sm:mb-5">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: "var(--espresso)", color: "var(--cream)" }}>3</span>
              <h2 className="text-xl sm:text-2xl italic" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Metode Pengiriman</h2>
            </div>

            {/* Origin not set warning */}
            {settingsLoaded && !originId && (
              <div className="rounded-lg p-3 text-sm font-ui mb-4" style={{ background: "rgba(231,76,60,.08)", color: "#e74c3c", border: "1px solid rgba(231,76,60,.15)" }}>
                Origin toko belum diatur. Hubungi admin untuk mengatur alamat toko di Pengaturan.
              </div>
            )}

            {/* Loading state */}
            {loadingCost && (
              <div className="flex items-center gap-2 py-4 text-sm font-ui" style={{ color: "var(--text-muted)" }}>
                <Loader2 size={16} className="animate-spin" style={{ color: "var(--gold)" }} />
                <span>Menghitung ongkos kirim…</span>
              </div>
            )}

            {/* Error state with retry */}
            {shippingError && !loadingCost && (
              <div className="rounded-lg p-4 text-sm font-ui" style={{ background: "rgba(231,76,60,.06)", border: "1px solid rgba(231,76,60,.15)" }}>
                <p style={{ color: "#e74c3c" }}>{shippingError}</p>
                {selectedAddressId && (
                  <button
                    type="button"
                    onClick={() => {
                      console.log("[CHECKOUT] 🔄 Retry clicked for address:", selectedAddressId);
                      const addr = savedAddresses.find((a) => a.id === selectedAddressId);
                      if (addr) {
                        lastResolvedRef.current = "";
                        calculateShipping(addr);
                      }
                    }}
                    className="mt-2 flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: "var(--gold)" }}
                  >
                    <RefreshCw size={12} /> Coba Lagi
                  </button>
                )}
              </div>
            )}

            {/* Shipping options */}
            {shipOptions.length > 0 && !loadingCost && (
              <div className="space-y-2">
                {shipOptions.map((opt, i) => {
                  const isActive = selectedShipping?.courier === opt.courier && selectedShipping?.service === opt.service;
                  return (
                    <label
                      key={`${opt.courier}-${opt.service}-${i}`}
                      className="relative rounded-xl p-4 flex items-start gap-3 cursor-pointer transition-all"
                      style={{ border: `1.5px solid ${isActive ? "var(--gold)" : "rgba(0,0,0,.25)"}`, background: isActive ? "white" : "transparent" }}
                    >
                      <input
                        type="radio"
                        name="ship"
                        className="sr-only"
                        checked={isActive}
                        onChange={() => {
                          console.log("[CHECKOUT] 📦 Selected shipping:", opt);
                          setSelectedShipping(opt);
                        }}
                      />
                      <span className="relative mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0" style={{ borderColor: isActive ? "var(--gold)" : "var(--text-muted)" }}>
                        {isActive && <span className="absolute inset-[3px] rounded-full" style={{ background: "var(--gold)" }} />}
                      </span>
                      <span className="flex-1">
                        <span className="flex items-center justify-between">
                          <span className="text-[13px] sm:text-sm font-ui font-medium" style={{ color: "var(--espresso)" }}>
                            {opt.courier.toUpperCase()} — {opt.service}
                          </span>
                          <span className="text-[13px] sm:text-sm font-ui font-semibold" style={{ color: "var(--gold)" }}>
                            Rp {opt.cost.toLocaleString("id-ID")}
                          </span>
                        </span>
                        <span className="block text-[11px] sm:text-xs font-ui mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {opt.description}{opt.etd ? ` · Estimasi ${opt.etd}${/hari/i.test(opt.etd) ? "" : " hari"}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Empty state when no address selected */}
            {shipOptions.length === 0 && !loadingCost && !shippingError && !selectedAddressId && (
              <p className="text-xs font-ui" style={{ color: "var(--text-muted)" }}>
                Pilih alamat pengiriman untuk menghitung ongkir otomatis.
              </p>
            )}

            {errors.shipping && <p className="text-[11px] font-ui mt-2" style={{ color: "#e74c3c" }}>{errors.shipping}</p>}
          </section>

          {/* Section 4: Payment Method */}
          <section data-field="payment">
            <div className="flex items-center gap-3 mb-4 sm:mb-5">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: "var(--espresso)", color: "var(--cream)" }}>4</span>
              <h2 className="text-xl sm:text-2xl italic" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Metode Pembayaran</h2>
            </div>
            <div className="space-y-3">
              {paymentMethods.length === 0 ? (
                <p className="text-xs font-ui" style={{ color: "var(--text-muted)" }}>
                  Metode pembayaran belum tersedia. Hubungi admin.
                </p>
              ) : paymentMethods.map((pm) => {
                const type = normalizeMethodType(pm.method_type);
                const active = payment === pm.id;
                const note = (type === "bank" || type === "ewallet") && pm.account_name ? `a.n. ${pm.account_name}` : null;
                return (
                  <label
                    key={pm.id}
                    className="pay-option relative rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-all"
                    style={{ border: `1.5px solid ${active ? "var(--gold)" : "rgba(0,0,0,.25)"}`, background: active ? "white" : "transparent" }}
                  >
                    <input type="radio" name="pay" value={pm.id} checked={active} onChange={() => setPayment(pm.id)} className="sr-only" />
                    <span className="relative w-4 h-4 rounded-full border-2 flex-shrink-0" style={{ borderColor: active ? "var(--gold)" : "var(--text-muted)" }}>
                      {active && <span className="absolute inset-[3px] rounded-full" style={{ background: "var(--gold)" }} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] sm:text-sm font-ui font-medium truncate" style={{ color: "var(--espresso)" }}>{paymentMethodLabel(pm)}</span>
                      {note && <span className="block text-[11px] font-ui mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{note}</span>}
                    </span>
                    <PaymentIcon type={pm.icon || pm.method_type || undefined} size={22} style={{ color: "var(--text-secondary)" }} />
                  </label>
                );
              })}
            </div>
          </section>
          {errors.payment && <p className="text-[11px] font-ui" style={{ color: "#e74c3c" }}>{errors.payment}</p>}

          {/* Submit error */}
          {errors.submit && (
            <div className="rounded-lg p-3 text-sm font-ui" style={{ background: "rgba(231,76,60,.1)", color: "#e74c3c", border: "1px solid rgba(231,76,60,.2)" }}>
              {errors.submit}
            </div>
          )}

        </form>

        {/* Right: Order Summary */}
        <aside className="lg:sticky lg:top-8">
          <div className="rounded-2xl p-5 sm:p-7" style={{ background: "var(--bg-secondary, #f0ebe5)", border: "1px solid rgba(0,0,0,.08)" }}>
            <h2 className="text-xl sm:text-2xl italic mb-4 sm:mb-5" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Ringkasan Pesanan</h2>

            {isCartMode ? (
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={`${item.id}-${item.color}-${item.size}-${item.series ?? ""}`} className="flex gap-3 sm:gap-4">
                    <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-lg flex-shrink-0 overflow-hidden" style={{ background: "#e5e5e5" }}>
                      <img src={cloudinaryUrl(item.image, { width: 160 })} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] sm:text-sm font-ui font-medium leading-snug" style={{ color: "var(--espresso)" }}>{item.name}</p>
                      <p className="text-[11px] sm:text-xs font-ui mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {[item.kain ? `Kain ${item.kain}` : null, item.series, (item.color !== "-" && item.color !== "default") ? (isPaketItem(item) ? item.color : `Warna: ${item.color}`) : null, isPaketItem(item) ? null : `Ukuran: ${item.size}`, `×${item.qty}`].filter(Boolean).join(' · ')}
                      </p>
                      <p className="text-[10px] sm:text-[11px] font-ui mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Berat: {(() => { const w = variantWeights[variantWeightKey(item.id, item.color, item.size)] ?? productWeights[item.id] ?? 800; return w >= 1000 ? `${(w/1000).toFixed(1)} kg` : `${w} g`; })()} / item
                      </p>
                      {item.create_your_price_enabled && item.customer_price && (
                        <p className="text-[10px] sm:text-[11px] font-ui mt-0.5" style={{ color: "var(--gold)" }}>Harga pilihanmu</p>
                      )}
                      <p className="text-[13px] sm:text-sm font-ui font-semibold mt-1" style={{ color: "var(--espresso)" }}>Rp {((item.create_your_price_enabled && item.customer_price ? item.customer_price : item.price) * item.qty).toLocaleString("id-ID")}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : !product ? (
              <p className="text-sm font-ui" style={{ color: "var(--text-muted)" }}>
                Keranjang Anda kosong. Pilih produk terlebih dahulu untuk melanjutkan.
              </p>
            ) : (
              <div className="flex gap-3 sm:gap-4">
                <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-lg flex-shrink-0 overflow-hidden" style={{ background: "#e5e5e5" }}>
                  <img src={cloudinaryUrl(product.image, { width: 160 })} alt={product.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] sm:text-sm font-ui font-medium leading-snug" style={{ color: "var(--espresso)" }}>{product!.name}</p>
                  <p className="text-[11px] sm:text-xs font-ui mt-0.5" style={{ color: "var(--text-muted)" }}>{isPaketSize(selectedSize) ? variantName(selectedColor) : `Warna: ${selectedColor} · Ukuran: ${selectedSize}`}</p>
                  <p className="text-[10px] sm:text-[11px] font-ui mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Berat: {(() => { const w = variantWeights[variantWeightKey(productId, colorParam, sizeParam)] ?? productWeights[productId] ?? 800; return w >= 1000 ? `${(w/1000).toFixed(1)} kg` : `${w} g`; })()} / item
                  </p>
                  <div className="flex items-center justify-between mt-2 sm:mt-2.5">
                    <div className="inline-flex items-center rounded-lg" style={{ border: "1px solid rgba(0,0,0,.25)" }}>
                      <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-7 h-7 flex items-center justify-center text-base font-ui" style={{ color: "var(--espresso)" }} aria-label="Kurangi">−</button>
                      <span className="w-8 text-center text-sm font-ui">{qty}</span>
                      <button type="button" onClick={() => setQty((q) => q + 1)} className="w-7 h-7 flex items-center justify-center text-sm font-ui" style={{ color: "var(--espresso)" }} aria-label="Tambah">+</button>
                    </div>
                    <span className="text-[13px] sm:text-sm font-ui font-semibold" style={{ color: "var(--espresso)" }}>Rp {subtotal.toLocaleString("id-ID")}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Promo */}
            {promoApplied ? (
              <div className="flex items-center justify-between mt-5 sm:mt-6 rounded-xl px-4 py-3" style={{ background: "rgba(75,122,78,.06)", border: "1px solid rgba(75,122,78,.15)" }}>
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#4b7a4e" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  <span className="text-sm font-ui font-medium" style={{ color: "var(--espresso)" }}>{voucherCode}</span>
                </div>
                <button type="button" onClick={() => { removeVoucher(); setPromoCode(""); }} className="text-xs font-ui font-medium" style={{ color: "#8b6f42" }}>Ganti</button>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mt-5 sm:mt-6">
                  <input type="text" value={promoCode} onChange={(e) => { setPromoCode(e.target.value); setPromoError(""); }} className="flex-1 rounded-lg px-3.5 py-2.5 text-sm font-ui" style={{ background: "white", border: "1px solid rgba(0,0,0,.25)", color: "var(--espresso)", outline: "none" }} placeholder="Kode promo" />
                  <button type="button" onClick={applyPromo} className="rounded-lg px-4 text-sm font-ui font-medium" style={{ background: "#e8e2da", color: "var(--espresso)" }}>Terapkan</button>
                </div>
                {promoError && <p className="text-[11px] mt-1.5 font-ui" style={{ color: "#e74c3c" }}>{promoError}</p>}
              </>
            )}

            {/* Totals */}
            <div className="mt-5 sm:mt-6 pt-4 sm:pt-5 space-y-2 sm:space-y-2.5 text-sm font-ui" style={{ borderTop: "1px solid rgba(0,0,0,.15)" }}>
              <div className="flex justify-between" style={{ color: "var(--text-secondary)" }}>
                <span>Subtotal</span><span>Rp {subtotal.toLocaleString("id-ID")}</span>
              </div>
              <div className="flex justify-between" style={{ color: "var(--text-secondary)" }}>
                <span>Pengiriman</span><span>{selectedShipping ? `Rp ${shippingCost.toLocaleString("id-ID")}` : "—"}</span>
              </div>
              <div className="flex justify-between" style={{ color: "var(--text-secondary)" }}>
                <span>Total berat</span>
                <span>{berat.toLocaleString("id-ID")} g ({(berat / 1000).toLocaleString("id-ID", { maximumFractionDigits: 3 })} kg)</span>
              </div>
              {promoApplied && (
                <div className="flex justify-between" style={{ color: "var(--gold)" }}>
                  <span>Diskon</span><span>− Rp {discount.toLocaleString("id-ID")}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-2 sm:pt-3 mt-1" style={{ borderTop: "1px solid rgba(0,0,0,.15)" }}>
                <span className="text-lg sm:text-xl italic" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Total</span>
                <span className="text-lg sm:text-xl font-ui font-semibold" style={{ color: "var(--espresso)" }}>Rp {total.toLocaleString("id-ID")}</span>
              </div>
            </div>

            {/* Submit (desktop) */}
            <button type="submit" form="checkout-form" disabled={submitting} className="hidden lg:block w-full mt-5 sm:mt-6 rounded-xl py-4 text-sm font-ui font-medium tracking-wide transition-all" style={{ background: "var(--espresso)", color: "var(--cream)" }}>
              {submitting ? "Memproses…" : "Buat Pesanan"}
            </button>

            <div className="flex items-center justify-center gap-2 mt-3 sm:mt-4 text-[11px] sm:text-xs font-ui" style={{ color: "var(--text-muted)" }}>
              <Lock size={13} strokeWidth={1.6} />
              <span>Transaksi Anda dienkripsi & aman</span>
            </div>
          </div>

          <p className="text-center text-[11px] sm:text-xs font-ui mt-4 sm:mt-5" style={{ color: "var(--text-muted)" }}>
            Butuh bantuan ukuran? <a href={getWhatsAppLink("Halo Admin SAMAQU, saya butuh bantuan ukuran.")} className="underline" style={{ color: "var(--gold)" }}>Konsultasi gratis</a> dengan tim kami.
          </p>
        </aside>
      </main>

      {/* Spacer (mobile/tablet): supaya konten paling bawah tidak tertutup bar "Buat Pesanan"
          yang sticky. Tingginya persis setinggi bar (--checkout-bar-h) → tanpa ruang kosong berlebih. */}
      <div className="lg:hidden" style={{ height: "var(--checkout-bar-h)" }} />

      {/* Sticky mobile submit bar */}
      <div className="lg:hidden fixed bottom-[var(--mobile-nav-h)] inset-x-0 z-40 px-4 pt-3" style={{ background: "linear-gradient(to top, var(--cream) 70%, transparent)", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        <button type="submit" form="checkout-form" disabled={submitting} className="w-full rounded-xl py-4 text-sm font-ui font-medium tracking-wide transition-all" style={{ background: "var(--espresso)", color: "var(--cream)" }}>
          {submitting ? "Memproses…" : "Buat Pesanan"}
        </button>
      </div>

      {/* Footer (desktop only) */}
      <footer className="hidden lg:block mt-8" style={{ borderTop: "1px solid rgba(0,0,0,.08)" }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6 sm:py-8 text-center text-[11px] sm:text-xs font-ui" style={{ color: "var(--text-muted)" }}>
          © 2024 SAMAQU · Busana yang Layak Menemani Setiap Momen
        </div>
      </footer>
    </section>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<section className="min-h-screen flex items-center justify-center" style={{ background: "var(--cream)" }}><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(0,0,0,.3)", borderTopColor: "var(--gold)" }} /></section>}>
      <CheckoutContent />
    </Suspense>
  );
}
