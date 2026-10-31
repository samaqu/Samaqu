"use client";

/**
 * Kartu "Teks di halaman promo" — label kecil, judul, dan deskripsi yang tampil di banner
 * halaman pesan. Deskripsi punya penghitung karakter.
 *
 * Nilai awal = yang tersimpan di DB (`promo_fch_eyebrow`, `promo_fch_title`,
 * `promo_fch_description`). Placeholder hanya muncul kalau kolomnya memang kosong.
 */

import { Card, FieldLabel, HelperText, PromoInput, PromoTextarea, TEXT_DIM } from "./primitives";

const DESCRIPTION_MAX = 240;

export function TeksCard({
  eyebrow,
  title,
  description,
  onChange,
}: {
  eyebrow: string;
  title: string;
  description: string;
  onChange: (patch: { eyebrow?: string; title?: string; description?: string }) => void;
}) {
  const over = description.length > DESCRIPTION_MAX;

  return (
    <Card title="Teks di halaman promo" description="Tulisan yang dilihat pembeli di banner halaman pesan.">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="promo-eyebrow">Label kecil</FieldLabel>
          <PromoInput
            id="promo-eyebrow"
            value={eyebrow}
            onChange={(e) => onChange({ eyebrow: e.target.value })}
            placeholder="Pembelian Pertama"
          />
          <HelperText>Badge kecil huruf besar di atas judul.</HelperText>
        </div>
        <div>
          <FieldLabel htmlFor="promo-title">Judul besar</FieldLabel>
          <PromoInput
            id="promo-title"
            value={title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Free Cover Hanger"
          />
          <HelperText>Judul utama banner promo.</HelperText>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <FieldLabel htmlFor="promo-description">Deskripsi</FieldLabel>
          <span className="text-[11px] tabular-nums" style={{ color: over ? "#b91c1c" : TEXT_DIM }}>
            {description.length}/{DESCRIPTION_MAX}
          </span>
        </div>
        <PromoTextarea
          id="promo-description"
          value={description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="Beli Thobe, Kandora, atau Koko pertamamu dan Cover Hanger senilai Rp35.000 masuk otomatis…"
        />
        <HelperText>Penjelasan singkat isi bonus dan caranya.</HelperText>
      </div>
    </Card>
  );
}
