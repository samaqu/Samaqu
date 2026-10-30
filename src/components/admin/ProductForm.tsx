"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, Plus, X, Upload, Image as ImageIcon, Video, GripVertical,
  ChevronDown, Check, Loader2, Trash2, Lock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import AdminShell from "@/components/AdminShell";
import JenisKainForm from "@/components/JenisKainForm";
import PresetColorPicker from "@/components/PresetColorPicker";
import { colorMap } from "@/lib/katalog-data";
import { PAKET_SIZE, isCoverHangerKategori, isKabakKategori, isPaketKategori, isPaketSize, variantName } from "@/lib/item-label";
import { uploadToCloudinary, validateMediaFile } from "@/lib/cloudinary";
import { useStoreSettings } from "@/lib/store-settings";
import { usePageUrl } from "@/lib/ops-router";
import { duplicateSkus, generateBaseSku, generateVariantSku, resolveColorName, seriesCode } from "@/lib/sku";

const CATEGORIES = ["Thobe", "Kandora", "Koko", "Vest", "Kabak", "Cover & Hanger"] as const;
const SIZES = ["S", "M", "L", "XL", "XXL"] as const;

/**
 * SKU produk Thobe disimpan per series (…-JHR, …-IMR, dst). Saat form edit memuat
 * salah satu baris series, suffix itu dibuang dulu supaya tidak dobel saat disimpan
 * untuk series lain. SKU varian tidak memakai ini.
 */
const SERIES_SUFFIXES = ["JHR", "IMR", "BYT", "NHW", "KRM", "IML"];
function stripSeriesSuffix(value: string): string {
  let base = String(value || "").trim();
  for (const code of SERIES_SUFFIXES) {
    if (base.toUpperCase().endsWith(`-${code}`)) {
      base = base.slice(0, -(code.length + 1));
      break;
    }
  }
  return base;
}

/**
 * Kategori paket (Cover & Hanger dan Kabak) = non-pakaian: variannya berupa NAMA
 * (mis. "Hanger saja", "Kabak 01"), bukan kombinasi warna × ukuran.
 *
 * Penyimpanannya TETAP satu baris `product_variants` per varian (struktur sama seperti varian
 * biasa) dengan `color` = nama varian dan `size` = "ALL SIZE":
 *  - `color`/`size` NOT NULL + UNIQUE(product_id,color,size) → dua varian dengan color/size
 *    kosong akan bentrok, jadi pembeda HARUS ada di salah satu kolom itu;
 *  - RPC stok (`samaqu_decrement_stock`) mencocokkan baris lewat color + size, jadi varian
 *    tanpa pembeda di situ tidak bisa dipotong stoknya;
 *  - "ALL SIZE" adalah penanda yang sudah dipakai baris Cover & Hanger lama (`cover-thobe`),
 *    dan website membaca daftar ukuran dari kolom ini — jadi pembeli melihat satu pilihan
 *    "ALL SIZE" (bukan teks kosong / "undefined").
 * Nama varian inilah yang tampil di semua layar (Daftar Produk, Laporan Stok, drawer Transaksi).
 */
const COVER_HANGER = "Cover & Hanger";
const COVER_HANGER_TEMPLATE = ["Hanger saja", "Cover saja", "Set Hanger + Cover"];
const KABAK_TEMPLATE = Array.from({ length: 15 }, (_, i) => `Kabak ${String(i + 1).padStart(2, "0")}`);

const paketTemplateFor = (category: string) =>
  isKabakKategori(category) ? KABAK_TEMPLATE : COVER_HANGER_TEMPLATE;
const paketPlaceholderFor = (category: string) => (isKabakKategori(category) ? "mis. Kabak 01" : "mis. Hanger saja");

function formatRupiah(val: string): string {
  const digits = val.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function parseRupiah(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

interface Variant {
  color: string;
  hex: string;
  sizes: SizeRow[];
}

/**
 * Satu varian Cover & Hanger: `color` diisi NAMA varian, dan selalu punya tepat satu
 * baris "ukuran" tetap (`PAKET_SIZE`) supaya bentuk datanya sama dengan varian biasa.
 */
function emptyPaketVariant(name = ""): Variant {
  return { color: name, hex: "", sizes: [{ size: PAKET_SIZE, stock: 0, priceOverride: "", sku: "", weight: "" }] };
}

/** Nama varian Cover & Hanger yang isinya dobel (case-insensitive, spasi diabaikan). */
function duplicatePaketNames(variants: Variant[]): Set<string> {
  const seen = new Map<string, number>();
  for (const v of variants) {
    const key = String(v.color ?? "").trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key));
}

interface MediaFile {
  id: string;
  file?: File;
  url: string;
  isVideo: boolean;
  color: string;
  preview: string;
  uploading: boolean;
  error?: string;
}

interface SeriesBlock {
  price: string;
  cypEnabled: boolean;
  minimumPrice: string;
  recommendedPrice: string;
  useCustomCypMicrocopy: boolean;
  cypMicrocopyOverride: string;
  media: MediaFile[];
  variants: Variant[];
  activeColor: string | null;
  // Shared stock pool: link this series to a base product
  baseProductId: string;   // product_id of the base series (e.g., "thobe-b01-jiharkah")
  baseSize: string;        // size mapping (e.g., "M" → pulls from base product's M stock)
  /** id baris `products` tersimpan (mode edit) — dipakai saat update agar tidak bikin duplikat. */
  productId: string;
}

type SizeRow = { size: string; stock: number; priceOverride: string; sku: string; weight?: string; /** ID baris `product_variants` lama (dipakai mode Edit supaya ID tidak putus). */ id?: string };

/**
 * Tabel ukuran yang dipakai dua tempat (blok series Thobe & varian biasa).
 * Di layar sempit tiap ukuran jadi satu kartu berlabel (tidak ada tabel yang
 * melebar keluar layar), di sm+ kembali jadi satu baris rapi berkolom tetap.
 */
function SizeGrid({
  sizes,
  onUpdate,
  onUpdateAll,
  onRemove,
  onAdd,
  skuFallback,
  skuContext,
  stockLocked,
  stockLockedLabel,
}: {
  sizes: SizeRow[];
  onUpdate: (idx: number, field: keyof SizeRow, value: string | number) => void;
  /** Ubah SATU field untuk SEMUA baris sekaligus (satu update state, bukan loop per baris). */
  onUpdateAll: (field: keyof SizeRow, value: string | number) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  skuFallback?: string;
  /** Konteks atribut produk untuk SKU otomatis: KATEGORI-KAIN-WARNA-SERIES-UKURAN. */
  skuContext?: { category: string; kain?: string | null; color?: string | null; series?: string | null };
  /** Baris turunan (stok menumpang series induk): kolom STOK dikunci, kolom BERAT tetap bisa diisi. */
  stockLocked?: boolean;
  stockLockedLabel?: string;
}) {
  // ── Bar isi massal: berat yang sama untuk semua ukuran (SATU update state) ──
  const [bulkWeight, setBulkWeight] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkDone, setBulkDone] = useState("");
  const bulkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyBulkWeight() {
    if (bulkTimer.current) clearTimeout(bulkTimer.current);
    setBulkDone("");
    const raw = String(bulkWeight).trim();
    if (raw === "") {
      setBulkError("Isi beratnya dulu.");
      return;
    }
    const w = Number(raw);
    if (!Number.isInteger(w) || w < 1 || w > 5000) {
      setBulkError("Berat harus bilangan bulat 1–5000 gram.");
      return;
    }
    setBulkError("");
    onUpdateAll("weight", w);
    setBulkDone(`Berat ${w.toLocaleString("id-ID")} g diisi ke ${sizes.length} ukuran`);
    bulkTimer.current = setTimeout(() => setBulkDone(""), 3000);
  }

  // ── "Tambah ukuran": tambah ukuran standar berikutnya + fokus ke isian stok baris baru ──
  const stockRefs = useRef<Array<HTMLInputElement | null>>([]);
  const prevCount = useRef(sizes.length);
  useEffect(() => {
    if (sizes.length > prevCount.current) {
      const el = stockRefs.current[sizes.length - 1];
      if (el) el.focus();
    }
    prevCount.current = sizes.length;
  }, [sizes.length]);
  const allStandardUsed = SIZES.every((sz) => sizes.some((s) => String(s.size).toUpperCase() === sz));

  const missingWeight = sizes.filter((s) => String(s.weight ?? "").trim() === "").length;

  return (
    <div className="pf-sizes">
      {/* Bar isi massal — grup sendiri supaya jelas apa yang berubah saat ditekan */}
      <div className="pf-bulkbar">
        <div className="pf-bulkbar-text">
          <span className="pf-bulkbar-title">Isi berat sekaligus</span>
          <span className="pf-bulkbar-hint">
            Diterapkan ke {sizes.length} ukuran di bawah · ukuran tanpa berat memakai berat default
          </span>
        </div>
        <div className="pf-bulkbar-actions">
          <span className={`pf-adorn pf-adorn--g${bulkError ? " invalid" : ""}`}>
            <input
              type="number"
              min={1}
              max={5000}
              inputMode="numeric"
              value={bulkWeight}
              onChange={(e) => { setBulkWeight(e.target.value); if (bulkError) setBulkError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyBulkWeight(); } }}
              placeholder="500"
              aria-label="Berat untuk semua ukuran (gram)"
              className="pf-cell pf-cell-num"
            />
            <span className="pf-suffix">g</span>
          </span>
          <button type="button" className="pf-btn pf-btn-primary pf-bulk-apply" onClick={applyBulkWeight}>
            Terapkan
          </button>
        </div>
      </div>
      {bulkError ? <p className="pf-error pf-sizes-msg">{bulkError}</p> : null}
      {!bulkError && bulkDone ? <p className="pf-sizes-done pf-sizes-msg">✓ {bulkDone}</p> : null}

      {/* Header kolom (layar ≥768px) */}
      <div className="pf-sizes-head">
        <span>Ukuran</span>
        <span>Stok</span>
        <span>Berat</span>
        <span>Harga Khusus</span>
        <span>SKU</span>
        <span className="pf-sizes-head-act" />
      </div>

      <div className="pf-sizes-list">
      {sizes.map((s, i) => {
        const weightEmpty = String(s.weight ?? "").trim() === "";
        return (
          <div key={i} className="pf-size-row">
            <div className="pf-size-head">
              <label className="pf-size-field pf-f-size">
                <span className="pf-size-label">Ukuran</span>
                <input value={s.size} onChange={(e) => onUpdate(i, "size", e.target.value.toUpperCase())}
                  onFocus={(e) => e.target.select()} list="size-suggestions" className="pf-cell pf-cell-center" placeholder="—" />
              </label>
              <div className="pf-size-act">
                {sizes.length > 1 ? (
                  <button type="button" onClick={() => onRemove(i)} className="pf-rowdel" title="Hapus ukuran" aria-label={`Hapus ukuran ${s.size || i + 1}`}>
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="pf-size-body">
              <div className="pf-size-field pf-f-stock">
                <span className="pf-size-label">Stok</span>
                {stockLocked ? (
                  <span className="pf-adorn is-locked" title={stockLockedLabel}>
                    <Lock size={12} aria-hidden />
                    <span className="pf-locked-text">{stockLockedLabel}</span>
                  </span>
                ) : (
                  <span className="pf-adorn">
                    <input
                      ref={(el) => { stockRefs.current[i] = el; }}
                      type="number"
                      inputMode="numeric"
                      value={s.stock ?? 0}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => onUpdate(i, "stock", parseInt(e.target.value) || 0)}
                      placeholder="0"
                      className="pf-cell pf-cell-num"
                    />
                  </span>
                )}
              </div>

              <div className="pf-size-field pf-f-weight">
                <span className="pf-size-label">Berat</span>
                <span className={`pf-adorn pf-adorn--g${weightEmpty ? " is-missing" : ""}`}>
                  {weightEmpty ? <span className="pf-dot-warn" title="belum diisi" aria-label="belum diisi" /> : null}
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    inputMode="numeric"
                    value={s.weight ?? ""}
                    onChange={(e) => onUpdate(i, "weight", e.target.value)}
                    placeholder="—"
                    title={weightEmpty ? "belum diisi" : undefined}
                    className="pf-cell pf-cell-num"
                  />
                  <span className="pf-suffix">g</span>
                </span>
              </div>

              <label className="pf-size-field pf-f-price">
                <span className="pf-size-label">Harga khusus</span>
                <span className="pf-adorn pf-adorn--rp">
                  <span className="pf-prefix">Rp</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatRupiah(s.priceOverride)}
                    onChange={(e) => onUpdate(i, "priceOverride", parseRupiah(e.target.value))}
                    placeholder="—"
                    className="pf-cell pf-cell-num"
                  />
                </span>
              </label>

              <label className="pf-size-field pf-f-sku">
                <span className="pf-size-label">SKU</span>
                <input
                  value={s.sku || (skuContext ? generateVariantSku({ ...skuContext, size: s.size }) : "")}
                  onChange={(e) => onUpdate(i, "sku", e.target.value)}
                  placeholder={skuFallback?.trim() || "—"}
                  title="Otomatis dari kategori-kain-warna-series-ukuran. Bisa diedit."
                  className="pf-cell"
                />
              </label>
            </div>
          </div>
        );
      })}
      </div>

      <datalist id="size-suggestions">{SIZES.map((sz) => <option key={sz} value={sz} />)}</datalist>

      <div className="pf-sizes-foot">
        <button type="button" onClick={onAdd} className="pf-add" disabled={allStandardUsed}
          title={allStandardUsed ? "Semua ukuran standar sudah ada" : "Tambah ukuran standar berikutnya"}>
          <Plus size={14} /> Tambah ukuran
        </button>
        {missingWeight > 0 ? (
          <span className="pf-missing-chip" title="Ukuran ini memakai berat default saat menghitung ongkir">
            {missingWeight} dari {sizes.length} ukuran belum ada berat
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Daftar varian untuk kategori paket (Cover & Hanger dan Kabak): satu baris = satu varian
 * dengan NAMA bebas (tidak ada warna & ukuran). Struktur & gaya barisnya sama dengan
 * `SizeGrid` (kelas `pf-*`), hanya kolom pertama yang berubah dari "Ukuran" jadi "Nama varian".
 */
function PaketVariantList({
  variants,
  template,
  placeholder,
  skuFallback,
  skuContext,
  onUpdateName,
  onUpdateField,
  onAdd,
  onAddTemplate,
  onRemove,
}: {
  variants: Variant[];
  /** Nama varian siap pakai sesuai kategori (Hanger/Cover atau Kabak 01–15). */
  template: string[];
  placeholder: string;
  skuFallback?: string;
  /** Konteks kategori untuk SKU otomatis paket: KATEGORI-WARNA (tanpa ukuran). */
  skuContext?: { category: string };
  onUpdateName: (idx: number, value: string) => void;
  onUpdateField: (idx: number, field: keyof SizeRow, value: string | number) => void;
  onAdd: () => void;
  onAddTemplate: () => void;
  onRemove: (idx: number) => void;
}) {
  const duplicates = duplicatePaketNames(variants);
  const missingWeight = variants.filter((v) => String(v.sizes[0]?.weight ?? "").trim() === "").length;
  // Daftar panjang (Kabak 01–15) diringkas jadi rentang supaya bar hint tidak memanjang.
  const templateLabel = template.length > 5 ? `${template[0]}–${template[template.length - 1]}` : template.join(" · ");

  return (
    <div className="pf-sizes">
      {/* Aksi cepat: isi nama varian siap pakai — nama tetap bisa diubah & baris tetap bisa dihapus */}
      <div className="pf-bulkbar">
        <div className="pf-bulkbar-text">
          <span className="pf-bulkbar-title">Tambah dari template</span>
          <span className="pf-bulkbar-hint">Mengisi {template.length} varian: {templateLabel} (nama masih bisa diubah)</span>
        </div>
        <div className="pf-bulkbar-actions">
          <button type="button" className="pf-btn pf-btn-ghost" onClick={onAddTemplate}>Tambah dari template</button>
        </div>
      </div>

      {duplicates.size > 0 ? (
        <p className="pf-error pf-sizes-msg">Nama varian tidak boleh kembar: {[...duplicates].join(", ")}</p>
      ) : null}

      {/* Header kolom (layar ≥768px) */}
      <div className="pf-sizes-head">
        <span>Nama Varian</span>
        <span>Stok</span>
        <span>Berat</span>
        <span>Harga Khusus</span>
        <span>SKU</span>
        <span className="pf-sizes-head-act" />
      </div>

      <div className="pf-sizes-list">
        {variants.map((v, i) => {
          const s = v.sizes[0] ?? { size: PAKET_SIZE, stock: 0, priceOverride: "", sku: "", weight: "" };
          const weightEmpty = String(s.weight ?? "").trim() === "";
          const isDuplicate = duplicates.has(String(v.color ?? "").trim().toLowerCase());
          return (
            <div key={i} className="pf-size-row">
              <div className="pf-size-head">
                <label className="pf-size-field pf-f-size">
                  <span className="pf-size-label">Nama varian</span>
                  <input
                    value={v.color}
                    onChange={(e) => onUpdateName(i, e.target.value)}
                    placeholder={placeholder}
                    list="paket-suggestions"
                    aria-invalid={isDuplicate || undefined}
                    title={isDuplicate ? "Nama varian ini dipakai lebih dari satu baris" : undefined}
                    className={`pf-cell${isDuplicate ? " invalid" : ""}`}
                  />
                </label>
                <div className="pf-size-act">
                  {variants.length > 1 ? (
                    <button type="button" onClick={() => onRemove(i)} className="pf-rowdel" title="Hapus varian" aria-label={`Hapus varian ${v.color || i + 1}`}>
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="pf-size-body">
                <div className="pf-size-field pf-f-stock">
                  <span className="pf-size-label">Stok</span>
                  <span className="pf-adorn">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={s.stock ?? 0}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => onUpdateField(i, "stock", parseInt(e.target.value) || 0)}
                      placeholder="0"
                      className="pf-cell pf-cell-num"
                    />
                  </span>
                </div>

                <div className="pf-size-field pf-f-weight">
                  <span className="pf-size-label">Berat</span>
                  <span className={`pf-adorn pf-adorn--g${weightEmpty ? " is-missing" : ""}`}>
                    {weightEmpty ? <span className="pf-dot-warn" title="belum diisi" aria-label="belum diisi" /> : null}
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      inputMode="numeric"
                      value={s.weight ?? ""}
                      onChange={(e) => onUpdateField(i, "weight", e.target.value)}
                      placeholder="—"
                      title={weightEmpty ? "belum diisi" : undefined}
                      className="pf-cell pf-cell-num"
                    />
                    <span className="pf-suffix">g</span>
                  </span>
                </div>

                <label className="pf-size-field pf-f-price">
                  <span className="pf-size-label">Harga khusus</span>
                  <span className="pf-adorn pf-adorn--rp">
                    <span className="pf-prefix">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatRupiah(s.priceOverride)}
                      onChange={(e) => onUpdateField(i, "priceOverride", parseRupiah(e.target.value))}
                      placeholder="—"
                      className="pf-cell pf-cell-num"
                    />
                  </span>
                </label>

                <label className="pf-size-field pf-f-sku">
                  <span className="pf-size-label">SKU</span>
                  <input
                    value={s.sku || (skuContext ? generateVariantSku({ ...skuContext, color: v.color, size: s.size }) : "")}
                    onChange={(e) => onUpdateField(i, "sku", e.target.value)}
                    placeholder={skuFallback?.trim() || "—"}
                    title="Otomatis dari kategori + nama varian. Bisa diedit."
                    className="pf-cell"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <datalist id="paket-suggestions">
        {template.map((n) => <option key={n} value={n} />)}
      </datalist>

      <div className="pf-sizes-foot">
        <button type="button" onClick={onAdd} className="pf-add">
          <Plus size={14} /> Tambah Varian
        </button>
        {missingWeight > 0 ? (
          <span className="pf-missing-chip" title="Varian ini memakai berat default saat menghitung ongkir">
            {missingWeight} dari {variants.length} varian belum ada berat
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function TambahProdukPage({
  mode = "admin",
  editProductId,
  priceTarget = "catalog",
}: { mode?: "admin" | "ops"; editProductId?: string; priceTarget?: "catalog" | "openOrder" } = {}) {
  const router = useRouter();
  const storeSettings = useStoreSettings();
  // Dua mode satu komponen: "admin" (katalog lengkap, dengan foto) dan "ops" (internal:
  // tanpa foto, plus SKU/HPP/Tipe Produk, dan produk baru BELUM tampil di website).
  const isOps = mode === "ops";
  const isEdit = !!editProductId;
  // Harga diarahkan ke kolom khusus Open Order (`open_order_*`) saat `priceTarget = "openOrder"`
  // (menu Open Order) supaya harga kampanye beda tanpa mengubah harga katalog (`products.price`).
  const isOpenOrderPrice = priceTarget === "openOrder";
  // Sadar-base: di panel admin, "kembali" harus ke /panel-admin/produk, bukan /ops/master-produk.
  const pageUrl = usePageUrl();
  const backHref = isOps ? pageUrl("MasterProduk") : isOpenOrderPrice ? "/admin/open-order" : "/admin";
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editProductId);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Basic fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // SKU dasar produk (tanpa ukuran). Kosong = otomatis dari kategori-kain-warna-series.
  // SKU tiap varian dihitung per ukuran di SizeGrid.
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  /** ID baris `product_variants` Cover & Hanger yang dimuat saat Edit (supaya ID-nya tidak putus). */
  const paketIdsLamaRef = useRef<string[]>([]);
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [weight, setWeight] = useState("");
  const [series, setSeries] = useState("");
  const [catatanHarga, setCatatanHarga] = useState("");
  const [selectedJenisKainId, setSelectedJenisKainId] = useState<string>("");
  const [showNewKainForm, setShowNewKainForm] = useState(false);
  const [badgeType, setBadgeType] = useState<string>("");
  // Ikut Open Order: produk baru default tampil di /open-order (bisa dimatikan kapan saja).
  const [openOrderEnabled, setOpenOrderEnabled] = useState(true);

  // ── Field khusus mode ops (dipakai laporan internal) ──
  const [productType, setProductType] = useState<"normal" | "free_gift">("normal");
  const [hpp, setHpp] = useState("");

  // Series list (dari produk yang sudah ada) + tambah baru
  const [seriesList, setSeriesList] = useState<string[]>([]);
  const [showNewSeries, setShowNewSeries] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState("");

  // Warna custom dikelola di dalam PresetColorPicker (state lokal komponen)

  // Jenis Kain list
  const [jenisKainList, setJenisKainList] = useState<{ id: string; name: string }[]>([]);

  // Create Your Price
  const [cypEnabled, setCypEnabled] = useState(false);
  const [minimumPrice, setMinimumPrice] = useState("");
  const [recommendedPrice, setRecommendedPrice] = useState("");
  const [useCustomCypMicrocopy, setUseCustomCypMicrocopy] = useState(false);
  const [cypMicrocopyOverride, setCypMicrocopyOverride] = useState("");

  // Variants
  const [variants, setVariants] = useState<Variant[]>([]);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  /** Produk SAMAQU biasa: satu varian `default`, warna ada di nama produk. */
  const onlyDefaultVariant =
    variants.length === 1 && String(variants[0]?.color || "").trim().toLowerCase() === "default";

  // Media
  const [media, setMedia] = useState<MediaFile[]>([]);
  /**
   * Varian paket yang sedang dipilih untuk upload media. Kosong = media fallback
   * untuk semua varian. Nilainya disimpan sebagai `color` di `product_images`
   * supaya katalog bisa menampilkan foto per varian (Kabak 01, Kabak 12, dst).
   */
  const [paketMediaColor, setPaketMediaColor] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);

  // Thobe multi-series
  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
  const [seriesBlocks, setSeriesBlocks] = useState<Record<string, SeriesBlock>>({});
  const [activeSeriesTab, setActiveSeriesTab] = useState<string | null>(null);
  // Mode edit: nama asli + series asli yang ter-load — dipakai untuk rename & menentukan
  // baris series mana yang boleh dihapus saat dicabut dari checklist.
  const [originalName, setOriginalName] = useState("");
  const [originalSelectedSeries, setOriginalSelectedSeries] = useState<string[]>([]);

  // ── Kategori paket (Cover & Hanger / Kabak): varian berupa NAMA, bukan warna × ukuran ──
  const isPaket = isPaketKategori(category);
  const paketTemplate = paketTemplateFor(category);
  const paketPlaceholder = paketPlaceholderFor(category);
  /** Ada isian varian yang bakal hilang kalau mode varian ikut ganti kategori (untuk konfirmasi). */
  const variantDataFilled = isPaket
    ? variants.some((v) => String(v.color).trim() !== "" || v.sizes.some((s) => s.stock > 0))
    : variants.length > 0;
  /**
   * Pemilik media. Untuk kategori paket, `color` diisi nama varian (mis. "Kabak 01")
   * supaya katalog bisa menampilkan foto per varian; kosong = fallback untuk semua varian.
   * Katalog memfilter `!m.color || m.color === selectedColor`.
   */
  const mediaColor = isPaket ? paketMediaColor : category === "Thobe" ? "default" : activeColor || "default";

  // ── SKU otomatis ──
  // SKU produk = dasar tanpa ukuran (KATEGORI-KAIN-WARNA[-SERIES]); SKU varian
  // menambahkan ukuran. Series Thobe ditambahkan per baris series saat simpan.
  const kainName = jenisKainList.find((j) => j.id === selectedJenisKainId)?.name || "";
  const skuColor =
    category === "Thobe"
      ? resolveColorName({
          color: "",
          productName: name,
          category,
          series: activeSeriesTab || selectedSeries[0] || "",
        })
      : resolveColorName({
          color: activeColor || variants[0]?.color || "",
          productName: name,
          category,
          series,
        });
  const autoBaseSku =
    !category || !skuColor
      ? ""
      : generateBaseSku({
          category,
          kain: kainName,
          color: skuColor,
          series: category === "Thobe" ? "" : series,
        });

  /** Kalau varian yang dipilih untuk media dihapus/di-rename, jatuh ke varian pertama. */
  useEffect(() => {
    if (!isPaket) return;
    const names = variants.map((v) => String(v.color || "").trim()).filter(Boolean);
    if (paketMediaColor && !names.includes(paketMediaColor)) {
      setPaketMediaColor(names[0] || "");
    }
  }, [isPaket, variants, paketMediaColor]);

  // Fetch jenis_kain list + daftar series dari tabel product_series
  useEffect(() => {
    supabase.from("jenis_kain").select("id, name").order("display_order").then(({ data }) => {
      if (data) setJenisKainList(data);
    });
    supabase.from("product_series").select("name").order("name").then(({ data }) => {
      if (data && data.length > 0) {
        setSeriesList(data.map((r) => r.name));
      } else {
        setSeriesList(["Jiharkah", "Imron", "Bayati", "Nahawand", "Karim", "Imalah"]);
      }
    });
  }, []);

  // ── Mode edit: muat data produk yang ada (produk, series, varian, media, Produk Dasar) ──
  useEffect(() => {
    if (!editProductId) return;
    let alive = true;
    async function loadProduct() {
      try {
        const { data: product } = await supabase.from("products").select("*").eq("id", editProductId).single();
        if (!product) { router.push(backHref); return; }
        if (!alive) return;
        setName(product.name);
        setOriginalName(product.name);
        setSlug(product.id);
        // Hanya ejaan lama Cover/Hanger yang dinormalkan. Kabak tetap "Kabak".
        setCategory(isCoverHangerKategori(product.category) ? COVER_HANGER : product.category);
        setDescription(product.description || "");
        // Harga: mode Open Order membaca kolom `open_order_*` (fallback ke harga katalog bila
        // belum pernah diatur) supaya form tidak kosong; mode biasa membaca kolom katalog.
        const priceValue = isOpenOrderPrice ? product.open_order_price ?? product.price : product.price;
        const minimumValue = isOpenOrderPrice ? product.open_order_minimum_price ?? product.minimum_price : product.minimum_price;
        const recommendedValue = isOpenOrderPrice ? product.open_order_recommended_price ?? product.recommended_price : product.recommended_price;
        const cypValue = isOpenOrderPrice ? product.open_order_cyp_enabled ?? product.create_your_price_enabled : product.create_your_price_enabled;
        const microcopyValue = isOpenOrderPrice ? product.open_order_cyp_microcopy ?? product.cyp_microcopy_override : product.cyp_microcopy_override;

        setBasePrice(priceValue != null ? String(priceValue) : "");
        setWeight(product.weight ? String(product.weight) : "");
        setSeries(product.series || "");
        setCatatanHarga(product.catatan_harga || "");
        setBadgeType(product.badge_type || "");
        setOpenOrderEnabled(product.open_order_enabled ?? true);
        setSelectedJenisKainId(product.jenis_kain_id || "");
        setCypEnabled(cypValue || false);
        setMinimumPrice(minimumValue ? String(minimumValue) : "");
        setRecommendedPrice(recommendedValue ? String(recommendedValue) : "");
        setCypMicrocopyOverride(microcopyValue || "");
        setUseCustomCypMicrocopy(!!microcopyValue);
        const loadedSku = product.sku || "";
        const loadedSeriesSuffix = product.category === "Thobe" ? seriesCode(product.series || "") : "";
        setSku(
          loadedSeriesSuffix && loadedSku.toUpperCase().endsWith(`-${loadedSeriesSuffix}`)
            ? loadedSku.slice(0, -(loadedSeriesSuffix.length + 1))
            : loadedSku,
        );
        setHpp(product.hpp ? String(product.hpp) : "");
        setProductType(product.product_type === "free_gift" ? "free_gift" : "normal");

        // Thobe multi-series: muat semua baris senama (satu block per series).
        if (product.category === "Thobe" && product.name) {
          const { data: siblings } = await supabase
            .from("products")
            .select("id, name, series, price, minimum_price, recommended_price, create_your_price_enabled, cyp_microcopy_override, open_order_price, open_order_minimum_price, open_order_recommended_price, open_order_cyp_enabled, open_order_cyp_microcopy, image, images")
            .eq("category", "Thobe")
            .eq("name", product.name)
            .order("created_at", { ascending: true });
          const blocks: Record<string, SeriesBlock> = {};
          const seriesNames: string[] = [];
          for (const sib of siblings || []) {
            if (!sib.series || blocks[sib.series]) continue;
            const { data: sibVariants } = await supabase.from("product_variants").select("*").eq("product_id", sib.id).order("display_order");
            const colorGroups: Record<string, Variant> = {};
            let baseProductId = "";
            let baseSize = "";
            (sibVariants || []).forEach((v: { color: string; hex: string | null; size: string; stock: number; weight: number | null; price_override: number | null; sku: string | null; base_product_id: string | null; base_size: string | null }) => {
              if (!colorGroups[v.color]) colorGroups[v.color] = { color: v.color, hex: v.hex || "#141414", sizes: [] };
              colorGroups[v.color].sizes.push({ size: v.size, stock: v.stock, weight: v.weight ? String(v.weight) : "", priceOverride: v.price_override ? String(v.price_override) : "", sku: v.sku || "" });
              if (v.base_product_id && !baseProductId) { baseProductId = v.base_product_id; baseSize = v.base_size || ""; }
            });
            const { data: sibImages } = await supabase.from("product_images").select("*").eq("product_id", sib.id).order("display_order");
            const sibMedia: MediaFile[] = (sibImages || []).map((img: { id: string; url: string; is_video: boolean; color: string }) => ({
              id: img.id, url: img.url, isVideo: img.is_video, color: img.color, preview: img.url, uploading: false,
            }));
            const varList = Object.values(colorGroups);
            seriesNames.push(sib.series);
            // Mode Open Order: pakai kolom `open_order_*` (fallback ke harga katalog tiap series).
            const blockPrice = isOpenOrderPrice ? sib.open_order_price ?? sib.price : sib.price;
            const blockMinimum = isOpenOrderPrice ? sib.open_order_minimum_price ?? sib.minimum_price : sib.minimum_price;
            const blockRecommended = isOpenOrderPrice ? sib.open_order_recommended_price ?? sib.recommended_price : sib.recommended_price;
            const blockCyp = isOpenOrderPrice ? sib.open_order_cyp_enabled ?? sib.create_your_price_enabled : sib.create_your_price_enabled;
            const blockMicrocopy = isOpenOrderPrice ? sib.open_order_cyp_microcopy ?? sib.cyp_microcopy_override : sib.cyp_microcopy_override;
            blocks[sib.series] = {
              productId: sib.id,
              price: blockPrice != null ? String(blockPrice) : "",
              cypEnabled: blockCyp || false,
              minimumPrice: blockMinimum != null ? String(blockMinimum) : "",
              recommendedPrice: blockRecommended != null ? String(blockRecommended) : "",
              useCustomCypMicrocopy: !!blockMicrocopy,
              cypMicrocopyOverride: blockMicrocopy || "",
              media: sibMedia,
              variants: varList.length > 0 ? varList : [{ color: "default", hex: "#141414", sizes: [{ size: "M", stock: 0, priceOverride: "", sku: "" }] }],
              activeColor: varList[0]?.color || "default",
              baseProductId,
              baseSize,
            };
          }
          if (seriesNames.length > 0) {
            setSelectedSeries(seriesNames);
            setOriginalSelectedSeries(seriesNames);
            setSeriesBlocks(blocks);
            setActiveSeriesTab(blocks[product.series] ? product.series : seriesNames[0]);
            setVariants([]);
            setMedia([]);
            if (alive) setLoading(false);
            return;
          }
        }

        // Non-Thobe (atau Thobe tanpa series): varian & media global.
        const { data: dbVariants } = await supabase.from("product_variants").select("*").eq("product_id", editProductId).order("display_order");
        if (isPaketKategori(product.category)) {
          // Cover & Hanger: tiap baris = satu NAMA varian (bukan warna × ukuran). Nama paket
          // dibaca dari `color` (data lama bisa menyimpannya di `series`/nama produk), ukuran
          // penanda (ALL SIZE) diabaikan sepenuhnya; stok, berat, harga khusus, dan SKU baris lama
          // terbawa apa adanya. ID baris disimpan supaya menyimpan ulang tidak memutus referensi.
          const rowsPaket = (dbVariants || []).map((v: { id: string; color: string | null; stock: number; weight: number | null; price_override: number | null; sku: string | null }) => ({
            color: (isPaketSize(v.color) ? "" : variantName(v.color)) || variantName(product.series) || variantName(product.name),
            hex: "",
            sizes: [{
              id: v.id,
              size: PAKET_SIZE,
              stock: Number(v.stock) || 0,
              priceOverride: v.price_override ? String(v.price_override) : "",
              sku: v.sku || "",
              weight: v.weight ? String(v.weight) : "",
            }],
          }));
          paketIdsLamaRef.current = rowsPaket.map((row) => row.sizes[0].id).filter((id): id is string => Boolean(id));
          setVariants(rowsPaket.length > 0 ? rowsPaket : [emptyPaketVariant()]);
          setPaketMediaColor(rowsPaket[0]?.color || "");
        } else if (dbVariants && dbVariants.length > 0) {
          const colorGroups: Record<string, Variant> = {};
          dbVariants.forEach((v: { color: string; hex: string | null; size: string; stock: number; weight: number | null; price_override: number | null; sku: string | null }) => {
            if (!colorGroups[v.color]) colorGroups[v.color] = { color: v.color, hex: v.hex || colorMap[v.color] || "#141414", sizes: [] };
            colorGroups[v.color].sizes.push({ size: v.size, stock: v.stock, weight: v.weight ? String(v.weight) : "", priceOverride: v.price_override ? String(v.price_override) : "", sku: v.sku || "" });
          });
          const varList = Object.values(colorGroups);
          setVariants(varList);
          setActiveColor(varList[0]?.color || null);
        }
        const { data: dbImages } = await supabase.from("product_images").select("*").eq("product_id", editProductId).order("display_order");
        if (dbImages) {
          setMedia(dbImages.map((img: { id: string; url: string; is_video: boolean; color: string }) => ({
            id: img.id, url: img.url, isVideo: img.is_video, color: img.color, preview: img.url, uploading: false,
          })));
        }
      } catch (err) {
        console.error("Load produk error:", err);
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadProduct();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editProductId]);

  // Auto-generate slug from name
  function handleNameChange(val: string) {
    setName(val);
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(val));
    }
  }

  function generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /** Nama series induk dari `baseProductId` (untuk label "ikut <series>"). */
  function parentSeriesName(baseId: string): string {
    if (!baseId) return "";
    const baseSlug = generateSlug(name);
    return selectedSeries.find((s) => `${baseSlug}-${s.toLowerCase().replace(/\s+/g, "-")}` === baseId) || "";
  }

  /** Berat ukuran terbesar yang terisi pada satu daftar ukuran (0 = belum ada yang diisi). */
  function maxSizeWeight(rows: SizeRow[]): number {
    let max = 0;
    for (const r of rows) {
      const n = Number(String(r?.weight ?? "").trim());
      if (Number.isInteger(n) && n > 0) max = Math.max(max, n);
    }
    return max;
  }

  /** Berat default (read-only) yang dipakai ukuran tanpa berat — dari `products.weight`. */
  const defaultWeightGrams = Number(String(weight).trim()) || 0;

  /** Rentang berat dari ukuran yang sudah diisi (kosong kalau belum ada yang diisi). */
  const weightRange = useMemo(() => {
    const rows = category === "Thobe" && activeSeriesTab && seriesBlocks[activeSeriesTab]
      ? seriesBlocks[activeSeriesTab].variants.flatMap((v) => v.sizes)
      : variants.flatMap((v) => v.sizes);
    const nums = rows
      .map((s) => Number(String(s.weight ?? "").trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (nums.length === 0) return "";
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return min === max
      ? `Berat ${min.toLocaleString("id-ID")} g`
      : `Berat ${min.toLocaleString("id-ID")} sampai ${max.toLocaleString("id-ID")} g`;
  }, [category, activeSeriesTab, seriesBlocks, variants]);

  // Add color variant
  function addColor(color: string, hex?: string) {
    if (variants.find((v) => v.color === color)) return;
    setVariants([...variants, { color, hex: hex || colorMap[color] || "#141414", sizes: [{ size: "M", stock: 0, priceOverride: "", sku: "" }] }]);
    setActiveColor(color);
  }

  // Tambah series baru → simpan ke Supabase
  async function addNewSeries() {
    const nama = newSeriesName.trim();
    if (!nama) return;
    if (!seriesList.find((s) => s.toLowerCase() === nama.toLowerCase())) {
      await supabase.from("product_series").upsert({ name: nama }, { onConflict: "name" });
      setSeriesList((prev) => [...prev, nama].sort());
    }
    // Auto-select the new series for Thobe
    if (category === "Thobe" && !selectedSeries.includes(nama)) {
      toggleSeries(nama);
    } else {
      setSeries(nama);
    }
    setShowNewSeries(false);
    setNewSeriesName("");
  }

  // Remove color variant
  function removeColor(color: string) {
    setVariants(variants.filter((v) => v.color !== color));
    setMedia(media.filter((m) => m.color !== color));
    if (activeColor === color) setActiveColor(variants[0]?.color || null);
  }

  // Add size to variant
  function addSize(color: string) {
    setVariants(variants.map((v) => {
      if (v.color !== color) return v;
      const usedSizes = v.sizes.map((s) => s.size);
      const nextSize = SIZES.find((s) => !usedSizes.includes(s)) || "M";
      return { ...v, sizes: [...v.sizes, { size: nextSize, stock: 0, priceOverride: "", sku: "" }] };
    }));
  }

  // Remove size from variant
  function removeSize(color: string, sizeIdx: number) {
    setVariants(variants.map((v) => {
      if (v.color !== color) return v;
      return { ...v, sizes: v.sizes.filter((_, i) => i !== sizeIdx) };
    }));
  }

  // Update size field
  function updateSizeField(color: string, sizeIdx: number, field: string, value: string | number) {
    setVariants(variants.map((v) => {
      if (v.color !== color) return v;
      const sizes = [...v.sizes];
      sizes[sizeIdx] = { ...sizes[sizeIdx], [field]: value };
      return { ...v, sizes };
    }));
  }

  /** Ubah satu field untuk SEMUA ukuran warna ini sekaligus — SATU update state. */
  function updateSizesBulk(color: string, field: string, value: string | number) {
    setVariants((prev) =>
      prev.map((v) =>
        v.color === color ? { ...v, sizes: v.sizes.map((s) => ({ ...s, [field]: value })) } : v
      )
    );
  }

  // Toggle CYP: rekomendasi otomatis Harga Dasar + Rp 30.000 kalau masih kosong (seperti HTML)
  function toggleCyp() {
    const next = !cypEnabled;
    if (next && !recommendedPrice && basePrice) setRecommendedPrice(String((parseInt(basePrice) || 0) + 30000));
    setCypEnabled(next);
  }

  // Handle file select
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, color: string) {
    const files = e.target.files;
    // Cover & Hanger tidak punya warna, jadi tidak lagi mensyaratkan `activeColor`.
    if (!files) return;

    const newMedia: MediaFile[] = [];
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      // Satu aturan validasi untuk semua halaman admin: MIME, ekstensi, ukuran,
      // durasi (maks 2 menit) dan resolusi (maks 1080p). Video ditolak di sini
      // sebelum sempat memakan video processing unit Cloudinary.
      try {
        await validateMediaFile(file);
      } catch (err) {
        alert(err instanceof Error ? err.message : `${file.name}: format tidak didukung`);
        continue;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preview = URL.createObjectURL(file);
      newMedia.push({ id, file, url: "", isVideo, color, preview, uploading: true });
    }

    setMedia((prev) => [...prev, ...newMedia]);

    // Upload each file
    for (const item of newMedia) {
      try {
        const url = await uploadToCloudinary(item.file!);
        setMedia((prev) => prev.map((m) => m.id === item.id ? { ...m, url, uploading: false } : m));
      } catch {
        setMedia((prev) => prev.map((m) => m.id === item.id ? { ...m, uploading: false, error: "Upload gagal" } : m));
      }
    }
    e.target.value = "";
  }

  // Remove media
  function removeMedia(id: string) {
    setMedia((prev) => {
      const item = prev.find((m) => m.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((m) => m.id !== id);
    });
  }

  // Tambah media via URL (tempel link gambar/video)
  const [mediaUrl, setMediaUrl] = useState("");
  function addMediaByUrl() {
    const u = mediaUrl.trim();
    if (!u) return;
    const isVideo = /\.(mp4|webm|ogg|m4v)(\?|#|$)/i.test(u);
    setMedia((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, url: u, isVideo, color: mediaColor, preview: u, uploading: false }]);
    setMediaUrl("");
  }

  // ── Thobe multi-series helpers ──
  function toggleSeries(seriesName: string) {
    setSelectedSeries((prev) => {
      const next = prev.includes(seriesName)
        ? prev.filter((s) => s !== seriesName)
        : [...prev, seriesName];
      // Create default block for newly checked series
      if (!prev.includes(seriesName)) {
        setSeriesBlocks((blocks) => ({
          ...blocks,
          [seriesName]: blocks[seriesName] || {
            price: basePrice || "",
            cypEnabled: false,
            minimumPrice: "",
            recommendedPrice: "",
            useCustomCypMicrocopy: false,
            cypMicrocopyOverride: "",
            media: [],
            variants: [{ color: "default", hex: "#141414", sizes: [{ size: "M", stock: 0, priceOverride: "", sku: "" }] }],
            activeColor: "default",
            baseProductId: "",
            baseSize: "",
            productId: "",
          },
        }));
        setActiveSeriesTab(seriesName);
      }
      // Cleanup block when unchecked
      if (prev.includes(seriesName)) {
        setSeriesBlocks((blocks) => {
          const next = { ...blocks };
          delete next[seriesName];
          return next;
        });
        if (activeSeriesTab === seriesName) {
          const remaining = prev.filter((s) => s !== seriesName);
          setActiveSeriesTab(remaining[0] || null);
        }
      }
      return next;
    });
  }

  function updateSeriesBlock(seriesName: string, patch: Partial<SeriesBlock>) {
    setSeriesBlocks((prev) => ({
      ...prev,
      [seriesName]: { ...prev[seriesName], ...patch },
    }));
  }

  function activeSeriesVariant(block: SeriesBlock): Variant | undefined {
    return (
      block.variants.find((v) => v.color === block.activeColor) ||
      block.variants[0]
    );
  }

  function addSeriesColor(seriesName: string, color: string, hex?: string) {
    const nextColor = String(color || "").trim();
    if (!nextColor) return;
    setSeriesBlocks((prev) => {
      const block = prev[seriesName];
      if (!block) return prev;
      if (block.variants.some((v) => v.color === nextColor)) {
        return { ...prev, [seriesName]: { ...block, activeColor: nextColor } };
      }

      const first = block.variants[0];
      const onlyDefault =
        block.variants.length === 1 &&
        String(first?.color || "").trim().toLowerCase() === "default";
      const resolvedDefault = resolveColorName({
        color: "default",
        productName: name,
        category: "Thobe",
        series: seriesName,
      });
      const placeholderEmpty =
        !!first &&
        first.sizes.every((s) => !s.stock && !s.sku && !s.priceOverride && s.size === "M");
      const sameAsName =
        !!resolvedDefault && resolvedDefault.trim().toLowerCase() === nextColor.toLowerCase();
      const replaceDefault = onlyDefault && (placeholderEmpty || sameAsName);
      const nextVariant: Variant = {
        color: nextColor,
        hex: hex || colorMap[nextColor] || "#141414",
        sizes: replaceDefault
          ? first.sizes
          : [{ size: "M", stock: 0, priceOverride: "", sku: "" }],
      };

      return {
        ...prev,
        [seriesName]: {
          ...block,
          variants: replaceDefault ? [nextVariant] : [...block.variants, nextVariant],
          activeColor: nextColor,
        },
      };
    });
  }

  function removeSeriesColor(seriesName: string, color: string) {
    setSeriesBlocks((prev) => {
      const block = prev[seriesName];
      if (!block || block.variants.length <= 1) return prev;
      const variants = block.variants.filter((v) => v.color !== color);
      return {
        ...prev,
        [seriesName]: {
          ...block,
          variants,
          activeColor:
            block.activeColor === color
              ? variants[0]?.color || null
              : block.activeColor,
        },
      };
    });
  }

  function addSizeToSeriesBlock(seriesName: string) {
    setSeriesBlocks((prev) => {
      const block = prev[seriesName];
      if (!block) return prev;
      const v = activeSeriesVariant(block);
      if (!v) return prev;
      const usedSizes = v.sizes.map((s) => s.size);
      const nextSize = SIZES.find((s) => !usedSizes.includes(s)) || "M";
      return {
        ...prev,
        [seriesName]: {
          ...block,
          variants: block.variants.map((item) =>
            item.color === v.color
              ? { ...item, sizes: [...item.sizes, { size: nextSize, stock: 0, priceOverride: "", sku: "" }] }
              : item,
          ),
        },
      };
    });
  }

  function removeSizeFromSeriesBlock(seriesName: string, sizeIdx: number) {
    setSeriesBlocks((prev) => {
      const block = prev[seriesName];
      if (!block) return prev;
      const v = activeSeriesVariant(block);
      if (!v) return prev;
      return {
        ...prev,
        [seriesName]: {
          ...block,
          variants: block.variants.map((item) =>
            item.color === v.color
              ? { ...item, sizes: item.sizes.filter((_, i) => i !== sizeIdx) }
              : item,
          ),
        },
      };
    });
  }

  function updateSeriesBlockSizeField(seriesName: string, sizeIdx: number, field: string, value: string | number) {
    setSeriesBlocks((prev) => {
      const block = prev[seriesName];
      if (!block) return prev;
      const v = activeSeriesVariant(block);
      if (!v) return prev;
      const sizes = [...v.sizes];
      sizes[sizeIdx] = { ...sizes[sizeIdx], [field]: value };
      return {
        ...prev,
        [seriesName]: {
          ...block,
          variants: block.variants.map((item) =>
            item.color === v.color ? { ...item, sizes } : item,
          ),
        },
      };
    });
  }

  /** Ubah satu field untuk SEMUA ukuran pada warna aktif series — SATU update state. */
  function updateSeriesBlockSizesBulk(seriesName: string, field: string, value: string | number) {
    setSeriesBlocks((prev) => {
      const block = prev[seriesName];
      if (!block) return prev;
      const v = activeSeriesVariant(block);
      if (!v) return prev;
      return {
        ...prev,
        [seriesName]: {
          ...block,
          variants: block.variants.map((item) =>
            item.color === v.color
              ? { ...item, sizes: item.sizes.map((s) => ({ ...s, [field]: value })) }
              : item,
          ),
        },
      };
    });
  }

  async function handleSeriesFileSelect(e: React.ChangeEvent<HTMLInputElement>, seriesName: string) {
    const files = e.target.files;
    if (!files) return;
    const block = seriesBlocks[seriesName];
    if (!block) return;

    const newMedia: MediaFile[] = [];
    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert(`${file.name} terlalu besar. Maks: ${isVideo ? "50MB" : "10MB"}`);
        continue;
      }
      const validTypes = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"];
      if (!validTypes.includes(file.type)) {
        alert(`${file.name} format tidak didukung`);
        continue;
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preview = URL.createObjectURL(file);
      newMedia.push({ id, file, url: "", isVideo, color: "default", preview, uploading: true });
    }

    updateSeriesBlock(seriesName, { media: [...block.media, ...newMedia] });

    for (const item of newMedia) {
      try {
        const url = await uploadToCloudinary(item.file!);
        setSeriesBlocks((prev) => ({
          ...prev,
          [seriesName]: {
            ...prev[seriesName],
            media: prev[seriesName].media.map((m) => m.id === item.id ? { ...m, url, uploading: false } : m),
          },
        }));
      } catch {
        setSeriesBlocks((prev) => ({
          ...prev,
          [seriesName]: {
            ...prev[seriesName],
            media: prev[seriesName].media.map((m) => m.id === item.id ? { ...m, uploading: false, error: "Upload gagal" } : m),
          },
        }));
      }
    }
    e.target.value = "";
  }

  function removeSeriesMedia(seriesName: string, mediaId: string) {
    setSeriesBlocks((prev) => {
      const block = prev[seriesName];
      if (!block) return prev;
      const item = block.media.find((m) => m.id === mediaId);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return {
        ...prev,
        [seriesName]: {
          ...block,
          media: block.media.filter((m) => m.id !== mediaId),
        },
      };
    });
  }

  function addSeriesMediaByUrl(seriesName: string, urlStr: string) {
    const u = urlStr.trim();
    if (!u) return;
    const isVideo = /\.(mp4|webm|ogg|m4v)(\?|#|$)/i.test(u);
    setSeriesBlocks((prev) => {
      const block = prev[seriesName];
      if (!block) return prev;
      return {
        ...prev,
        [seriesName]: {
          ...block,
          media: [...block.media, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, url: u, isVideo, color: "default", preview: u, uploading: false }],
        },
      };
    });
  }

  // ── End Thobe multi-series helpers ──

  // Validate
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Nama produk wajib diisi";
    if (!category) e.category = "Kategori wajib dipilih";
    if ((category === "Thobe" || category === "Kandora") && !selectedJenisKainId) e.jenisKain = "Jenis Kain wajib dipilih";
    // Ops: SKU wajib (ditulis ke products.sku). Harga mengikuti aturan admin (tidak
    // dilonggarkan) supaya produk yang dibuat dari ops tetap siap terbit.
    if (isOps && !sku.trim() && !autoBaseSku) e.sku = "SKU wajib diisi";

    if (category === "Thobe") {
      // Multi-series validation
      if (selectedSeries.length === 0) e.series = "Minimal pilih 1 series";
      for (const sn of selectedSeries) {
        const block = seriesBlocks[sn];
        if (!block) continue;
        if (block.variants.length === 0) {
          e[`series_${sn}_color`] = `Warna ${sn} wajib diisi minimal 1`;
        } else {
          const colors = block.variants.map((v) => String(v.color || "").trim().toLowerCase());
          if (colors.some((color) => !color)) {
            e[`series_${sn}_color`] = `Warna ${sn} tidak boleh kosong`;
          } else if (new Set(colors).size !== colors.length) {
            e[`series_${sn}_color`] = `Warna ${sn} tidak boleh kembar`;
          }
        }
        if (!isOps && (!block.price || parseInt(block.price) <= 0)) e[`series_${sn}_price`] = `Harga ${sn} wajib diisi`;
        if (block.cypEnabled && (!block.minimumPrice || parseInt(block.minimumPrice) <= 0)) e[`series_${sn}_min`] = `Harga Minimum ${sn} wajib diisi`;
        if (!isOps) {
          const uploadedMedia = block.media.filter((m) => m.url && !m.uploading);
          if (uploadedMedia.length === 0) e[`series_${sn}_media`] = `Media ${sn} wajib diisi (min 1)`;
        }
        // Stok boleh 0 — stok bisa diisi menyusul lewat Barang Masuk.
        // Berat per ukuran (opsional): kalau diisi harus bilangan bulat 1–5000 gram.
        for (const v of block.variants) {
          for (const s of v.sizes) {
            const raw = String(s.weight ?? "").trim();
            if (raw === "") continue;
            const w = Number(raw);
            if (!Number.isInteger(w) || w < 1 || w > 5000) {
              e[`series_${sn}_weight`] = `Berat ${sn} harus bilangan bulat 1–5000 gram`;
            }
          }
        }
      }
    } else {
      // Non-Thobe: existing validation
      if (!isOps && !cypEnabled && (!basePrice || parseInt(basePrice) <= 0)) e.basePrice = "Harga wajib diisi";
      if (cypEnabled && (!minimumPrice || parseInt(minimumPrice) <= 0)) e.minimumPrice = "Harga Minimum wajib diisi jika Create Your Price aktif";
      if (cypEnabled && minimumPrice && basePrice && parseInt(minimumPrice) > parseInt(basePrice)) e.minimumPrice = "Harga Minimum tidak boleh lebih besar dari Harga Dasar";
      if (cypEnabled && recommendedPrice && minimumPrice && parseInt(recommendedPrice) < parseInt(minimumPrice)) e.recommendedPrice = "Harga Rekomendasi tidak boleh kurang dari Harga Minimum";
      if (isPaket) {
        // Cover & Hanger: varian dinilai dari NAMAnya (tidak ada warna & ukuran).
        if (variants.length === 0) {
          e.variants = "Minimal 1 varian";
        } else {
          const names = variants.map((v) => String(v.color ?? "").trim());
          if (names.some((n) => n === "")) e.variants = "Nama varian wajib diisi";
          else if (duplicatePaketNames(variants).size > 0) e.variants = "Nama varian tidak boleh kembar";
        }
      } else {
        if (variants.length === 0) e.variants = "Minimal 1 varian warna";
      }
      // Berat per varian/ukuran (opsional): kalau diisi harus bilangan bulat 1–5000 gram.
      for (const v of variants) {
        for (const s of v.sizes) {
          const raw = String(s.weight ?? "").trim();
          if (raw === "") continue;
          const w = Number(raw);
          if (!Number.isInteger(w) || w < 1 || w > 5000) {
            e.variants = isPaket ? "Berat varian harus bilangan bulat 1–5000 gram" : "Berat per ukuran harus bilangan bulat 1–5000 gram";
          }
        }
      }
      if (!isOps) {
        const uploadedMedia = media.filter((m) => m.url && !m.uploading);
        if (uploadedMedia.length === 0) e.media = "Minimal 1 media (gambar/video)";
      }
    }

    // SKU per varian harus unik. Kalau bentrok, tampilkan daftarnya di kolom SKU
    // (jangan menimpa SKU yang sudah diisi manual).
    if (category) {
      const variantSkus: string[] = [];
      const productSkus: string[] = [];
      if (category === "Thobe") {
        for (const sn of selectedSeries) {
          const block = seriesBlocks[sn];
          if (!block) continue;
          const seriesColor = resolveColorName({
            color: block.variants[0]?.color,
            productName: name,
            category,
            series: sn,
          });
          const suffix = seriesCode(sn);
          const typed = stripSeriesSuffix(sku.trim());
          const productSku = typed
            ? suffix
              ? `${typed}-${suffix}`
              : typed
            : generateBaseSku({ category, kain: kainName, color: seriesColor, series: sn });
          if (productSku) productSkus.push(productSku);

          for (const v of block.variants) {
            const color = resolveColorName({ color: v.color, productName: name, category, series: sn });
            for (const s of v.sizes) {
              const value =
                s.sku.trim() ||
                generateVariantSku({ category, kain: kainName, color, series: sn, size: s.size });
              if (value) variantSkus.push(value);
            }
          }
        }
      } else {
        const base = sku.trim() || autoBaseSku;
        if (base) productSkus.push(base);
        for (const v of variants) {
          const color = resolveColorName({ color: v.color, productName: name, category, series });
          for (const s of v.sizes) {
            const value =
              s.sku.trim() ||
              generateVariantSku({ category, kain: kainName, color, series, size: s.size });
            if (value) variantSkus.push(value);
          }
        }
      }
      const duplicates = [...new Set([...duplicateSkus(productSkus), ...duplicateSkus(variantSkus)])];
      if (duplicates.length > 0) {
        e.sku = `SKU dobel: ${duplicates.join(", ")}. Ubah salah satu SKU.`;
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Submit
  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);

    try {
      // Field khusus ops (dipakai laporan internal): tipe produk, HPP, dan
      // penanda "belum tampil" — produk baru dari ops tidak langsung masuk katalog.
      const opsProductFields = isOps
        ? { product_type: productType, hpp: parseInt(hpp) || 0, ...(isEdit ? {} : { is_published: false }) }
        : {};
      // Kolom harga: katalog biasa ATAU harga khusus Open Order (lihat `priceTarget`). Dipisah
      // supaya menyimpan dari menu Open Order TIDAK mengubah harga di menu Produk.
      const priceFieldsFor = (p: { price: number; minimum: string; recommended: string; cyp: boolean; microcopy: string; microcopyOn: boolean }): Record<string, number | string | boolean | null> =>
        isOpenOrderPrice
          ? {
              open_order_price: p.price,
              open_order_minimum_price: p.minimum ? parseInt(p.minimum) : null,
              open_order_recommended_price: p.recommended ? parseInt(p.recommended) : null,
              open_order_cyp_enabled: p.cyp,
              open_order_cyp_microcopy: p.microcopyOn && p.microcopy.trim() ? p.microcopy.trim() : null,
            }
          : {
              price: p.price,
              minimum_price: p.minimum ? parseInt(p.minimum) : null,
              recommended_price: p.recommended ? parseInt(p.recommended) : null,
              create_your_price_enabled: p.cyp,
              cyp_microcopy_override: p.microcopyOn && p.microcopy.trim() ? p.microcopy.trim() : null,
            };
      if (category === "Thobe" && selectedSeries.length > 0) {
        // ── Thobe multi-series: create 1 product row per series ──
        for (const seriesName of selectedSeries) {
          const block = seriesBlocks[seriesName];
          if (!block) continue;
          const seriesNameSlug = seriesName.toLowerCase().replace(/\s+/g, "-");
          // Mode edit: pakai id baris tersimpan (stabil) → update, bukan bikin duplikat.
          const seriesSlug = isEdit && block.productId ? block.productId : `${slug}-${seriesNameSlug}`;
          const blockPrice = block.cypEnabled
            ? (parseInt(block.price) || parseInt(block.minimumPrice) || 0)
            : (parseInt(block.price) || 0);
          // products.weight = berat ukuran TERBESAR yang terisi pada baris ini (angka
          // konservatif untuk fallback ongkir + tampilan katalog). Kalau belum ada ukuran
          // yang diisi → kolom TIDAK ditulis supaya nilai lama (mis. 1.200 g) tidak berubah.
          const rowWeight = maxSizeWeight(block.variants.flatMap((v) => v.sizes));

          // SKU dasar produk per series: series ditambahkan otomatis ke SKU dasar.
          const seriesColor = resolveColorName({
            color: block.variants[0]?.color,
            productName: name,
            category,
            series: seriesName,
          });
          const autoSeriesSku = generateBaseSku({ category, kain: kainName, color: seriesColor, series: seriesName });
          const seriesSuffix = seriesCode(seriesName);
          const typedBaseSku = stripSeriesSuffix(sku.trim());
          const productSku = typedBaseSku
            ? seriesSuffix
              ? `${typedBaseSku}-${seriesSuffix}`
              : typedBaseSku
            : autoSeriesSku;

          const productRow = {
            id: seriesSlug,
            name,
            category,
            description: description || null,
            ...priceFieldsFor({
              price: blockPrice,
              minimum: block.minimumPrice,
              recommended: block.recommendedPrice,
              cyp: block.cypEnabled,
              microcopy: block.cypMicrocopyOverride,
              microcopyOn: block.useCustomCypMicrocopy,
            }),
            ...(rowWeight > 0 ? { weight: rowWeight } : {}),
            image: block.media.find((m) => m.url)?.url || "",
            images: block.media.filter((m) => m.url).map((m) => m.url),
            // Jangan pernah menimpa warna lama dengan array kosong.
            ...(block.variants.length > 0 ? { colors: block.variants.map((v) => v.color) } : {}),
            jenis_kain_id: selectedJenisKainId || null,
            series: seriesName,
            catatan_harga: catatanHarga.trim() || null,
            badge_type: badgeType || null,
            open_order_enabled: openOrderEnabled,
            ...opsProductFields,
            sku: productSku || null,
          };
          // Mode harga Open Order: baris produk SUDAH ada → pakai `update`, bukan `upsert`.
          // `upsert` menyiapkan baris INSERT, dan `products.price` NOT NULL membuatnya ditolak
          // 400 (23502) karena mode ini sengaja tidak menulis kolom harga katalog.
          const { error: productError } = isOpenOrderPrice
            ? await supabase.from("products").update(productRow).eq("id", seriesSlug)
            : await supabase.from("products").upsert(productRow, { onConflict: "id" });
          if (productError) throw productError;

          // Insert variants
          const isDerived = !!block.baseProductId;
          const variantRows = block.variants.flatMap((v, vi) =>
            v.sizes.map((s, si) => ({
              product_id: seriesSlug,
              color: v.color,
              hex: v.hex || null,
              size: s.size,
              stock: isDerived ? 0 : s.stock,  // Derived series: stock lives in base product
              weight: s.weight !== undefined && String(s.weight).trim() !== "" ? parseInt(String(s.weight)) : null,
              price_override: s.priceOverride ? parseInt(s.priceOverride) : null,
              sku:
                s.sku.trim() ||
                generateVariantSku({
                  category,
                  kain: kainName,
                  color: resolveColorName({ color: v.color, productName: name, category, series: seriesName }),
                  series: seriesName,
                  size: s.size,
                }) ||
                productSku ||
                null,
              display_order: vi * 100 + si,
              base_product_id: isDerived ? block.baseProductId : null,
              base_size: isDerived ? s.size : null,  // 1:1 mapping: each size maps to same size in base
            }))
          );
          // Mode edit: tulis ulang varian & media baris ini (bukan menumpuk).
          if (isEdit) {
            await supabase.from("product_variants").delete().eq("product_id", seriesSlug);
            await supabase.from("product_images").delete().eq("product_id", seriesSlug);
          }
          if (variantRows.length > 0) {
            await supabase.from("product_variants").upsert(variantRows, { onConflict: "product_id,color,size" });
          }

          // Insert images
          const imageRows = block.media.filter((m) => m.url).map((m, i) => ({
            product_id: seriesSlug,
            color: m.color,
            url: m.url,
            is_video: m.isVideo,
            display_order: i,
          }));
          if (imageRows.length > 0) {
            await supabase.from("product_images").insert(imageRows);
          }
        }

        // Mode edit: hapus baris series yang dicabut dari checklist — HANYA yang semula
        // ter-load, supaya hydrate parsial tidak menghapus data yang tidak dimaksud.
        if (isEdit) {
          const namesToCheck = Array.from(new Set([name, originalName].filter(Boolean)));
          const { data: oldSiblings } = await supabase.from("products").select("id, series").eq("category", "Thobe").in("name", namesToCheck);
          for (const old of oldSiblings || []) {
            if (old.series && originalSelectedSeries.includes(old.series) && !selectedSeries.includes(old.series)) {
              await supabase.from("product_variants").delete().eq("product_id", old.id);
              await supabase.from("product_images").delete().eq("product_id", old.id);
              await supabase.from("products").delete().eq("id", old.id);
            }
          }
        }
      } else {
        // ── Non-Thobe: existing single-product logic ──
        // products.weight = berat ukuran terbesar yang terisi (lihat catatan di cabang Thobe).
        const rowWeight = maxSizeWeight(variants.flatMap((v) => v.sizes));
        const nonThobePrice = cypEnabled ? (parseInt(basePrice) || parseInt(minimumPrice) || 0) : (parseInt(basePrice) || 0);
        const productSku = sku.trim() || autoBaseSku;
        const productRow = {
          id: slug,
          name,
          category,
          description: description || null,
          ...priceFieldsFor({
            price: nonThobePrice,
            minimum: minimumPrice,
            recommended: recommendedPrice,
            cyp: cypEnabled,
            microcopy: cypMicrocopyOverride,
            microcopyOn: useCustomCypMicrocopy,
          }),
          ...(rowWeight > 0 ? { weight: rowWeight } : {}),
          image: media.find((m) => m.url)?.url || "",
          images: media.filter((m) => m.url).map((m) => m.url),
          // Jangan pernah menimpa warna lama dengan array kosong.
          ...(variants.length > 0 ? { colors: variants.map((v) => v.color) } : {}),
          jenis_kain_id: selectedJenisKainId || null,
          series: series.trim() || null,
          catatan_harga: catatanHarga.trim() || null,
          badge_type: badgeType || null,
          open_order_enabled: openOrderEnabled,
          ...opsProductFields,
          sku: productSku || null,
        };
        // Mode harga Open Order: baris produk sudah ada → `update`, bukan `upsert` (lihat catatan
        // di cabang Thobe: `products.price` NOT NULL menolak baris INSERT dari upsert).
        const { error: productError } = isOpenOrderPrice
          ? await supabase.from("products").update(productRow).eq("id", slug)
          : await supabase.from("products").upsert(productRow, { onConflict: "id" });
        if (productError) throw productError;

        // Insert variants
        const variantRows = variants.flatMap((v, vi) =>
          v.sizes.map((s, si) => ({
            // ID baris lama (Cover & Hanger, mode Edit) ikut dikirim supaya baris itu diperbarui,
            // bukan dihapus lalu dibuat ulang — referensi transaksi ke varian tetap nyambung.
            ...(s.id ? { id: s.id } : {}),
            product_id: slug,
            color: v.color,
            hex: v.hex || null,
            size: s.size,
            stock: s.stock,
            weight: s.weight !== undefined && String(s.weight).trim() !== "" ? parseInt(String(s.weight)) : null,
            price_override: s.priceOverride ? parseInt(s.priceOverride) : null,
            sku:
              s.sku.trim() ||
              generateVariantSku({
                category,
                kain: kainName,
                color: resolveColorName({ color: v.color, productName: name, category, series }),
                series,
                size: s.size,
              }) ||
              productSku ||
              null,
            display_order: vi * 100 + si,
          }))
        );
        if (isEdit) {
          if (isPaket) {
            // Cover & Hanger: hapus HANYA baris yang memang dibuang di form; baris yang masih ada
            // diperbarui in-place (ID tetap). Aturan varian biasa tidak diubah.
            const idDisimpan = new Set(variantRows.map((row) => row.id).filter((id): id is string => Boolean(id)));
            const idHapus = paketIdsLamaRef.current.filter((id) => !idDisimpan.has(id));
            if (idHapus.length > 0) await supabase.from("product_variants").delete().in("id", idHapus);
          } else {
            await supabase.from("product_variants").delete().eq("product_id", slug);
          }
          await supabase.from("product_images").delete().eq("product_id", slug);
        }
        if (variantRows.length > 0) {
          if (isPaket) {
            for (const row of variantRows) {
              if (!row.id) continue;
              const { id, ...patch } = row;
              await supabase.from("product_variants").update(patch).eq("id", id);
            }
            const rowsBaru = variantRows.filter((row) => !row.id);
            if (rowsBaru.length > 0) await supabase.from("product_variants").insert(rowsBaru);
          } else {
            await supabase.from("product_variants").upsert(variantRows, { onConflict: "product_id,color,size" });
          }
        }

        // Insert images
        const imageRows = media.filter((m) => m.url).map((m, i) => ({
          product_id: slug,
          color: m.color,
          url: m.url,
          is_video: m.isVideo,
          display_order: i,
        }));
        if (imageRows.length > 0) {
          await supabase.from("product_images").insert(imageRows);
        }
      }

      // Hard navigation: daftar produk di /admin memuat stok lewat useEffect di client.
      // `router.push` bisa memulihkan cache route lama sehingga stok hasil simpan baru
      // terlihat setelah refresh manual — paksa muat ulang supaya data langsung segar.
      window.location.assign(backHref);
    } catch (err) {
      console.error("Save error:", err);
      alert("Gagal menyimpan produk");
    } finally {
      setSaving(false);
    }
  }

  const activeVariant = variants.find((v) => v.color === activeColor);
  const activeMedia = category === "Thobe" && activeSeriesTab && seriesBlocks[activeSeriesTab]
    ? seriesBlocks[activeSeriesTab].media
    : category === "Thobe"
      ? media
      : isPaket
        ? (mediaColor
            ? [...media.filter((m) => m.color === mediaColor), ...media.filter((m) => !m.color)]
            : media)
        : media.filter((m) => m.color === mediaColor);

  if (loading) {
    return isOps
      ? <div className="grid min-h-[40vh] place-items-center"><Loader2 size={22} className="animate-spin text-blue-600" /></div>
      : <AdminShell><section className="min-h-screen flex items-center justify-center" style={{ background: "var(--cream)" }}><Loader2 size={24} className="animate-spin" style={{ color: "var(--gold)" }} /></section></AdminShell>;
  }

  const content = (
    <section className={`min-h-screen${isOps ? " pf--ops" : ""}`} style={{ background: isOps ? "transparent" : "var(--cream)" }}>
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur" style={{ background: "rgba(255,255,255,.85)", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
        <div className="max-w-6xl mx-auto px-5 lg:px-8 py-4 flex items-center gap-4">
          <button onClick={() => router.push(backHref)} title="Kembali" className="p-2.5 -ml-2 rounded-xl bg-white transition-colors hover:bg-[var(--bg-secondary)]" style={{ border: "1px solid #e4e4e7", color: "var(--espresso)" }}>
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="hidden sm:block text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>Produk</p>
            <h1 className={`text-2xl leading-none truncate${isOps ? "" : " italic"}`} style={isOps ? { fontFamily: "var(--font-inter), system-ui, sans-serif", fontWeight: 800, color: "#0f172a" } : { fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>{isOpenOrderPrice ? "Harga Open Order" : isEdit ? "Edit Produk" : "Tambah Produk"}</h1>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-5 lg:px-8 py-6 lg:py-8 pb-28">
        {/* Kolom kiri `minmax(0,1fr)` supaya tabel ukuran boleh menyusut dan tidak pernah
            mendorong kolom preview keluar layar. Preview tampil mulai 1440px — di bawah itu
            form pakai lebar penuh supaya isinya tidak terpotong. */}
        <div className="grid grid-cols-1 min-[1440px]:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:gap-8 items-start">

          {/* Left: Form */}
          <div className="space-y-6">
            {/* Info Dasar */}
            <div className="pf-card p-5 lg:p-6">
              <div className="pf-head">
                <div className="pf-num">1</div>
                <div>
                  <h2 className="pf-title">Info Dasar</h2>
                  <p className="pf-sub">Nama, kategori, harga, dan atribut utama produk.</p>
                </div>
              </div>
              <div className="space-y-4">
                {/* Baris 1: Nama + Kategori (2 kolom) */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="pf-label">Nama Produk <span className="pf-req">*</span></label>
                    <input value={name} onChange={(e) => handleNameChange(e.target.value)} className={`pf-input${errors.name ? " invalid" : ""}`} placeholder="Contoh: Thobe Jiharkah Premium" />
                    {errors.name && <p className="pf-error">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="pf-label">Kategori <span className="pf-req">*</span></label>
                    <div className="pf-selectwrap">
                      <select value={category} onChange={(e) => {
                        const val = e.target.value;
                        const toPaket = isPaketKategori(val);
                        // Ganti mode varian (pakaian ↔ paket, atau antar kategori paket) hanya
                        // setelah dikonfirmasi kalau sudah ada isian — supaya varian yang sudah
                        // diisi tidak hilang diam-diam.
                        const paketCategoryChanged = toPaket && isPaket && val !== category;
                        const variantModeChanged = toPaket !== isPaket || paketCategoryChanged;
                        if (variantModeChanged && variantDataFilled) {
                          const pesan = "Varian yang sudah diisi akan diganti mengikuti kategori baru. Lanjut?";
                          if (!window.confirm(pesan)) return;
                        }
                        if (variantModeChanged) setVariants(toPaket ? [emptyPaketVariant()] : []);
                        setCategory(val);
                        if (val !== "Thobe") setSeries("");
                        if (val !== "Thobe" && val !== "Kandora") setSelectedJenisKainId("");
                      }} className={`pf-select${errors.category ? " invalid" : ""}`}>
                        <option value="">Pilih kategori</option>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown size={14} className="pf-selectico" />
                    </div>
                    {errors.category && <p className="pf-error">{errors.category}</p>}
                  </div>
                </div>
                {/* Baris 2: Slug + SKU (2 kolom) */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="pf-label">Slug</label>
                    <input value={slug} onChange={(e) => setSlug(e.target.value)} className="pf-input" placeholder="thobe-jiharkah-premium" />
                    <p className="pf-hint">URL: /katalog/{slug || "..."}</p>
                  </div>
                  <div>
                    <label className="pf-label">SKU Produk {isOps && <span className="pf-req">*</span>}</label>
                    <input
                      value={sku || autoBaseSku}
                      onChange={(e) => setSku(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`pf-input${errors.sku ? " invalid" : ""}`}
                      placeholder={autoBaseSku || "SMQ-THB-JHK"}
                    />
                    {errors.sku && <p className="pf-error">{errors.sku}</p>}
                    <p className="pf-hint">
                      SKU dasar tanpa ukuran.{" "}
                      {category === "Thobe"
                        ? "Kode series ditambahkan otomatis di SKU tiap series."
                        : isPaket
                          ? "Kode varian ditambahkan otomatis di SKU tiap varian."
                          : "Ukuran ditambahkan otomatis di SKU varian."}{" "}
                      Kosongkan untuk memakai otomatis.
                    </p>
                  </div>
                </div>
                {isOps && (() => {
                  const refPrice = category === "Thobe" && activeSeriesTab && seriesBlocks[activeSeriesTab]
                    ? parseInt(seriesBlocks[activeSeriesTab].price) || 0
                    : parseInt(basePrice) || 0;
                  const hppNum = parseInt(hpp) || 0;
                  const profit = refPrice - hppNum;
                  const margin = refPrice > 0 ? Math.round((profit / refPrice) * 100) : 0;
                  return (
                    <div className="pf-panel">
                      <p className="text-sm font-semibold mb-3" style={{ color: "var(--espresso)" }}>Data Internal (Ops)</p>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <label className="pf-label">HPP per Unit (Rp)</label>
                          <input type="text" inputMode="numeric" value={formatRupiah(hpp)} onChange={(e) => setHpp(parseRupiah(e.target.value))} className="pf-input" placeholder="150.000" />
                          <p className="pf-hint">Modal per unit — dipakai laporan margin.</p>
                        </div>
                        <div>
                          <label className="pf-label">Tipe Produk</label>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setProductType("normal")} className={`pf-chip${productType === "normal" ? " active" : ""}`}>Normal</button>
                            <button type="button" onClick={() => setProductType("free_gift")} className={`pf-chip${productType === "free_gift" ? " active" : ""}`}>Free Gift</button>
                          </div>
                        </div>
                      </div>
                      <p className="pf-hint mt-3">Margin otomatis: <b>{refPrice > 0 ? `${margin}%` : "—"}</b> · profit/unit {refPrice > 0 ? `Rp ${formatRupiah(String(profit))}` : "—"}</p>
                    </div>
                  );
                })()}
                {/* Baris 3: Deskripsi */}
                <div>
                  <label className="pf-label">Deskripsi</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="pf-textarea" placeholder="Deskripsi produk..." />
                </div>
                {/* Baris 4: Harga Dasar (non-Thobe).
                    Berat TIDAK diisi di sini lagi — berat per ukuran ada di blok ukuran
                    (itulah yang dipakai menghitung ongkir J&T). */}
                {category !== "Thobe" && !cypEnabled && (
                  <div>
                    <label className="pf-label">Harga Dasar (Rp) <span className="pf-req">*</span></label>
                    <input type="text" inputMode="numeric" value={formatRupiah(basePrice)} onChange={(e) => setBasePrice(parseRupiah(e.target.value))} className={`pf-input${errors.basePrice ? " invalid" : ""}`} placeholder="389.000" />
                    <p className="pf-hint">Harga terendah / yang tampil di katalog. Angka saja, contoh 249000.</p>
                    {errors.basePrice && <p className="pf-error">{errors.basePrice}</p>}
                  </div>
                )}
                {/* Badge Katalog */}
                <div>
                  <label className="pf-label">Badge Katalog (opsional)</label>
                  <div className="pf-selectwrap">
                    <select value={badgeType} onChange={(e) => setBadgeType(e.target.value)} className="pf-select">
                      <option value="">Tanpa Badge</option>
                      <option value="terlaris">Terlaris</option>
                      <option value="rekomendasi">Rekomendasi</option>
                      <option value="new">New</option>
                    </select>
                    <ChevronDown size={14} className="pf-selectico" />
                  </div>
                  <p className="pf-hint">Badge yang tampil di pojok kanan atas foto card katalog.</p>
                </div>
                {/* Open Order — produk ikut tampil di katalog /open-order (menu Open Order). */}
                <div className={`pf-panel${openOrderEnabled ? " accent" : " flat"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--espresso)" }}>Tampilkan di Open Order</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Produk ini muncul di katalog halaman /open-order.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenOrderEnabled((v) => !v)}
                      aria-pressed={openOrderEnabled}
                      aria-label="Tampilkan produk ini di menu Open Order"
                      className="pf-toggle"
                      style={{ background: openOrderEnabled ? "var(--gold)" : "#d4d4d8" }}
                    >
                      <span className="pf-toggle-knob" style={{ transform: openOrderEnabled ? "translateX(20px)" : "translateX(0)" }} />
                    </button>
                  </div>
                </div>
                {/* Create Your Price Toggle — hidden untuk Thobe (CYP per-series) */}
                {category !== "Thobe" && (
                <div className={`pf-panel${cypEnabled ? " accent" : " flat"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--espresso)" }}>Create Your Price</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Customer bisa tentukan harga sendiri (minimal = Harga Minimum)</p>
                    </div>
                    <button type="button" onClick={toggleCyp} className="pf-toggle" style={{ background: cypEnabled ? "var(--gold)" : "#d4d4d8" }}>
                      <span className="pf-toggle-knob" style={{ transform: cypEnabled ? "translateX(20px)" : "translateX(0)" }} />
                    </button>
                  </div>
                  {cypEnabled && (
                    <div className="space-y-3">
                      <div>
                        <label className="pf-label">Harga Minimum (Rp) <span className="pf-req">*</span></label>
                        <input type="text" inputMode="numeric" value={formatRupiah(minimumPrice)} onChange={(e) => setMinimumPrice(parseRupiah(e.target.value))} className={`pf-input${errors.minimumPrice ? " invalid" : ""}`} placeholder="350.000" />
                        {errors.minimumPrice && <p className="pf-error">{errors.minimumPrice}</p>}
                        <p className="pf-hint">Harga terendah yang bisa dipilih customer.</p>
                      </div>
                      <div>
                        <label className="pf-label">Harga Rekomendasi (Rp)</label>
                        <input type="text" inputMode="numeric" value={formatRupiah(recommendedPrice)} onChange={(e) => setRecommendedPrice(parseRupiah(e.target.value))} className={`pf-input${errors.recommendedPrice ? " invalid" : ""}`} placeholder={basePrice ? formatRupiah(String((parseInt(basePrice) || 0) + 30000)) : "379.000"} />
                        {errors.recommendedPrice && <p className="pf-error">{errors.recommendedPrice}</p>}
                        <p className="pf-hint">Kosongkan = otomatis Harga Dasar + Rp 30.000 ({basePrice ? `Rp ${formatRupiah(String((parseInt(basePrice) || 0) + 30000))}` : "—"}).</p>
                      </div>
                      <div className="pf-panel">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div>
                            <p className="text-sm font-medium" style={{ color: "var(--espresso)" }}>Microcopy CYP (khusus produk ini)</p>
                            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Teks kecil di bawah opsi harga pada halaman produk.</p>
                          </div>
                          <button type="button" onClick={() => setUseCustomCypMicrocopy((v) => !v)} className="pf-toggle" style={{ background: useCustomCypMicrocopy ? "var(--gold)" : "#d4d4d8" }}>
                            <span className="pf-toggle-knob" style={{ transform: useCustomCypMicrocopy ? "translateX(20px)" : "translateX(0)" }} />
                          </button>
                        </div>
                        {useCustomCypMicrocopy ? (
                          <>
                            <textarea value={cypMicrocopyOverride} onChange={(e) => setCypMicrocopyOverride(e.target.value.slice(0, 120))} rows={2} maxLength={120} placeholder="Tulis teks khusus produk ini..." className="pf-textarea" />
                            <p className="pf-hint text-right" style={{ color: cypMicrocopyOverride.length >= 120 ? "#dc2626" : "var(--text-muted)" }}>{cypMicrocopyOverride.length}/120</p>
                          </>
                        ) : (
                          <p className="text-[12px] leading-relaxed px-3 py-2.5 rounded-xl" style={{ background: "#fafafa", color: "var(--text-muted)", fontStyle: "italic" }}>
                            {storeSettings.cyp_microcopy || "Harga Minimum boleh dipilih. Itulah alasan kami membuat Create Your Price."}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                )}
                {(category === "Thobe" || category === "Kandora") && (
                <div>
                  <label className="pf-label">Jenis Kain</label>
                  <div className="flex gap-2">
                    <div className="pf-selectwrap flex-1">
                      <select value={selectedJenisKainId} onChange={(e) => setSelectedJenisKainId(e.target.value)} className={`pf-select${errors.jenisKain ? " invalid" : ""}`}>
                        <option value="">Pilih Jenis Kain</option>
                        {jenisKainList.map((jk) => <option key={jk.id} value={jk.id}>{jk.name}</option>)}
                      </select>
                      <ChevronDown size={14} className="pf-selectico" />
                    </div>
                    <button type="button" onClick={() => setShowNewKainForm(!showNewKainForm)} className="pf-btn pf-btn-outline shrink-0">
                      <Plus size={13} /> Baru
                    </button>
                    {selectedJenisKainId && (
                      <button type="button" onClick={async () => {
                        const jk = jenisKainList.find((j) => j.id === selectedJenisKainId);
                        if (!confirm(`Hapus jenis kain "${jk?.name}" dari database?`)) return;
                        await supabase.from("jenis_kain").delete().eq("id", selectedJenisKainId);
                        setJenisKainList((prev) => prev.filter((j) => j.id !== selectedJenisKainId));
                        setSelectedJenisKainId("");
                      }} className="pf-btn pf-btn-danger shrink-0">
                        Hapus
                      </button>
                    )}
                  </div>
                  {errors.jenisKain && <p className="pf-error">{errors.jenisKain}</p>}
                  {showNewKainForm && (
                    <div className="mt-3">
                      <JenisKainForm
                        onSave={(newKain) => {
                          setJenisKainList((prev) => [...prev, { id: newKain.id, name: newKain.name }]);
                          setSelectedJenisKainId(newKain.id);
                          setShowNewKainForm(false);
                        }}
                        onCancel={() => setShowNewKainForm(false)}
                      />
                    </div>
                  )}
                </div>
                )}
                {category === "Thobe" && (
                <div>
                  <label className="pf-label">Series <span className="pf-req">*</span></label>
                  {errors.series && <p className="pf-error mb-2">{errors.series}</p>}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {seriesList.map((s) => (
                      <button key={s} type="button" onClick={() => toggleSeries(s)} className={`pf-chip${selectedSeries.includes(s) ? " active" : ""}`}>
                        {selectedSeries.includes(s) && <Check size={12} />}
                        {s}
                      </button>
                    ))}
                    <button type="button" onClick={() => setShowNewSeries(!showNewSeries)} className="pf-chip shrink-0" style={{ borderStyle: "dashed", borderColor: "#d4d4d8", color: "var(--gold-deep)" }}>
                      <Plus size={13} /> Baru
                    </button>
                  </div>
                  {showNewSeries && (
                    <div className="mb-3 flex gap-2">
                      <input
                        value={newSeriesName}
                        onChange={(e) => setNewSeriesName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewSeries(); } }}
                        placeholder="Nama series baru…"
                        autoFocus
                        className="pf-input flex-1"
                      />
                      <button type="button" onClick={addNewSeries} className="pf-btn pf-btn-primary shrink-0">Tambah</button>
                    </div>
                  )}
                  <p className="pf-hint">Centang series yang tersedia untuk produk ini. Setiap series akan jadi baris produk terpisah di database.</p>
                </div>
                )}
              </div>
            </div>

            {/* Varian & Stok + Media (Thobe multi-series) / Varian & Stok (non-Thobe) */}
            {category === "Thobe" && selectedSeries.length > 0 ? (
              <div className="pf-card p-5 lg:p-6">
                <div className="pf-head">
                  <div className="pf-num">2</div>
                  <div>
                    <h2 className="pf-title">Series &amp; Harga</h2>
                    <p className="pf-sub">Atur harga, media, dan stok untuk setiap series.</p>
                  </div>
                </div>

                {/* Series tabs */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {selectedSeries.map((sn) => (
                    <button key={sn} type="button" onClick={() => setActiveSeriesTab(sn)} className={`pf-tab${activeSeriesTab === sn ? " active" : ""}`}>
                      {sn}
                      {seriesBlocks[sn] && (() => {
                        const b = seriesBlocks[sn];
                        const hasError = errors[`series_${sn}_price`] || errors[`series_${sn}_media`] || errors[`series_${sn}_stock`];
                        return hasError ? <span className="pf-dot" /> : null;
                      })()}
                    </button>
                  ))}
                </div>

                {/* Active series block */}
                {activeSeriesTab && seriesBlocks[activeSeriesTab] && (() => {
                  const sn = activeSeriesTab;
                  const block = seriesBlocks[sn];
                  const v0 = activeSeriesVariant(block);
                  return (
                    <div className="space-y-6">
                      {/* ── Harga & CYP ── */}
                      <div>
                        <p className="text-sm font-semibold mb-3" style={{ color: "var(--espresso)" }}>
                          <span style={{ color: "var(--gold)" }}>{sn}</span> — Harga
                        </p>
                        <div className="pf-panel">
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <label className="pf-label">Harga Dasar (Rp) <span className="pf-req">*</span></label>
                              <input type="text" inputMode="numeric" value={formatRupiah(block.price)}
                                onChange={(e) => updateSeriesBlock(sn, { price: parseRupiah(e.target.value) })}
                                className={`pf-input${errors[`series_${sn}_price`] ? " invalid" : ""}`}
                                placeholder="389.000" />
                              {errors[`series_${sn}_price`] && <p className="pf-error">{errors[`series_${sn}_price`]}</p>}
                            </div>
                          </div>

                          {/* CYP toggle */}
                          <div className={`mt-4 pf-panel${block.cypEnabled ? " accent" : " flat"}`}>
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-sm font-medium" style={{ color: "var(--espresso)" }}>Create Your Price</p>
                                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Customer bisa tentukan harga sendiri</p>
                              </div>
                              <button type="button" onClick={() => updateSeriesBlock(sn, { cypEnabled: !block.cypEnabled })} className="pf-toggle" style={{ background: block.cypEnabled ? "var(--gold)" : "#d4d4d8" }}>
                                <span className="pf-toggle-knob" style={{ transform: block.cypEnabled ? "translateX(20px)" : "translateX(0)" }} />
                              </button>
                            </div>
                            {block.cypEnabled && (
                              <div className="grid sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="pf-label">Harga Minimum (Rp) <span className="pf-req">*</span></label>
                                  <input type="text" inputMode="numeric" value={formatRupiah(block.minimumPrice)}
                                    onChange={(e) => updateSeriesBlock(sn, { minimumPrice: parseRupiah(e.target.value) })}
                                    className={`pf-input${errors[`series_${sn}_min`] ? " invalid" : ""}`}
                                    placeholder="350.000" />
                                  {errors[`series_${sn}_min`] && <p className="pf-error">{errors[`series_${sn}_min`]}</p>}
                                </div>
                                <div>
                                  <label className="pf-label">Harga Rekomendasi (Rp)</label>
                                  <input type="text" inputMode="numeric" value={formatRupiah(block.recommendedPrice)}
                                    onChange={(e) => updateSeriesBlock(sn, { recommendedPrice: parseRupiah(e.target.value) })}
                                    className="pf-input"
                                    placeholder={block.price ? formatRupiah(String((parseInt(block.price) || 0) + 30000)) : "—"} />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── Media (mode admin saja) ── */}
                      {!isOps && (
                      <div>
                        <p className="text-sm font-semibold mb-3" style={{ color: "var(--espresso)" }}>
                          <span style={{ color: "var(--gold)" }}>{sn}</span> — Foto &amp; Video
                        </p>
                        {errors[`series_${sn}_media`] && <p className="pf-error mb-2">{errors[`series_${sn}_media`]}</p>}
                        <div className="pf-panel">
                          <label className="pf-drop">
                            <span className="pf-drop-ico"><Upload size={18} /></span>
                            <p className="text-sm font-medium" style={{ color: "var(--espresso)" }}>Upload foto/video untuk {sn}</p>
                            <p className="pf-hint">JPG, PNG, WebP (max 10MB) · MP4, WebM (max 50MB)</p>
                            <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                              onChange={(e) => handleSeriesFileSelect(e, sn)} className="hidden" />
                          </label>
                          {block.media.length > 0 && (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 mt-3">
                              {block.media.map((m, idx) => (
                                <div key={m.id} className="pf-thumb group">
                                  {m.uploading ? (
                                    <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={16} className="animate-spin" style={{ color: "var(--gold)" }} /></div>
                                  ) : m.error ? (
                                    <div className="absolute inset-0 flex items-center justify-center p-1"><p className="text-[9px] text-center" style={{ color: "#dc2626" }}>{m.error}</p></div>
                                  ) : m.isVideo ? (
                                    <video src={m.url || m.preview} className="w-full h-full object-cover" muted />
                                  ) : (
                                    <img src={m.url || m.preview} alt="" className="w-full h-full object-cover" />
                                  )}
                                  {idx === 0 && !m.uploading && !m.error && (
                                    <span className="pf-thumb-tag">Utama</span>
                                  )}
                                  <button onClick={() => removeSeriesMedia(sn, m.id)} className="pf-thumb-x">
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>)}

                      {/* ── Warna series ── */}
                      <div>
                        <p className="text-sm font-semibold mb-1" style={{ color: "var(--espresso)" }}>
                          <span style={{ color: "var(--gold)" }}>{sn}</span> — Warna
                        </p>
                        <p className="pf-hint mb-3">
                          Warna menjadi bagian SKU varian. Produk lama yang masih memakai warna bawaan
                          ditampilkan dengan warna dari nama produk.
                        </p>
                        {errors[`series_${sn}_color`] && (
                          <p className="pf-error mb-2">{errors[`series_${sn}_color`]}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {block.variants.map((variant) => {
                            const label =
                              String(variant.color).toLowerCase() === "default"
                                ? resolveColorName({
                                    color: "default",
                                    productName: name,
                                    category: "Thobe",
                                    series: sn,
                                  }) || "default"
                                : variant.color;
                            const active =
                              (block.activeColor || block.variants[0]?.color) === variant.color;
                            return (
                              <button
                                key={variant.color}
                                type="button"
                                onClick={() => updateSeriesBlock(sn, { activeColor: variant.color })}
                                className={`pf-chip${active ? " active" : ""}`}
                              >
                                <span
                                  className="w-3 h-3 rounded-full"
                                  style={{
                                    background: variant.hex || colorMap[variant.color] || "#ccc",
                                    border: "1px solid rgba(42,33,27,.1)",
                                  }}
                                />
                                {label}
                                {block.variants.length > 1 ? (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Hapus warna ${label}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeSeriesColor(sn, variant.color);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        removeSeriesColor(sn, variant.color);
                                      }
                                    }}
                                    className="ml-1 hover:opacity-60"
                                  >
                                    <X size={12} />
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                          <PresetColorPicker
                            existing={block.variants
                              .filter((variant) => String(variant.color).toLowerCase() !== "default")
                              .map((variant) => variant.color)}
                            onAdd={(color, hex) => addSeriesColor(sn, color, hex)}
                          />
                        </div>
                      </div>

                      {/* ── Shared Stock Pool ── */}
                      <div>
                        <p className="text-sm font-semibold mb-3" style={{ color: "var(--espresso)" }}>
                          <span style={{ color: "var(--gold)" }}>{sn}</span> — Stok dari Produk Dasar
                        </p>
                        <div className="pf-panel">
                          <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>
                            Jika series ini berbagi stok dengan series lain, pilih produk dasar dan ukuran yang sesuai. Kosongkan jika series ini memiliki stok sendiri.
                          </p>
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="pf-label">Produk Dasar</label>
                              <select
                                value={block.baseProductId}
                                onChange={(e) => updateSeriesBlock(sn, { baseProductId: e.target.value, baseSize: "" })}
                                className="pf-input"
                              >
                                <option value="">— Stok Sendiri —</option>
                                {selectedSeries.filter((s) => s !== sn).map((s) => {
                                  const sSlug = `${generateSlug(name)}-${s.toLowerCase().replace(/\s+/g, "-")}`;
                                  return <option key={s} value={sSlug}>{s}</option>;
                                })}
                              </select>
                            </div>
                            {block.baseProductId && (
                              <div>
                                <label className="pf-label">Pemetaan Stok</label>
                                <div className="pf-input" style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>
                                  1:1 otomatis (XS→XS, S→S, M→M, L→L, XL→XL)
                                </div>
                              </div>
                            )}
                          </div>
                          {block.baseProductId && (
                            <p className="text-[11px] mt-2" style={{ color: "var(--gold)" }}>
                              Stok diambil dari produk dasar secara otomatis (1:1 per ukuran)
                            </p>
                          )}
                        </div>
                      </div>

                      {/* ── Stok dan Berat per Ukuran ── */}
                      <div>
                        <p className="text-sm font-semibold mb-1" style={{ color: "var(--espresso)" }}>
                          <span style={{ color: "var(--gold)" }}>{sn}</span> — Stok dan Berat per Ukuran
                        </p>
                        <p className="pf-hint mb-3">
                          Berat dipakai untuk hitung ongkir J&T. Ukuran tanpa berat memakai berat default{" "}
                          {defaultWeightGrams > 0 ? `${defaultWeightGrams.toLocaleString("id-ID")} g` : "1.200 g"}.
                        </p>
                        {errors[`series_${sn}_stock`] && <p className="pf-error mb-2">{errors[`series_${sn}_stock`]}</p>}
                        {errors[`series_${sn}_weight`] && <p className="pf-error mb-2">{errors[`series_${sn}_weight`]}</p>}
                        {block.baseProductId ? (
                          <div className="pf-panel">
                            <p className="pf-hint mb-2.5">
                              Stok dikunci — <b>ikut {parentSeriesName(block.baseProductId) || "produk dasar"}</b> (ubah di tab itu).
                              Berat tetap diisi per series ini karena potongan &amp; kerahnya berbeda.
                            </p>
                            <SizeGrid
                              sizes={v0?.sizes || []}
                              onUpdate={(i, field, value) => updateSeriesBlockSizeField(sn, i, field, value)}
                              onUpdateAll={(field, value) => updateSeriesBlockSizesBulk(sn, field, value)}
                              onRemove={(i) => removeSizeFromSeriesBlock(sn, i)}
                              onAdd={() => addSizeToSeriesBlock(sn)}
                              skuFallback={sku}
                              skuContext={{ category, kain: kainName, series: sn, color: resolveColorName({ color: v0?.color, productName: name, category, series: sn }) }}
                              stockLocked
                              stockLockedLabel={`ikut ${parentSeriesName(block.baseProductId) || "produk dasar"}`}
                            />
                          </div>
                        ) : (
                        <div className="pf-panel">
                          <SizeGrid
                            sizes={v0?.sizes || []}
                            onUpdate={(i, field, value) => updateSeriesBlockSizeField(sn, i, field, value)}
                            onUpdateAll={(field, value) => updateSeriesBlockSizesBulk(sn, field, value)}
                            onRemove={(i) => removeSizeFromSeriesBlock(sn, i)}
                            onAdd={() => addSizeToSeriesBlock(sn)}
                            skuFallback={sku}
                            skuContext={{ category, kain: kainName, series: sn, color: resolveColorName({ color: v0?.color, productName: name, category, series: sn }) }}
                          />
                        </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {selectedSeries.length > 0 && !activeSeriesTab && (
                  <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>Pilih series di atas untuk mengatur harga, media, dan stok</p>
                )}
              </div>
            ) : (
              <>
              {/* Non-Thobe: Varian & Stok (Cover & Hanger pakai daftar varian nama) */}
              <div className="pf-card p-5 lg:p-6">
                <div className="pf-head">
                  <div className="pf-num">2</div>
                  <div>
                    <h2 className="pf-title">Varian &amp; Stok</h2>
                    <p className="pf-sub">
                      {isPaket
                        ? "Daftar varian produk ini (nama varian, stok, harga khusus, berat)."
                        : onlyDefaultVariant
                          ? "Kelola ukuran, harga khusus, dan stok."
                          : "Kelola warna, ukuran, harga khusus, dan stok."}
                    </p>
                  </div>
                </div>
                {errors.variants && <p className="pf-error mb-3">{errors.variants}</p>}
                {isPaket ? (
                  <PaketVariantList
                    variants={variants}
                    template={paketTemplate}
                    placeholder={paketPlaceholder}
                    skuFallback={sku}
                    skuContext={{ category }}
                    onUpdateName={(i, value) => {
                      const oldName = String(variants[i]?.color || "").trim();
                      const nextName = String(value || "").trim();
                      setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, color: value } : v)));
                      if (oldName && oldName !== nextName) {
                        setMedia((prev) => prev.map((m) => (m.color === oldName ? { ...m, color: nextName } : m)));
                        setPaketMediaColor((current) => (current === oldName ? nextName : current));
                      }
                    }}
                    onUpdateField={(i, field, value) =>
                      setVariants((prev) =>
                        prev.map((v, idx) => {
                          if (idx !== i) return v;
                          const sizes = v.sizes.length > 0 ? [...v.sizes] : [{ size: PAKET_SIZE, stock: 0, priceOverride: "", sku: "", weight: "" }];
                          sizes[0] = { ...sizes[0], [field]: value };
                          return { ...v, sizes };
                        })
                      )
                    }
                    onAdd={() => setVariants((prev) => [...prev, emptyPaketVariant()])}
                    /* Template: baris kosong yang belum diisi ikut terpakai, nama yang sudah ada dilewati —
                       semuanya dalam SATU update state. */
                    onAddTemplate={() =>
                      setVariants((prev) => {
                        const adaNama = new Set(prev.map((v) => String(v.color ?? "").trim().toLowerCase()).filter(Boolean));
                        const baru = paketTemplate.filter((n) => !adaNama.has(n.toLowerCase())).map((n) => emptyPaketVariant(n));
                        if (baru.length === 0) return prev;
                        const kosong = prev.length === 1 && String(prev[0].color ?? "").trim() === "" && prev[0].sizes.every((s) => !s.stock);
                        return kosong ? baru : [...prev, ...baru];
                      })
                    }
                    onRemove={(i) => {
                      const name = String(variants[i]?.color || "").trim();
                      setVariants((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
                      // Foto milik varian yang dihapus ikut dibuang supaya tidak jadi media yatim.
                      if (name) {
                        setMedia((prev) => prev.filter((m) => m.color !== name));
                        setPaketMediaColor((current) => (current === name ? "" : current));
                      }
                    }}
                  />
                ) : category === "Thobe" && selectedSeries.length === 0 ? (
                  <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>Pilih minimal 1 series terlebih dahulu</p>
                ) : (
                <>
                  {/* Color chips — disembunyikan untuk produk default SAMAQU. */}
                  {!onlyDefaultVariant ? (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {variants.map((v) => (
                        <button key={v.color} onClick={() => { setActiveColor(v.color); setPreviewIndex(0); }} className={`pf-chip${activeColor === v.color ? " active" : ""}`}>
                          <span className="w-3 h-3 rounded-full" style={{ background: v.hex || colorMap[v.color] || "#ccc", border: "1px solid rgba(42,33,27,.1)" }} />
                          {v.color}
                          {/* Hapus warna memakai span role="button" — kontrol bersarang di dalam
                              tombol chip membuat React melaporkan hydration error. */}
                          <span role="button" tabIndex={0} aria-label={`Hapus warna ${v.color}`} onClick={(e) => { e.stopPropagation(); removeColor(v.color); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); removeColor(v.color); } }} className="ml-1 hover:opacity-60"><X size={12} /></span>
                        </button>
                      ))}
                      <PresetColorPicker existing={variants.map((v) => v.color)} onAdd={addColor} />
                    </div>
                  ) : null}
                  {activeVariant && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium" style={{ color: "var(--espresso)" }}>
                        {onlyDefaultVariant ? "Ukuran & stok" : <>Ukuran untuk <span style={{ color: "var(--gold)" }}>{activeColor}</span></>}
                      </p>
                      <SizeGrid
                        sizes={activeVariant.sizes}
                        onUpdate={(i, field, value) => updateSizeField(activeColor!, i, field, value)}
                        onUpdateAll={(field, value) => updateSizesBulk(activeColor!, field, value)}
                        onRemove={(i) => removeSize(activeColor!, i)}
                        onAdd={() => addSize(activeColor!)}
                        skuFallback={sku}
                        skuContext={{
                          category,
                          kain: kainName,
                          series,
                          color: resolveColorName({ color: activeVariant.color, productName: name, category, series }),
                        }}
                      />
                    </div>
                  )}
                  {variants.length === 0 && (
                    <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>Pilih warna terlebih dahulu untuk mengatur ukuran dan stok</p>
                  )}
                </>
                )}
              </div>

              {/* Non-Thobe: Media (mode admin saja) */}
              {!isOps && (
              <div className="pf-card p-5 lg:p-6">
                <div className="pf-head">
                  <div className="pf-num">3</div>
                  <div>
                    <h2 className="pf-title">Media</h2>
                    <p className="pf-sub">{isPaket ? "Foto & video produk per varian (fallback ke semua varian)." : "Foto & video produk per warna."}</p>
                  </div>
                </div>
                {errors.media && <p className="pf-error mb-3">{errors.media}</p>}
                {!activeColor && !isPaket ? (
                  <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>Pilih warna terlebih dahulu untuk upload media</p>
                ) : (
                  <div>
                    {isPaket ? (
                      <div className="mb-3">
                        <label className="pf-label">Foto untuk varian</label>
                        <div className="pf-selectwrap">
                          <select
                            value={paketMediaColor}
                            onChange={(e) => setPaketMediaColor(e.target.value)}
                            className="pf-select"
                          >
                            <option value="">Semua varian (fallback)</option>
                            {variants.map((v, i) => {
                              const name = String(v.color || "").trim();
                              return (
                                <option key={i} value={name} disabled={!name}>
                                  {name || "(nama varian belum diisi)"}
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown size={14} className="pf-selectico" />
                        </div>
                      </div>
                    ) : null}
                    <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
                      {isPaket ? (
                        <>Media untuk <span className="font-medium" style={{ color: "var(--gold)" }}>{paketMediaColor || "semua varian"}</span></>
                      ) : (
                        <>Upload untuk warna: <span className="font-medium" style={{ color: "var(--gold)" }}>{activeColor}</span></>
                      )}
                    </p>
                    <label className="pf-drop">
                      <span className="pf-drop-ico"><Upload size={20} /></span>
                      <p className="text-sm font-medium" style={{ color: "var(--espresso)" }}>Klik atau seret file ke sini</p>
                      <p className="pf-hint">JPG, PNG, WebP (max 10MB) · MP4, WebM (max 50MB)</p>
                      <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(e) => handleFileSelect(e, mediaColor)} className="hidden" />
                    </label>
                    <div className="flex gap-2 mt-2.5">
                      <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMediaByUrl(); } }} placeholder="atau tempel URL gambar / video…" className="pf-input flex-1" />
                      <button type="button" onClick={addMediaByUrl} className="pf-btn pf-btn-primary shrink-0">Tambah</button>
                    </div>
                    <p className="pf-hint">Foto pertama = foto utama di katalog.</p>
                    {activeMedia.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4">
                        {activeMedia.map((m, idx) => (
                          <div key={m.id} className="pf-thumb group cursor-pointer"
                            onClick={() => { if (!m.uploading && !m.error) { setPreviewIndex(idx); } }}>
                            {m.uploading ? (
                              <div className="absolute inset-0 flex items-center justify-center"><Loader2 size={20} className="animate-spin" style={{ color: "var(--gold)" }} /></div>
                            ) : m.error ? (
                              <div className="absolute inset-0 flex items-center justify-center p-2"><p className="text-[10px] text-center" style={{ color: "#dc2626" }}>{m.error}</p></div>
                            ) : m.isVideo ? (
                              <video src={m.url || m.preview} className="w-full h-full object-cover" muted loop playsInline onMouseEnter={(e) => (e.target as HTMLVideoElement).play()} onMouseLeave={(e) => { (e.target as HTMLVideoElement).pause(); (e.target as HTMLVideoElement).currentTime = 0; }} />
                            ) : (
                              <img src={m.url || m.preview} alt="" className="w-full h-full object-cover" />
                            )}
                            {idx === 0 && !m.uploading && !m.error && (
                              <span className="pf-thumb-tag">Utama</span>
                            )}
                            {m.isVideo && <div className="absolute top-1.5 left-1.5"><Video size={12} style={{ color: "white" }} /></div>}
                            <button onClick={(e) => { e.stopPropagation(); removeMedia(m.id); }} className="pf-thumb-x">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>)}
              </>
            )}
          </div>

          {/* Right: Preview sidebar (mode admin saja) */}
          {!isOps && (
          <div className="hidden min-[1440px]:block sticky top-24">
            <div className="pf-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif italic text-lg" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>Preview Produk</h3>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ background: "#f4f4f5", color: "var(--gold-deep)", border: "1px solid #e4e4e7" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--gold)" }} /> Live
                </span>
              </div>

              {/* Main image / video */}
              <div className="aspect-[4/5] rounded-2xl overflow-hidden mb-3" style={{ background: "#f4f4f5", border: "1px solid #e4e4e7" }}>
                {activeMedia.length > 0 ? (
                  (() => {
                    const item = activeMedia[Math.min(previewIndex, activeMedia.length - 1)];
                    return item.isVideo ? (
                      <video src={item.url || item.preview} className="w-full h-full object-cover" muted loop playsInline onMouseEnter={(e) => (e.target as HTMLVideoElement).play()} onMouseLeave={(e) => { (e.target as HTMLVideoElement).pause(); (e.target as HTMLVideoElement).currentTime = 0; }} />
                    ) : (
                      <img src={item.url || item.preview} alt="" className="w-full h-full object-cover" />
                    );
                  })()
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon size={32} style={{ color: "var(--text-muted)" }} />
                  </div>
                )}
              </div>

              {/* Thumbnail strip */}
              {activeMedia.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto mb-3 pb-1">
                  {activeMedia.map((m, i) => (
                    <button key={m.id} onClick={() => setPreviewIndex(i)} className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 transition-all" style={{ border: i === (Math.min(previewIndex, activeMedia.length - 1)) ? "2px solid var(--gold)" : "1px solid #e4e4e7", opacity: i === (Math.min(previewIndex, activeMedia.length - 1)) ? 1 : 0.6 }}>
                      {m.isVideo ? (
                        <div className="w-full h-full relative">
                          <video src={m.url || m.preview} className="w-full h-full object-cover" muted />
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,.3)" }}>
                            <Video size={12} color="white" />
                          </div>
                        </div>
                      ) : (
                        <img src={m.url || m.preview} alt="" className="w-full h-full object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Product info */}
              <p className="text-sm font-medium" style={{ color: "var(--espresso)" }}>{name || "Nama Produk"}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{category || "Kategori"}{activeSeriesTab && category === "Thobe" ? ` · ${activeSeriesTab}` : ""}</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>SKU: {sku.trim() || "—"}</p>
              {weightRange ? <p className="text-[11px] mt-0.5 font-semibold" style={{ color: "var(--gold-deep)" }}>{weightRange}</p> : null}
              <p className="text-xl font-serif italic mt-1.5" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--gold)" }}>
                {category === "Thobe" && activeSeriesTab && seriesBlocks[activeSeriesTab] ? (
                  (() => {
                    const b = seriesBlocks[activeSeriesTab];
                    return b.cypEnabled
                      ? (b.minimumPrice ? `Rp ${formatRupiah(b.minimumPrice)}` : "Rp 0")
                      : (b.price ? `Rp ${formatRupiah(b.price)}` : "Rp 0");
                  })()
                ) : cypEnabled
                  ? (minimumPrice ? `Rp ${formatRupiah(minimumPrice)}` : recommendedPrice ? `Rp ${formatRupiah(recommendedPrice)}` : "Rp 0")
                  : (basePrice ? `Rp ${formatRupiah(basePrice)}` : "Rp 0")
                }
              </p>

              {/* Color swatches — skip for Thobe */}
              {category !== "Thobe" && variants.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {variants.map((v) => (
                    <button key={v.color} onClick={() => { setActiveColor(v.color); setPreviewIndex(0); }} className="w-6 h-6 rounded-full transition-transform" style={{ background: v.hex || colorMap[v.color] || "#ccc", border: activeColor === v.color ? "2px solid var(--gold)" : "1px solid rgba(42,33,27,.15)", transform: activeColor === v.color ? "scale(1.15)" : "scale(1)" }} title={v.color} />
                  ))}
                </div>
              )}

              {/* Active color label */}
              {activeColor && (
                <p className="text-[11px] mt-2 font-medium" style={{ color: "var(--text-muted)" }}>{activeColor}</p>
              )}
            </div>
          </div>
          )}
        </div>
      </main>

      {/* Bar aksi bawah — tampil di SEMUA lebar layar, bukan cuma mobile.
          Form produk sangat panjang (Info Dasar → Media), jadi admin yang sudah di
          bagian bawah tidak perlu scroll balik ke atas lagi untuk menyimpan.
          Lebarnya mengikuti konten form (max-w-6xl) supaya rapi di desktop. */}
      <div className="pf-savebar fixed bottom-0 inset-x-0 z-40">
        <div className="max-w-6xl mx-auto px-5 lg:px-8 pt-3 pb-4 flex items-center gap-3">
          {/* Batal disembunyikan di layar sempit supaya tombol Simpan tetap selebar
              layar (tampilan mobile lama tidak berubah). */}
          <div className="hidden sm:block">
            <button onClick={() => router.push(backHref)} className="pf-btn pf-btn-ghost">Batal</button>
          </div>
          <button onClick={handleSubmit} disabled={saving} className="pf-btn pf-btn-primary w-full sm:w-auto sm:ml-auto sm:min-w-[170px]" style={{ paddingTop: ".85rem", paddingBottom: ".85rem", fontSize: ".9rem" }}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Menyimpan...</> : <><Check size={14} /> {isEdit ? "Simpan Perubahan" : "Simpan Produk"}</>}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .card { background: #ffffff; border: 1px solid #f1f1f3; border-radius: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,.03); }

        .pf-card {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,.06);
          border-radius: 1.25rem;
          box-shadow: 0 1px 2px rgba(0,0,0,.03), 0 18px 40px -32px rgba(45,33,27,.35);
        }
        .pf-head {
          display: flex; align-items: flex-start; gap: .85rem;
          padding-bottom: 1rem; margin-bottom: 1.25rem;
          border-bottom: 1px solid rgba(0,0,0,.06);
        }
        .pf-num {
          flex: none; width: 2.3rem; height: 2.3rem; border-radius: .8rem;
          display: flex; align-items: center; justify-content: center;
          font-size: .8rem; font-weight: 700; color: var(--gold-deep);
          background: linear-gradient(135deg, rgba(0,0,0,.04), rgba(0,0,0,.015));
          border: 1px solid #e4e4e7;
        }
        .pf-title {
          font-family: var(--font-cormorant), Georgia, serif; font-style: italic;
          font-size: 1.35rem; line-height: 1.1; color: var(--espresso);
        }
        .pf-sub { font-size: .74rem; color: var(--text-muted); margin-top: .18rem; line-height: 1.4; }
        .pf-label {
          display: block; font-size: .78rem; font-weight: 600;
          color: var(--text-secondary); margin-bottom: .4rem;
        }
        .pf-req { color: var(--gold); }
        .pf-input, .pf-select, .pf-textarea {
          width: 100%; border-radius: .8rem; border: 1px solid rgba(0,0,0,.12);
          background: #fff; color: var(--espresso); font-size: .875rem;
          padding: .7rem .9rem; outline: none;
          transition: border-color .18s ease, box-shadow .18s ease;
        }
        .pf-textarea { resize: none; line-height: 1.55; }
        .pf-select { appearance: none; padding-right: 2.2rem; }
        .pf-input::placeholder, .pf-textarea::placeholder { color: var(--text-muted); }
        .pf-input:focus, .pf-select:focus, .pf-textarea:focus {
          border-color: var(--gold); box-shadow: 0 0 0 3px rgba(0,0,0,.07);
        }
        .pf-input.invalid, .pf-select.invalid, .pf-textarea.invalid { border-color: #dc2626; }
        .pf-hint { font-size: .7rem; color: var(--text-muted); margin-top: .35rem; }
        .pf-error { font-size: .72rem; color: #dc2626; margin-top: .35rem; }
        .pf-selectwrap { position: relative; }
        .pf-selectico {
          position: absolute; right: .85rem; top: 50%; transform: translateY(-50%);
          pointer-events: none; color: var(--text-muted);
        }
        .pf-panel {
          border-radius: 1rem; border: 1px solid #e4e4e7;
          background: rgba(255,255,255,.65); padding: 1rem;
        }
        .pf-panel.accent { background: rgba(0,0,0,.03); border-color: #e4e4e7; }
        .pf-panel.flat { background: rgba(0,0,0,.03); border-color: #e4e4e7; }
        .pf-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: .45rem;
          border-radius: .8rem; font-size: .8rem; font-weight: 600;
          padding: .6rem .95rem; border: 1px solid transparent;
          transition: filter .18s ease, background .18s ease, border-color .18s ease;
        }
        .pf-btn-primary {
          background: linear-gradient(135deg, var(--gold), var(--gold-deep));
          color: #fff; box-shadow: 0 10px 22px -12px rgba(150,116,47,.75);
        }
        .pf-btn-primary:hover { filter: brightness(1.05); }
        .pf-btn-primary:disabled { opacity: .6; }
        .pf-btn-ghost { background: #fff; border-color: rgba(0,0,0,.12); color: var(--espresso); }
        .pf-btn-ghost:hover { background: var(--bg-secondary); }
        .pf-btn-outline {
          background: transparent; border-color: #d4d4d8;
          border-style: dashed; color: var(--gold-deep);
        }
        .pf-btn-outline:hover { background: #f4f4f5; }
        .pf-btn-danger { background: transparent; border-color: rgba(231,76,60,.3); color: #dc2626; }
        .pf-btn-danger:hover { background: rgba(231,76,60,.07); }
        /* Bar aksi tetap di bawah (Simpan). Latar semi-transparan + blur supaya isi
           form yang lewat di belakangnya masih terbaca samar, bukan garis keras. */
        .pf-savebar {
          background: rgba(255,255,255,.9);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-top: 1px solid rgba(0,0,0,.07);
          box-shadow: 0 -18px 34px -30px rgba(45,33,27,.65);
        }
        .pf-toggle {
          position: relative; width: 2.6rem; height: 1.45rem; border-radius: 999px;
          flex: none; transition: background .2s ease;
        }
        .pf-toggle-knob {
          position: absolute; top: .15rem; left: .15rem; width: 1.15rem; height: 1.15rem;
          border-radius: 999px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25);
          transition: transform .2s ease;
        }
        .pf-chip {
          display: inline-flex; align-items: center; gap: .4rem;
          padding: .4rem .85rem; border-radius: 999px; font-size: .75rem; font-weight: 600;
          color: var(--coffee); background: transparent;
          border: 1px solid #d4d4d8;
          transition: all .18s ease;
        }
        .pf-chip:hover { border-color: var(--gold); color: var(--espresso); background: rgba(0,0,0,.03); }
        .pf-chip.active { background: var(--espresso); color: var(--cream); border-color: var(--espresso); }
        .pf-tab {
          display: inline-flex; align-items: center; gap: .4rem;
          padding: .55rem 1.05rem; border-radius: .8rem; font-size: .78rem; font-weight: 600;
          color: var(--coffee); background: transparent; border: 1px solid #d4d4d8;
          transition: all .18s ease;
        }
        .pf-tab:hover { border-color: var(--gold); background: rgba(0,0,0,.03); }
        .pf-tab.active { background: var(--espresso); color: var(--cream); border-color: var(--espresso); }
        .pf-dot { width: .4rem; height: .4rem; border-radius: 999px; background: #dc2626; display: inline-block; margin-left: .4rem; }
        .pf-drop {
          display: block; border-radius: 1rem; text-align: center; cursor: pointer;
          padding: 1.5rem 1.25rem; border: 2px dashed #d4d4d8;
          background: rgba(255,255,255,.55); transition: border-color .2s ease, background .2s ease;
        }
        .pf-drop:hover { border-color: var(--gold); background: rgba(0,0,0,.025); }
        .pf-drop-ico {
          width: 2.75rem; height: 2.75rem; border-radius: 999px; margin: 0 auto .6rem;
          display: flex; align-items: center; justify-content: center;
          background: #f4f4f5; color: var(--gold-deep);
        }
        .pf-thumb {
          position: relative; aspect-ratio: 1 / 1; border-radius: .85rem; overflow: hidden;
          background: #f4f4f5;
        }
        .pf-thumb-x {
          position: absolute; top: .35rem; right: .35rem; width: 1.5rem; height: 1.5rem;
          border-radius: 999px; display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,.62); color: #fff; opacity: 0; transition: opacity .18s ease;
        }
        .pf-thumb:hover .pf-thumb-x { opacity: 1; }
        .pf-thumb-tag {
          position: absolute; bottom: .35rem; left: .35rem; border-radius: .35rem;
          padding: .1rem .35rem; font-size: .55rem; font-weight: 600; letter-spacing: .02em;
          color: #fff; background: rgba(0,0,0,.65);
        }
        /* ── Tabel ukuran (SizeGrid) ──
           <768px: kartu per ukuran (judul + tombol hapus di kanan atas, isian 2 kolom).
           ≥768px: tabel grid berkolom lurus, semua isian & tombol hapus sebaris. */
        .pf-sizes { min-width: 0; }
        /* Guard: apa pun isinya tidak boleh melebar melewati section (anti scroll samping). */
        .pf-sizes, .pf-sizes * { min-width: 0; max-width: 100%; }
        .pf-sizes-bar {
          display: flex; flex-wrap: wrap; align-items: center; gap: .5rem;
          justify-content: flex-end; margin-bottom: .55rem;
        }
        .pf-bulk-label { font-size: .72rem; font-weight: 600; color: var(--text-muted); }
        .pf-bulk-apply { padding: .5rem 1rem; }
        .pf-sizes-msg { margin: 0 0 .55rem; }
        .pf-sizes-done { font-size: .72rem; font-weight: 700; color: #047857; }
        .pf-sizes-head { display: none; }
        .pf-size-row {
          display: block; padding: .75rem 0; border-bottom: 1px solid #ececef;
        }
        .pf-sizes-list { border-top: 1px solid #ececef; }
        /* Layar sempit: baris gepeng ala tabel (bukan kartu di dalam kartu panel) */
        .pf-size-head { display: flex; align-items: flex-end; gap: .5rem; margin-bottom: .55rem; }
        .pf-f-size { flex: 1 1 auto; }
        .pf-size-body { display: flex; flex-wrap: wrap; gap: .5rem .6rem; }
        .pf-size-body > .pf-size-field { flex: 1 1 calc(50% - .3rem); min-width: 0; max-width: calc(50% - .3rem); }
        .pf-size-field { display: block; min-width: 0; }
        .pf-size-act { flex: none; display: flex; align-items: center; justify-content: flex-end; }
        .pf-size-label {
          display: block; margin-bottom: .3rem; font-size: .62rem; font-weight: 700;
          letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted);
        }
        /* Bar isi massal: grup sendiri — judul + akibat + tombol commit, bukan isian nyempil. */
        .pf-bulkbar {
          display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
          gap: .6rem .9rem; padding: .7rem .85rem; margin-bottom: .85rem;
          border: 1px solid #ececef; border-radius: .7rem; background: #f7f7f8;
        }
        .pf-bulkbar-title { display: block; font-size: .78rem; font-weight: 700; color: var(--espresso); }
        .pf-bulkbar-hint { display: block; margin-top: .1rem; font-size: .68rem; color: var(--text-muted); }
        .pf-bulkbar-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-left: auto; }
        .pf-bulkbar-actions .pf-adorn { width: 104px; flex: none; }
        .pf-bulk-apply { min-height: 44px; }
        /* Isian bergaya "form line": TIDAK ada kotak sama sekali — hanya garis bawah tipis.
           Semua isian di bagian ukuran (termasuk yang berdiri sendiri seperti SKU/harga)
           memakai satu gaya yang sama, jadi jelas bisa diketik dan tidak ada yang terpotong. */
        .pf-sizes .pf-cell {
          border: 0; border-bottom: 1px solid #d4d4d8; border-radius: 0;
          background: transparent; box-shadow: none; width: 100%;
          padding: .45rem .15rem; min-height: 40px; min-width: 84px;
        }
        .pf-sizes .pf-cell:hover { border-bottom-color: #a1a1aa; }
        .pf-sizes .pf-cell:focus { border-bottom: 2px solid var(--gold); box-shadow: none; outline: none; }
        .pf-adorn {
          display: flex; align-items: center; gap: .3rem; min-width: 0; min-height: 44px;
          padding: 0 .15rem; border: 0; background: transparent; border-radius: 0;
        }
        .pf-adorn .pf-cell { flex: 1 1 auto; min-width: 0; }
        .pf-adorn:hover .pf-cell { border-bottom-color: #a1a1aa; }
        .pf-adorn:focus-within .pf-cell { border-bottom: 2px solid var(--gold); }
        .pf-suffix, .pf-prefix { flex: none; font-size: .72rem; font-weight: 700; color: var(--text-muted); }
        .pf-cell-num { text-align: right; }
        .pf-cell-center { text-align: center; }
        /* Berat belum diisi: garis bawah kuning + titik kuning (tanpa kotak; tinggi baris tetap) */
        .pf-adorn.is-missing .pf-cell { border-bottom-color: #f59e0b; }
        .pf-adorn.invalid .pf-cell { border-bottom: 2px solid #dc2626; }
        .pf-dot-warn { flex: none; width: .45rem; height: .45rem; border-radius: 999px; background: #f59e0b; }
        /* Stok terkunci (series turunan): latar redup + ikon gembok + label "ikut <series>" */
        .pf-adorn.is-locked { background: #f4f4f5; gap: .35rem; padding: 0 .5rem; color: var(--text-muted); }
        .pf-locked-text {
          min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font-size: .72rem; font-weight: 700; color: var(--text-muted);
        }
        .pf-rowdel { min-width: 44px; min-height: 44px; }
        .pf-rowdel:focus-visible { outline: 2px solid #dc2626; outline-offset: 2px; }
        /* Ponsel: tanpa latar kotak, isian tetap bergaris bawah. */
        /* Ponsel sempit (≤419px): satu kolom penuh + bar aksi melebar, jadi tidak mungkin
           meluber keluar layar. Dua kolom dipakai mulai 420px. */
        @media (max-width: 419px) {
          .pf-size-body > .pf-size-field { flex: 1 1 100%; max-width: 100%; }
          .pf-bulkbar-actions { width: 100%; margin-left: 0; }
          .pf-bulkbar-actions .pf-adorn { flex: 1 1 auto; width: auto; }
        }
        /* iOS Safari: input ber-font < 16px memicu zoom otomatis saat difokus. */
        @media (max-width: 640px) {
          .pf-sizes .pf-cell { font-size: 1rem; }
        }
        .pf-sizes-foot { display: block; margin-top: .7rem; }
        .pf-sizes-foot .pf-add { display: flex; width: 100%; margin: 0 0 .5rem; }
        .pf-sizes-foot .pf-missing-chip { display: block; width: auto; }
        .pf-add:disabled { opacity: .5; cursor: not-allowed; }
        .pf-missing-chip {
          display: inline-block; max-width: 100%; overflow-wrap: anywhere;
          padding: .3rem .7rem; border-radius: 999px;
          font-size: .7rem; font-weight: 700; color: #b45309;
          background: #fffbeb; border: 1px solid #fcd34d;
        }
        /* Sembunyikan panah spinner bawaan browser pada isian angka */
        .pf-sizes input[type="number"]::-webkit-outer-spin-button,
        .pf-sizes input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .pf-sizes input[type="number"] { -moz-appearance: textfield; appearance: textfield; }

        @media (min-width: 768px) {
          /* Kolom proporsional (fr, min 0): tabel selalu memenuhi lebar kartu — tidak ada kolom
             kekecilan yang memotong angka, tidak ada ruang kosong menganggur di kanan.
             Pemisah pakai garis antarkolom (gaya tabel), bukan kotak di tiap isian. */
          .pf-sizes-head {
            display: grid;
            grid-template-columns: minmax(76px, .7fr) minmax(84px, .85fr) minmax(108px, 1fr) minmax(128px, 1.3fr) minmax(110px, 1.1fr) 44px;
            gap: 0; border-bottom: 1px solid var(--bd);
            font-size: .68rem; font-weight: 700; letter-spacing: .02em;
            text-transform: uppercase; color: var(--text-muted);
          }
          .pf-sizes-head > span { padding: 0 .5rem .5rem; }
          .pf-sizes-head-act { text-align: right; }
          .pf-sizes-list { border-top: 0; }
          .pf-size-row {
            /* WAJIB display:grid — tanpa itu baris kembali menumpuk vertikal seperti block. */
            display: grid;
            grid-template-columns: minmax(76px, .7fr) minmax(84px, .85fr) minmax(108px, 1fr) minmax(128px, 1.3fr) minmax(110px, 1.1fr) 44px;
            gap: 0; align-items: center;
            padding: .3rem 0; border-bottom: 1px solid #f1f1f3;
          }
          .pf-f-stock, .pf-f-weight, .pf-f-price, .pf-f-sku, .pf-size-act { border-left: 1px solid #f1f1f3; }
          .pf-size-row:hover { background: #fafafa; }
          /* head & body jadi transparan → 6 isian sejajar dalam satu baris grid */
          .pf-size-head, .pf-size-body { display: contents; }
          .pf-f-size { flex: none; order: 1; }
          .pf-f-stock { order: 2; }
          .pf-f-weight { order: 3; }
          .pf-f-price { order: 4; }
          .pf-f-sku { order: 5; }
          .pf-size-act { order: 6; padding: 0 .3rem; }
          .pf-size-label { display: none; }
          .pf-adorn { min-height: 40px; }
          .pf-adorn .pf-cell { min-height: 38px; font-size: .82rem; }
          .pf-rowdel { min-width: 40px; min-height: 40px; }
        }
        .pf-cell {
          border-radius: .6rem; border: 1px solid rgba(0,0,0,.12);
          background: #fff; color: var(--espresso); font-size: .85rem;
          padding: .5rem .65rem; outline: none; width: 100%;
          transition: border-color .18s ease, box-shadow .18s ease;
        }
        .pf-cell:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(0,0,0,.07); }
        .pf-rowdel {
          padding: .4rem; border-radius: .6rem; color: #dc2626;
          display: flex; align-items: center; justify-content: center;
        }
        .pf-rowdel:hover { background: rgba(231,76,60,.08); }
        .pf-add {
          display: inline-flex; align-items: center; gap: .4rem;
          font-size: .8rem; font-weight: 600; color: var(--gold-deep); margin-top: .35rem;
        }
        .pf-add:hover { color: var(--gold); }

        /* ── Tema ops: kartu putih + aksen biru (menu ops). Hanya warna/bentuk, bukan struktur. ── */
        .pf--ops .pf-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 1rem; box-shadow: 0 1px 2px rgba(15,23,42,.05); }
        .pf--ops .pf-head { border-bottom: 1px solid #e2e8f0; }
        .pf--ops .pf-num { color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: .7rem; }
        .pf--ops .pf-title { font-family: var(--font-inter), system-ui, sans-serif; font-style: normal; font-weight: 800; color: #0f172a; font-size: 1.15rem; }
        .pf--ops .pf-sub, .pf--ops .pf-label, .pf--ops .pf-hint { color: #64748b; }
        .pf--ops .pf-input, .pf--ops .pf-select, .pf--ops .pf-textarea, .pf--ops .pf-cell { border-color: #cbd5e1; color: #0f172a; }
        .pf--ops .pf-input:focus, .pf--ops .pf-select:focus, .pf--ops .pf-textarea:focus, .pf--ops .pf-cell:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.15); }
        .pf--ops .pf-panel { border-color: #e2e8f0; background: #f8fafc; }
        .pf--ops .pf-btn-primary { background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 10px 22px -12px rgba(37,99,235,.7); }
        .pf--ops .pf-btn-ghost { border-color: #cbd5e1; color: #334155; background: #fff; }
        .pf--ops .pf-savebar { background: rgba(255,255,255,.95); border-top-color: #e2e8f0; box-shadow: 0 -18px 34px -30px rgba(15,23,42,.4); }
        .pf--ops .pf-btn-outline { border-color: #cbd5e1; color: #1d4ed8; }
        .pf--ops .pf-chip { border-color: #cbd5e1; color: #334155; }
        .pf--ops .pf-chip.active { background: #2563eb; border-color: #2563eb; color: #fff; }
        .pf--ops .pf-tab { border-color: #cbd5e1; color: #334155; }
        .pf--ops .pf-tab.active { background: #2563eb; border-color: #2563eb; color: #fff; }
        .pf--ops .pf-add { color: #1d4ed8; }
        .pf--ops .pf-add:hover { color: #2563eb; }
        .pf--ops .pf-selectico { color: #64748b; }
        .pf--ops .pf-size-row { border-color: #e2e8f0; }
      `}</style>
    </section>
  );
  return isOps ? content : <AdminShell>{content}</AdminShell>;
}
