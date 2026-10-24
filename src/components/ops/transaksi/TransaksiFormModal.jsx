"use client";

/**
 * Form transaksi manual (Tambah / Ubah) — drawer dari sisi kanan.
 *
 * Bentuknya sengaja seperti panel samping: header & footer menempel (footer tidak ikut
 * ter-scroll), hanya isi tengahnya yang bisa di-scroll, dan latar digelapkan tipis.
 * Kalau sudah ada isian lalu drawer ditutup, muncul konfirmasi singkat supaya isian
 * tidak hilang karena salah klik.
 *
 * Pemilihan pelanggan memakai pemilih cepat yang sama polanya: ketik nama / nomor HP → daftar
 * tersaring → klik satu pelanggan (nomor dicocokkan setelah dinormalkan lewat `phoneKey`, jadi
 * "0878…", "62878…", dan "878…" sama). Pelanggan yang sudah terpilih diringkas jadi satu baris
 * dengan tombol "Ganti". Pelanggan tanpa akun tidak punya `customer_id`, jadi pilihan itu
 * dicocokkan lewat nama + nomor HP supaya barisnya tidak tampil kosong lagi.
 *
 * Pemilihan produk memakai pemilih cepat: cari produk → tombol Series (harga + sisa stok) →
 * tombol Ukuran (sisa stok per ukuran) → Qty. Grup produk (nama + jenis kain) diambil dari
 * data yang sama dengan Laporan Stok (`/api/ops/product-variants`), urutan series memakai
 * `seriesRank` dari `src/lib/ops-order.ts`, dan stok yang ditampilkan SELALU `stock_efektif`
 * (hasil `resolveStock`) — bukan kolom `stock` mentah, karena baris series pengikut
 * (Bayati/Imron ikut Jiharkah, Karim/Imalah ikut Nahawand) menyimpan stok 0 di database.
 *
 * Langkah Warna hanya muncul kalau produk itu memang punya lebih dari satu warna asli;
 * varian Thobe menyimpan warna `default` (warna sebenarnya ada di nama produk), jadi langkah
 * itu dilewati. Nilai `color` yang dikirim ke server tetap nilai asli di `product_variants`.
 *
 * Catatan: stok di sini hanya untuk tampilan/peringatan; server tetap memotong stok lewat RPC yang
 * sama dengan checkout. Harga juga dibaca ulang dari database — KECUALI kalau admin mengisi kolom
 * "Harga" di baris produk (harga manual): nilai itu ikut dikirim, divalidasi server
 * (`MANUAL_PRICE_MIN`–`MANUAL_PRICE_MAX` di `src/lib/transaksi.ts`), lalu disimpan sebagai
 * `order_items.price`. Harga itulah yang dipakai subtotal pesanan dan semua angka pembukuan.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Clock, Info, Loader2, Pencil, Plus, RotateCcw, Save, Trash2, Truck, Wand2, X } from "lucide-react";
import { base44 } from "@/lib/ops-api";
import { MANUAL_PRICE_MAX, MANUAL_PRICE_MIN, MANUAL_SOURCE_KEYS, SOURCE_LABEL, manualPrice } from "@/lib/transaksi";
import { PAKET_SIZE, isPaketKategori, variantName } from "@/lib/item-label";
import { OPS_STOCK_SIZES } from "@/lib/ops-stock";
import { categoryRank, seriesRank, variantSortKey } from "@/lib/ops-order";
import { formatWeightExact } from "@/lib/shipping-weight";
import { formatRupiah, isoToWibInput, itemSummaryLabel, itemSummaryParts, wibNow, wibToIso } from "@/components/ops/transaksi/transaksi-format";
import TransaksiResiPanel from "@/components/ops/transaksi/TransaksiResiPanel";
import WilayahSelect from "@/components/ops/transaksi/WilayahSelect";
import { useToast } from "@/components/ops/ui/use-toast";

const inputClass =
  "w-full px-3 py-2 bg-gray-50 dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 text-sm font-semibold text-slate-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed";
const labelClass = "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1";
const sectionClass = "text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500";
const cmpId = (a, b) => String(a).localeCompare(String(b), "id", { sensitivity: "base" });

/** Kondisi awal panel "Cek Ongkir" (tidak ada hasil). */
const EMPTY_ONGKIR = { status: "idle", services: [], error: "", weightGrams: 0, key: "", destination: "" };

/**
 * Sidik jari data yang dipakai saat cek ongkir (tujuan + daftar item).
 * Kalau isinya berubah setelah ongkir terisi, panel menandai "Ongkir mungkin berubah, cek ulang"
 * — nilai yang sudah diisi TIDAK diubah otomatis.
 */
const ongkirKey = (destination, items) =>
  `${destination.map((part) => String(part || "").trim()).join(", ")}||${items
    .map((item) => `${item.product_id}:${item.color}:${item.size}:${item.quantity}`)
    .join(",")}`;

const digits = (value) => String(value ?? "").replace(/\D/g, "");

/** Nomor HP tanpa peduli 08… / 628… / 8… — untuk mendeteksi pelanggan yang sudah terdaftar. */
const phoneKey = (value) => digits(value).replace(/^0+/, "").replace(/^62/, "");

const ADDRESS_FIELDS = ["address", "province", "city", "kecamatan", "postal_code"];

/** Satu baris item yang masih kosong (produk belum dipilih). */
const emptyRow = () => ({
  product: "",
  category: "",
  kain: "",
  warna: "",
  series: null,
  variant: "",
  /** Harga satuan ketikan admin (digit saja). Kosong = pakai harga katalog produk. */
  price: "",
  /** true = admin memang mengetik harga sendiri → `price` ikut dikirim ke server. */
  priceManual: false,
  quantity: 1,
  editing: true,
});

/** Batasi qty: minimal 1, tidak lebih dari stok efektif varian yang dipilih. */
const clampQty = (value, max) => {
  const top = Number(max) > 0 ? Number(max) : 99;
  return Math.max(1, Math.min(top, Number(value) || 1));
};

/**
 * Harga satuan yang dipakai satu baris: harga ketikan admin kalau ada, kalau tidak harga katalog.
 * Harga inilah yang dikirim ke server sebagai `order_items.price`, jadi subtotal pesanan — dan
 * semua angka pembukuan yang membacanya (omset, laba, Produk Terlaris) — ikut harga manual.
 */
const rowUnitPrice = (row, catalogPrice) => {
  const manual = row?.priceManual ? manualPrice(row.price) : null;
  return manual ?? (Number(catalogPrice) || 0);
};

/**
 * Mode Ubah: harga baris pesanan lama dianggap "harga manual" kalau berbeda dari harga katalog
 * produk itu sekarang. Dipakai supaya harga yang sudah tercatat tidak diam-diam kembali ke harga
 * katalog saat transaksi diubah. Kalau harga katalog sempat berubah setelah transaksi dibuat,
 * baris lama bisa terlihat sebagai harga manual — labelnya saja, nilainya tetap benar.
 */
const recordedManualPrice = (recordedPrice, catalogPrice) => {
  const recorded = Number(recordedPrice);
  if (!Number.isFinite(recorded) || recorded <= 0) return null;
  return recorded === Number(catalogPrice) ? null : recorded;
};

/**
 * Gabungkan data alamat jadi SATU blok teks untuk ditampilkan (read-only):
 * "Jalan… No. 51, Harapan Jaya, Bekasi Utara, Kota Bekasi, Jawa Barat, 17124".
 * Dipakai untuk alamat dari buku alamat pelanggan MAUPUN isi form saat ini (sumber apa pun).
 * Ini hanya untuk tampilan — nilai provinsi/kota/kecamatan/kode pos tetap tersimpan
 * sebagai data terpisah di transaksi (dipakai Database Kota, Detail Transaksi, & resi J&T).
 */
const addressText = (source) =>
  [source?.address, source?.kecamatan, source?.city, source?.province, source?.postal_code]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");

const sizeRank = (size) => {
  const index = OPS_STOCK_SIZES.indexOf(String(size || "").toUpperCase());
  return index === -1 ? OPS_STOCK_SIZES.length : index;
};

export default function TransaksiFormModal({ isOpen, onClose, initialData = null, onSaved, variant = "ops" }) {
  const isEdit = !!initialData;
  // Tema pink hanya untuk panel admin; dashboard ops tetap slate/black.
  const isPanelForm = variant === "panel";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState(null);
  const [items, setItems] = useState([emptyRow()]);
  const [saveError, setSaveError] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);
  /** Langkah drawer: 0 Pelanggan, 1 Produk, 2 Pembayaran. */
  const [step, setStep] = useState(0);
  /** Alamat diketik baru (bukan dari daftar tersimpan) → ikut masuk buku alamat pelanggan. */
  const [newAddressForCustomer, setNewAddressForCustomer] = useState(false);
  /**
   * Sedang mengetik alamat (klik "Ubah alamat"/"Tambah alamat baru") → kolom isian ditampilkan.
   * Patokan tampilan kartu teks adalah ISI FORM, bukan ada/tidaknya alamat di buku alamat,
   * supaya alamat yang terisi otomatis dari sumber lain (mis. pesanan terakhir) juga tampil
   * sebagai kartu, bukan sebagai kolom.
   */
  const [addressEditing, setAddressEditing] = useState(false);
  /** Salinan alamat sebelum isian dibuka → tombol "Batal" mengembalikannya apa adanya. */
  const [addressBackup, setAddressBackup] = useState(null);
  /** Hasil "Cek Ongkir" terakhir (daftar layanan J&T + berat & tujuan yang dipakai). */
  const [ongkir, setOngkir] = useState(EMPTY_ONGKIR);
  /** Layanan yang dipilih — kunci `service|cost`. Dua layanan bisa punya tarif sama,
   *  jadi ongkir saja tidak cukup untuk menandai baris mana yang aktif. */
  const [selectedService, setSelectedService] = useState("");
  /**
   * Setelah transaksi tersimpan, drawer TIDAK langsung ditutup: diganti panel "Transaksi tercatat"
   * yang isinya aksi resi (buat + cetak), supaya admin tidak perlu mencari barisnya di daftar.
   */
  const [savedOrder, setSavedOrder] = useState(null);
  const prefilledFor = useRef(null);
  /** Penanda pelanggan yang alamatnya sudah diisi otomatis (sekali per pelanggan). */
  const prefilledAddressFor = useRef(null);
  /**
   * Penanda "mulai transaksi baru": dinaikkan saat admin mau input transaksi berikutnya dari
   * panel "Transaksi tercatat". Efek reset memakai nilai ini sebagai dependensi, jadi form
   * dikosongkan lewat jalur yang SAMA dengan saat drawer dibuka (tidak ada dua aturan reset).
   */
  const [resetKey, setResetKey] = useState(0);
  /** Nomor pesanan sumber alamat yang sedang terisi otomatis (ditampilkan sebagai keterangan). */
  const [addressPrefilledFrom, setAddressPrefilledFrom] = useState("");
  /** Pemilih produk cepat: kata kunci + chip kategori (dipakai pada baris item yang terbuka). */
  const [search, setSearch] = useState("");
  const [catChip, setCatChip] = useState("all");
  const searchRef = useRef(null);
  /** Blok langkah baris yang sedang terbuka — tujuan auto-scroll setelah tiap pilihan. */
  const paketStepRef = useRef(null);
  const colorStepRef = useRef(null);
  const seriesStepRef = useRef(null);
  const sizeStepRef = useRef(null);
  const qtyStepRef = useRef(null);
  /** Pencarian pelanggan di langkah 1 — nama atau nomor HP (pemilih pelanggan cepat). */
  const [customerSearch, setCustomerSearch] = useState("");
  const customerSearchRef = useRef(null);
  /**
   * Mode Ubah: data pelanggan tampil sebagai kartu ringkasan dulu. Field pelanggan baru
   * dibuka setelah admin menekan "Ubah data pelanggan", supaya tidak terkesan disuruh
   * mengisi ulang pesanan yang sudah ada.
   */
  const [customerEditing, setCustomerEditing] = useState(false);
  /** Mode Ubah: kotak "Tempel alamat lengkap" dilipat dulu, bisa dibuka kalau perlu. */
  const [pasteExpanded, setPasteExpanded] = useState(false);
  /**
   * "Tempel alamat lengkap, isi otomatis" (mode Pelanggan baru): teks tempelan, status pesan,
   * dan daftar kolom yang terakhir diisi otomatis (dipakai tombol Reset supaya isian manual
   * yang lain tidak ikut terhapus).
   */
  const [pasteText, setPasteText] = useState("");
  const [pasteStatus, setPasteStatus] = useState({ state: "idle", message: "" });
  const [pasteFilled, setPasteFilled] = useState([]);
  /** Saran kode pos dari data wilayah (kecamatan yang punya beberapa kode pos) → chip pilihan. */
  const [pastePostal, setPastePostal] = useState([]);
  /** Sedang memproses tombol "Isi otomatis" (tombolnya dinonaktifkan selama ini). */
  const [pasting, setPasting] = useState(false);
  /** Area isi drawer (yang di-scroll) + penanda supaya validasi gagal menggeser ke isian error. */
  const bodyRef = useRef(null);
  const [scrollKick, setScrollKick] = useState(0);

  const { data: variants = [] } = useQuery({
    queryKey: ["transaksi", "variants"],
    queryFn: () => base44.entities.ProductVariant.list(),
    enabled: isOpen,
    staleTime: 30_000,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["transaksi", "customers"],
    queryFn: () => base44.entities.Customer.list(),
    enabled: isOpen,
    staleTime: 60_000,
  });

  // Alamat pelanggan: daftar alamat tersimpan + alamat pesanan terakhirnya (untuk auto-isi).
  const selectedCustomerId = form?.customer_mode === "existing" ? form?.customer_id || "" : "";
  const selectedCustomerName = form?.customer_mode === "existing" ? form?.customer_name || "" : "";
  const selectedCustomerPhone = form?.customer_mode === "existing" ? form?.customer_whatsapp || "" : "";
  const { data: addressData, isSuccess: addressesLoaded } = useQuery({
    queryKey: ["transaksi", "alamat", selectedCustomerId, selectedCustomerPhone, selectedCustomerName],
    queryFn: () =>
      base44.entities.Transaction.addresses({
        customer_id: selectedCustomerId,
        whatsapp: selectedCustomerPhone,
        name: selectedCustomerName,
      }),
    enabled: isOpen && Boolean(selectedCustomerId || selectedCustomerName),
    staleTime: 30_000,
  });
  const savedAddresses = addressData?.addresses || [];
  const lastCustomerAddress = addressData?.last || null;
  const { data: provinces = [] } = useQuery({
    queryKey: ["transaksi", "wilayah", "provinsi"],
    queryFn: () => base44.entities.Wilayah.provinces(),
    enabled: isOpen,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const { data: cities = [] } = useQuery({
    queryKey: ["transaksi", "wilayah", "kota", form?.province || ""],
    queryFn: () => base44.entities.Wilayah.cities(form.province),
    enabled: isOpen && Boolean(form?.province),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const { data: districts = [] } = useQuery({
    queryKey: ["transaksi", "wilayah", "kecamatan", form?.city || ""],
    queryFn: () => base44.entities.Wilayah.districts(form.city),
    enabled: isOpen && Boolean(form?.city),
    staleTime: 24 * 60 * 60 * 1000,
  });

  /**
   * Bantuan kode pos: setelah kota + kecamatan dipilih, ambil kode pos dari peta yang sama
   * dengan fitur "tempel alamat". Satu kode pos → isi otomatis; lebih dari satu → tampilkan
   * pilihan (tidak menebak).
   */
  const { data: postalLookup } = useQuery({
    queryKey: ["transaksi", "kodepos", form?.city || "", form?.kecamatan || ""],
    queryFn: () => base44.entities.Wilayah.postalCodes(form?.city || "", form?.kecamatan || ""),
    enabled: isOpen && Boolean(form?.city) && Boolean(form?.kecamatan),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const postalCodes = postalLookup?.postal_codes || [];
  const autoPostal = postalCodes.length === 1 ? postalCodes[0] : "";

  useEffect(() => {
    if (!isOpen || !autoPostal) return;
    // Jangan timpa kode pos yang sudah diketik admin; isi hanya kalau kolomnya masih kosong.
    setForm((current) => (current && !current.postal_code ? { ...current, postal_code: autoPostal } : current));
  }, [isOpen, autoPostal]);

  /** Pilihan kode pos: hasil lookup wilayah didahulukan, lalu saran dari teks yang ditempel. */
  const postalSuggestions = postalCodes.length > 0 ? postalCodes : pastePostal;

  /**
   * Satu baris data per (produk + warna). Urutan & "warna" memakai aturan bersama
   * `variantSortKey` — sama dengan Daftar Produk & Laporan Stok (varian Thobe menyimpan
   * warna `default`, jadi warnanya diambil dari nama produk).
   */
  const dataset = useMemo(
    () =>
      (variants || []).map((variant) => ({
        product_id: variant.product_id,
        product_name: variant.product_name,
        category: variant.category || "",
        kain: variant.jenis_kain_name || "",
        warna: variantSortKey(variant).warna,
        series: variant.series_name || "",
        color: String(variant.color || "").trim() || "default",
        price: Number(variant.price) || 0,
        // HPP produk — hanya untuk peringatan kalau harga manual di bawah HPP.
        hpp: Number(variant.hpp) || 0,
        sizes: variant.stock_efektif || variant.stock || {},
        // Berat per ukuran + berat produk (gram) — dari API varian yang sama dengan ongkir/resi.
        weights: variant.weights || {},
        product_weight: Number(variant.product_weight) || 0,
        linkedTo: variant.base_series_name || variant.base_product_name || null,
      })),
    [variants],
  );

  /* ── Nilai awal: transaksi baru (waktu sekarang) atau yang sedang diubah ── */
  useEffect(() => {
    if (!isOpen) {
      prefilledFor.current = null;
      prefilledAddressFor.current = null;
      setConfirmClose(false);
      return;
    }
    setSaveError("");
    setTouched(false);
    setSaveAttempted(false);
    // Panel "Transaksi tercatat" milik simpan sebelumnya harus hilang saat drawer dibuka lagi
    // atau saat admin mulai transaksi baru — dulu tidak direset sehingga form tampak "tidak
    // kereset" (masih memperlihatkan transaksi yang barusan disimpan).
    setSavedOrder(null);
    setNewAddressForCustomer(false);
    setAddressEditing(false);
    setAddressBackup(null);
    setOngkir(EMPTY_ONGKIR);
    setSelectedService("");
    setAddressPrefilledFrom("");
    setCustomerSearch("");
    setCustomerEditing(false);
    setPasteExpanded(false);
    // Drawer dibuka ulang → isian "tempel alamat" tidak boleh menempel dari sesi sebelumnya.
    setPasteText("");
    setPasteStatus({ state: "idle", message: "" });
    setPasteFilled([]);
    setPastePostal([]);
    setPasting(false);
    // Mode Ubah langsung membuka langkah Produk — bagian yang paling sering diubah.
    setStep(initialData ? 1 : 0);
    if (initialData) {
      const parts = isoToWibInput(initialData.created_at);
      const kecamatan = String(initialData.shipping_kecamatan || "").trim()
        || String(initialData.shipping_city || "").split(",")[0].trim();
      setForm({
        customer_mode: initialData.customer_id ? "existing" : "new",
        customer_id: initialData.customer_id || "",
        customer_name: initialData.customer_name || "",
        customer_whatsapp: initialData.customer_whatsapp || "",
        source: initialData.source || "whatsapp",
        date: parts.date,
        time: parts.time,
        shipping_cost: String(initialData.shipping_cost || ""),
        shipping_method: initialData.shipping_method || "",
        discount: String(initialData.discount || ""),
        payment_status: initialData.payment_status === "unpaid" ? "unpaid" : "paid",
        notes: initialData.notes || "",
        // Alamat transaksi ini sudah tersimpan di pesanan, jadi isiannya langsung terisi.
        address_mode: "new",
        saved_address_id: "",
        address: initialData.shipping_address || "",
        province: initialData.shipping_province || "",
        city: initialData.kota || "",
        kecamatan,
        postal_code: initialData.shipping_postal_code || "",
      });
    } else {
      const now = wibNow();
      setForm({
        customer_mode: "existing",
        customer_id: "",
        customer_name: "",
        customer_whatsapp: "",
        source: "whatsapp",
        date: now.date,
        time: now.time,
        shipping_cost: "",
        shipping_method: "",
        discount: "",
        payment_status: "paid",
        notes: "",
        address_mode: "saved",
        saved_address_id: "",
        address: "",
        province: "",
        city: "",
        kecamatan: "",
        postal_code: "",
      });
      setItems([emptyRow()]);
      prefilledFor.current = null;
    }
  }, [isOpen, initialData, resetKey]);

  /* ── Pelanggan terdaftar: alamat utama langsung terpilih ── */
  useEffect(() => {
    if (!isOpen || form?.customer_mode !== "existing" || form?.address_mode !== "saved") return;
    if (form?.saved_address_id || savedAddresses.length === 0) return;
    applySavedAddress(savedAddresses.find((address) => address.is_default) || savedAddresses[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form?.customer_mode, form?.address_mode, form?.saved_address_id, savedAddresses]);

  /**
   * Pelanggan dipilih tapi belum punya alamat tersimpan → isi otomatis dari alamat PESANAN
   * TERAKHIRNYA supaya admin tidak mengetik ulang. Sekali per pelanggan (kalau kolomnya
   * dikosongkan sendiri oleh admin, tidak diisi ulang).
   */
  useEffect(() => {
    if (!isOpen || !form || !lastCustomerAddress) return;
    if (form.customer_mode !== "existing") return;
    // Pelanggan yang sudah punya alamat tersimpan tetap memakai alamat tersimpannya.
    if (savedAddresses.length > 0) return;
    if (form.address) return;
    const key = selectedCustomerId || selectedCustomerName;
    if (!key || prefilledAddressFor.current === key) return;
    prefilledAddressFor.current = key;

    // Nama penerima ikut diisi dari pesanan terakhirnya (kolom `orders.customer_name` =
    // "Nama penerima" di resi), bukan nama akun pelanggan — sama seperti alamat tersimpan.
    const recipient = String(lastCustomerAddress.recipient_name || "").trim();

    setForm((current) =>
      current
        ? {
            ...current,
            address_mode: "new",
            saved_address_id: "",
            address: lastCustomerAddress.address || "",
            province: lastCustomerAddress.province || "",
            city: lastCustomerAddress.city || "",
            kecamatan: lastCustomerAddress.kecamatan || "",
            postal_code: lastCustomerAddress.postal_code || "",
            ...(recipient ? { customer_name: recipient } : null),
          }
        : current,
    );
    setAddressPrefilledFrom(lastCustomerAddress.order_number || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form?.customer_mode, form?.address, lastCustomerAddress, selectedCustomerId, selectedCustomerName, savedAddresses.length]);

  /* ── Pelanggan terdaftar tanpa alamat tersimpan: isian alamat langsung tampil & ikut disimpan ── */
  useEffect(() => {
    if (!isOpen || isEdit) return;
    if (form?.customer_mode !== "existing" || !form?.customer_id) return;
    if (!addressesLoaded || savedAddresses.length > 0) return;
    setNewAddressForCustomer(true);
  }, [isOpen, isEdit, form?.customer_mode, form?.customer_id, addressesLoaded, savedAddresses.length]);

  /* ── Baris item diubah → telusuri balik jadi langkah bertahapnya ── */
  useEffect(() => {
    if (!isOpen || dataset.length === 0) return;
    const marker = initialData?.order_number || "__new__";
    if (prefilledFor.current === marker) return;
    prefilledFor.current = marker;
    if (!initialData) return;

    const rows = (initialData.items || []).map((item) => {
      const groups = dataset.filter((entry) => entry.product_id === item.product_id);
      const group = groups.find((entry) => entry.color === (item.color || "default")) || groups[0];
      if (!group) {
        return { ...emptyRow(), variant: `${item.color || "default"}||${String(item.size).toUpperCase()}`, quantity: item.quantity };
      }
      const manual = recordedManualPrice(item.price, group.price);
      return {
        product: group.product_name,
        category: group.category,
        kain: group.kain,
        warna: group.warna,
        series: group.series || "",
        variant: `${group.color}||${String(item.size).toUpperCase()}`,
        // Harga yang sudah tercatat dipakai apa adanya; kalau beda dari harga katalog sekarang,
        // barisnya ditandai sebagai harga manual supaya tidak hilang saat transaksi diubah.
        price: manual === null ? "" : String(manual),
        priceManual: manual !== null,
        quantity: item.quantity,
        editing: false,
      };
    });
    setItems(rows.length > 0 ? rows : [emptyRow()]);
  }, [isOpen, initialData, dataset]);

  /* ── Opsi bertahap: tiap langkah hanya berisi opsi yang valid dari langkah sebelumnya ── */
  const categoryOptions = useMemo(
    () => [...new Set(dataset.map((row) => row.category))].sort((a, b) => categoryRank(a) - categoryRank(b)),
    [dataset],
  );

  const rowsFor = (category, kain, warna) =>
    dataset.filter((row) => row.category === category && row.kain === kain && row.warna === warna);

  /**
   * Grup produk = nama produk + jenis kain (berisi semua series & warnanya).
   * Grup inilah yang muncul di hasil pencarian, contoh "Thobe Superblack · Kain B-01".
   */
  const productGroups = useMemo(() => {
    const map = new Map();
    for (const entry of dataset) {
      const key = `${entry.category}|${entry.kain}|${entry.product_name}`;
      let group = map.get(key);
      if (!group) {
        group = { key, product_id: entry.product_id, name: entry.product_name, category: entry.category, kain: entry.kain, warnas: [], series: [], stockTotal: 0 };
        map.set(key, group);
      }
      if (!group.warnas.includes(entry.warna)) group.warnas.push(entry.warna);
      if (entry.series && !group.series.includes(entry.series)) group.series.push(entry.series);
      // Stok grup dihitung HANYA dari baris pemilik stok (tanpa `linkedTo`). Baris pengikut
      // memakai stok induknya, jadi kalau ikut dijumlah hasilnya dobel.
      if (!entry.linkedTo) {
        group.stockTotal += Object.values(entry.sizes || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
      }
    }
    return [...map.values()];
  }, [dataset]);

  /** Grup yang sedang dipilih pada satu baris item (dibaca dari isian barisnya sendiri). */
  const groupOf = (row) =>
    row.product
      ? productGroups.find((group) => group.name === row.product && group.kain === row.kain && group.category === row.category) || null
      : null;

  /** Hasil pencarian: difilter kata kunci + chip kategori, diurutkan seperti Daftar Produk. */
  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return productGroups
      .filter((group) => catChip === "all" || group.category === catChip)
      .filter((group) => {
        if (!query) return true;
        return `${group.name} ${group.kain} ${group.category} ${group.warnas.join(" ")}`.toLowerCase().includes(query);
      })
      .sort(
        (a, b) =>
          categoryRank(a.category) - categoryRank(b.category) || cmpId(a.kain, b.kain) || cmpId(a.name, b.name),
      );
  }, [productGroups, search, catChip]);

  /**
   * Tombol series untuk satu baris item: satu tombol per series, urut seperti Laporan Stok
   * (`seriesRank`), harga = harga produk pada baris series itu (sama dengan yang dipakai server
   * saat menyimpan), stok = jumlah `stock_efektif` seluruh ukuran di series tersebut.
   */
  const seriesChoices = (row) => {
    if (!row.product || !row.kain || !row.warna) return [];
    const rows = rowsFor(row.category, row.kain, row.warna).filter((entry) => entry.product_name === row.product);
    const bySeries = new Map();
    for (const entry of rows) {
      const key = entry.series || "";
      const current = bySeries.get(key) || { series: entry.series || "", price: entry.price, stock: 0 };
      current.stock += Object.values(entry.sizes || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
      bySeries.set(key, current);
    }
    return [...bySeries.values()].sort((a, b) => seriesRank(a.series) - seriesRank(b.series));
  };

  /** Series hanya jadi langkah kalau produk di kombinasi itu memang punya series. */
  const seriesStep = (category, kain, warna) => {
    if (!category || !kain || !warna) return { show: false, options: [] };
    const rows = rowsFor(category, kain, warna);
    const options = [...new Set(rows.map((row) => row.series))].sort((a, b) => seriesRank(a) - seriesRank(b));
    return { show: options.some(Boolean), options };
  };

  /** Produk yang cocok dengan seluruh langkah yang sudah dipilih. */
  const resolveProduct = (row) => {
    if (!row.category || !row.warna) return null;
    // Cover & Hanger tidak punya jenis kain & series — cukup kategori + nama paket.
    // (Sebelumnya `kain` wajib terisi, jadi produk paket SELALU gagal di-resolve dan
    // paketnya tidak pernah bisa dipilih di form transaksi.)
    if (isPaketEntry(row)) {
      const paket = rowsFor(row.category, row.kain, row.warna).filter(
        (entry) => !row.product || entry.product_name === row.product,
      );
      return paket[0] || null;
    }
    // Koko/Vest tidak punya jenis kain. Jangan wajibkan `kain` di sini —
    // rowsFor() sudah mencocokkan kain kosong dengan data yang memang kosong.
    const step = seriesStep(row.category, row.kain, row.warna);
    if (step.show && row.series === null) return null;
    const series = step.show ? row.series : "";
    const rows = rowsFor(row.category, row.kain, row.warna).filter((entry) => (entry.series || "") === series);
    return rows.length === 1 ? rows[0] : rows[0] || null;
  };

  /* ── Cover & Hanger: kategori non-pakaian → alurnya Cari produk → PAKET → Qty.
     Paket = satu baris dataset per varian; nama paketnya tersimpan di `color` (data lama bisa
     menaruhnya di `series`/nama produk — dibaca lewat `variantName()`), dan ukuran (`ALL SIZE`
     atau kosong) DIIABAIKAN sepenuhnya: tidak pernah jadi syarat. ── */
  const isPaketEntry = (entry) => isPaketKategori(entry?.category);
  /** Nama paket: field warna → series (data lama) → nama produk. Data lama tidak diubah. */
  const paketNameOf = (entry) => variantName(entry?.color) || variantName(entry?.series) || String(entry?.product_name || "");
  /** Ukuran yang dipakai saat menyimpan paket: ukuran yang benar-benar ada di data (kalau kosong, penanda ALL SIZE). */
  const paketSize = (entry) => Object.keys(entry?.sizes || {})[0] || PAKET_SIZE;
  /**
   * Berat SATU unit (gram) — aturannya sama dengan `resolveLineWeight` di server:
   * berat varian (per ukuran) → berat produk → belum ada. Tidak ada angka tebakan di sini.
   */
  const unitWeightOf = (product, paket, chosen) => {
    if (!product) return { grams: 0, source: "missing" };
    const size = String(paket ? paketSize(product) : chosen?.size || "").toUpperCase();
    const variantWeight = Number(product.weights?.[size]);
    if (Number.isFinite(variantWeight) && variantWeight > 0) return { grams: variantWeight, source: "variant" };
    const productWeight = Number(product.product_weight);
    if (Number.isFinite(productWeight) && productWeight > 0) return { grams: productWeight, source: "product" };
    return { grams: 0, source: "missing" };
  };
  /** Chip paket satu grup (satu baris dataset per paket) — dicocokkan lewat ID produk. */
  const paketOptions = (group) =>
    isPaketKategori(group?.category)
      ? dataset.filter((entry) =>
          group.product_id
            ? entry.product_id === group.product_id
            : entry.category === group.category && entry.kain === group.kain && entry.product_name === group.name,
        )
      : [];
  /** Satu "pilihan" untuk baris paket supaya harga, stok, subtotal, dan simpan lewat jalur yang sama. */
  const paketChoice = (entry) =>
    entry
      ? {
          value: `${entry.color}||${paketSize(entry)}`,
          size: paketSize(entry),
          color: entry.color,
          // Dibawa supaya `paketNameOf()` bisa membaca nama paket data lama (color kosong →
          // series/nama produk) waktu menyusun label ringkasan.
          series: entry.series,
          product_name: entry.product_name,
          showColor: false,
          stock: Object.values(entry.sizes || {}).reduce((sum, n) => sum + (Number(n) || 0), 0),
          price: entry.price,
          linkedTo: entry.linkedTo,
        }
      : null;

  /**
   * Pilihan ukuran + stok tersedia; turunan memakai stok induknya (bawaan /api/ops).
   * Cover & Hanger tidak punya ukuran → satu "pilihan" saja (paketnya), supaya harga/stok/
   * subtotal baris tetap lewat jalur yang sama tanpa menuntut ukuran.
   */
  const sizeOptions = (product) => {
    if (!product) return [];
    if (isPaketEntry(product)) return [paketChoice(product)];
    const groups = dataset.filter((entry) => entry.product_id === product.product_id);
    const multiColor = new Set(groups.map((entry) => entry.color)).size > 1;
    return groups
      .flatMap((entry) =>
        Object.keys(entry.sizes || {}).map((size) => ({
          value: `${entry.color}||${size}`,
          size,
          color: entry.color,
          showColor: multiColor,
          stock: Number(entry.sizes?.[size]) || 0,
          price: entry.price,
          linkedTo: entry.linkedTo,
        })),
      )
      .sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || cmpId(a.color, b.color));
  };

  /** Baris lengkap: pakaian butuh ukuran, Cover & Hanger cukup paket (warna) + Qty. */
  const rowComplete = (row) => {
    const product = resolveProduct(row);
    if (!product) return false;
    if (isPaketEntry(product)) return Number(row.quantity) >= 1;
    return Boolean(row.variant) && Number(row.quantity) >= 1;
  };

  /** Total permintaan per varian; baris kembar ikut dihitung supaya peringatan jujur. */
  const requested = useMemo(() => {
    const map = {};
    for (const row of items) {
      const product = resolveProduct(row);
      if (!product) continue;
      const options = sizeOptions(product);
      const option = isPaketEntry(product) ? options[0] : options.find((entry) => entry.value === row.variant);
      if (!option) continue;
      const key = `${product.product_id}||${option.value}`;
      const entry = map[key] || { option, total: 0 };
      entry.total += Number(row.quantity) || 0;
      map[key] = entry;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dataset]);

  const rowInfo = items.map((row) => {
    const product = resolveProduct(row);
    const paket = isPaketEntry(product);
    const groupIsPaket = paketOptions(groupOf(row)).length > 0;
    const options = sizeOptions(product);
    const chosen = paket ? options[0] || null : options.find((entry) => entry.value === row.variant) || null;
    const quantity = Number(row.quantity) || 0;
    let issue = null;
    if (!product) {
      issue = groupIsPaket ? "Pilih paket dulu di atas" : "Pilih produk dulu (cari produk → series → ukuran)";
    } else if (!paket && !row.variant) issue = "Ukuran belum dipilih";
    else if (quantity < 1) issue = "Jumlah minimal 1";
    else if (row.priceManual && manualPrice(row.price) === null) {
      issue = `Harga manual harus bilangan bulat Rp ${formatRupiah(MANUAL_PRICE_MIN)} - Rp ${formatRupiah(MANUAL_PRICE_MAX)}`;
    } else {
      const entry = requested[`${product.product_id}||${chosen?.value}`];
      if (entry && entry.total > entry.option.stock) {
        issue = paket
          ? `Stok paket "${entry.option.color}" tinggal ${entry.option.stock}, diminta ${entry.total}`
          : `Stok ${entry.option.size} tinggal ${entry.option.stock}, diminta ${entry.total}`;
      }
    }
    const unitPrice = rowUnitPrice(row, chosen?.price);
    return {
      product,
      paket,
      options,
      chosen,
      quantity,
      issue,
      unitPrice,
      subtotal: unitPrice * quantity,
      unitWeight: unitWeightOf(product, paket, chosen),
    };
  });

  const stockIssues = rowInfo.filter((info) => info.issue && info.product && info.chosen).map((info) => info.issue);
  const incomplete = rowInfo.some((info) => info.issue);

  const subtotal = rowInfo.reduce((sum, info) => sum + info.subtotal, 0);
  /**
   * Ringkasan berat untuk step Pembayaran. Hanya baris yang sudah lengkap (produk + ukuran/
   * paket) yang dihitung; baris tanpa berat dicatat terpisah supaya tidak ditutupi angka
   * default — sama seperti aturan berat di server (varian → produk).
   */
  const weightSummary = rowInfo.reduce(
    (acc, info) => {
      if (!info.product || !info.chosen) return acc;
      const qty = Number(info.quantity) || 0;
      if (qty < 1) return acc;
      if (info.unitWeight.grams > 0) acc.grams += info.unitWeight.grams * qty;
      else acc.missingQty += qty;
      return acc;
    },
    { grams: 0, missingQty: 0 },
  );
  const discountValue = Number(digits(form?.discount)) || 0;
  const shippingValue = Number(digits(form?.shipping_cost)) || 0;
  const total = Math.max(0, subtotal - Math.min(discountValue, subtotal)) + shippingValue;

  /**
   * Item yang dikirim ke server saat Simpan (bentuknya sama persis). Dipakai juga untuk Cek
   * Ongkir — cuma item yang sudah lengkap (punya produk + paket/ukuran).
   * SATU aturan: baris paket (Cover & Hanger) memakai nama paket + ukuran penanda dari data;
   * baris pakaian memakai pilihan warna/ukuran seperti biasa.
   */
  const rowPayload = (row) => {
    const product = resolveProduct(row);
    const paket = isPaketEntry(product);
    const [variantColor, variantSize] = String(row.variant).split("||");
    return {
      product_id: product?.product_id || "",
      color: paket ? product.color : variantColor || "default",
      size: paket ? paketSize(product) : variantSize,
      quantity: Number(row.quantity) || 0,
    };
  };

  const payloadItems = () => items.map(rowPayload).filter((item) => item.product_id && item.size);

  /**
   * Mode Ubah: ringkasan perubahan untuk footer sebelum menyimpan. Hanya tampilan —
   * angkanya memakai perhitungan total yang sama dengan yang dikirim ke server.
   */
  const originalItemCount = initialData?.items?.length || 0;
  const currentItemCount = payloadItems().length;
  const itemCountDelta = currentItemCount - originalItemCount;
  const originalTotal = Number(initialData?.total) || 0;
  const changeParts = [];
  if (dataset.length > 0 && itemCountDelta !== 0) {
    changeParts.push(`Produk ${itemCountDelta > 0 ? "+" : ""}${itemCountDelta}`);
  }
  if (dataset.length > 0 && Math.round(total) !== Math.round(originalTotal)) {
    changeParts.push(`Total Rp ${formatRupiah(originalTotal)} jadi Rp ${formatRupiah(total)}`);
  }
  const changeSummary = isEdit ? changeParts.join(" · ") : "";

  /** Penanda "Ongkir mungkin berubah, cek ulang" — nilai ongkir yang sudah diisi tidak diubah. */
  const ongkirStale =
    ongkir.status === "done" && Boolean(ongkir.key) && ongkir.key !== ongkirKey([form?.city, form?.kecamatan], payloadItems());

  /**
   * Cek ongkir J&T: tujuan diambil dari alamat form, berat dihitung di server memakai fungsi
   * berat bersama (sama dengan website checkout), tarifnya dari route J&T yang sudah ada.
   */
  const checkOngkir = async () => {
    const city = String(form?.city || "").trim();
    const kecamatan = String(form?.kecamatan || "").trim();
    const destination = [kecamatan, city].filter(Boolean).join(", ");

    if (!city || !kecamatan) {
      setOngkir({ ...EMPTY_ONGKIR, status: "error", error: "Lengkapi alamat dulu (kota/kabupaten & kecamatan).", destination });
      return;
    }

    const orderItems = payloadItems();
    if (orderItems.length === 0) {
      setOngkir({ ...EMPTY_ONGKIR, status: "error", error: "Pilih produk dulu (minimal 1 item dengan ukuran).", destination });
      return;
    }

    setSelectedService("");
    setOngkir({ ...EMPTY_ONGKIR, status: "loading", destination });
    try {
      const result = await base44.entities.Ongkir.check({ city, kecamatan, items: orderItems });
      const services = (result?.data || []).filter((service) => Number(service?.cost) > 0);
      setOngkir({
        status: "done",
        services,
        error: services.length === 0 ? "Tidak ada layanan J&T untuk tujuan ini. Isi ongkir manual." : "",
        weightGrams: Number(result?.weight_grams) || 0,
        key: ongkirKey([city, kecamatan], orderItems),
        destination,
      });
    } catch (error) {
      setOngkir({
        ...EMPTY_ONGKIR,
        status: "error",
        error: error instanceof Error ? error.message : "Gagal cek ongkir. Isi ongkir manual.",
        destination,
      });
    }
  };

  /** Klik salah satu layanan → kolom Ongkir terisi tarifnya (masih bisa diedit manual). */
  const applyOngkir = (service) => {
    setTouched(true);
    setSelectedService(`${service?.service}|${service?.cost}`);
    // HBO dibuat manual di J&T VIP: tarifnya tidak lewat Tariff Check, jadi ongkirnya tetap
    // diisi admin sendiri — yang disimpan hanya penanda layanannya.
    if (service?.manual) {
      updateForm({ shipping_method: "J&T HBO" });
      return;
    }
    updateForm({ shipping_cost: digits(service?.cost), shipping_method: "" });
  };

  /** Setelah resi dibuat dari panel "Transaksi tercatat", simpan nomor resinya di panel. */
  const handleResiCreated = (patch, refreshFromServer = false) => {
    if (patch && !refreshFromServer) {
      setSavedOrder((current) => (current ? { ...current, ...patch } : current));
    }
    // Daftar transaksi di belakang drawer juga harus ikut segar, supaya kolom No. Resi /
    // penanda packing langsung berubah tanpa reload (dulu hanya panel ini yang diperbarui).
    queryClient.invalidateQueries({ queryKey: ["transaksi"] });
  };

  /**
   * Pilihan pelanggan = SEMUA pelanggan (termasuk yang hanya punya pesanan batal dan yang
   * belum punya alamat) supaya admin dari tab mana pun tetap bisa memilih. Yang alamatnya
   * sudah siap ditaruh di atas supaya input transaksi tetap cepat, dan sisanya ditandai.
   */
  const customerOptions = useMemo(() => {
    const sorted = [...customers].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "id-ID"));
    return [...sorted.filter((customer) => customer.hasAddress !== false), ...sorted.filter((customer) => customer.hasAddress === false)];
  }, [customers]);

  const semuaPelanggan = useMemo(
    () => [...customers].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "id-ID")),
    [customers],
  );

  /**
   * Hasil pencarian pelanggan: nama ATAU nomor HP. Nomornya dinormalkan lewat `phoneKey`
   * (lihat fungsi di atas) supaya "0878…", "62878…", dan "878…" sama-sama cocok — admin sering
   * hanya mengetik sebagian nomor. Kosong = seluruh daftar, urutannya tetap "alamatnya siap" di atas.
   */
  const customerMatches = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    const phoneQuery = phoneKey(customerSearch);
    if (!query) return customerOptions;
    return customerOptions.filter((customer) => {
      if (String(customer.name || "").toLowerCase().includes(query)) return true;
      return phoneQuery.length >= 3 && phoneKey(customer.whatsapp).includes(phoneQuery);
    });
  }, [customerOptions, customerSearch]);

  /**
   * Pelanggan yang sedang terpilih. Pelanggan tanpa akun tidak punya `customer_id`, jadi
   * dicocokkan lewat nama + nomor HP-nya — dulu pilihan seperti itu tampil kosong lagi
   * walaupun nama & nomornya sudah terisi.
   */
  const pickedCustomer = useMemo(() => {
    if (form?.customer_mode !== "existing") return null;
    if (form?.customer_id) {
      return customerOptions.find((customer) => (customer.id || customer.key) === form.customer_id) || null;
    }
    const name = String(form?.customer_name || "").trim().toLowerCase();
    const phone = phoneKey(form?.customer_whatsapp || "");
    if (!name) return null;
    return (
      customerOptions.find(
        (customer) => String(customer.name || "").trim().toLowerCase() === name && (!phone || phoneKey(customer.whatsapp) === phone),
      ) || null
    );
  }, [form?.customer_mode, form?.customer_id, form?.customer_name, form?.customer_whatsapp, customerOptions]);

  /** Ada pelanggan terpilih (akun maupun tamu) → tampilkan baris ringkas, bukan kotak pencarian. */
  const customerChosen = form?.customer_mode === "existing" && Boolean(form?.customer_id || String(form?.customer_name || "").trim());

  /* ── Alamat pengiriman (sama seperti checkout website) ── */
  const addressErrors = {
    address: String(form?.address || "").trim() ? "" : "Alamat lengkap wajib diisi",
    province: String(form?.province || "").trim() ? "" : "Provinsi wajib dipilih",
    city: String(form?.city || "").trim() ? "" : "Kota/Kabupaten wajib dipilih",
    kecamatan: String(form?.kecamatan || "").trim() ? "" : "Kecamatan wajib diisi",
    postal_code: String(form?.postal_code || "").trim() ? "" : "Kode pos wajib diisi",
  };
  const addressIncomplete = ADDRESS_FIELDS.some((field) => addressErrors[field]);
  const addressErrorText = (field) => (saveAttempted ? addressErrors[field] : "");

  /**
   * Patokan tampilan kartu alamat adalah ISI FORM (dari sumber apa pun: buku alamat, pesanan
   * terakhir, atau ketikan admin) — bukan ada/tidaknya alamat di buku alamat pelanggan.
   * Kolom isian hanya muncul kalau alamat memang kosong atau admin klik Ubah/Tambah alamat.
   */
  const formAddressFilled = Boolean(String(form?.address || "").trim());
  const customerHasSavedAddresses = savedAddresses.length > 0;
  const showAddressCard = form?.customer_mode === "existing" && !addressEditing && formAddressFilled;
  const showAddressForm = !showAddressCard;
  /** Alamat form sekarang berasal dari salah satu kartu buku alamat yang terpilih. */
  const formPickedSavedAddress =
    Boolean(form?.saved_address_id) && savedAddresses.some((address) => address.id === form.saved_address_id);

  /** Nomor HP yang sudah terdaftar → tawarkan pakai pelanggan itu daripada bikin ganda. */
  const duplicateCustomer = useMemo(() => {
    if (form?.customer_mode !== "new") return null;
    const key = phoneKey(form?.customer_whatsapp || "");
    if (key.length < 8) return null;
    const found = semuaPelanggan.find((customer) => phoneKey(customer.whatsapp) === key) || null;
    if (!found) return null;
    // Mode Ubah: nomor milik pelanggan yang SAMA dengan pesanan ini bukan duplikat — jangan
    // menyuruh admin "Pakai pelanggan ini" untuk data yang memang sedang diedit.
    if (isEdit) {
      const originalId = String(initialData?.customer_id || "");
      const originalPhone = phoneKey(initialData?.customer_whatsapp || "");
      const sameCustomer =
        (originalId && String(found.id || "") === originalId) ||
        (originalPhone && phoneKey(found.whatsapp) === originalPhone);
      if (sameCustomer) return null;
    }
    return found;
  }, [form?.customer_mode, form?.customer_whatsapp, semuaPelanggan, isEdit, initialData?.customer_id, initialData?.customer_whatsapp]);

  /**
   * Alamat dari buku alamat dipakai → alamatnya diisi SEKALIGUS nama penerima & nomor HP-nya,
   * sama seperti checkout website (`setNama(addr.recipient_name)`).
   *
   * `recipient_name` di buku alamat adalah nama PENERIMA paket, dan kolom `orders.customer_name`
   * dibaca sebagai "Nama penerima" saat membuat resi J&T. Kalau yang dipakai nama AKUN pelanggan,
   * nama penerimanya jadi salah — mis. akun atas nama A, tapi paketnya dikirim untuk B (alamat
   * "Rumah" dipakai bersama). Nilai dari buku alamat hanya dipakai kalau memang terisi.
   */
  const applySavedAddress = (address) => {
    const recipient = String(address?.recipient_name || "").trim();
    const phone = String(address?.phone || "").trim();
    setForm((current) => ({
      ...current,
      saved_address_id: address?.id || "",
      address: address?.address || "",
      province: address?.province || "",
      city: address?.city || "",
      kecamatan: address?.kecamatan || "",
      postal_code: address?.postal_code || "",
      ...(recipient ? { customer_name: recipient } : null),
      ...(phone ? { customer_whatsapp: phone } : null),
    }));
  };

  /** Pilih pelanggan dari hasil pencarian: alamat diisi ulang dari buku alamatnya (efek di atas). */
  const pickCustomer = (customer) => {
    setCustomerSearch("");
    setNewAddressForCustomer(false);
    setAddressEditing(false);
    setAddressBackup(null);
    // Ganti pelanggan → alamat ikut diganti (alamat utama terpilih otomatis).
    updateForm({
      customer_mode: "existing",
      customer_id: customer.id || "",
      customer_name: customer.name || "",
      customer_whatsapp: customer.whatsapp || "",
      address_mode: "saved",
      saved_address_id: "",
      address: "",
      province: "",
      city: "",
      kecamatan: "",
      postal_code: "",
    });
  };

  /** Batalkan pilihan pelanggan → kembali ke kotak pencarian. */
  const clearPickedCustomer = () => {
    setCustomerSearch("");
    setNewAddressForCustomer(false);
    setAddressEditing(false);
    setAddressBackup(null);
    updateForm({
      customer_id: "",
      customer_name: "",
      customer_whatsapp: "",
      address_mode: "saved",
      saved_address_id: "",
      address: "",
      province: "",
      city: "",
      kecamatan: "",
      postal_code: "",
    });
  };

  /* ── "Tempel alamat lengkap, isi otomatis" (mode Pelanggan baru) ── */

  /** Label kolom untuk pesan "belum terdeteksi" — pakai istilah yang dibaca admin. */
  const LABEL_BAGIAN = {
    name: "Nama pelanggan",
    whatsapp: "Nomor HP",
    province: "Provinsi",
    city: "Kota/Kabupaten",
    kecamatan: "Kecamatan",
    postal_code: "Kode pos",
  };

  /**
   * Isi otomatis dari teks tempelan. Semua kolom diisi dalam SATU update state supaya
   * dropdown berantai (Provinsi → Kota → Kecamatan) tidak saling mereset: nilai yang
   * terisi berasal dari daftar wilayah yang sama dengan isi dropdown itu.
   */
  const isiOtomatisAlamat = async () => {
    const teks = pasteText.trim();
    if (!teks || pasting) return;
    setPasting(true);
    setPasteStatus({ state: "loading", message: "Membaca teks alamat…" });
    try {
      const hasil = await base44.entities.AlamatTebak.deteksi(teks);
      updateForm({
        customer_mode: "new",
        customer_id: "",
        customer_name: hasil.name || "",
        customer_whatsapp: hasil.whatsapp || "",
        address_mode: "new",
        saved_address_id: "",
        address: hasil.street || "",
        province: hasil.province || "",
        city: hasil.city || "",
        kecamatan: hasil.kecamatan || "",
        postal_code: hasil.postal_code || "",
      });
      setPasteFilled(Array.isArray(hasil.filled) ? hasil.filled : []);
      setPastePostal(Array.isArray(hasil.postal_options) ? hasil.postal_options : []);
      // Peringatan (oranye) hanya untuk kolom WAJIB: nama, nomor HP, provinsi, kota, kecamatan.
      // Kode pos yang tidak ada di teks hanya info netral — aturan validasinya tidak diubah.
      const gagal = (Array.isArray(hasil.missing) ? hasil.missing : []).filter((bagian) => bagian !== "postal_code");
      const belum = gagal.map((bagian) => LABEL_BAGIAN[bagian] || bagian);
      const catatan = Array.isArray(hasil.notes) ? hasil.notes : [];
      setPasteStatus({
        state: belum.length > 0 ? "partial" : "done",
        message:
          belum.length > 0
            ? `${belum.join(", ")} belum terdeteksi, silakan isi/pilih manual. Kolom lain sudah terisi dan bisa diubah.`
            : "Alamat terisi otomatis. Periksa lagi sebelum klik Lanjut.",
        notes: catatan,
      });
    } catch (error) {
      setPasteStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Gagal membaca teks alamat. Isi manual saja.",
      });
    } finally {
      setPasting(false);
    }
  };

  /** Reset: kosongkan textarea + kolom yang tadi diisi otomatis (isian manual lain dibiarkan). */
  const resetAlamatTempel = () => {
    const terisi = new Set(pasteFilled);
    const patch = { customer_mode: "new" };
    if (terisi.has("name")) patch.customer_name = "";
    if (terisi.has("whatsapp")) patch.customer_whatsapp = "";
    if (terisi.has("address")) patch.address = "";
    if (terisi.has("province")) patch.province = "";
    if (terisi.has("city")) patch.city = "";
    if (terisi.has("kecamatan")) patch.kecamatan = "";
    if (terisi.has("postal_code")) patch.postal_code = "";
    updateForm(patch);
    setPasteFilled([]);
    setPasteStatus({ state: "idle", message: "" });
    setPasteText("");
  };

  const useExistingCustomer = (customer) => {
    setTouched(true);
    setNewAddressForCustomer(false);
    setAddressEditing(false);
    setAddressBackup(null);
    setForm((current) => ({
      ...current,
      customer_mode: "existing",
      customer_id: customer.id || "",
      customer_name: customer.name || "",
      customer_whatsapp: customer.whatsapp || "",
      address_mode: "saved",
      saved_address_id: "",
    }));
  };

  /** Salinan alamat sebelum isian dibuka → dipakai tombol "Batal" untuk kembali apa adanya. */
  const beginAddressEdit = () => {
    const current = form || {};
    setAddressBackup({
      address: current.address || "",
      province: current.province || "",
      city: current.city || "",
      kecamatan: current.kecamatan || "",
      postal_code: current.postal_code || "",
      saved_address_id: current.saved_address_id || "",
    });
    setAddressEditing(true);
  };

  const startNewAddress = () => {
    setTouched(true);
    setNewAddressForCustomer(true);
    beginAddressEdit();
    setForm((current) => ({ ...current, address_mode: "new", saved_address_id: "" }));
  };

  /**
   * "Ubah alamat": buka isian dengan alamat terpilih sebagai nilai awal, TANPA menambah alamat
   * baru ke buku alamat pelanggan (perubahan hanya tersimpan di transaksi ini).
   */
  const startEditingAddress = () => {
    setTouched(true);
    setNewAddressForCustomer(false);
    beginAddressEdit();
    setForm((current) => ({ ...current, address_mode: "new" }));
  };

  /**
   * Pintasan "Ubah alamat" dari luar langkah Pelanggan (ringkasan mode Ubah & bar di langkah
   * Produk). Langsung pindah ke langkah Pelanggan sekaligus membuka kolom isian alamat, jadi
   * admin tidak perlu tahu bahwa alamat ada di balik "Ubah data pelanggan".
   */
  const openAddressEditor = () => {
    setCustomerEditing(true);
    setStep(0);
    startEditingAddress();
  };

  /** "Batal" di isian alamat: balik ke kartu teks dan kembalikan alamat sebelum diubah. */
  const cancelAddressEdit = () => {
    setTouched(true);
    setNewAddressForCustomer(false);
    setAddressEditing(false);
    if (addressBackup) {
      const backup = addressBackup;
      setAddressBackup(null);
      setForm((current) => ({ ...current, ...backup, address_mode: "saved" }));
      return;
    }
    const chosen =
      savedAddresses.find((address) => address.id === form?.saved_address_id) ||
      savedAddresses.find((address) => address.is_default) ||
      savedAddresses[0];
    if (chosen) {
      applySavedAddress(chosen);
      return;
    }
    setForm((current) => ({ ...current, address_mode: "saved" }));
  };

  /* ── Alur bertahap: tiap langkah harus beres dulu sebelum bisa lanjut ── */
  const step1Ready = Boolean(form?.customer_name?.trim()) && Boolean(form?.customer_whatsapp?.trim()) && !addressIncomplete;
  const stepReady = [step1Ready, !incomplete, true];
  const stepLabels = ["Pelanggan", "Produk", "Pembayaran"];

  const goNext = () => {
    setSaveAttempted(true);
    setSaveError("");
    if (!stepReady[step]) {
      // Isian wajib belum lengkap → geser ke isian pertama yang bermasalah.
      setScrollKick((count) => count + 1);
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  };

  const goBack = () => {
    setSaveError("");
    setStep((current) => Math.max(0, current - 1));
  };

  /** Hanya satu baris produk yang dibiarkan terbuka; baris lengkap diringkas jadi satu baris. */
  const openRow = (index) => {
    setTouched(true);
    setSearch("");
    setCatChip("all");
    setItems((rows) => rows.map((row, i) => (row.editing === (i === index) ? row : { ...row, editing: i === index })));
  };

  const addRow = () => {
    setTouched(true);
    setSearch("");
    setCatChip("all");
    setItems((rows) => [...rows.map((row) => ({ ...row, editing: false })), emptyRow()]);
  };

  /* ── Aksi ── */
  const updateForm = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setTouched(true);
  };

  const updateRow = (index, patch) => {
    setTouched(true);
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  /**
   * Tutup baris yang sudah lengkap → berubah jadi satu baris list ringkas.
   * Baris TIDAK ditutup otomatis: admin masih bisa atur qty/harga dulu, lalu klik "Simpan produk".
   */
  const saveRow = (index) => {
    setTouched(true);
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, editing: false } : row)));
  };

  const removeRow = (index) => {
    setTouched(true);
    setItems((rows) => rows.filter((_, i) => i !== index));
  };

  /** Baris item yang sedang terbuka (hanya satu) — dipakai untuk fokus kotak cari. */
  const openIndex = items.findIndex((row) => row.editing);

  /**
   * Baris yang sedang dibuka memakai alur PAKET (Cover & Hanger)? → teks petunjuk di kanan atas
   * ikut menyesuaikan: "Cari produk → Paket → Qty" (tanpa Series/Ukuran).
   */
  const openRowIsPaket = openIndex >= 0 ? paketOptions(groupOf(items[openIndex])).length > 0 : false;

  /** Geser drawer ke blok langkah berikutnya — dipakai semua alur (baju & paket). */
  const scrollToStep = (ref) => {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  /** Pilih grup produk pada satu baris; `null` = kosongkan pilihan lagi ("Ganti"). */
  const chooseGroup = (index, nextGroup) => {
    if (!nextGroup) {
      updateRow(index, { product: "", category: "", kain: "", warna: "", series: null, variant: "", price: "", priceManual: false });
      return;
    }
    // Produk dengan satu warna asli langsung terisi; yang multi-warna menunggu langkah Warna.
    // Cover & Hanger: paketnya cuma satu → langsung terisi juga (chip paket tetap tampil).
    // Harga manual ikut dikosongkan: harganya milik varian yang lama.
    const paketGroup = isPaketEntry(nextGroup) ? paketOptions(nextGroup) : [];
    updateRow(index, {
      product: nextGroup.name,
      category: nextGroup.category,
      kain: nextGroup.kain,
      warna: paketGroup.length === 1 ? paketGroup[0].color : nextGroup.warnas.length === 1 ? nextGroup.warnas[0] : "",
      series: null,
      variant: "",
      price: "",
      priceManual: false,
    });

    // Langkah berikutnya berbeda per jenis produk — geser otomatis supaya input satset.
    if (isPaketEntry(nextGroup)) {
      scrollToStep(paketOptions(nextGroup).length > 1 ? paketStepRef : qtyStepRef);
    } else if (nextGroup.warnas.length > 1) {
      scrollToStep(colorStepRef);
    } else {
      const warna = nextGroup.warnas[0] || "";
      scrollToStep(seriesStep(nextGroup.category, nextGroup.kain, warna).show ? seriesStepRef : sizeStepRef);
    }
  };

  /* Kata kunci & chip direset saat pindah baris supaya ketikan tidak "menempel" ke item lain,
     dan kotak cari langsung difokuskan supaya input produk bisa dimulai tanpa klik. */
  useEffect(() => {
    setSearch("");
    setCatChip("all");
  }, [openIndex]);

  useEffect(() => {
    if (!isOpen || step !== 1 || openIndex === -1) return undefined;
    const timer = setTimeout(() => searchRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [isOpen, step, openIndex]);

  /* Langkah Pelanggan dibuka tanpa pelanggan terpilih → kotak pencarian pelanggan langsung
     difokuskan supaya admin bisa langsung mengetik nama/nomor tanpa klik dulu. */
  useEffect(() => {
    if (!isOpen || step !== 0 || customerChosen) return undefined;
    if (form?.customer_mode !== "existing") return undefined;
    const timer = setTimeout(() => customerSearchRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [isOpen, step, customerChosen, form?.customer_mode]);

  /* Ganti langkah → posisi scroll isi drawer kembali ke atas. */
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  /* Validasi gagal → geser ke isian pertama yang bermasalah. Kalau isiannya sudah terlihat,
     tidak perlu digeser (biar tidak ada gerakan yang tidak diminta). */
  useEffect(() => {
    if (scrollKick === 0) return undefined;
    const timer = setTimeout(() => {
      const area = bodyRef.current;
      if (!area) return;
      const target = area.querySelector('[data-invalid="true"]');
      if (!target) return;
      const box = target.getBoundingClientRect();
      const view = area.getBoundingClientRect();
      if (box.top >= view.top && box.bottom <= view.bottom) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
    return () => clearTimeout(timer);
  }, [scrollKick]);

  const mutation = useMutation({
    mutationFn: (data) =>
      isEdit
        ? base44.entities.Transaction.updateManual({ order_number: initialData.order_number, ...data })
        : base44.entities.Transaction.createManual(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["transaksi"] });
      toast({
        title: isEdit ? "✅ Transaksi diperbarui" : "✅ Transaksi tercatat",
        description: `No. Order ${result?.order_number ?? ""}`,
        variant: "success",
      });
      onSaved?.();
      setTouched(false);
      // Lanjut ke panel "Transaksi tercatat" (bukan menutup drawer) supaya bisa langsung
      // buat/cetak resi. Datanya diambil dari respons server + data awal saat mode Ubah.
      setSavedOrder({
        order_number: result?.order_number || initialData?.order_number || "",
        total: Number(result?.total ?? total) || 0,
        status: initialData?.status || "diproses",
        awb_no: initialData?.awb_no || "",
        shipping_status: initialData?.shipping_status || "",
        customer_name: form?.customer_name || initialData?.customer_name || "",
        isEdit,
      });
    },
    onError: (error) =>
      setSaveError(error instanceof Error ? error.message : "Gagal menyimpan transaksi. Coba lagi."),
  });

  const save = () => {
    if (!form) return;
    setSaveAttempted(true);
    setSaveError("");
    if (incomplete) {
      if (isEdit) setStep(1);
      setSaveError("Lengkapi dulu produknya (dan periksa baris yang stoknya tidak cukup).");
      setScrollKick((count) => count + 1);
      return;
    }
    if (!form.customer_name.trim()) {
      if (isEdit) setStep(0);
      setScrollKick((count) => count + 1);
      return setSaveError("Nama pelanggan wajib diisi.");
    }
    if (!form.customer_whatsapp.trim()) {
      if (isEdit) setStep(0);
      setScrollKick((count) => count + 1);
      return setSaveError("Nomor HP pelanggan wajib diisi.");
    }
    if (addressIncomplete) {
      if (isEdit) setStep(0);
      setScrollKick((count) => count + 1);
      return setSaveError("Alamat pengiriman wajib diisi lengkap.");
    }
    const createdAt = wibToIso(form.date, form.time);
    if (!createdAt) return setSaveError("Tanggal/jam transaksi tidak valid.");

    mutation.mutate({
      customer_id: form.customer_mode === "existing" ? form.customer_id || null : null,
      customer_name: form.customer_name.trim(),
      customer_whatsapp: form.customer_whatsapp.trim(),
      source: form.source,
      created_at: createdAt,
      shipping_cost: shippingValue,
      ...(form.shipping_method === "J&T HBO" ? { shipping_method: "J&T HBO" } : {}),
      discount: Math.min(discountValue, subtotal),
      // "Belum Lunas" → server menyimpan status `pending` (di luar SALE_STATUSES, jadi tidak
      // ikut omset) dan otomatis mengirim invoice berisi nomor rekening ke WA pembeli.
      payment_status: form.payment_status === "unpaid" ? "unpaid" : "paid",
      notes: form.notes.trim(),
      // Alamat yang dipakai transaksi ini tersimpan di pesanan (dan di buku alamat kalau baru).
      shipping: {
        address: form.address.trim(),
        province: form.province.trim(),
        city: form.city.trim(),
        kecamatan: form.kecamatan.trim(),
        postal_code: form.postal_code.trim(),
      },
      save_address: newAddressForCustomer && form.customer_mode === "existing" && Boolean(form.customer_id),
      // `price` dikirim HANYA kalau admin memang mengetik harga manual; server memvalidasi ulang
      // (bilangan bulat dalam batas) lalu menyimpannya sebagai `order_items.price` — harga itulah
      // yang dipakai semua angka pembukuan. Tanpa harga manual, server tetap memakai harga katalog.
      items: items.map((row) => {
        const item = rowPayload(row);
        if (row.priceManual) item.price = Number(digits(row.price)) || 0;
        return item;
      }),
    });
  };

  const requestClose = () => {
    if (mutation.isPending) return;
    if (touched) setConfirmClose(true);
    else onClose();
  };

  // Escape = tombol X (ikut minta konfirmasi kalau ada isian).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (confirmClose) setConfirmClose(false);
      else requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, confirmClose, touched, mutation.isPending]);

  /**
   * Selama drawer terbuka, scroll halaman dikunci. Kalau tidak, scrollbar halaman tampak
   * menimpa tepi kanan drawer (dan latar belakang ikut bergeser waktu di-scroll).
   * Lebar scrollbar yang hilang diganti padding supaya isi halaman tidak "melompat".
   */
  useEffect(() => {
    if (!isOpen) return undefined;
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && form && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
            onClick={requestClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.24, ease: "easeOut" }}
            className="fixed inset-y-0 right-0 z-[9999] w-full sm:w-[680px] bg-white dark:bg-[#1a1d28] shadow-2xl flex flex-col overflow-hidden"
            role="dialog"
            aria-label={isEdit ? "Ubah transaksi" : "Tambah transaksi"}
          >
            {/* Header menempel: judul + indikator langkah */}
            <div className="shrink-0 px-5 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
                    {savedOrder ? "Transaksi Tercatat" : isEdit ? "Ubah Transaksi" : "Tambah Transaksi"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {savedOrder
                      ? `No. Order ${savedOrder.order_number}`
                      : isEdit
                        ? `No. Order ${initialData?.order_number}`
                        : "Transaksi manual langsung berstatus Lunas"}
                  </p>
                </div>
                <button
                  onClick={requestClose}
                  className="p-2 -mr-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Tutup"
                >
                  <X size={18} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              {/* Stepper: di mode Ubah semua langkah boleh diklik bebas (data sudah terisi);
                  di mode Tambah hanya langkah yang sudah selesai. Disembunyikan saat tersimpan. */}
              <ol className={`flex items-center gap-1.5 mt-3 ${savedOrder ? "hidden" : ""}`}>
                {stepLabels.map((label, index) => {
                  const done = index < step;
                  const active = index === step;
                  const canJump = isEdit || done;
                  return (
                    <li key={label} className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        disabled={!canJump}
                        onClick={() => canJump && setStep(index)}
                        aria-current={active ? "step" : undefined}
                        className={`flex items-center gap-1.5 min-w-0 ${canJump ? "cursor-pointer" : "cursor-default"}`}
                      >
                        <span
                          className={`w-5 h-5 shrink-0 rounded-full grid place-items-center text-[10px] font-black ${
                            done || active
                              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                              : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                          }`}
                        >
                          {done ? <Check size={11} /> : index + 1}
                        </span>
                        <span
                          className={`text-xs font-bold truncate ${
                            done || active ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"
                          }`}
                        >
                          {label}
                        </span>
                      </button>
                      {index < stepLabels.length - 1 && <span className="w-3 sm:w-5 h-px bg-slate-200 dark:bg-slate-700 shrink-0" />}
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Body: boleh di-scroll (header & footer menempel), scrollbar disembunyikan total */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                // Mode Ubah: Enter menyimpan dari langkah mana pun (data sudah terisi).
                if (isEdit || step === 2) save();
                else goNext();
              }}
              ref={bodyRef}
              className="transaksi-body no-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-3 space-y-3.5"
              style={{ scrollbarWidth: "none" }}
            >
              {/* Setelah tersimpan: panel "Transaksi tercatat" — langsung bisa buat & cetak resi,
                  jadi admin tidak perlu mencari barisnya lagi di daftar. */}
              {savedOrder ? (
                <div className="space-y-3.5">
                  <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3.5">
                    <p className="text-sm font-black text-emerald-800 dark:text-emerald-200">
                      {savedOrder.isEdit ? "✅ Transaksi diperbarui" : "✅ Transaksi tercatat"}
                    </p>
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mt-1">
                      No. Order <b className="font-mono">{savedOrder.order_number}</b>
                      {savedOrder.total ? ` · Rp ${formatRupiah(savedOrder.total)}` : ""}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Pengiriman J&T
                    </p>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-3 space-y-2.5">
                      <TransaksiResiPanel order={savedOrder} onResiCreated={handleResiCreated} />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Transaksi sudah masuk ke daftar Transaksi. Tutup panel ini kalau sudah selesai.
                  </p>
                </div>
              ) : (
                <>
              {/* ── Langkah 1: Pelanggan (termasuk alamat & sumber/waktu) ── */}
              {step === 0 && (
                <>
              <section className="space-y-2">
                <h4 className={sectionClass}>Pelanggan</h4>

                {/* Mode Ubah: data pesanan sudah ada → tampilkan ringkasan dulu, bukan form kosong. */}
                {isEdit && !customerEditing && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {form.customer_name || "Tanpa nama"}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                          {form.customer_whatsapp || "nomor belum ada"}
                        </p>
                      </div>
                      <div className="shrink-0 flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCustomerEditing(true)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                          Ubah pelanggan
                        </button>
                        <button
                          type="button"
                          onClick={openAddressEditor}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-[11px] font-bold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                        >
                          <Pencil size={12} /> Ubah alamat
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-200 mt-2 leading-relaxed">
                      {addressText(form) || "Alamat belum diisi"}
                    </p>
                  </div>
                )}

                {/* Field pelanggan & alamat: selalu di mode Tambah, dan di mode Ubah hanya
                    setelah admin menekan "Ubah data pelanggan". */}
                {(!isEdit || customerEditing) && (
                  <>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewAddressForCustomer(false);
                      setAddressEditing(false);
                      setAddressBackup(null);
                      updateForm({
                        customer_mode: "existing",
                        customer_id: "",
                        customer_name: "",
                        customer_whatsapp: "",
                        address_mode: "saved",
                        saved_address_id: "",
                        address: "",
                        province: "",
                        city: "",
                        kecamatan: "",
                        postal_code: "",
                      });
                    }}
                    className={`flex-1 px-4 py-1.5 rounded-lg border-2 text-sm font-bold transition-all ${
                      form.customer_mode === "existing"
                        ? "bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-500 text-slate-900 dark:text-white"
                        : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    Pelanggan terdaftar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddressEditing(false);
                      setAddressBackup(null);
                      updateForm({ customer_mode: "new", customer_id: "" });
                    }}
                    className={`flex-1 px-4 py-1.5 rounded-lg border-2 text-sm font-bold transition-all ${
                      form.customer_mode === "new"
                        ? "bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-500 text-slate-900 dark:text-white"
                        : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    Pelanggan baru
                  </button>
                </div>

                {form.customer_mode === "existing" ? (
                  customerChosen ? (
                    /* Sudah terpilih → satu baris ringkas + "Ganti" (pola sama dengan baris produk) */
                    <div
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-900 px-3 py-2"
                      data-invalid={
                        form.customer_mode === "existing" && (!form.customer_name.trim() || !form.customer_whatsapp.trim())
                          ? "true"
                          : undefined
                      }
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">
                          {pickedCustomer?.name || form.customer_name || "Tanpa nama"}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {[
                            pickedCustomer?.whatsapp || form.customer_whatsapp || "nomor belum ada",
                            pickedCustomer && !pickedCustomer.registered ? "belum daftar" : "",
                            pickedCustomer?.hasAddress === false ? "belum ada alamat" : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={clearPickedCustomer}
                        className="shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        Ganti
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Pemilih pelanggan cepat: ketik nama / nomor HP → daftar tersaring */}
                      <input
                        ref={customerSearchRef}
                        type="text"
                        value={customerSearch}
                        onChange={(event) => setCustomerSearch(event.target.value)}
                        placeholder="Cari pelanggan… (nama atau nomor HP)"
                        aria-label="Cari pelanggan"
                        data-invalid={
                          form.customer_mode === "existing" && (!form.customer_name.trim() || !form.customer_whatsapp.trim())
                            ? "true"
                            : undefined
                        }
                        className={inputClass}
                      />

                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-[214px] overflow-y-auto no-scrollbar">
                        {customerOptions.length === 0 ? (
                          <p className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Belum ada pelanggan terdaftar. Pakai tab “Pelanggan baru”.
                          </p>
                        ) : customerMatches.length === 0 ? (
                          <p className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Pelanggan tidak ditemukan. Coba nama atau nomor HP lain.
                          </p>
                        ) : (
                          customerMatches.map((customer) => (
                            <button
                              key={customer.id || customer.key}
                              type="button"
                              onClick={() => pickCustomer(customer)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                              <span className="min-w-0">
                                <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">
                                  {customer.name}
                                </span>
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {[
                                    customer.whatsapp || "nomor belum ada",
                                    customer.registered ? "" : "belum daftar",
                                    customer.hasAddress === false ? "belum ada alamat" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>

                      {customerOptions.length > 0 && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {customerSearch.trim()
                            ? `Menampilkan ${customerMatches.length} dari ${customerOptions.length} pelanggan`
                            : `${customerOptions.length} pelanggan siap dipilih`}
                        </p>
                      )}
                    </>
                  )
                ) : (
                  <>
                    {/* "Tempel alamat lengkap, isi otomatis" — hanya di mode Pelanggan baru.
                        Di mode Ubah kotaknya dilipat dulu supaya tidak terkesan menyuruh
                        mengisi ulang; admin bisa membukanya kalau memang perlu.
                        Cara kerja & aturan deteksinya ada di src/lib/alamat-deteksi.ts. */}
                    {isEdit && !pasteExpanded ? (
                      <button
                        type="button"
                        onClick={() => setPasteExpanded(true)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Wand2 size={13} /> Tempel alamat lengkap, isi otomatis
                      </button>
                    ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Tempel alamat lengkap, isi otomatis
                      </p>
                      <textarea
                        rows={3}
                        value={pasteText}
                        onChange={(event) => {
                          setPasteText(event.target.value);
                          if (pasteStatus.state !== "idle") setPasteStatus({ state: "idle", message: "" });
                        }}
                        placeholder="Tempel teks alamat lengkap di sini. Contoh: Budi Santoso · 08123456789, Jl. Sudirman No.123, Kelurahan X, Kecamatan Y, Kota Z"
                        aria-label="Tempel teks alamat lengkap"
                        className={`${inputClass} resize-y`}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={isiOtomatisAlamat}
                          disabled={pasting || !pasteText.trim()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {pasting ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                          {pasting ? "Mengisi…" : "Isi otomatis"}
                        </button>
                        <button
                          type="button"
                          onClick={resetAlamatTempel}
                          disabled={pasting || (!pasteText.trim() && pasteFilled.length === 0)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border-2 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <RotateCcw size={13} /> Reset
                        </button>
                        {pasteStatus.message ? (
                          <p
                            className={`flex items-start gap-1.5 text-[11px] font-semibold ${
                              pasteStatus.state === "error"
                                ? "text-red-600 dark:text-red-400"
                                : pasteStatus.state === "partial"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : pasteStatus.state === "done"
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-slate-500 dark:text-slate-400"
                            }`}
                            role="status"
                          >
                            {pasteStatus.state === "error" || pasteStatus.state === "partial" ? (
                              <AlertCircle size={13} className="mt-px shrink-0" />
                            ) : pasteStatus.state === "done" ? (
                              <Check size={13} className="mt-px shrink-0" />
                            ) : null}
                            <span>{pasteStatus.message}</span>
                          </p>
                        ) : null}
                        {/* Info netral (abu/biru): kode pos tidak ada di teks, data ganda, dst. */}
                        {(pasteStatus.notes || []).map((catatan) => (
                          <p key={catatan} className="flex items-start gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400" role="status">
                            <Info size={13} className="mt-px shrink-0" />
                            <span>{catatan}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={form.customer_name}
                        onChange={(event) => updateForm({ customer_name: event.target.value })}
                        placeholder="Nama pelanggan"
                        data-invalid={saveAttempted && !form.customer_name.trim() ? "true" : undefined}
                        className={inputClass}
                      />
                      <input
                        type="text"
                        value={form.customer_whatsapp}
                        onChange={(event) => updateForm({ customer_whatsapp: event.target.value })}
                        placeholder="Nomor HP (08…)"
                        data-invalid={saveAttempted && !form.customer_whatsapp.trim() ? "true" : undefined}
                        className={inputClass}
                      />
                    </div>
                  </>
                )}

                {/* Nomor HP yang sudah terdaftar → tawarkan pakai pelanggan itu supaya tidak ganda */}
                {duplicateCustomer && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-amber-200 bg-amber-50 px-3.5 py-2.5">
                    <AlertCircle size={15} className="shrink-0 text-amber-600" />
                    <p className="text-sm font-semibold text-amber-800">
                      Nomor ini sudah terdaftar{duplicateCustomer.name ? `: ${duplicateCustomer.name}` : ""}.
                    </p>
                    <button
                      type="button"
                      onClick={() => useExistingCustomer(duplicateCustomer)}
                      className="ml-auto text-xs font-bold px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                    >
                      Pakai pelanggan ini
                    </button>
                  </div>
                )}

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {form.customer_mode === "existing"
                    ? form.customer_name
                      ? `Penerima paket: ${form.customer_name} · ${form.customer_whatsapp || "nomor belum ada"}`
                      : "Pilih salah satu pelanggan, atau ganti ke Pelanggan baru."
                    : "Pelanggan baru dan alamatnya otomatis tersimpan di menu Pelanggan."}
                </p>

                {/* Alamat Pengiriman */}
                <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <h5 className={sectionClass}>Alamat Pengiriman</h5>

                  {/* Pelanggan terdaftar + alamat form sudah terisi → kartu teks, tanpa kolom.
                      Kartu dari buku alamat tetap dipakai kalau pelanggan punya beberapa alamat. */}
                  {showAddressCard && (
                    <div className="space-y-2">
                      {!formPickedSavedAddress && (
                        <div className="rounded-xl border-2 border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800 px-3.5 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              Alamat pengiriman
                            </span>
                            <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-slate-900 dark:text-white">
                              <Check size={14} /> Dipakai
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 leading-relaxed">
                            {addressText(form)}
                          </p>
                        </div>
                      )}
                      {savedAddresses.map((address) => {
                        const chosen = form.saved_address_id === address.id;
                        return (
                          <button
                            key={address.id}
                            type="button"
                            onClick={() => applySavedAddress(address)}
                            aria-pressed={chosen}
                            className={`w-full text-left rounded-xl border-2 px-3.5 py-3 transition-colors ${
                              chosen
                                ? "border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800"
                                : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                {address.label || "Alamat"}
                              </span>
                              {address.is_default && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                                  Utama
                                </span>
                              )}
                              {chosen && (
                                <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-slate-900 dark:text-white">
                                  <Check size={14} /> Dipilih
                                </span>
                              )}
                            </div>
                            {/* Nama penerima + nomornya ditampilkan seperti di checkout website,
                                supaya admin bisa memastikan paketnya memang untuk orang yang benar. */}
                            {address.recipient_name ? (
                              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                {address.recipient_name}
                                {address.phone ? ` · ${address.phone}` : ""}
                              </p>
                            ) : null}
                            <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 leading-relaxed">
                              {addressText(address)}
                            </p>
                          </button>
                        );
                      })}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
                        <button
                          type="button"
                          onClick={startEditingAddress}
                          className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Ubah alamat
                        </button>
                        <button
                          type="button"
                          onClick={startNewAddress}
                          className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Tambah alamat baru
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pesan ini HANYA saat alamat form memang kosong & pelanggan belum punya
                      alamat tersimpan — bukan saat alamat terisi dari sumber lain. */}
                  {form.customer_mode === "existing" && addressesLoaded && !formAddressFilled && !customerHasSavedAddresses && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Pelanggan ini belum punya alamat.</p>
                  )}

                  {showAddressForm && (
                    <div className="space-y-2">
                      {form.customer_mode === "existing" && (formAddressFilled || customerHasSavedAddresses) && (
                        <button
                          type="button"
                          onClick={cancelAddressEdit}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                        >
                          <X size={13} /> Batal
                        </button>
                      )}
                      <div
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                        data-invalid={
                          saveAttempted &&
                          (addressErrors.province || addressErrors.city || addressErrors.kecamatan || addressErrors.postal_code)
                            ? "true"
                            : undefined
                        }
                      >
                        <WilayahSelect
                          label="Provinsi"
                          value={form.province}
                          options={provinces}
                          onChange={(value) => updateForm({ province: value, city: "", kecamatan: "", postal_code: "" })}
                          error={addressErrorText("province")}
                        />
                        <WilayahSelect
                          label="Kota / Kabupaten"
                          value={form.city}
                          options={cities}
                          disabled={!form.province}
                          onChange={(value) => updateForm({ city: value, kecamatan: "", postal_code: "" })}
                          error={addressErrorText("city")}
                        />
                        <WilayahSelect
                          label="Kecamatan"
                          value={form.kecamatan}
                          options={districts}
                          disabled={!form.city}
                          onChange={(value) => updateForm({ kecamatan: value, postal_code: "" })}
                          error={addressErrorText("kecamatan")}
                          hint={
                            addressPrefilledFrom && !form.kecamatan
                              ? "Kecamatan belum ada di data pesanan ini — isi manual ya."
                              : ""
                          }
                        />
                        <div>
                          <label className={labelClass}>
                            Kode Pos <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={form.postal_code}
                            onChange={(event) => updateForm({ postal_code: digits(event.target.value) })}
                            placeholder="55581"
                            className={`${inputClass} ${saveAttempted && addressErrors.postal_code ? "border-red-300 dark:border-red-900/60" : ""}`}
                          />
                          {autoPostal && form.postal_code === autoPostal ? (
                            <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Kode pos terisi otomatis dari kecamatan.
                            </p>
                          ) : null}
                          {/* Kecamatan ini punya beberapa kode pos di data wilayah → tawarkan
                              pilihannya, tidak menebak satu. Chip hilang setelah kolom terisi. */}
                          {postalSuggestions.length > 0 && !form.postal_code ? (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Pilih kode pos
                              </span>
                              {postalSuggestions.map((kode) => (
                                <button
                                  key={kode}
                                  type="button"
                                  onClick={() => updateForm({ postal_code: kode })}
                                  className="px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                  {kode}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {addressErrorText("postal_code") ? (
                            <p className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1">{addressErrorText("postal_code")}</p>
                          ) : null}
                        </div>
                      </div>

                      {/* Alamat lengkap di bawah, tinggi kecil supaya tetap muat tanpa scroll */}
                      <div>
                        <label className={labelClass}>
                          Alamat Lengkap <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          rows={2}
                          value={form.address}
                          onChange={(event) => {
                            setAddressPrefilledFrom("");
                            updateForm({ address: event.target.value });
                          }}
                          placeholder="Nama jalan, nomor rumah, RT/RW, patokan"
                          data-invalid={saveAttempted && addressErrors.address ? "true" : undefined}
                          className={`${inputClass} ${saveAttempted && addressErrors.address ? "border-red-300 dark:border-red-900/60" : ""}`}
                        />
                        {addressErrorText("address") ? (
                          <p className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1">{addressErrorText("address")}</p>
                        ) : null}
                        {addressPrefilledFrom ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Terisi otomatis dari pesanan terakhir {addressPrefilledFrom} — bisa diubah.
                          </p>
                        ) : null}
                      </div>

                      {newAddressForCustomer && form.customer_mode === "existing" && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Alamat ini akan ditambahkan ke daftar alamat pelanggan.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                  </>
                )}
              </section>

              {/* Sumber & waktu */}
              <section className="space-y-2">
                <h4 className={sectionClass}>Sumber &amp; Waktu</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className={labelClass}>
                      Sumber <span className="text-red-500">*</span>
                    </label>
                    <select value={form.source} onChange={(event) => updateForm({ source: event.target.value })} className={inputClass}>
                      {MANUAL_SOURCE_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {SOURCE_LABEL[key]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>
                      Tanggal <span className="text-red-500">*</span>
                    </label>
                    <input type="date" value={form.date} onChange={(event) => updateForm({ date: event.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Jam (WIB)</label>
                    <input type="time" value={form.time} onChange={(event) => updateForm({ time: event.target.value })} className={inputClass} />
                  </div>
                </div>
              </section>
                </>
              )}

              {/* ── Langkah 2: Produk ── */}
              {step === 1 && (
                <>
              {/* Mode Ubah: alamat tetap terlihat & bisa diubah dari langkah yang pertama
                  terbuka, tanpa harus tahu bahwa kolomnya ada di langkah Pelanggan. */}
              {isEdit && (
                <button
                  type="button"
                  onClick={openAddressEditor}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 px-3.5 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Alamat pengiriman · bisa diubah
                    </span>
                    <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                      {addressText(form) || "Alamat belum diisi"}
                    </span>
                  </span>
                  <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
                    <Pencil size={13} /> Ubah alamat
                  </span>
                </button>
              )}
              {/* Pemilih produk cepat: cari produk → series → ukuran → qty */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className={sectionClass}>Produk</h4>
                  <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                    {openRowIsPaket ? "Cari produk → Paket → Qty" : "Cari produk → Series → Ukuran → Qty"}
                  </span>
                </div>

                {/* Daftar item tidak lagi punya kotak scroll sendiri: pemilih produk ikut
                    mengalir lega, dan halaman drawer yang men-scroll (satu scrollbar saja). */}
                <div className="space-y-2">
                  {items.map((row, index) => {
                    const info = rowInfo[index];
                    const step = seriesStep(row.category, row.kain, row.warna);

                    if (!row.editing && rowComplete(row) && info.chosen) {
                      const group = groupOf(row);
                      // Satu baris ringkas: "Thobe Superblack · Kain B-01 · Jiharkah · XL × 2"
                      const summaryParts = itemSummaryParts({
                        product: group?.name || row.product,
                        kain: row.kain,
                        series: step.show ? row.series : "",
                        // Paket: nama paketnya selalu tampil (walau paketnya cuma satu) dan
                        // ukurannya tidak pernah ikut ("ALL SIZE" = penanda internal).
                        color: isPaketEntry(row)
                          ? paketNameOf(info.chosen) || row.warna
                          : group && group.warnas.length > 1
                            ? row.warna
                            : "",
                        size: isPaketEntry(row) ? `× ${info.quantity}` : `${info.chosen.size} × ${info.quantity}`,
                      });
                      const summary = summaryParts.join(" · ");
                      const weightMissing = info.unitWeight.source === "missing";
                      const quantity = Number(row.quantity) || 1;
                      const maxStock = info.chosen.stock;
                      return (
                        <div
                          key={index}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate" title={summary}>
                                {summaryParts[0]}
                                {summaryParts.length > 1 ? (
                                  <span className="font-semibold text-slate-500 dark:text-slate-400"> · {summaryParts.slice(1).join(" · ")}</span>
                                ) : null}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Rp {formatRupiah(info.subtotal)}
                                {row.priceManual ? ` · harga manual Rp ${formatRupiah(info.unitPrice)}/pcs` : ""}
                                {` · stok ${info.chosen.stock}`}
                                {info.chosen.linkedTo ? ` · stok mengikuti ${info.chosen.linkedTo}` : ""}
                                {" · "}
                                {/* Berat per produk — ditampilkan di list supaya admin tahu tanpa buka detail. */}
                                <span
                                  className={
                                    weightMissing || info.unitWeight.source === "product"
                                      ? "font-bold text-amber-600 dark:text-amber-400"
                                      : "font-semibold text-slate-600 dark:text-slate-300"
                                  }
                                >
                                  Berat {weightMissing ? "belum diisi" : formatWeightExact(info.unitWeight.grams)}
                                  {info.unitWeight.source === "product" ? " (fallback)" : ""}
                                </span>
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => openRow(index)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                              >
                                <Pencil size={13} /> Ubah
                              </button>
                              <button
                                type="button"
                                onClick={() => removeRow(index)}
                                className="p-2 rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors"
                                aria-label="Hapus produk"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          {/* Mode Ubah: qty, ukuran, dan harga bisa langsung diubah dari daftar
                              tanpa membuka ulang pemilih produk. "Ubah" tetap untuk ganti produk. */}
                          {isEdit && (
                            <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ukuran</span>
                                {info.paket ? (
                                  <span className="mt-0.5 block text-sm font-bold text-slate-900 dark:text-white">
                                    {paketNameOf(info.chosen) || row.warna || "-"}
                                  </span>
                                ) : (
                                  <select
                                    value={row.variant}
                                    onChange={(event) => updateRow(index, { variant: event.target.value, price: "", priceManual: false })}
                                    className="mt-0.5 block w-auto min-w-[110px] px-2 py-1.5 bg-gray-50 dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white"
                                    aria-label="Ukuran"
                                  >
                                    {info.options.map((option) => (
                                      <option key={option.value} value={option.value} disabled={option.stock <= 0 && option.value !== row.variant}>
                                        {option.showColor ? `${option.size} · ${option.color}` : option.size}
                                        {option.stock <= 0 ? " (habis)" : ""}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>

                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Jumlah</span>
                                <div className="mt-0.5 flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => updateRow(index, { quantity: Math.max(1, quantity - 1) })}
                                    disabled={quantity <= 1}
                                    className="w-7 h-7 grid place-items-center rounded-lg border-2 border-slate-200 dark:border-slate-700 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                                    aria-label="Kurangi jumlah"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={row.quantity}
                                    onChange={(event) => updateRow(index, { quantity: clampQty(digits(event.target.value), maxStock) })}
                                    aria-label="Jumlah"
                                    className="w-11 px-1 py-1.5 bg-gray-50 dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-lg text-center text-sm font-bold text-slate-900 dark:text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateRow(index, { quantity: Math.min(maxStock, quantity + 1) })}
                                    disabled={quantity >= maxStock}
                                    className="w-7 h-7 grid place-items-center rounded-lg border-2 border-slate-200 dark:border-slate-700 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                                    aria-label="Tambah jumlah"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Harga</span>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 dark:text-slate-400">Rp</span>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={row.price}
                                      onChange={(event) => updateRow(index, { price: digits(event.target.value), priceManual: true })}
                                      placeholder={String(info.chosen.price)}
                                      aria-label="Harga satuan"
                                      className="w-28 pl-7 pr-2 py-1.5 bg-gray-50 dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white"
                                    />
                                  </div>
                                  {row.priceManual ? (
                                    <button
                                      type="button"
                                      onClick={() => updateRow(index, { price: "", priceManual: false })}
                                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                      Katalog
                                    </button>
                                  ) : (
                                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                      Rp {formatRupiah(info.chosen.price)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const group = groupOf(row);
                    const maxStock = info.chosen ? info.chosen.stock : 0;
                    const quantity = Number(row.quantity) || 1;

                    return (
                      <div
                        key={index}
                        data-invalid={info.issue ? "true" : undefined}
                        className="rounded-xl border-2 border-slate-200 dark:border-slate-700 p-3 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Produk {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            disabled={items.length === 1}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent"
                            aria-label="Hapus produk"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {/* 1 · Cari produk (hasil dikelompokkan per produk + jenis kain) */}
                        <div className="space-y-1.5">
                          {rowComplete(row) && info.chosen && (
                            <p className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                              {itemSummaryLabel({
                                product: group?.name || row.product,
                                kain: row.kain,
                                series: step.show ? row.series : "",
                                color: group && (group.warnas.length > 1 || paketOptions(group).length > 0) ? row.warna : "",
                                size: info.chosen.size,
                              })}{" "}
                              × {info.quantity}
                              <span className="font-semibold"> · Rp {formatRupiah(info.subtotal)}</span>
                              <span
                                className={`font-semibold ${
                                  info.unitWeight.source === "missing" || info.unitWeight.source === "product"
                                    ? "text-amber-700 dark:text-amber-300"
                                    : ""
                                }`}
                              >
                                {" · "}Berat{" "}
                                {info.unitWeight.source === "missing" ? "belum diisi" : formatWeightExact(info.unitWeight.grams)}
                                {info.unitWeight.source === "product" ? " (fallback)" : ""}
                              </span>
                            </p>
                          )}
                          <input
                            ref={index === openIndex ? searchRef : null}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Cari produk… (mis. super, grey, b-01)"
                            aria-label="Cari produk"
                            className={inputClass}
                          />

                          {categoryOptions.length > 1 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {["all", ...categoryOptions].map((category) => {
                                const active = catChip === category;
                                return (
                                  <button
                                    key={category}
                                    type="button"
                                    onClick={() => setCatChip(category)}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                                      active
                                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white"
                                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    }`}
                                  >
                                    {category === "all" ? "Semua" : category}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {!group ? (
                            <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-[214px] overflow-y-auto no-scrollbar">
                              {dataset.length === 0 ? (
                                <p className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                  Memuat daftar produk…
                                </p>
                              ) : visibleGroups.length === 0 ? (
                                <p className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                  Produk tidak ditemukan. Coba kata lain (mis. “super”, “grey”, “b-01”).
                                </p>
                              ) : (
                                visibleGroups.map((option) => (
                                  <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => chooseGroup(index, option)}
                                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    <span className="min-w-0">
                                      <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{option.name}</span>
                                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                        {[
                                          option.kain ? `Kain ${option.kain}` : "",
                                          option.category,
                                          option.series.length > 1 ? `${option.series.length} series` : "",
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </span>
                                    </span>
                                    <span
                                      className={`shrink-0 text-[11px] font-bold ${
                                        option.stockTotal > 0
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : "text-slate-400 dark:text-slate-500"
                                      }`}
                                    >
                                      {option.stockTotal > 0 ? `sisa ${option.stockTotal}` : "habis"}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-900 px-3 py-2">
                              <span className="min-w-0 text-sm font-bold text-slate-900 dark:text-white truncate">
                                {group.name}
                                {group.kain ? (
                                  <span className="font-semibold text-slate-500 dark:text-slate-400"> · Kain {group.kain}</span>
                                ) : null}
                              </span>
                              <button
                                type="button"
                                onClick={() => chooseGroup(index, null)}
                                className="shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                              >
                                Ganti
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Langkah varian: pakaian = Warna, Cover & Hanger = PAKET (nama paket +
                            harga + sisa stok). Satu paket pun tetap ditampilkan sebagai chip supaya
                            selalu bisa dipilih/diganti (kalau cuma satu, otomatis terpilih). */}
                        {group && paketOptions(group).length >= 1 && (
                          <div className="space-y-1" ref={paketStepRef}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Paket
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {paketOptions(group).map((paket) => {
                                const sisa = Object.values(paket.sizes || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
                                const habis = sisa <= 0;
                                const aktif = row.warna === paket.color;
                                return (
                                  <button
                                    key={paket.color}
                                    type="button"
                                    disabled={habis}
                                    onClick={() => {
                                      updateRow(index, { warna: paket.color, series: null, variant: "", price: "", priceManual: false });
                                      // Paket tidak punya ukuran — langsung ke Qty.
                                      scrollToStep(qtyStepRef);
                                    }}
                                    className={`px-3 py-2 rounded-xl border-2 text-left transition-colors ${
                                      habis
                                        ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 opacity-60 cursor-not-allowed"
                                        : aktif
                                          ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    }`}
                                  >
                                    <span className={`block text-sm font-bold truncate ${habis ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"}`}>
                                      {paketNameOf(paket)}
                                    </span>
                                    <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                      Rp {formatRupiah(paket.price)}
                                    </span>
                                    <span className={`block text-[11px] font-bold ${habis ? "text-slate-400 dark:text-slate-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                                      {habis ? "stok habis" : `sisa ${sisa}`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Warna: hanya untuk produk pakaian dengan lebih dari satu warna asli */}
                        {group && paketOptions(group).length === 0 && group.warnas.length > 1 && !row.warna && (
                          <div className="space-y-1" ref={colorStepRef}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {isPaketKategori(group.category) ? "Varian" : "Warna"}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {group.warnas.map((warna) => (
                                <button
                                  key={warna}
                                  type="button"
                                  onClick={() => {
                                    updateRow(index, { warna, series: null, variant: "", price: "", priceManual: false });
                                    // Warna dipilih → lanjut ke Series (kalau ada) atau Ukuran.
                                    scrollToStep(seriesStep(group.category, group.kain, warna).show ? seriesStepRef : sizeStepRef);
                                  }}
                                  className="px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                  {warna}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 2 · Series (nama + harga + sisa stok; urut seperti Laporan Stok) — dilewati untuk paket */}
                        {group && row.warna && step.show && paketOptions(group).length === 0 && (
                          <div className="space-y-1" ref={seriesStepRef}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Series</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {seriesChoices(row).map((option) => {
                                const active = (row.series || "") === option.series;
                                const soldOut = option.stock <= 0;
                                return (
                                  <button
                                    key={option.series || "tanpa-series"}
                                    type="button"
                                    disabled={soldOut}
                                    onClick={() => {
                                      updateRow(index, { series: option.series, variant: "", price: "", priceManual: false });
                                      // Series selesai → lanjut ke Ukuran.
                                      scrollToStep(sizeStepRef);
                                    }}
                                    className={`px-3 py-2 rounded-xl border-2 text-left transition-colors ${
                                      active
                                        ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white"
                                        : soldOut
                                          ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 opacity-60 cursor-not-allowed"
                                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    }`}
                                  >
                                    <span
                                      className={`block text-sm font-bold truncate ${
                                        active
                                          ? "text-white dark:text-slate-900"
                                          : soldOut
                                            ? "text-slate-400 dark:text-slate-500"
                                            : "text-slate-900 dark:text-white"
                                      }`}
                                    >
                                      {option.series || "Tanpa series"}
                                    </span>
                                    <span
                                      className={`block text-[11px] font-semibold ${
                                        active ? "text-white/80 dark:text-slate-700" : "text-slate-500 dark:text-slate-400"
                                      }`}
                                    >
                                      Rp {formatRupiah(option.price)}
                                    </span>
                                    <span
                                      className={`block text-[11px] font-bold ${
                                        active
                                          ? "text-white/80 dark:text-slate-700"
                                          : soldOut
                                            ? "text-slate-400 dark:text-slate-500"
                                            : "text-emerald-600 dark:text-emerald-400"
                                      }`}
                                    >
                                      {soldOut ? "stok habis" : `sisa ${option.stock}`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 3 · Ukuran (stok per ukuran = stock_efektif, jadi pengikut ikut induknya)
                            — TIDAK berlaku untuk paket (Cover & Hanger): tidak ada ukuran. */}
                        {info.product && !info.paket && (
                          <div className="space-y-1" ref={sizeStepRef}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ukuran</p>
                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                              {info.options.map((option) => {
                                const active = row.variant === option.value;
                                const soldOut = option.stock <= 0;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    disabled={soldOut}
                                    onClick={() => {
                                      updateRow(index, { variant: option.value, price: "", priceManual: false });
                                      // Ukuran dipilih → lanjut ke Qty/harga.
                                      scrollToStep(qtyStepRef);
                                    }}
                                    className={`px-2 py-2 rounded-xl border-2 text-center transition-colors ${
                                      active
                                        ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white"
                                        : soldOut
                                          ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 opacity-60 cursor-not-allowed"
                                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    }`}
                                  >
                                    <span
                                      className={`block text-sm font-bold ${
                                        active
                                          ? "text-white dark:text-slate-900"
                                          : soldOut
                                            ? "text-slate-400 dark:text-slate-500"
                                            : "text-slate-900 dark:text-white"
                                      }`}
                                    >
                                      {option.size}
                                    </span>
                                    <span
                                      className={`block text-[10px] font-bold ${
                                        active
                                          ? "text-white/80 dark:text-slate-700"
                                          : soldOut
                                            ? "text-slate-400 dark:text-slate-500"
                                            : "text-slate-500 dark:text-slate-400"
                                      }`}
                                    >
                                      {soldOut ? "habis" : `sisa ${option.stock}`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 4 · Qty (maksimal = stok efektif varian yang dipilih) */}
                        {info.chosen && (
                          <div className="space-y-1" ref={qtyStepRef}>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Jumlah</p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateRow(index, { quantity: Math.max(1, quantity - 1) })}
                                disabled={quantity <= 1}
                                className="w-9 h-9 grid place-items-center rounded-xl border-2 border-slate-200 dark:border-slate-700 text-lg font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                                aria-label="Kurangi jumlah"
                              >
                                −
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={row.quantity}
                                onChange={(event) => updateRow(index, { quantity: clampQty(digits(event.target.value), maxStock) })}
                                aria-label="Jumlah"
                                className={`${inputClass} w-16 text-center`}
                              />
                              <button
                                type="button"
                                onClick={() => updateRow(index, { quantity: Math.min(maxStock, quantity + 1) })}
                                disabled={quantity >= maxStock}
                                className="w-9 h-9 grid place-items-center rounded-xl border-2 border-slate-200 dark:border-slate-700 text-lg font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                                aria-label="Tambah jumlah"
                              >
                                +
                              </button>
                              <span
                                className={`text-[11px] font-bold ${
                                  quantity >= maxStock ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"
                                }`}
                              >
                                {quantity >= maxStock ? `Stok tersisa ${maxStock}` : `Maks ${maxStock} pcs`}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* 5 · Harga satuan. Kosong = harga katalog produk; kalau admin mengetik,
                            harga itu yang dipakai di subtotal pesanan & seluruh angka pembukuan
                            (omset, laba, Produk Terlaris) — bukan harga katalog. */}
                        {info.chosen && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Harga</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="relative w-36">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-semibold text-sm">Rp</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={row.price}
                                  onChange={(event) => updateRow(index, { price: digits(event.target.value), priceManual: true })}
                                  placeholder={String(info.chosen.price)}
                                  aria-label="Harga satuan"
                                  data-invalid={row.priceManual && manualPrice(row.price) === null ? "true" : undefined}
                                  className={`${inputClass} pl-10`}
                                />
                              </div>
                              {row.priceManual ? (
                                <button
                                  type="button"
                                  onClick={() => updateRow(index, { price: "", priceManual: false })}
                                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  Pakai harga katalog
                                </button>
                              ) : (
                                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                  Harga katalog Rp {formatRupiah(info.chosen.price)}
                                </span>
                              )}
                            </div>
                            {row.priceManual && manualPrice(row.price) !== null ? (
                              <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                Harga manual Rp {formatRupiah(info.unitPrice)} / pcs · katalog Rp {formatRupiah(info.chosen.price)}
                              </p>
                            ) : null}
                            {row.priceManual && manualPrice(row.price) !== null && info.chosen.hpp > 0 && info.unitPrice < info.chosen.hpp ? (
                              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                Di bawah HPP (Rp {formatRupiah(info.chosen.hpp)}) — labanya negatif, pastikan memang begitu.
                              </p>
                            ) : null}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {info.chosen
                              ? `Rp ${formatRupiah(info.unitPrice)} / pcs${row.priceManual ? " (harga manual)" : ""} · subtotal Rp ${formatRupiah(info.subtotal)}`
                              : info.product
                                ? info.paket ? "Isi Qty di bawah" : "Pilih ukuran dulu"
                                : group
                                  ? paketOptions(group).length > 0
                                    ? "Pilih paket di atas"
                                    : step.show
                                      ? "Pilih series di atas"
                                      : "Pilih ukuran di atas"
                                  : "Cari & pilih produk di atas"}
                            {info.chosen?.linkedTo ? ` · stok mengikuti ${info.chosen.linkedTo}` : ""}
                          </p>
                          {info.issue ? (
                            <p
                              className={`text-xs font-bold ${
                                info.chosen ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500"
                              }`}
                            >
                              {info.issue}
                            </p>
                          ) : null}
                        </div>

                      </div>
                    );
                  })}
                </div>

                {/* Aksi baris DI LUAR daftar item dan menempel di bawah area scroll drawer,
                    jadi "Simpan produk" selalu kelihatan tanpa scroll ke dalam baris. */}
                <div className="sticky bottom-0 z-10 flex items-center gap-2 bg-white/95 dark:bg-[#1a1d28]/95 backdrop-blur pt-2 pb-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={addRow}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-bold rounded-xl transition-all ${
                      isEdit
                        ? "border-2 border-slate-900 dark:border-slate-100 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800"
                        : "border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Plus size={15} /> Tambah produk
                  </button>
                  {openIndex >= 0 &&
                  rowComplete(items[openIndex]) &&
                  rowInfo[openIndex]?.chosen &&
                  !rowInfo[openIndex]?.issue ? (
                    <button
                      type="button"
                      onClick={() => saveRow(openIndex)}
                      className="ml-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
                    >
                      <Save size={15} /> Simpan produk
                    </button>
                  ) : null}
                </div>
              </section>
                </>
              )}

              {/* ── Langkah 3: Pembayaran ── */}
              {step === 2 && (
                <>
              {/* Ongkir & diskon */}
              <section className="space-y-2.5">
                <h4 className={sectionClass}>Ongkir &amp; Diskon</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Ongkir</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-semibold text-sm">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.shipping_cost}
                        onChange={(event) => {
                          // Edit manual = pilihan layanan dilepas (tarif bisa sama antar layanan).
                          setSelectedService("");
                          updateForm({ shipping_cost: digits(event.target.value) });
                        }}
                        placeholder="0"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={checkOngkir}
                      disabled={ongkir.status === "loading"}
                      className={`mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-bold disabled:opacity-60 disabled:cursor-wait transition-colors ${
                        isPanelForm
                          ? "border-[#f3c7d6] dark:border-rose-900/50 text-[#c2255c] dark:text-rose-300 hover:bg-[#fdf3f7] dark:hover:bg-rose-900/20"
                          : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {ongkir.status === "loading" ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Truck size={15} />
                      )}
                      {ongkir.status === "loading" ? "Menghitung ongkir…" : "Cek Ongkir J&T"}
                    </button>
                  </div>
                  <div>
                    <label className={labelClass}>Diskon (opsional)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-semibold text-sm">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.discount}
                        onChange={(event) => updateForm({ discount: digits(event.target.value) })}
                        placeholder="0"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                  </div>
                </div>

                {ongkirStale && (
                  <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    Ongkir mungkin berubah, cek ulang
                  </p>
                )}

                {ongkir.status === "error" && (
                  <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">{ongkir.error}</p>
                )}

                {/* Hasil tarif dibuat full-width (bukan di dalam kolom input) supaya nama
                    layanan, estimasi, dan harga tidak berdesakan/terpotong. */}
                {ongkir.status === "done" && ongkir.services.length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                      <Truck size={15} className={`mt-0.5 shrink-0 ${isPanelForm ? "text-[#c2255c]" : "text-slate-500 dark:text-slate-400"}`} />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Berat kirim
                        </p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {formatWeightExact(ongkir.weightGrams)}
                        </p>
                        {ongkir.destination ? (
                          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate" title={ongkir.destination}>
                            Tujuan {ongkir.destination}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[220px] overflow-y-auto no-scrollbar">
                      {ongkir.services.map((service) => {
                        const key = `${service.service}|${service.cost}`;
                        const active = selectedService === key;
                        const detail = [service.description, service.etd ? `Estimasi ${service.etd}${/hari/i.test(service.etd) ? "" : " hari"}` : ""]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => applyOngkir(service)}
                            aria-pressed={active}
                            className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                              active
                                ? isPanelForm
                                  ? "bg-[#fdf3f7] dark:bg-rose-900/20"
                                  : "bg-slate-100 dark:bg-slate-800"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                          >
                            <span
                              className={`grid place-items-center w-5 h-5 shrink-0 rounded-full border-2 transition-colors ${
                                active
                                  ? isPanelForm
                                    ? "border-[#c2255c] bg-[#c2255c] text-white"
                                    : "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                                  : "border-slate-300 dark:border-slate-600 text-transparent"
                              }`}
                            >
                              <Check size={12} strokeWidth={3} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">
                                {service.service}
                              </span>
                              {detail ? (
                                <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                                  {detail}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-sm font-black text-slate-900 dark:text-white whitespace-nowrap">
                              Rp {formatRupiah(service.cost)}
                            </span>
                          </button>
                        );
                      })}
                      {/* HBO tidak ada di Tariff Check: pesanannya dibuat admin di J&T VIP. */}
                      {(() => {
                        const active = selectedService === "J&T HBO|";
                        return (
                          <button
                            type="button"
                            onClick={() => applyOngkir({ service: "J&T HBO", manual: true })}
                            aria-pressed={active}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                          >
                            <span
                              className={`shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full border-2 transition-all ${
                                active
                                  ? isPanelForm
                                    ? "border-[#c2255c] bg-[#c2255c] text-white"
                                    : "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                                  : "border-slate-300 dark:border-slate-600 text-transparent"
                              }`}
                            >
                              <Check size={12} strokeWidth={3} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">
                                J&amp;T HBO
                              </span>
                              <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                                Dibuat manual di J&amp;T VIP — isi ongkir manual
                              </span>
                            </span>
                          </button>
                        );
                      })()}
                    </div>
                    <p className="px-3.5 py-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                      Pilih layanan untuk mengisi ongkir otomatis. Nominalnya masih bisa diedit.
                    </p>
                  </div>
                )}

                {ongkir.status === "done" && ongkir.services.length === 0 && ongkir.error && (
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{ongkir.error}</p>
                )}
              </section>

              {/* Status pembayaran: menentukan server menulis "Lunas" (status diproses) atau
                  "Belum Lunas" (status pending, di luar omset + invoice WA otomatis).
                  Hanya untuk transaksi baru — status transaksi yang sudah tercatat diubah
                  lewat tombol "Tandai Lunas" di detail transaksi. */}
              {!isEdit ? (
                <section className="space-y-2">
                  <h4 className={sectionClass}>Status Pembayaran</h4>
                  {/* Segmented control: pilihan aktif solid + ikon, jadi tidak cuma beda border tipis. */}
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                    {[
                      { value: "paid", label: "Lunas", icon: Check },
                      { value: "unpaid", label: "Belum Lunas", icon: Clock },
                    ].map((opsi) => {
                      const active = (form.payment_status || "paid") === opsi.value;
                      const Icon = opsi.icon;
                      return (
                        <button
                          key={opsi.value}
                          type="button"
                          onClick={() => updateForm({ payment_status: opsi.value })}
                          aria-pressed={active}
                          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
                            active
                              ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                              : "text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700"
                          }`}
                        >
                          <Icon size={15} />
                          {opsi.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {form.payment_status === "unpaid"
                      ? "Belum ikut dihitung sebagai omset sampai ditandai lunas. Invoice berisi nomor rekening otomatis dikirim ke WA pembeli saat Simpan."
                      : "Transaksi langsung dianggap lunas dan masuk ke omset."}
                  </p>
                </section>
              ) : (
                /* Mode Ubah: status pembayaran hanya ditampilkan (tidak diminta ulang).
                   Perubahannya tetap lewat tombol "Tandai Lunas" di detail transaksi. */
                <section className="space-y-2">
                  <h4 className={sectionClass}>Status Pembayaran</h4>
                  <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3.5 py-3">
                    {form.payment_status === "unpaid" ? (
                      <Clock size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Check size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {form.payment_status === "unpaid" ? "Belum Lunas" : "Lunas"}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        Status ini sudah tercatat di pesanan. Kalau berubah, ubah lewat tombol “Tandai Lunas” di detail transaksi.
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Catatan */}
              <section className="space-y-2">
                <h4 className={sectionClass}>Catatan</h4>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(event) => updateForm({ notes: event.target.value })}
                  placeholder="Catatan transaksi (opsional)"
                  className={inputClass}
                />
              </section>

              {/* Ringkasan transaksi */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pelanggan</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{form.customer_name || "-"}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{form.customer_whatsapp || "nomor belum ada"}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {SOURCE_LABEL[form.source]}
                  </span>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-2 text-xs">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">{form.address || "Alamat belum diisi"}</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {[form.kecamatan, form.city, form.province, form.postal_code].filter(Boolean).join(", ")}
                  </p>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
                  {items.map((row, index) => {
                    const info = rowInfo[index];
                    if (!info?.chosen) return null;
                    const seri = seriesStep(row.category, row.kain, row.warna);
                    const group = groupOf(row);
                    // Sama persis dengan baris ringkasan di langkah Produk: nama produk lengkap,
                    // jenis kain, series, (warna kalau produknya multi-warna), lalu ukuran.
                    const labelParts = itemSummaryParts({
                      product: group?.name || row.product,
                      kain: row.kain,
                      series: seri.show ? row.series : "",
                      color: isPaketEntry(row)
                        ? paketNameOf(info.chosen) || row.warna
                        : group && group.warnas.length > 1
                          ? row.warna
                          : "",
                      size: isPaketEntry(row) ? "" : info.chosen.size,
                    });
                    const label = labelParts.join(" · ");
                    const weightMissing = info.unitWeight.source === "missing";
                    return (
                      <div key={index} className="flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <span
                            className="block leading-snug font-bold text-slate-900 dark:text-white"
                            title={label}
                          >
                            {labelParts[0]}
                            {labelParts.length > 1 ? (
                              <span className="font-semibold text-slate-500 dark:text-slate-400"> · {labelParts.slice(1).join(" · ")}</span>
                            ) : null}
                          </span>
                          {/* Berat per item — label eksplisit, bukan angka yang ditempel di baris lain. */}
                          <span className="mt-0.5 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            Berat:{" "}
                            <b className={weightMissing ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-200"}>
                              {weightMissing ? "belum diisi" : formatWeightExact(info.unitWeight.grams)}
                            </b>
                            {info.unitWeight.source === "product" ? (
                              <span className="font-bold text-amber-600 dark:text-amber-400"> · fallback berat produk</span>
                            ) : null}
                          </span>
                        </div>
                        <span className="shrink-0 text-slate-900 dark:text-white font-semibold whitespace-nowrap">
                          x{info.quantity} · Rp {formatRupiah(info.subtotal)}
                          {row.priceManual ? " (harga manual)" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1 text-sm">
                  {/* Total berat semua item — gram apa adanya, kg cuma pelengkap.
                      Item yang beratnya belum diisi ditandai, tidak ditutupi angka default. */}
                  {rowInfo.some((info) => info.chosen) ? (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500 dark:text-slate-400">Total berat</span>
                      <span className="text-right font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {weightSummary.grams > 0 ? formatWeightExact(weightSummary.grams) : "-"}
                        {weightSummary.missingQty > 0 ? (
                          <span className="block text-[11px] font-bold text-amber-600 dark:text-amber-400">
                            {weightSummary.missingQty} item belum ada berat
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                    <span className="font-semibold text-slate-900 dark:text-white">Rp {formatRupiah(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Ongkir</span>
                    <span className="font-semibold text-slate-900 dark:text-white">Rp {formatRupiah(shippingValue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Diskon</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      - Rp {formatRupiah(Math.min(discountValue, subtotal))}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">Total</span>
                  <span className="text-base font-black font-heading text-slate-900 dark:text-white whitespace-nowrap">
                    Rp {formatRupiah(total)}
                  </span>
                </div>
              </section>
                </>
              )}

                </>
              )}

              {/* Tombol simpan untuk Enter; tombol aslinya ada di footer yang menempel */}
              <button type="submit" className="hidden" aria-hidden="true" />
            </form>

            {/* Footer menempel: Total di kiri, aksi di kanan — tidak ikut ter-scroll */}
            <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28] px-5 sm:px-6 py-3.5">
              {(step === 1 && stockIssues.length > 0) || saveError ? (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 mb-2" role="alert">
                  <AlertCircle size={13} className="mt-px shrink-0" />
                  <span className="line-clamp-2">
                    {saveError || stockIssues[0]}
                    {!saveError && stockIssues.length > 1 ? ` (+${stockIssues.length - 1} lainnya)` : ""}
                  </span>
                </p>
              ) : null}

              {/* Mode Ubah: ringkasan perubahan singkat sebelum menyimpan (hanya tampilan). */}
              {!savedOrder && changeSummary ? (
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  {changeSummary}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total</p>
                  <p className="text-lg font-black font-heading text-slate-900 dark:text-white whitespace-nowrap">
                    Rp {formatRupiah(total)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Sudah tersimpan → footer cukup satu aksi: tutup panel (aksinya pindah ke
                      panel "Transaksi tercatat" yang berisi Buat Resi & Cetak Resi). */}
                  {savedOrder ? (
                    <>
                      {/* Selesai simpan, admin biasanya langsung input transaksi berikutnya.
                          Tombol ini mengosongkan form lewat efek reset yang sama (drawer tetap
                          terbuka, tanpa reload dan tanpa menampilkan data transaksi lama). */}
                      {/* Tombol ini hanya untuk transaksi BARU: kalau tadi menyimpan perubahan
                          (Ubah), mengosongkan form justru membingungkan. */}
                      {!savedOrder.isEdit ? (
                        <button
                          type="button"
                          onClick={() => setResetKey((k) => k + 1)}
                          className="px-4 py-2.5 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
                        >
                          Tambah transaksi lagi
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
                      >
                        Tutup
                      </button>
                    </>
                  ) : (
                    <>
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={goBack}
                      className="px-4 py-2.5 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
                    >
                      Kembali
                    </button>
                  )}

                  {isEdit ? (
                    /* Mode Ubah: simpan bisa ditekan dari langkah mana pun — data pesanan
                       sudah terisi, validasi tetap sama seperti simpan biasa. */
                    <button
                      type="button"
                      onClick={save}
                      disabled={mutation.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-all"
                    >
                      <Save size={16} />
                      {mutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
                    </button>
                  ) : step < 2 ? (
                    <button
                      type="button"
                      onClick={goNext}
                      className={`px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all ${
                        stepReady[step] ? "" : "opacity-60"
                      }`}
                      title={stepReady[step] ? undefined : "Lengkapi isian wajib di langkah ini dulu"}
                    >
                      Lanjut
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={save}
                      disabled={mutation.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-all"
                    >
                      <Save size={16} />
                      {mutation.isPending ? "Menyimpan..." : "Simpan Transaksi"}
                    </button>
                  )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Konfirmasi tutup: isian belum disimpan tidak hilang karena salah klik */}
            <AnimatePresence>
              {confirmClose && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 bg-white/80 dark:bg-[#1a1d28]/80 backdrop-blur-sm flex items-center justify-center p-5"
                  onClick={() => setConfirmClose(false)}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28] p-5 shadow-xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <h4 className="font-heading font-bold text-slate-900 dark:text-white">Isian belum disimpan</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Tutup drawer dan buang isian transaksi ini?
                    </p>
                    <div className="flex gap-2 mt-4">
                      <button
                        type="button"
                        onClick={() => setConfirmClose(false)}
                        className="flex-1 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
                      >
                        Lanjut isi
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmClose(false);
                          setTouched(false);
                          onClose();
                        }}
                        className="flex-1 px-4 py-2.5 border-2 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                      >
                        Buang &amp; tutup
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
