"use client";

/**
 * Kartu "Periode" — opsional. Input `date` asli disimpan sebagai `YYYY-MM-DD`
 * (format kolom DB), tapi yang dilihat admin adalah `dd/mm/yyyy`.
 *
 * Caranya: nilai `YYYY-MM-DD` dipecah ke tiga isian terpisah (dd, mm, yyyy) lalu disusun
 * ulang. Tidak ada library tanggal tambahan dan tidak ada perubahan format di database.
 */

import { Card, FieldLabel, HelperText } from "./primitives";

type Parts = { d: string; m: string; y: string };

function parseIso(value: string): Parts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return { d: "", m: "", y: "" };
  return { d: match[3], m: match[2], y: match[1] };
}

function toIso(parts: Parts): string {
  if (!parts.d || !parts.m || parts.y.length !== 4) return "";
  return `${parts.y}-${parts.m.padStart(2, "0")}-${parts.d.padStart(2, "0")}`;
}

/** Isian tanggal dd/mm/yyyy sederhana. Kosong = tidak dibatasi. */
function DateField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const parts = parseIso(value);

  function update(next: Parts) {
    // Simpan begitu lengkap saja; kalau dikosongkan, berarti tanpa batas.
    const iso = toIso(next);
    if (iso || (!next.d && !next.m && !next.y)) onChange(iso);
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        id={id}
        className="pf-input pf-date"
        aria-label="Tanggal"
        inputMode="numeric"
        maxLength={2}
        placeholder="dd"
        value={parts.d}
        onChange={(e) => update({ ...parts, d: e.target.value.replace(/\D/g, "") })}
        style={{ width: 56 }}
      />
      <span style={{ color: "#9aa5ad" }}>/</span>
      <input
        className="pf-input pf-date"
        aria-label="Bulan"
        inputMode="numeric"
        maxLength={2}
        placeholder="mm"
        value={parts.m}
        onChange={(e) => update({ ...parts, m: e.target.value.replace(/\D/g, "") })}
        style={{ width: 56 }}
      />
      <span style={{ color: "#9aa5ad" }}>/</span>
      <input
        className="pf-input pf-date"
        aria-label="Tahun"
        inputMode="numeric"
        maxLength={4}
        placeholder="yyyy"
        value={parts.y}
        onChange={(e) => update({ ...parts, y: e.target.value.replace(/\D/g, "") })}
        style={{ width: 82 }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="ml-1 rounded-lg px-2.5 py-2 text-[11px]"
          style={{ border: "1px solid #D9CFC1", color: "#5B6B78", background: "#FFFFFF" }}
        >
          Kosongkan
        </button>
      ) : null}
    </div>
  );
}

export function PeriodeCard({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (patch: { startDate?: string; endDate?: string }) => void;
}) {
  return (
    <Card title="Periode (opsional)" description="Batasi kapan promo berjalan.">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <FieldLabel htmlFor="promo-start-date">Mulai</FieldLabel>
          <DateField id="promo-start-date" value={startDate} onChange={(iso) => onChange({ startDate: iso })} />
        </div>
        <div>
          <FieldLabel htmlFor="promo-end-date">Selesai</FieldLabel>
          <DateField id="promo-end-date" value={endDate} onChange={(iso) => onChange({ endDate: iso })} />
        </div>
      </div>
      <HelperText>Kosongkan kalau promo jalan terus sampai kuota habis.</HelperText>
    </Card>
  );
}
