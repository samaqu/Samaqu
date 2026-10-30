"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ApiError, resellerApi, type KatalogProduct, type ShippingOption } from "@/lib/reseller/client";
import { useReseller } from "../ResellerShell";
import { Note } from "../ui";
import ItemEditor from "./ItemEditor";
import OrderBottomBar from "./OrderBottomBar";
import OrderStepper from "./OrderStepper";
import OrderSuccess from "./OrderSuccess";
import OngkirCards from "./OngkirCards";
import PenerimaForm from "./PenerimaForm";
import ProdukPicker from "./ProdukPicker";
import RingkasanPesanan from "./RingkasanPesanan";
import {
  createOrderLine,
  EMPTY_ADDRESS,
  lineKey,
  type AddressValue,
  type OrderLine,
} from "./types";

type CreateResult = {
  orderNumber: string;
  total: number;
  balanceDeduction: number;
  shortfall: number;
  status: string;
};

/** Halaman Buat Pesanan: produk → penerima → pengiriman → ringkasan. */
export default function OrderForm({ preselectProductId }: { preselectProductId?: string }) {
  const { me, refreshMe } = useReseller();
  const router = useRouter();
  const [products, setProducts] = useState<KatalogProduct[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [shipping, setShipping] = useState<ShippingOption | null>(null);
  const [showLabel, setShowLabel] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);
  const preselected = useRef(false);

  useEffect(() => {
    resellerApi
      .katalog()
      .then((res) => setProducts(res.data))
      .catch((e) => setCatalogError(e?.message || "Gagal memuat katalog."));
  }, []);

  const addLine = useCallback((line: OrderLine) => {
    setLines((prev) => {
      const existing = prev.find((item) => item.key === line.key);
      if (existing) {
        return prev.map((item) =>
          item.key === line.key
            ? { ...item, quantity: Math.min(item.stock, item.quantity + line.quantity) }
            : item
        );
      }
      return [...prev, line];
    });
  }, []);

  const pickProduct = useCallback(
    (product: KatalogProduct) => {
      const line = createOrderLine(product);
      if (line) addLine(line);
    },
    [addLine]
  );

  // Link "Pesan" dari katalog: otomatis pilih series + ukuran pertama yang ada stok.
  useEffect(() => {
    if (!preselectProductId || preselected.current || !products) return;
    const product = products.find((row) => row.id === preselectProductId);
    if (!product) return;
    preselected.current = true;
    const line = createOrderLine(product);
    if (line) addLine(line);
  }, [preselectProductId, products, addLine]);

  const updateLine = useCallback((uid: string, patch: Partial<OrderLine>) => {
    setLines((prev) =>
      prev.map((line) => (line.uid === uid ? { ...line, ...patch } : line))
    );
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
            line.uid === duplicate.uid
              ? {
                  ...line,
                  quantity: Math.min(line.stock, line.quantity + next.quantity),
                }
              : line
          );
      }
      return prev.map((line) => (line.uid === uid ? next : line));
    });
  }, []);

  const removeLine = useCallback((uid: string) => {
    setLines((prev) => prev.filter((line) => line.uid !== uid));
  }, []);

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

  const priceValid = lines.every(
    (line) => Number.isFinite(line.sellPrice) && line.sellPrice >= line.product.min_sell_price
  );
  const addressValid =
    Boolean(address.name.trim()) &&
    address.whatsapp.replace(/\D/g, "").length >= 9 &&
    Boolean(address.province) &&
    Boolean(address.city) &&
    Boolean(address.district) &&
    Boolean(address.address.trim());
  const productsComplete = lines.length > 0 && lines.every((line) => Boolean(line.size)) && priceValid;
  const recipientComplete = Boolean(addressValid);
  const shippingComplete = Boolean(shipping);
  const canSubmit = productsComplete && recipientComplete && shippingComplete;

  const reason = !lines.length
    ? "Tambahkan produk dulu."
    : lines.some((line) => !line.size)
      ? "Pilih ukuran dulu."
      : !priceValid
        ? "Periksa harga jual — ada yang di bawah batas."
        : !address.name.trim()
          ? "Lengkapi nama penerima."
          : address.whatsapp.replace(/\D/g, "").length < 9
            ? "Lengkapi WhatsApp penerima."
            : !address.address.trim()
              ? "Lengkapi alamat penerima."
              : !address.province || !address.city || !address.district
                ? "Pilih provinsi, kota, dan kecamatan tujuan."
                : !shipping
                  ? "Pilih layanan pengiriman."
                  : "";

  const stepReason =
    step === 0
      ? !lines.length
        ? "Tambahkan produk dulu."
        : lines.some((line) => !line.size)
          ? "Pilih ukuran dulu."
          : !priceValid
            ? "Periksa harga jual — ada yang di bawah batas."
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

  const subtotal = lines.reduce((sum, line) => sum + line.product.buy_price * line.quantity, 0);
  const total = subtotal + (shipping?.cost || 0);
  const shortfall = Math.max(0, total - Math.min(Math.max(me.saldo.saldo_tersedia, 0), total));

  const submit = async () => {
    if (!canSubmit || submitting || !shipping) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await resellerApi.createOrder({
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
          method: shipping.service,
          cost: shipping.cost,
        },
        show_reseller_name_on_label: showLabel,
      });
      await refreshMe();
      if (res.shortfall > 0) {
        router.push(`/reseller/pesanan/${encodeURIComponent(res.orderNumber)}/bayar`);
        return;
      }
      setResult(res);
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "Gagal membuat pesanan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <OrderSuccess
        result={result}
        onNew={() => {
          setResult(null);
          setLines([]);
          setAddress(EMPTY_ADDRESS);
          setShipping(null);
          setShowLabel(false);
          setSubmitError("");
          setStep(0);
        }}
      />
    );
  }

  if (catalogError) return <Note tone="err">{catalogError}</Note>;
  if (!products) {
    return (
      <div className="row" style={{ justifyContent: "center", padding: 40 }}>
        <Loader2 size={20} />
        <span className="muted">Memuat katalog…</span>
      </div>
    );
  }

  const complete = {
    products: productsComplete,
    recipient: recipientComplete,
    shipping: shippingComplete,
  };

  const selectedRows = (
    <div className="selected-rows">
      {lines.map((line) => (
        <div className="sel-row" key={line.uid}>
          <div className="min-w-0">
            <div className="bold" style={{ fontSize: 12.5 }}>
              {line.product.series
                ? `${line.product.name} — ${line.product.series}`
                : line.product.name}
            </div>
            <div className="small muted">
              {line.size} × {line.quantity}
            </div>
          </div>
          <button type="button" className="link-btn" onClick={() => setStep(0)}>
            Ubah
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="order-page">
      <OrderStepper step={step} onStep={setStep} />

      <div className="form-grid">
        <div className="stack">
          <section className={`card order-step ${step === 0 ? "on" : ""}`}>
            <div className="card-h">
              <h2>Produk</h2>
              <span className="small muted">
                {lines.length > 0 ? `${lines.length} item dipilih` : "Pilih series dulu"}
              </span>
            </div>
            <div className="card-b stack" style={{ gap: 14 }}>
              <ProdukPicker products={products} lines={lines} onPick={pickProduct} />
              {lines.length > 0 ? (
                <div className="selected-block">
                  <div className="item-label" style={{ marginBottom: 8 }}>
                    Item dipilih
                  </div>
                  <div className="stack" style={{ gap: 10 }}>
                    {lines.map((line) => (
                      <ItemEditor
                        key={line.uid}
                        line={line}
                        onChange={(patch) => updateLine(line.uid, patch)}
                        onVariant={(patch) => changeVariant(line.uid, patch)}
                        onRemove={() => removeLine(line.uid)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className={`card order-step ${step === 1 ? "on" : ""}`}>
            <div className="card-h">
              <h2>Penerima</h2>
            </div>
            <div className="card-b stack" style={{ gap: 14 }}>
              <div className="only-m">{selectedRows}</div>
              <PenerimaForm value={address} onChange={patchAddress} />
            </div>
          </section>

          <section className={`card order-step ${step === 2 ? "on" : ""}`}>
            <div className="card-h">
              <h2>Pengiriman</h2>
            </div>
            <div className="card-b stack" style={{ gap: 14 }}>
              <div className="only-m">{selectedRows}</div>
              <OngkirCards
                city={address.city}
                district={address.district}
                items={shippingItems}
                selected={shipping}
                onSelect={setShipping}
              />
              <label className="row" style={{ gap: 8, cursor: "pointer", minHeight: 44 }}>
                <input
                  type="checkbox"
                  checked={showLabel}
                  onChange={(e) => setShowLabel(e.target.checked)}
                  style={{ accentColor: "#111", width: 18, height: 18 }}
                />
                <span className="small">Tampilkan nama toko saya di label</span>
              </label>
              <div className="only-m" style={{ marginTop: 4 }}>
                <RingkasanPesanan
                  lines={lines}
                  shipping={shipping}
                  saldoTersedia={me.saldo.saldo_tersedia}
                  complete={complete}
                  disabled={!canSubmit}
                  disabledReason={reason}
                  submitting={submitting}
                  submitError={submitError}
                  onSubmit={submit}
                  showCta={false}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="only-d">
          <RingkasanPesanan
            lines={lines}
            shipping={shipping}
            saldoTersedia={me.saldo.saldo_tersedia}
            complete={complete}
            disabled={!canSubmit}
            disabledReason={reason}
            submitting={submitting}
            submitError={submitError}
            onSubmit={submit}
          />
        </div>
      </div>

      <OrderBottomBar
        step={step}
        total={total}
        shortfall={shortfall}
        disabled={step === 0 ? !productsComplete : step === 1 ? !recipientComplete : !canSubmit}
        reason={stepReason}
        submitting={submitting}
        onNext={() => setStep((current) => Math.min(2, current + 1))}
        onSubmit={submit}
      />
    </div>
  );
}
