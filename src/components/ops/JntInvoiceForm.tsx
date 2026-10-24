"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle, Clock, FileText, Loader2, Save } from "lucide-react";
import { base44 } from "@/lib/ops-api";
import { formatRp, toNumber, type JntInvoiceHeader } from "@/lib/jnt-invoice";

/**
 * Kartu "Angka Invoice J&T" — tempat menyalin angka resmi dari invoice PDF J&T.
 *
 * Tata letak (2026-10-24): form dibagi dua blok berjudul — **Identitas invoice** dan
 * **Angka tagihan** — supaya kolomnya rapi dan enak diisi: semua field setinggi `h-11`,
 * disusun 2 kolom (`sm:grid-cols-2`, bertumpuk di mobile), dan kolom uang dijajar KANAN
 * dengan awalan tanda (`Rp` / `−` / `+` / `=`) plus pemisah ribuan yang hidup saat diketik.
 * Hasil hitungannya (DPP dan total) turun jadi satu strip di bawah kolomnya, bukan lagi
 * baris teks kecil yang berdesakan — jadi alurnya kebaca dari atas ke bawah: bruto → diskon
 * → DPP → +PPN → total.
 * Status bayar juga dipindah: dulu pilnya di header **dan** ada kotak teks "Status Bayar"
 * yang cuma menampilkan hal yang sama; sekarang satu field "Status bayar" berisi
 * kontrolnya, jadi tidak ada informasi yang tampil dua kali.
 *
 * PPN sengaja jadi baris SENDIRI di sini (tidak digabung ke biaya ongkir): keputusan
 * apakah PPN dikreditkan sebagai pajak masukan atau jadi tambahan biaya masih menunggu
 * konsultasi akuntan, jadi angkanya harus mudah diubah tanpa menyentuh perhitungan lain.
 *
 * Baris "Cek invoice" membandingkan (bruto − diskon) + PPN dengan total yang dibayar,
 * supaya angka yang salah ketik kelihatan sebelum ikut ke laporan.
 */

type FormState = {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  gross_total: string;
  discount_total: string;
  ppn_total: string;
  paid_total: string;
  status: "unpaid" | "paid";
  notes: string;
};

const EMPTY: FormState = {
  invoice_number: "",
  invoice_date: "",
  due_date: "",
  gross_total: "",
  discount_total: "",
  ppn_total: "",
  paid_total: "",
  status: "unpaid",
  notes: "",
};

/**
 * Angka dari database → teks di dalam form: digit polos + koma desimal, TANPA pemisah
 * ribuan. State form selalu bentuk "bersih" ini (dipakai langsung `toNumber`), sedangkan
 * pemisah ribuan cuma dipasang saat ditampilkan — lihat `tampilAngka`.
 */
function angka(value: number | null | undefined): string {
  const n = Number(value || 0);
  return n ? String(n).replace(".", ",") : "";
}

/** State → tampilan: "1234567,5" → "1.234.567,5". */
function tampilAngka(raw: string): string {
  const [bulat, ...sisa] = raw.split(",");
  if (!bulat && !sisa.length) return "";
  const rupiah = bulat.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return sisa.length ? `${rupiah},${sisa.join("").slice(0, 2)}` : rupiah;
}

/**
 * Ketikan/paste → state: buang semua pemisah ribuan dan sisakan digit + satu koma desimal
 * (maks. 2 angka di belakang koma), jadi "1.234.567,50" yang ditempel dari invoice tetap
 * terbaca `toNumber` sebagai 1234567.5.
 */
function bersihAngka(raw: string): string {
  const [bulat, ...sisa] = raw.replace(/[^\d,]/g, "").split(",");
  return sisa.length ? `${bulat},${sisa.join("").slice(0, 2)}` : bulat;
}

function fromInvoice(invoice: JntInvoiceHeader | null): FormState {
  if (!invoice) return EMPTY;
  return {
    invoice_number: invoice.invoice_number || "",
    invoice_date: invoice.invoice_date || "",
    due_date: invoice.due_date || "",
    gross_total: angka(invoice.gross_total),
    discount_total: angka(invoice.discount_total),
    ppn_total: angka(invoice.ppn_total),
    paid_total: angka(invoice.paid_total),
    status: invoice.status === "paid" ? "paid" : "unpaid",
    notes: invoice.notes || "",
  };
}

const FIELD =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5";
const LABEL = "text-[11px] font-bold uppercase tracking-wider text-slate-500";
const STAT_LABEL = "text-[10px] font-bold uppercase tracking-wider text-slate-400";

/** Judul blok: label kecil + garis tipis sampai tepi kanan. */
function SectionTitle({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{children}</span>
      <span className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

/** Field uang: awalan tanda di kiri, angka dijajar kanan dengan pemisah ribuan. */
function MoneyField({
  label,
  sign,
  signTone = "text-slate-400",
  value,
  onChange,
}: {
  label: string;
  sign: string;
  signTone?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className={LABEL}>{label}</span>
      <span className="flex h-11 items-center rounded-xl border border-slate-200 bg-white transition focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/5">
        <span className={`pl-3 text-sm font-bold tabular-nums ${signTone}`}>{sign}</span>
        <input
          inputMode="numeric"
          className="h-full w-full rounded-xl bg-transparent pl-2 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-300"
          value={tampilAngka(value)}
          onChange={(event) => onChange(bersihAngka(event.target.value))}
          placeholder="0"
        />
      </span>
    </label>
  );
}

export default function JntInvoiceForm({
  period,
  monthLabel,
  invoice,
  onSaved,
}: {
  period: string;
  monthLabel: string;
  invoice: JntInvoiceHeader | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => fromInvoice(invoice));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Ganti bulan → form ikut memuat angka bulan itu (jangan tinggalkan isian bulan lama).
  useEffect(() => {
    setForm(fromInvoice(invoice));
    setMessage(null);
  }, [invoice]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }) as FormState);

  const gross = toNumber(form.gross_total) ?? 0;
  const discount = toNumber(form.discount_total) ?? 0;
  const ppn = toNumber(form.ppn_total) ?? 0;
  const paid = toNumber(form.paid_total) ?? 0;
  const dpp = gross - discount;
  const hitungTotal = dpp + ppn;
  const selisihTotal = paid ? hitungTotal - paid : 0;
  const adaAngka = gross > 0 || paid > 0;
  const cocok = Math.abs(selisihTotal) < 1;

  async function simpan() {
    setSaving(true);
    setMessage(null);
    try {
      await base44.entities.OngkirJnt.simpan({
        period,
        invoice_number: form.invoice_number,
        invoice_date: form.invoice_date,
        due_date: form.due_date,
        gross_total: gross,
        discount_total: discount,
        ppn_total: ppn,
        paid_total: paid,
        status: form.status,
        notes: form.notes,
      });
      setMessage({ tone: "ok", text: `Angka invoice ${monthLabel} tersimpan.` });
      onSaved();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message || "Gagal menyimpan." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-slate-200 bg-white p-5"
    >
      <div className="flex items-start gap-2">
        <FileText size={16} className="mt-0.5 text-slate-400" />
        <div>
          <h2 className="text-sm font-black text-slate-900">Angka Invoice J&T</h2>
          <p className="text-xs text-slate-500">
            Salin dari invoice resmi bulan {monthLabel}. Diskon = pengurang biaya, bukan pendapatan.
          </p>
        </div>
      </div>

      {/* ── identitas invoice ─────────────────────────────────────────────── */}
      <div className="mt-5 space-y-3">
        <SectionTitle>Identitas invoice</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className={LABEL}>No. Invoice</span>
            <input
              className={FIELD}
              value={form.invoice_number}
              onChange={(e) => set("invoice_number")(e.target.value)}
              placeholder="mis. INV-2026-10"
            />
          </label>
          <label className="block space-y-1.5">
            <span className={LABEL}>Tanggal Invoice</span>
            <input
              type="date"
              className={FIELD}
              value={form.invoice_date}
              onChange={(e) => set("invoice_date")(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={LABEL}>Jatuh Tempo</span>
            <input type="date" className={FIELD} value={form.due_date} onChange={(e) => set("due_date")(e.target.value)} />
          </label>
          <div className="space-y-1.5">
            <p className={LABEL}>Status Bayar</p>
            <div
              role="group"
              aria-label="Status bayar"
              className="flex h-11 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
            >
              {(
                [
                  { value: "unpaid", label: "Belum Bayar", active: "bg-amber-100 text-amber-700" },
                  { value: "paid", label: "Lunas", active: "bg-emerald-100 text-emerald-700" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => set("status")(option.value)}
                  aria-pressed={form.status === option.value}
                  className={`h-full flex-1 rounded-lg text-xs font-bold transition ${
                    form.status === option.value
                      ? `${option.active} shadow-sm`
                      : "text-slate-500 hover:bg-white hover:text-slate-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="flex items-center gap-1 text-[11px] text-slate-400">
              <Clock size={11} />
              {form.status === "paid" ? "Sudah dibayar" : "Menunggu pembayaran"}
            </p>
          </div>
        </div>
      </div>

      {/* ── angka tagihan ─────────────────────────────────────────────────── */}
      <div className="mt-5 space-y-3">
        <SectionTitle>Angka tagihan</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyField label="Delivery Fee (bruto)" sign="Rp" value={form.gross_total} onChange={set("gross_total")} />
          <MoneyField
            label="Diskon J&T"
            sign="−"
            signTone="text-emerald-500"
            value={form.discount_total}
            onChange={set("discount_total")}
          />
          <MoneyField label="PPN (baris sendiri)" sign="+" value={form.ppn_total} onChange={set("ppn_total")} />
          <MoneyField
            label="Total Dibayar"
            sign="="
            signTone="text-slate-500"
            value={form.paid_total}
            onChange={set("paid_total")}
          />
        </div>

        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className={STAT_LABEL}>DPP (bruto − diskon)</p>
              <p className="mt-0.5 text-base font-black tabular-nums text-slate-900">{formatRp(dpp)}</p>
            </div>
            <div>
              <p className={STAT_LABEL}>Total dihitung (DPP + PPN)</p>
              <p className="mt-0.5 text-base font-black tabular-nums text-slate-900">{formatRp(hitungTotal)}</p>
            </div>
            {adaAngka && paid > 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                  cocok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {cocok ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                {cocok ? "Cocok dengan total dibayar" : `Selisih ${formatRp(selisihTotal)} dari total dibayar`}
              </motion.span>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            PPN sengaja berdiri sendiri — belum digabung ke biaya ongkir (menunggu keputusan akuntan).
          </p>
        </div>
      </div>

      {/* ── catatan + simpan ──────────────────────────────────────────────── */}
      <div className="mt-5 space-y-3 border-t border-dashed border-slate-200 pt-4">
        <label className="block space-y-1.5">
          <span className={LABEL}>Catatan</span>
          <input
            className={FIELD}
            value={form.notes}
            onChange={(e) => set("notes")(e.target.value)}
            placeholder="mis. nomor VA, nomor invoice J&T, hal yang perlu ditanyakan"
          />
        </label>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={simpan}
            disabled={saving}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Menyimpan…" : "Simpan Angka Invoice"}
          </button>
        </div>

        <AnimatePresence>
          {message && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`text-right text-xs font-semibold ${message.tone === "ok" ? "text-emerald-600" : "text-red-600"}`}
            >
              {message.text}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
