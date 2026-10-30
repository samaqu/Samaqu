"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ApiError, resellerApi, type KatalogProduct, type ShippingOption } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import { useReseller } from "../ResellerShell";
import { Note } from "../ui";
import BarisProduk from "./BarisProduk";
import FormAlamat from "./FormAlamat";
import OrderSuccess from "./OrderSuccess";
import PilihOngkir from "./PilihOngkir";
import PilihProduk from "./PilihProduk";
import RingkasanPesanan from "./RingkasanPesanan";
import { EMPTY_ADDRESS, type AddressValue, type OrderLine } from "./types";

type CreateResult = {
  orderNumber: string;
  total: number;
  balanceDeduction: number;
  shortfall: number;
  status: string;
};

/** Halaman Buat Pesanan: pilih produk → penerima & alamat → pengiriman → ringkasan. */
export default function OrderForm({ preselectProductId }: { preselectProductId?: string }) {
  const { me, refreshMe } = useReseller();
  const router = useRouter();
  const [products, setProducts] = useState<KatalogProduct[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [shipping, setShipping] = useState<ShippingOption | null>(null);
  const [showLabel, setShowLabel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);

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

  const updateLine = useCallback((key: string, patch: Partial<OrderLine>) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }, []);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }, []);

  const patchAddress = useCallback((patch: Partial<AddressValue>) => {
    setAddress((prev) => ({ ...prev, ...patch }));
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
    address.name.trim() &&
    address.whatsapp.replace(/\D/g, "").length >= 9 &&
    address.province &&
    address.city &&
    address.district &&
    address.address.trim();
  const canSubmit = lines.length > 0 && priceValid && Boolean(addressValid) && Boolean(shipping);

  const disabledReason = !lines.length
    ? "Tambahkan produk dulu."
    : !priceValid
      ? "Periksa harga jual — ada yang di bawah batas."
      : !addressValid
        ? "Lengkapi nama, WhatsApp, dan alamat penerima."
        : !shipping
          ? "Pilih layanan pengiriman."
          : "";

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
      // Saldo kurang → langsung ke halaman bayar kekurangan (alur 3 langkah).
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

  return (
    <div className="form-grid">
      <div className="stack">
        <section className="card">
          <div className="card-h">
            <h2>1 · Produk</h2>
          </div>
          <div className="card-b">
            <PilihProduk products={products} onAdd={addLine} initialOpen={preselectProductId} />
          </div>
        </section>

        {lines.length > 0 ? (
          <section className="card">
            <div className="card-h">
              <h2>Produk dipilih ({lines.length})</h2>
            </div>
            <div className="card-b stack" style={{ gap: 12 }}>
              {lines.map((line) => (
                <BarisProduk
                  key={line.key}
                  line={line}
                  onChange={(patch) => updateLine(line.key, patch)}
                  onRemove={() => removeLine(line.key)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="card">
          <div className="card-h">
            <h2>2 · Customer & alamat</h2>
          </div>
          <div className="card-b">
            <FormAlamat value={address} onChange={patchAddress} />
          </div>
        </section>

        <section className="card">
          <div className="card-h">
            <h2>3 · Pengiriman</h2>
          </div>
          <div className="card-b stack" style={{ gap: 14 }}>
            <PilihOngkir
              city={address.city}
              district={address.district}
              items={shippingItems}
              selected={shipping}
              onSelect={setShipping}
            />
            <label className="row" style={{ gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showLabel}
                onChange={(e) => setShowLabel(e.target.checked)}
                style={{ accentColor: "#111", width: 16, height: 16 }}
              />
              <span className="small">Tampilkan nama toko saya di label</span>
            </label>
          </div>
        </section>
      </div>

      <div>
        <RingkasanPesanan
          lines={lines}
          shipping={shipping}
          saldoTersedia={me.saldo.saldo_tersedia}
          disabled={!canSubmit}
          disabledReason={disabledReason}
          submitting={submitting}
          submitError={submitError}
          onSubmit={submit}
        />
      </div>
    </div>
  );
}
