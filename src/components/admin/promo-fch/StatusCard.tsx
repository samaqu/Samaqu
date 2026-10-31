"use client";

/**
 * Kartu "Status promo" — menggantikan pill hitam Aktif/Nonaktif dengan toggle switch.
 * Teks penjelas ikut berubah sesuai status supaya admin tahu akibatnya.
 */

import { Card, PROMO_COLORS, TEXT, TEXT_MUTED } from "./primitives";
import { ToggleSwitch } from "./ToggleSwitch";

export function StatusCard({
  active,
  onChange,
  bonusExhausted,
}: {
  active: boolean;
  onChange: (next: boolean) => void;
  /** Kuota sudah habis walau status aktif — tampil sebagai peringatan kecil. */
  bonusExhausted: boolean;
}) {
  return (
    <Card title="Status promo" description="Sakelar utama tampil/tidaknya program di halaman pesan.">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: TEXT }}>
            {active ? "Promo sedang berjalan" : "Promo nonaktif"}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: TEXT_MUTED }}>
            {active
              ? "Banner bonus tampil di halaman pesan dan Cover Hanger dibagikan otomatis untuk pelanggan baru."
              : "Banner bonus disembunyikan dari halaman pesan. Pesanan tetap bisa masuk tanpa bonus."}
          </p>
          {active && bonusExhausted ? (
            <p className="mt-2 text-[12px] font-medium" style={{ color: "#b45309" }}>
              Kuota bonus sudah habis — halaman pesan menampilkan “Bonus sudah habis”.
            </p>
          ) : null}
        </div>
        <ToggleSwitch checked={active} onChange={onChange} label="Promo aktif" />
      </div>
    </Card>
  );
}
