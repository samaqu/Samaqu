"use client";

import { useMemo } from "react";
import {
  Building2,
  Laptop,
  Megaphone,
  Store,
  Tag,
  Truck,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { KATEGORI_OPERASIONAL } from "./helpers";

/** Ikon monokrom per kategori pengeluaran operasional. */
const IKON_KATEGORI: Record<string, typeof Tag> = {
  "Iklan & Promosi": Megaphone,
  "Admin Marketplace": Store,
  "Ongkos Kirim": Truck,
  "Gaji Karyawan": Users,
  "Listrik & Air": Zap,
  "Sewa Tempat": Building2,
  Maintenance: Wrench,
  "Tools & Software": Laptop,
};

/**
 * Pemilih kategori pengeluaran operasional berupa kartu berikon.
 * Nilai yang disimpan tetap nama kategori (string) supaya payload API tidak berubah.
 * Kategori lama di luar daftar tetap ditampilkan agar bisa dipertahankan atau diganti.
 */
export default function KategoriPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (kategori: string) => void;
}) {
  const options = useMemo(() => {
    if (value && !KATEGORI_OPERASIONAL.includes(value)) return [value, ...KATEGORI_OPERASIONAL];
    return KATEGORI_OPERASIONAL;
  }, [value]);

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((nama) => {
        const Ikon = IKON_KATEGORI[nama] || Tag;
        const aktif = value === nama;
        return (
          <button
            key={nama}
            type="button"
            onClick={() => onChange(nama)}
            aria-pressed={aktif}
            className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-xs font-bold leading-tight transition-colors ${
              aktif
                ? "border-[#18181b] bg-[#18181b] text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            <Ikon size={16} className={aktif ? "text-white" : "text-slate-400"} />
            <span>{nama}</span>
          </button>
        );
      })}
    </div>
  );
}
