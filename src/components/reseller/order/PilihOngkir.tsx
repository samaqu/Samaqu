"use client";

import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { resellerApi, type ShippingOption } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import { SkeletonRows } from "../ui";

/** Pilihan layanan J&T — tarif memakai fungsi yang sama dengan checkout. */
export default function PilihOngkir({
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
        setOptions(res.data || []);
        setWeight(res.weight || 0);
        // Pilih otomatis layanan termurah supaya reseller tidak lupa memilih.
        const next = (res.data || [])[0] || null;
        onSelect(next && selected && res.data.some((o) => o.serviceCode === selected.serviceCode)
          ? selected
          : next);
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
    return <p className="muted small">Pilih kecamatan tujuan dulu untuk melihat layanan J&T.</p>;
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <p className="small muted">
        <Truck size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
        Ongkir dihitung dari berat pesanan{weight > 0 ? ` (±${(weight / 1000).toFixed(weight % 1000 === 0 ? 0 : 1)} kg)` : ""}.
      </p>
      {loading ? <SkeletonRows rows={2} /> : null}
      {error ? <p className="err">{error}</p> : null}
      {!loading && !error && options.length === 0 ? (
        <p className="err">Tidak ada layanan J&T untuk tujuan ini.</p>
      ) : null}
      {options.map((option) => (
        <label
          key={option.serviceCode}
          className="pick-row"
          style={{ cursor: "pointer", borderColor: selected?.serviceCode === option.serviceCode ? "var(--rs-ink)" : undefined }}
        >
          <input
            type="radio"
            name="rs-ongkir"
            checked={selected?.serviceCode === option.serviceCode}
            onChange={() => onSelect(option)}
            style={{ accentColor: "#111" }}
          />
          <span style={{ flex: 1 }}>
            <span className="bold" style={{ display: "block", fontSize: 13.5 }}>
              {option.service}
            </span>
            <span className="small muted">{option.etd ? `Estimasi ${option.etd}` : "J&T Express"}</span>
          </span>
          <span className="bold">{rupiah(option.cost)}</span>
        </label>
      ))}
    </div>
  );
}
