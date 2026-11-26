"use client";

/**
 * Kartu "Promo yang disebut bot" di menu Promo (/admin/promo dan /panel-admin/promo).
 *
 * KARTU TERPISAH dari pengaturan Promo Free Cover Hanger website di atasnya: kolom, simpan, dan statusnya
 * sendiri (`promo_ongkir_*` dan `promo_bot_*` di `store_settings`). Pengaturan promo FCH website
 * (`promo_fch_*`) tidak dibaca maupun diubah di sini.
 *
 * Yang diatur di sini dibaca bot WhatsApp tiap membalas, juga checkout website dan draft pesanan:
 *  - Free ongkir Jabodetabek (saklar + tanggal)
 *  - Potongan ongkir luar Jabodetabek (saklar + tanggal + persen)
 *  - Free Cover Hanger khusus bot (saklar + tanggal; bawaan NYALA = perilaku bot sebelum fitur ini)
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Megaphone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_JABO_CITIES,
  DEFAULT_PROMO_SETTINGS,
  PROMO_ONGKIR_COLUMNS,
  parsePromoSettings,
  tanggalWib,
  type PromoOngkirSettings,
} from "@/lib/promo/ongkir-promo";
import { Card, FieldLabel, HelperText, PROMO_COLORS, PROMO_FORM_CSS, TEXT, TEXT_MUTED } from "../promo-fch/primitives";
import { ToggleSwitch } from "../promo-fch/ToggleSwitch";
import { SaveBar } from "../promo-fch/SaveBar";

/** Bentuk yang diedit di form (teks supaya isian bisa kosong sementara diketik). */
type Form = {
  jaboActive: boolean;
  jaboStart: string;
  jaboEnd: string;
  luarActive: boolean;
  luarStart: string;
  luarEnd: string;
  luarPercent: string;
  citiesText: string;
  jntDiscountPercent: string;
  fchBotActive: boolean;
  fchBotStart: string;
  fchBotEnd: string;
};

function toForm(s: PromoOngkirSettings): Form {
  return {
    jaboActive: s.jaboActive,
    jaboStart: s.jaboStart ?? "",
    jaboEnd: s.jaboEnd ?? "",
    luarActive: s.luarActive,
    luarStart: s.luarStart ?? "",
    luarEnd: s.luarEnd ?? "",
    luarPercent: String(s.luarPercent),
    citiesText: s.jaboCities.join("\n"),
    jntDiscountPercent: String(s.jntDiscountPercent),
    fchBotActive: s.fchBotActive,
    fchBotStart: s.fchBotStart ?? "",
    fchBotEnd: s.fchBotEnd ?? "",
  };
}

const citiesFrom = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase().replace(/\s+/g, " "))
    .filter(Boolean);

type Fase = { text: string; bg: string; bd: string; fg: string };

/** Status satu promo pada hari ini, dalam bahasa sederhana. */
function faseTeks(active: boolean, start: string, end: string, today: string): Fase {
  if (!active) return { text: "Mati", bg: "#F1F1F1", bd: "#DDDDDD", fg: "#6b6b6b" };
  if (start && today < start) return { text: "Belum mulai", bg: "#FEF6E7", bd: "#F5DDA8", fg: "#8a4b08" };
  if (end && today > end) return { text: "Sudah berakhir", bg: "#F1F1F1", bd: "#DDDDDD", fg: "#6b6b6b" };
  return { text: "Sedang berjalan", bg: "#EAF7F0", bd: "#BFE6D2", fg: "#1F6F45" };
}

function PeriodeFields({
  idPrefix,
  start,
  end,
  onChange,
  disabled,
}: {
  idPrefix: string;
  start: string;
  end: string;
  onChange: (patch: { start?: string; end?: string }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <FieldLabel htmlFor={`${idPrefix}-start`}>Mulai tanggal</FieldLabel>
        <input
          id={`${idPrefix}-start`}
          type="date"
          className="pf-input"
          value={start}
          disabled={disabled}
          onChange={(e) => onChange({ start: e.target.value })}
        />
      </div>
      <div>
        <FieldLabel htmlFor={`${idPrefix}-end`}>Selesai tanggal</FieldLabel>
        <input
          id={`${idPrefix}-end`}
          type="date"
          className="pf-input"
          value={end}
          disabled={disabled}
          onChange={(e) => onChange({ end: e.target.value })}
        />
      </div>
      <p className="text-[11.5px] leading-relaxed sm:col-span-2" style={{ color: "#7A8794" }}>
        Kosongkan tanggal kalau promo tidak dibatasi waktu. Tanggal mulai dan selesai ikut dihitung (jam WIB).
      </p>
    </div>
  );
}

function PromoRow({
  title,
  description,
  active,
  fase,
  onToggle,
  locked,
  children,
}: {
  title: string;
  description: string;
  active: boolean;
  fase: Fase;
  onToggle: (next: boolean) => void;
  /** true = mode baca saja (setelah disimpan); saklar terkunci sampai admin menekan "Edit pengaturan". */
  locked: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-4" style={{ border: `1px solid ${PROMO_COLORS.cardBorder}`, background: "#FFFFFF" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold" style={{ color: TEXT }}>
              {title}
            </p>
            <span
              className="rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold"
              style={{ background: fase.bg, border: `1px solid ${fase.bd}`, color: fase.fg }}
            >
              {fase.text}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: TEXT_MUTED }}>
            {description}
          </p>
        </div>
        <ToggleSwitch checked={active} onChange={onToggle} disabled={locked} label={title} />
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function PromoBotCard() {
  const [loading, setLoading] = useState(true);
  const [missingColumn, setMissingColumn] = useState(false);
  const [form, setForm] = useState<Form>(toForm(DEFAULT_PROMO_SETTINGS));
  const [saved, setSaved] = useState<Form>(toForm(DEFAULT_PROMO_SETTINGS));
  const [saving, setSaving] = useState(false);
  /** false = baca saja (setelah disimpan / saat dibuka); "Edit pengaturan" membukanya, Simpan/Batal menguncinya lagi. */
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("store_settings")
      .select(PROMO_ONGKIR_COLUMNS)
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          // Kolom belum dibuat (migrasi belum dijalankan): kartu menampilkan peringatan, halaman tetap terbuka.
          setMissingColumn(true);
          setLoading(false);
          return;
        }
        const next = toForm(parsePromoSettings(data as Record<string, unknown> | null));
        setForm(next);
        setSaved(next);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const today = tanggalWib();
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const patch = (next: Partial<Form>) => setForm((prev) => ({ ...prev, ...next }));

  async function save() {
    setNotice(null);
    const luarPercent = Math.round(Number(form.luarPercent));
    const jntPercent = Math.round(Number(form.jntDiscountPercent));
    if (!Number.isFinite(luarPercent) || luarPercent < 0 || luarPercent > 100) {
      setNotice({ kind: "err", text: "Persen potongan harus angka 0 sampai 100." });
      return;
    }
    if (!Number.isFinite(jntPercent) || jntPercent < 0 || jntPercent > 100) {
      setNotice({ kind: "err", text: "Diskon akun J&T harus angka 0 sampai 100." });
      return;
    }
    for (const [nama, start, end] of [
      ["Free ongkir Jabodetabek", form.jaboStart, form.jaboEnd],
      ["Potongan ongkir luar Jabodetabek", form.luarStart, form.luarEnd],
      ["Free Cover Hanger bot", form.fchBotStart, form.fchBotEnd],
    ] as const) {
      if (start && end && start > end) {
        setNotice({ kind: "err", text: `${nama}: tanggal selesai tidak boleh sebelum tanggal mulai.` });
        return;
      }
    }
    const cities = citiesFrom(form.citiesText);
    if (cities.length === 0) {
      setNotice({ kind: "err", text: "Daftar wilayah Jabodetabek tidak boleh kosong." });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("store_settings")
      .update({
        promo_ongkir_jabo_active: form.jaboActive,
        promo_ongkir_jabo_start: form.jaboStart || null,
        promo_ongkir_jabo_end: form.jaboEnd || null,
        promo_ongkir_luar_active: form.luarActive,
        promo_ongkir_luar_start: form.luarStart || null,
        promo_ongkir_luar_end: form.luarEnd || null,
        promo_ongkir_luar_percent: luarPercent,
        promo_ongkir_jabo_cities: cities,
        promo_ongkir_jnt_discount_percent: jntPercent,
        promo_bot_fch_active: form.fchBotActive,
        promo_bot_fch_start: form.fchBotStart || null,
        promo_bot_fch_end: form.fchBotEnd || null,
      })
      .eq("id", 1);
    setSaving(false);

    if (error) {
      setNotice({ kind: "err", text: `Gagal menyimpan: ${error.message}` });
      return;
    }
    const next = { ...form, luarPercent: String(luarPercent), jntDiscountPercent: String(jntPercent), citiesText: cities.join("\n") };
    setForm(next);
    setSaved(next);
    setEditing(false);
    setNotice({ kind: "ok", text: "Promo yang disebut bot tersimpan. Langsung berlaku di checkout, draft pesanan, dan bot." });
  }

  if (loading) return null;

  const jaboFase = faseTeks(form.jaboActive, form.jaboStart, form.jaboEnd, today);
  const luarFase = faseTeks(form.luarActive, form.luarStart, form.luarEnd, today);
  const fchFase = faseTeks(form.fchBotActive, form.fchBotStart, form.fchBotEnd, today);

  return (
    <div className="pf-form mt-6 flex flex-col gap-4 pb-4">
      <style>{PROMO_FORM_CSS}</style>

      <Card
        title="Promo yang disebut bot"
        description="Promo yang boleh disebut bot WhatsApp dan berlaku di checkout website. Terpisah dari promo Free Cover Hanger website di atas: mengubah di sini tidak mengubah promo website."
        aside={
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: PROMO_COLORS.chipBg, color: PROMO_COLORS.chipText }}>
            <Megaphone size={16} />
          </span>
        }
      >
        {missingColumn ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px]"
            style={{ background: "#FEF6E7", border: "1px solid #F5DDA8", color: "#8a4b08" }}
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>Pengaturan ini belum aktif di database. Minta developer menjalankan migrasi promo ongkir dulu.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <PromoRow
              title="Free ongkir Jabodetabek"
              description="Ongkir customer di Jabodetabek jadi Rp0 (J&T EZ dan ECO). Reseller tidak ikut."
              active={form.jaboActive}
              fase={jaboFase}
              onToggle={(next) => patch({ jaboActive: next })}
              locked={!editing}
            >
              <PeriodeFields
                idPrefix="po-jabo"
                disabled={!editing}
                start={form.jaboStart}
                end={form.jaboEnd}
                onChange={(p) => patch({ ...(p.start !== undefined ? { jaboStart: p.start } : {}), ...(p.end !== undefined ? { jaboEnd: p.end } : {}) })}
              />
              <div className="mt-4">
                <FieldLabel htmlFor="po-cities">Wilayah yang dihitung Jabodetabek</FieldLabel>
                <textarea
                  id="po-cities"
                  className="pf-input"
                  rows={7}
                  value={form.citiesText}
                  disabled={!editing}
                  onChange={(e) => patch({ citiesText: e.target.value })}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                />
                <HelperText>
                  Satu kota/kabupaten per baris, ditulis persis seperti nama di data J&T (contoh: KOTA ADM. JAKARTA SELATAN, KAB. BOGOR).{" "}
                  <button
                    type="button"
                    className="underline disabled:opacity-40 disabled:no-underline"
                    style={{ color: PROMO_COLORS.ink }}
                    disabled={!editing}
                    onClick={() => patch({ citiesText: DEFAULT_JABO_CITIES.join("\n") })}
                  >
                    Kembalikan daftar bawaan
                  </button>
                </HelperText>
              </div>
            </PromoRow>

            <PromoRow
              title="Potongan ongkir luar Jabodetabek"
              description="Ongkir customer di luar Jabodetabek dipotong sekian persen dari tarif J&T (EZ dan ECO), tanpa pembulatan. Reseller tidak ikut."
              active={form.luarActive}
              fase={luarFase}
              onToggle={(next) => patch({ luarActive: next })}
              locked={!editing}
            >
              <div className="mb-4 max-w-[220px]">
                <FieldLabel htmlFor="po-luar-persen">Potongan (persen dari tarif J&T)</FieldLabel>
                <input
                  id="po-luar-persen"
                  type="number"
                  min={0}
                  max={100}
                  className="pf-input"
                  value={form.luarPercent}
                  disabled={!editing}
                  onChange={(e) => patch({ luarPercent: e.target.value })}
                />
              </div>
              <PeriodeFields
                idPrefix="po-luar"
                disabled={!editing}
                start={form.luarStart}
                end={form.luarEnd}
                onChange={(p) => patch({ ...(p.start !== undefined ? { luarStart: p.start } : {}), ...(p.end !== undefined ? { luarEnd: p.end } : {}) })}
              />
              <div className="mt-4 max-w-[260px]">
                <FieldLabel htmlFor="po-jnt-persen">Diskon akun VIP J&T (persen)</FieldLabel>
                <input
                  id="po-jnt-persen"
                  type="number"
                  min={0}
                  max={100}
                  className="pf-input"
                  value={form.jntDiscountPercent}
                  disabled={!editing}
                  onChange={(e) => patch({ jntDiscountPercent: e.target.value })}
                />
                <HelperText>Hanya untuk laporan: dipakai memisahkan potongan yang ditanggung J&T dan yang ditanggung SAMAQU. Tidak mempengaruhi ongkir customer.</HelperText>
              </div>
            </PromoRow>

            <PromoRow
              title="Free Cover Hanger (khusus bot WhatsApp)"
              description="Bonus cover + hanger untuk pembelian pertama yang disebut bot. Tidak sama dengan promo Free Cover Hanger website. Nyalakan terus kalau bot harus tetap menawarkan bonus seperti biasa."
              active={form.fchBotActive}
              fase={fchFase}
              onToggle={(next) => patch({ fchBotActive: next })}
              locked={!editing}
            >
              <PeriodeFields
                idPrefix="po-fch"
                disabled={!editing}
                start={form.fchBotStart}
                end={form.fchBotEnd}
                onChange={(p) => patch({ ...(p.start !== undefined ? { fchBotStart: p.start } : {}), ...(p.end !== undefined ? { fchBotEnd: p.end } : {}) })}
              />
            </PromoRow>

            {notice ? (
              <div
                role="status"
                className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px]"
                style={
                  notice.kind === "ok"
                    ? { background: "#EAF7F0", border: "1px solid #BFE6D2", color: "#1F6F45" }
                    : { background: "#FDECEC", border: "1px solid #F5C2C2", color: "#B42318" }
                }
              >
                {notice.kind === "ok" ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
                <span>{notice.text}</span>
              </div>
            ) : null}

            <SaveBar
              dirty={dirty}
              saving={saving}
              locked={!editing}
              onEdit={() => setEditing(true)}
              onReset={() => {
                setForm(saved);
                setNotice(null);
                setEditing(false);
              }}
              onSave={save}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
