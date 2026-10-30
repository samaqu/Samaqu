"use client";

import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { resellerApi, type ShippingOption } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import { labelLayanan, layananByCode } from "@/lib/jnt/layanan";
import { SkeletonRows } from "../ui";

const SERVICES = [
  { code: "EZ", tag: "Lebih cepat" },
  { code: "ECO", tag: "Lebih hemat" },
] as const;

/** Kartu layanan J&T EZ/ECO — tarif dari API ongkir yang sama dengan checkout. */
export default function OngkirCards({
  city,
  district,
  items,
  selected,
  onSelect,
}: {
  city: string;
  district: string;
  items: { product_id: string; color: string; size: string; quantity: number }[];
  selected: ShippingOption | null;
  onSelect: (option: ShippingOption | null) => void;
}) {
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [weight, setWeight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const itemsKey = items.map((i) => `${i.product_id}|${i.color}|${i.size}|${i.quantity}`).join(",");

  useEffect(() => {
    if (!city || !district || items.length === 0) {
      setOptions([]);
      setError("");
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    resellerApi
      .ongkir({ city, district, items })
      .then((res) => {
        if (!alive) return;
        if (res.configured === false) {
          setOptions([]);
          setError("Ongkir J&T belum dikonfigurasi admin. Hubungi admin SAMAQU.");
          return;
        }
        const list = res.data || [];
        setOptions(list);
        setWeight(res.weight || 0);
        const keep =
          selected && list.find((option) => option.serviceCode === selected.serviceCode);
        // EZ dipilih otomatis kalau tersedia; kalau tidak, opsi pertama.
        const next = keep || list.find((option) => option.serviceCode === "EZ") || list[0] || null;
        onSelect(next);
      })
      .catch((e) => {
        if (!alive) return;
        setOptions([]);
        setError(e?.message || "Gagal menghitung ongkir.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, district, itemsKey]);

  if (!city || !district) {
    return (
      <div className="ongkir-empty">
        <Truck size={16} />
        <span>Isi alamat dulu untuk melihat ongkir.</span>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small muted">
        <Truck size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
        Ongkir dari berat pesanan
        {weight > 0 ? ` (±${(weight / 1000).toFixed(weight % 1000 === 0 ? 0 : 1)} kg)` : ""}.
      </p>

      {loading ? <SkeletonRows rows={2} /> : null}
      {error ? <p className="err">{error}</p> : null}

      {!loading ? (
        <div className="ongkir-grid">
          {SERVICES.map((service) => {
            const option = options.find((row) => row.serviceCode === service.code) || null;
            const layanan = layananByCode(service.code);
            const active = Boolean(option && selected?.serviceCode === option.serviceCode);
            const estimate = option?.etd || layanan?.estimate || "-";
            return (
              <button
                key={service.code}
                type="button"
                className={`ongkir-card ${active ? "on" : ""} ${option ? "" : "off"}`}
                disabled={!option || loading}
                aria-pressed={active}
                onClick={() => option && onSelect(option)}
              >
                <span className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <span className="svc">{service.code}</span>
                  <span className="tag">{service.tag}</span>
                </span>
                <span className="nm">{labelLayanan(service.code)}</span>
                <span className="small muted">
                  {option ? `Estimasi ${estimate}` : "Tidak tersedia untuk kecamatan ini"}
                </span>
                <span className="cost">{option ? rupiah(option.cost) : "—"}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
