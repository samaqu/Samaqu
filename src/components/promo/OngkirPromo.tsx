/**
 * Tampilan promo ongkir (checkout katalog website) — HANYA muncul kalau ada promo yang
 * berlaku. Tanpa promo, komponen ini tidak dipakai sama sekali sehingga tampilan lama tidak berubah.
 *
 * Gaya: halaman SAMAQU monokrom, jadi satu-satunya aksen warna adalah merah tua pada lencana dan harga bayar; harga asli dicoret abu.
 * Warna lewat `currentColor`/variabel yang sudah ada supaya ikut tema halaman pemakai.
 */

import { Tag } from "lucide-react";

/** Merah tua pekat: menonjol tapi tidak sama dengan merah error form (#e74c3c) dan kontras aman untuk teks putih. */
export const PROMO_RED = "#B91C1C";

const rp = (value: number) => `Rp ${Math.max(0, Math.round(value)).toLocaleString("id-ID")}`;

/** Lencana kecil: "Free ongkir" atau "Hemat ongkir 40%". */
export function OngkirPromoBadge({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold leading-none tracking-wide ${className}`}
      style={{ background: PROMO_RED, color: "#fff" }}
    >
      <Tag size={10} strokeWidth={2.4} aria-hidden />
      {label}
    </span>
  );
}

/** Harga ongkir bertingkat: tarif asli dicoret, di bawahnya ongkir yang dibayar ("Gratis" kalau Rp0). */
export function OngkirHargaPromo({
  cost,
  payCost,
  align = "right",
  className = "",
}: {
  cost: number;
  payCost: number;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <span className={`inline-flex flex-col leading-tight ${align === "right" ? "items-end text-right" : "items-start text-left"} ${className}`}>
      <span className="text-[11px] font-normal line-through opacity-55 tabular-nums">{rp(cost)}</span>
      <span className="font-bold tabular-nums" style={{ color: PROMO_RED }}>
        {payCost <= 0 ? "Gratis" : rp(payCost)}
      </span>
    </span>
  );
}

/** Kalimat hemat satu baris, mis. "Kamu hemat Rp 4.400 dari ongkir kirim". */
export function ongkirHematText(discount: number): string {
  return `Kamu hemat ${rp(discount)} dari ongkir`;
}
