"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, Plus } from "lucide-react";
// Gaya form Buat Pesanan portal (seluruhnya di-scope `.rs-root`, jadi tidak memengaruhi bagian lain halaman).
import "@/app/(internal)/reseller/reseller.css";
import type { KatalogProduct, ShippingOption } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import { AdminApiError, opsResellerApi, type AdminBalance, type AdminOrderResult, type ResellerAdminRow } from "./api";
import { Modal } from "./Modal";
import ItemCard from "../order/ItemCard";
import OngkirCards from "../order/OngkirCards";
import OrderStepper from "../order/OrderStepper";
import PenerimaForm from "../order/PenerimaForm";
import ProdukPicker from "../order/ProdukPicker";
import ProductPhoto from "../ProductPhoto";
import SavedAddresses from "./SavedAddresses";
import { addressToForm } from "@/lib/reseller/addresses";
import { Note, SkeletonRows } from "../ui";
import {
  createOrderLine,
  EMPTY_ADDRESS,
  lineKey,
  lineProfit,
  lineSubtotal,
  type AddressValue,
  type OrderLine,
} from "../order/types";

type Mode = "otomatis" | "menyusul";
type PickerState = { mode: "add" } | { mode: "replace"; uid: string } | null;

/**
 * Buat Pesanan atas nama reseller (admin ops & panel admin).
 *
 * Alur 3 langkah seperti portal: Reseller & Produk -> Penerima -> Kirim. Memakai komponen form portal
 * yang sama (pemilih produk, kartu item, form penerima, kartu ongkir). Harga, diskon, batas harga jual,
 * saldo, kekurangan, ongkir, dan nomor EP- TIDAK dihitung di sini: semuanya dihitung ulang di server oleh
 * fungsi yang sama dengan portal (`createResellerOrder`); angka di layar hanya pratinjau.
 */
export default function BuatPesananTab({
  resellers,
  initialResellerId = "",
  onCreated,
  onGoRiwayat,
}: {
  resellers: ResellerAdminRow[];
  /** Reseller yang sudah terpilih (tombol "Buat Pesanan" per baris di Data Reseller). */
  initialResellerId?: string;
  /** Dipanggil setelah pesanan tersimpan (muat ulang saldo/ringkasan halaman). */
  onCreated: () => void;
  onGoRiwayat: () => void;
}) {
  // Hanya reseller berstatus Aktif yang bisa dipilih (server juga menolak yang lain).
  const activeResellers = useMemo(() => resellers.filter((row) => row.status === "active"), [resellers]);

  const [resellerId, setResellerId] = useState(
    activeResellers.some((row) => row.id === initialResellerId) ? initialResellerId : ""
  );
  const [products, setProducts] = useState<KatalogProduct[] | null>(null);
  const [saldo, setSaldo] = useState<AdminBalance | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  // Dinaikkan saat alamat tersimpan dipilih: form penerima dibuka ulang (tab "Isi manual") dengan isian terisi.
  const [penerimaKey, setPenerimaKey] = useState(0);
  const [mode, setMode] = useState<Mode>("otomatis");
  const [shipping, setShipping] = useState<ShippingOption | null>(null);
  const [showLabel, setShowLabel] = useState(false);
  const [step, setStep] = useState(0);
  const [picker, setPicker] = useState<PickerState>({ mode: "add" });
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [duplicateMessage, setDuplicateMessage] = useState("");
  const [result, setResult] = useState<AdminOrderResult | null>(null);
  // Cegah dobel submit: kunci sinkron (state saja bisa terlambat satu render kalau tombol diklik cepat).
  const inflight = useRef(false);

  const reseller = activeResellers.find((row) => row.id === resellerId) || null;

  // Ganti reseller = katalog & harga beda (diskon per reseller), jadi produk dikosongkan dan katalog dimuat ulang.
  useEffect(() => {
    setProducts(null);
    setSaldo(null);
    setCatalogError("");
    setLines([]);
    setShipping(null);
    setPicker({ mode: "add" });
    setOpenUid(null);
    if (!resellerId) return;
    let alive = true;
    opsResellerApi
      .orderKatalog(resellerId)
      .then((res) => {
        if (!alive) return;
        setProducts(res.data);
        setSaldo(res.saldo);
      })
      .catch((e) => alive && setCatalogError(e instanceof AdminApiError ? e.message : "Gagal memuat katalog."));
    return () => {
      alive = false;
    };
  }, [resellerId]);

  const addLine = useCallback((line: OrderLine) => {
    setLines((prev) => {
      const existing = prev.find((item) => item.key === line.key);
      if (existing) {
        return prev.map((item) =>
          item.key === line.key ? { ...item, quantity: Math.min(item.stock, item.quantity + line.quantity) } : item
        );
      }
      return [...prev, line];
    });
  }, []);

  const pickProduct = useCallback(
    (product: KatalogProduct) => {
      const line = createOrderLine(product);
      if (!line) return;
      if (picker?.mode === "replace") {
        const target = picker.uid;
        setLines((prev) => prev.map((item) => (item.uid === target ? { ...line, uid: target } : item)));
        setOpenUid(target);
      } else {
        const existing = lines.find((item) => item.key === line.key);
        addLine(line);
        setOpenUid(existing?.uid || line.uid);
      }
      setPicker(null);
    },
    [addLine, lines, picker]
  );

  const updateLine = useCallback((uid: string, patch: Partial<OrderLine>) => {
    setLines((prev) => prev.map((line) => (line.uid === uid ? { ...line, ...patch } : line)));
  }, []);

  const changeVariant = useCallback((uid: string, patch: { color?: string; size?: string }) => {
    setLines((prev) => {
      const current = prev.find((line) => line.uid === uid);
      if (!current) return prev;
      const color = patch.color ?? current.color;
      const variants = current.product.variants.filter((variant) => variant.color === color);
      let size = patch.size ?? current.size;
      const chosen = variants.find((variant) => variant.size === size);
      if (!chosen || chosen.stock < 1) {
        const available = variants.find((variant) => variant.stock > 0);
        if (!available) return prev;
        size = available.size;
      }
      const variant = variants.find((row) => row.size === size);
      const stock = Math.max(0, variant?.stock || 0);
      const next: OrderLine = {
        ...current,
        color,
        size,
        stock,
        quantity: Math.min(Math.max(1, current.quantity), Math.max(1, stock)),
        key: lineKey(current.product.id, color, size),
      };
      const duplicate = prev.find((line) => line.uid !== uid && line.key === next.key);
      if (duplicate) {
        return prev
          .filter((line) => line.uid !== uid)
          .map((line) =>
            line.uid === duplicate.uid ? { ...line, quantity: Math.min(line.stock, line.quantity + next.quantity) } : line
          );
      }
      return prev.map((line) => (line.uid === uid ? next : line));
    });
  }, []);

  const removeLine = useCallback((uid: string) => setLines((prev) => prev.filter((line) => line.uid !== uid)), []);

  const patchAddress = useCallback((patch: Partial<AddressValue>) => {
    setAddress((prev) => ({ ...prev, ...patch }));
    if (patch.city !== undefined || patch.district !== undefined) setShipping(null);
  }, []);

  const shippingItems = useMemo(
    () =>
      lines.map((line) => ({
        product_id: line.product.id,
        color: line.color,
        size: line.size,
        quantity: line.quantity,
      })),
    [lines]
  );

  /* ── Validasi (aturan sama dengan form portal; server tetap memeriksa ulang semuanya) ── */
  const priceValid = lines.every((line) => Number.isFinite(line.sellPrice) && line.sellPrice >= line.product.min_sell_price);
  const addressValid =
    Boolean(address.name.trim()) &&
    address.whatsapp.replace(/\D/g, "").length >= 9 &&
    Boolean(address.province) &&
    Boolean(address.city) &&
    Boolean(address.district) &&
    Boolean(address.address.trim());
  const productsComplete = lines.length > 0 && lines.every((line) => Boolean(line.size)) && priceValid;

  const subtotal = lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
  const profit = lines.reduce((sum, line) => sum + lineProfit(line), 0);
  const shippingCost = mode === "otomatis" ? shipping?.cost ?? 0 : 0;
  const total = subtotal + shippingCost;
  const saldoNow = saldo?.saldo_tersedia ?? 0;
  const deducted = Math.min(Math.max(saldoNow, 0), total);
  const shortfall = Math.max(0, total - deducted);
  // Ongkir menyusul: saldo reseller WAJIB cukup untuk produk (aturan yang sama dengan fungsi database).
  const saldoKurangMenyusul = mode === "menyusul" && saldoNow < subtotal;
  const shippingComplete = mode === "menyusul" ? !saldoKurangMenyusul : Boolean(shipping);
  const canSubmit = Boolean(reseller) && Boolean(saldo) && productsComplete && addressValid && shippingComplete;

  const reason = !reseller
    ? "Pilih reseller dulu."
    : !lines.length
      ? "Tambahkan produk dulu."
      : lines.some((line) => !line.size)
        ? "Pilih ukuran dulu."
        : !priceValid
          ? "Harga jual di bawah batas minimal."
          : !address.name.trim()
            ? "Lengkapi nama penerima."
            : address.whatsapp.replace(/\D/g, "").length < 9
              ? "Lengkapi WhatsApp penerima."
              : !address.address.trim() || !address.province || !address.city || !address.district
                ? "Lengkapi alamat penerima."
                : saldoKurangMenyusul
                  ? `Saldo reseller (${rupiah(saldoNow)}) kurang untuk produk (${rupiah(subtotal)}). Top up dulu atau pakai ongkir otomatis.`
                  : mode === "otomatis" && !shipping
                    ? "Pilih layanan pengiriman."
                    : "";

  const stepDone = [productsComplete && Boolean(reseller), addressValid, shippingComplete];
  const stepReason =
    step === 0
      ? !reseller
        ? "Pilih reseller dulu."
        : !lines.length
          ? "Tambahkan produk dulu."
          : lines.some((line) => !line.size)
            ? "Pilih ukuran dulu."
            : !priceValid
              ? "Harga jual di bawah batas minimal."
              : ""
      : step === 1
        ? !address.name.trim()
          ? "Lengkapi nama penerima."
          : address.whatsapp.replace(/\D/g, "").length < 9
            ? "Lengkapi WhatsApp penerima."
            : !address.address.trim() || !address.province || !address.city || !address.district
              ? "Lengkapi alamat penerima."
              : ""
        : reason;
  const nextDisabled = step === 0 ? !(productsComplete && reseller) : !addressValid;

  const stepHints = [
    reseller ? `${reseller.store_name}${lines.length ? ` · ${lines.length} item` : ""}` : "Pilih reseller",
    address.name.trim() ? address.name.trim() : "Belum diisi",
    mode === "menyusul"
      ? "Ongkir menyusul"
      : shipping
        ? `${String(shipping.serviceCode || "").toUpperCase() === "ECO" ? "ECO" : "EZ"} · ${rupiah(shipping.cost)}`
        : "Pilih layanan",
  ];

  const submit = async (confirmDuplicate = false) => {
    if (!canSubmit || !reseller || inflight.current) return;
    inflight.current = true;
    setSubmitting(true);
    setSubmitError("");
    setDuplicateMessage("");
    try {
      const res = await opsResellerApi.createOrder({
        reseller_id: reseller.id,
        items: lines.map((line) => ({
          product_id: line.product.id,
          color: line.color,
          size: line.size,
          quantity: line.quantity,
          sell_price: line.sellPrice,
        })),
        customer: { name: address.name.trim(), whatsapp: address.whatsapp.trim() },
        shipping: {
          address: address.address.trim(),
          city: address.city,
          district: address.district,
          province: address.province || undefined,
          postalCode: address.postalCode || undefined,
          notes: address.notes || undefined,
          method: mode === "otomatis" ? shipping?.service : undefined,
          cost: mode === "otomatis" ? shipping?.cost : undefined,
        },
        mode,
        show_reseller_name_on_label: showLabel,
        ...(confirmDuplicate ? { confirm_duplicate: true } : {}),
      });
      setResult(res);
      setConfirmOpen(false);
      onCreated();
    } catch (e) {
      if (e instanceof AdminApiError && e.code === "possible_duplicate") {
        setDuplicateMessage(e.message);
      } else {
        setSubmitError(e instanceof AdminApiError ? e.message : "Gagal membuat pesanan. Coba lagi.");
      }
    } finally {
      inflight.current = false;
      setSubmitting(false);
    }
  };

  const openConfirm = () => {
    if (!canSubmit) return;
    setSubmitError("");
    setDuplicateMessage("");
    setConfirmOpen(true);
  };

  const resetForm = () => {
    setResult(null);
    setLines([]);
    setAddress(EMPTY_ADDRESS);
    setShipping(null);
    setMode("otomatis");
    setShowLabel(false);
    setSubmitError("");
    setDuplicateMessage("");
    setStep(0);
    setPicker({ mode: "add" });
    setOpenUid(null);
    // Saldo berubah setelah pesanan: muat ulang katalog + saldo reseller yang sama.
    if (resellerId) {
      setSaldo(null);
      opsResellerApi.orderKatalog(resellerId).then((res) => {
        setProducts(res.data);
        setSaldo(res.saldo);
      }).catch(() => setCatalogError("Gagal memuat ulang katalog."));
    }
  };

  /* ── Sukses ── */
  if (result) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-[560px] mx-auto text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <Check size={24} strokeWidth={3} />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900">Pesanan berhasil dibuat</h2>
        <p className="text-sm text-slate-500">
          Atas nama <b className="text-slate-800">{reseller?.store_name}</b>. Reseller sudah diberi tahu lewat WhatsApp.
        </p>
        <div className="text-left rounded-xl border border-slate-200 divide-y divide-slate-100 text-[13px]">
          <Row label="Nomor pesanan" value={result.orderNumber} strong />
          <Row label="Total" value={rupiah(result.total)} />
          <Row label="Dipotong dari saldo" value={rupiah(result.balanceDeduction)} />
          {result.shippingPending ? (
            <Row label="Ongkir" value="Menunggu diisi admin" />
          ) : (
            <Row label="Ongkir" value={rupiah(result.shippingCost)} />
          )}
          {result.shortfall > 0 ? <Row label="Kekurangan" value={rupiah(result.shortfall)} warn /> : null}
        </div>
        {result.shippingPending ? (
          <p className="text-[12.5px] text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2 text-left">
            Status <b>Menunggu ongkir</b>: stok ditahan dan saldo terpotong sebesar produk. Isi ongkir lewat tab{" "}
            <b>Riwayat Pesanan</b> → tombol <b>Isi Ongkir</b>; resi belum bisa dibuat sebelum itu.
          </p>
        ) : null}
        {result.shortfall > 0 ? (
          <p className="text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-left">
            Saldo reseller kurang. Pesanan menunggu pembayaran kekurangan (reseller membayar lewat portal, batas 24 jam).
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button type="button" onClick={onGoRiwayat} className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700">
            Lihat di Riwayat Pesanan
          </button>
          <button type="button" onClick={resetForm} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200">
            Buat pesanan lagi
          </button>
        </div>
      </div>
    );
  }

  const stepHead = (index: number, title: string, desc: string) => (
    <div className="order-step-h">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <span className={`step-pill${stepDone[index] ? " ok" : ""}`}>
        {stepDone[index] ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}
        {stepDone[index] ? "Lengkap" : "Belum lengkap"}
      </span>
    </div>
  );

  const ctaText = mode === "menyusul" ? "Tinjau pesanan (ongkir menyusul)" : shortfall > 0 ? `Tinjau pesanan (kurang ${rupiah(shortfall)})` : "Tinjau pesanan";

  return (
    <>
      <div className="rs-root !min-h-0 !bg-transparent">
        <div className="order-page !pb-0">
          <OrderStepper step={step} onStep={setStep} done={stepDone} hints={stepHints} />

          <div className="form-grid">
            <div className="stack">
              {/* Langkah 1: Reseller & Produk */}
              <section className={`card order-step ${step === 0 ? "on" : ""}`}>
                {stepHead(0, "Reseller & produk", "Pilih reseller (hanya yang Aktif), lalu series, ukuran, dan harga jual.")}
                <div className="card-b stack" style={{ gap: 12 }}>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Reseller</label>
                    <select
                      className="w-full px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
                      value={resellerId}
                      onChange={(e) => setResellerId(e.target.value)}
                      aria-label="Pilih reseller"
                    >
                      <option value="">— Pilih reseller —</option>
                      {activeResellers.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.store_name} ({row.owner_name})
                        </option>
                      ))}
                    </select>
                    {reseller ? (
                      <p className="small muted" style={{ marginTop: 6 }}>
                        Harga memakai diskon milik reseller ini
                        {reseller.discount_percent !== null && reseller.discount_percent !== undefined && reseller.discount_percent !== ""
                          ? ` (${Number(reseller.discount_percent)}%)`
                          : " (diskon default)"}
                        {saldo ? ` · saldo ${rupiah(saldo.saldo_tersedia)}` : ""}.
                      </p>
                    ) : null}
                  </div>

                  {!reseller ? (
                    <p className="small muted">Pilih reseller dulu untuk melihat katalog dan harga belinya.</p>
                  ) : catalogError ? (
                    <Note tone="err">{catalogError}</Note>
                  ) : !products ? (
                    <SkeletonRows rows={3} />
                  ) : picker ? (
                    <div className="stack" style={{ gap: 10 }}>
                      <ProdukPicker products={products} lines={lines} onPick={pickProduct} />
                      {lines.length > 0 ? (
                        <button type="button" className="btn ghost sm" onClick={() => setPicker(null)}>
                          Batal
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="stack" style={{ gap: 12 }}>
                      {lines.map((line) => (
                        <ItemCard
                          key={line.uid}
                          line={line}
                          open={openUid === line.uid}
                          onToggle={() => setOpenUid((current) => (current === line.uid ? null : line.uid))}
                          onChange={(patch) => updateLine(line.uid, patch)}
                          onVariant={(patch) => changeVariant(line.uid, patch)}
                          onRemove={() => removeLine(line.uid)}
                          onReplace={() => setPicker({ mode: "replace", uid: line.uid })}
                        />
                      ))}
                      <button type="button" className="add-line" onClick={() => setPicker({ mode: "add" })}>
                        <Plus size={16} aria-hidden="true" />
                        Tambah produk lain
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* Langkah 2: Penerima */}
              <section className={`card order-step ${step === 1 ? "on" : ""}`}>
                {stepHead(1, "Data penerima", "Tempel alamat dari chat customer, atau isi manual.")}
                <div className="card-b stack" style={{ gap: 14 }}>
                  {reseller ? (
                    <SavedAddresses
                      key={reseller.id}
                      resellerId={reseller.id}
                      form={address}
                      formComplete={addressValid}
                      onPick={(saved) => {
                        setAddress(addressToForm(saved));
                        setPenerimaKey((key) => key + 1);
                      }}
                    />
                  ) : null}
                  <PenerimaForm key={penerimaKey} value={address} onChange={patchAddress} detectAddress={opsResellerApi.alamatTebak} />
                </div>
              </section>

              {/* Langkah 3: Kirim */}
              <section className={`card order-step ${step === 2 ? "on" : ""}`}>
                {stepHead(2, "Pengiriman", "Pilih layanan J&T sekarang, atau biarkan ongkir diisi belakangan.")}
                <div className="card-b stack" style={{ gap: 14 }}>
                  <div className="ongkir-grid" role="radiogroup" aria-label="Mode pengiriman">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={mode === "otomatis"}
                      className={`ongkir-card ${mode === "otomatis" ? "on" : ""}`}
                      onClick={() => setMode("otomatis")}
                    >
                      <span className="radio" aria-hidden="true" />
                      <span className="row" style={{ justifyContent: "space-between", gap: 8, width: "100%" }}>
                        <span className="svc">Otomatis</span>
                        <span className="tag">J&T EZ / ECO</span>
                      </span>
                      <span className="nm">Pilih layanan sekarang</span>
                      <span className="small muted">Ongkir dihitung dari berat dan langsung dipotong dari saldo (tanpa diskon).</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={mode === "menyusul"}
                      className={`ongkir-card ${mode === "menyusul" ? "on" : ""}`}
                      onClick={() => {
                        setMode("menyusul");
                        setShipping(null);
                      }}
                    >
                      <span className="radio" aria-hidden="true" />
                      <span className="row" style={{ justifyContent: "space-between", gap: 8, width: "100%" }}>
                        <span className="svc">Menyusul</span>
                        <span className="tag">Diisi admin</span>
                      </span>
                      <span className="nm">Ongkir menyusul</span>
                      <span className="small muted">
                        Stok ditahan, saldo dipotong sebesar produk. Resi belum bisa dibuat sampai ongkir diisi.
                      </span>
                    </button>
                  </div>

                  {mode === "otomatis" ? (
                    <OngkirCards
                      city={address.city}
                      district={address.district}
                      items={shippingItems}
                      selected={shipping}
                      onSelect={setShipping}
                      fetchOngkir={opsResellerApi.orderOngkir}
                    />
                  ) : (
                    <Note tone={saldoKurangMenyusul ? "err" : "warn"}>
                      {saldoKurangMenyusul ? (
                        <>
                          <b>Saldo reseller kurang untuk produk.</b> Saldo {rupiah(saldoNow)}, produk {rupiah(subtotal)}. Top up dulu atau pakai ongkir otomatis.
                        </>
                      ) : (
                        <>
                          Ongkir diisi admin belakangan lewat <b>Riwayat Pesanan → Isi Ongkir</b>. Pesanan tidak dibatalkan otomatis
                          selama menunggu ongkir.
                        </>
                      )}
                    </Note>
                  )}

                  <label className="switch-row">
                    <span className="switch-txt">
                      <b>Tampilkan nama toko reseller di label</b>
                      <small>Nama pengirim di J&T tetap SAMAQU.</small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="switch"
                      checked={showLabel}
                      onChange={(e) => setShowLabel(e.target.checked)}
                    />
                  </label>
                </div>
              </section>

              <div className="step-nav">
                {step > 0 ? (
                  <button type="button" className="btn ghost" onClick={() => setStep((current) => Math.max(0, current - 1))}>
                    <ArrowLeft size={16} aria-hidden="true" />
                    Kembali
                  </button>
                ) : (
                  <span />
                )}
                {step < 2 ? (
                  <div className="step-nav-next">
                    {nextDisabled && stepReason ? <span className="step-nav-hint">{stepReason}</span> : null}
                    <button
                      type="button"
                      className="btn"
                      disabled={nextDisabled}
                      onClick={() => setStep((current) => Math.min(2, current + 1))}
                    >
                      Lanjut
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Ringkasan: total, saldo, dan kekurangan SEBELUM konfirmasi */}
            <div>
              <div className="card review">
                <div className="card-h">
                  <h2>Ringkasan pesanan</h2>
                  <span className="small muted">{lines.length} item</span>
                </div>
                <div className="card-b">
                  <div className="kv" style={{ marginBottom: 8 }}>
                    <span>Reseller</span>
                    <b>{reseller ? reseller.store_name : "—"}</b>
                  </div>
                  <div className="rd-lines">
                    {lines.length === 0 ? <p className="small muted">Belum ada produk dipilih.</p> : null}
                    {lines.map((line) => (
                      <div className="rd-line" key={line.uid}>
                        <ProductPhoto src={line.product.image} name={line.product.name} series={line.product.series} className="rd-thumb" />
                        <span className="rd-name">
                          {line.product.series ? `${line.product.name} — ${line.product.series}` : line.product.name}
                          <small>
                            {line.size || "Ukuran belum dipilih"} × {line.quantity}
                          </small>
                        </span>
                        <b>{rupiah(lineSubtotal(line))}</b>
                      </div>
                    ))}
                  </div>

                  <div className="kv" style={{ marginTop: 8 }}>
                    <span>Produk (harga beli)</span>
                    <b>{rupiah(subtotal)}</b>
                  </div>
                  <div className="kv">
                    <span>Ongkir {mode === "otomatis" && shipping ? `(${String(shipping.serviceCode || "").toUpperCase() === "ECO" ? "ECO" : "EZ"})` : ""}</span>
                    <b>{mode === "menyusul" ? "Menyusul" : shipping ? rupiah(shippingCost) : "—"}</b>
                  </div>
                  <div className="kv total">
                    <span>{mode === "menyusul" ? "Total sekarang" : "Total bayar"}</span>
                    <b>{rupiah(total)}</b>
                  </div>

                  <div className="rd-soft">
                    <div className="kv">
                      <span>Saldo reseller</span>
                      <b>{saldo ? rupiah(saldoNow) : "—"}</b>
                    </div>
                    <div className="kv">
                      <span>Dipotong dari saldo</span>
                      <b>{rupiah(deducted)}</b>
                    </div>
                    <div className="kv">
                      <span>Estimasi untung reseller</span>
                      <b className="rd-profit">{rupiah(profit)}</b>
                    </div>
                  </div>

                  {shortfall > 0 && mode === "otomatis" ? (
                    <div style={{ marginTop: 12 }}>
                      <Note tone="warn">
                        <b>Saldo kurang {rupiah(shortfall)}.</b> Setelah dibuat, pesanan menunggu pembayaran kekurangan oleh reseller
                        (batas 24 jam, lalu batal otomatis).
                      </Note>
                    </div>
                  ) : null}

                  {!canSubmit && reason ? (
                    <p className="rd-reason">
                      <AlertTriangle size={15} aria-hidden="true" />
                      <span>{reason}</span>
                    </p>
                  ) : null}
                  <button className="btn blk rd-cta" type="button" disabled={!canSubmit || submitting} onClick={openConfirm}>
                    {submitting ? <Loader2 size={16} /> : null}
                    {ctaText}
                    {!submitting ? <ArrowRight size={16} aria-hidden="true" /> : null}
                  </button>
                  <p className="hint rd-note">Pesanan baru tersimpan setelah kamu menekan “Buat pesanan” di langkah konfirmasi.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {confirmOpen && reseller ? (
        <Modal title="Konfirmasi pesanan" onClose={() => (submitting ? undefined : setConfirmOpen(false))} width={480}>
          <div className="space-y-3">
            <p className="text-[13px] text-slate-600">
              Pesanan dibuat <b className="text-slate-900">atas nama {reseller.store_name}</b>. Saldo reseller akan terpotong dan
              reseller diberi tahu lewat WhatsApp.
            </p>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-[13px]">
              <Row label="Penerima" value={address.name.trim()} />
              <Row label="Produk (harga beli)" value={rupiah(subtotal)} />
              <Row
                label="Ongkir"
                value={mode === "menyusul" ? "Menyusul (diisi admin)" : shipping ? `${shipping.service} · ${rupiah(shippingCost)}` : "—"}
              />
              <Row label={mode === "menyusul" ? "Total sekarang" : "Total"} value={rupiah(total)} strong />
              <Row label="Saldo reseller" value={rupiah(saldoNow)} />
              <Row label="Dipotong dari saldo" value={rupiah(deducted)} />
              {shortfall > 0 && mode === "otomatis" ? <Row label="Kekurangan" value={rupiah(shortfall)} warn /> : null}
            </div>
            {mode === "menyusul" ? (
              <p className="text-[12.5px] text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-2">
                Status <b>Menunggu ongkir</b>: stok ditahan, resi belum bisa dibuat, dan tidak dibatalkan otomatis.
              </p>
            ) : null}
            {shortfall > 0 && mode === "otomatis" ? (
              <p className="text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Saldo kurang {rupiah(shortfall)}: pesanan menunggu pembayaran kekurangan (24 jam).
              </p>
            ) : null}
            {duplicateMessage ? (
              <p className="text-[12.5px] text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
                <b>Periksa dulu.</b> {duplicateMessage}
              </p>
            ) : null}
            {submitError ? <p className="text-sm text-red-600 font-semibold">{submitError}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
              >
                {duplicateMessage ? "Periksa dulu" : "Batal"}
              </button>
              <button
                type="button"
                onClick={() => submit(Boolean(duplicateMessage))}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {submitting ? <Loader2 size={15} /> : null}
                {submitting ? "Menyimpan…" : duplicateMessage ? "Tetap buat pesanan" : "Buat pesanan"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Row({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-bold ${warn ? "text-amber-700" : strong ? "text-slate-900" : "text-slate-700"}`}>{value}</span>
    </div>
  );
}
