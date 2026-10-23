"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle, Clock, FileText, Loader2, Save } from "lucide-react";
import { base44 } from "@/lib/ops-api";
import { formatRp, toNumber, type JntInvoiceHeader } from "@/lib/jnt-invoice";

/**
 * Kartu "Angka Invoice J&T" — tempat menyalin angka resmi dari invoice PDF J&T.
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

function angka(value: number | null | undefined): string {
  const n = Number(value || 0);
  return n ? n.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : "";
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
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/5";
const LABEL = "text-[11px] font-bold uppercase tracking-wider text-slate-500";

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <FileText size={16} className="mt-0.5 text-slate-400" />
          <div>
            <h2 className="text-sm font-black text-slate-900">Angka Invoice J&T</h2>
            <p className="text-xs text-slate-500">
              Salin dari invoice resmi bulan {monthLabel}. Diskon = pengurang biaya, bukan pendapatan.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => set("status")("unpaid")}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              form.status === "unpaid" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            Belum Bayar
          </button>
          <button
            type="button"
            onClick={() => set("status")("paid")}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              form.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            Lunas
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className={LABEL}>No. Invoice</span>
          <input className={FIELD} value={form.invoice_number} onChange={(e) => set("invoice_number")(e.target.value)} placeholder="mis. INV-2026-10" />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>Tanggal Invoice</span>
          <input type="date" className={FIELD} value={form.invoice_date} onChange={(e) => set("invoice_date")(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>Jatuh Tempo</span>
          <input type="date" className={FIELD} value={form.due_date} onChange={(e) => set("due_date")(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>Status Bayar</span>
          <div className={`${FIELD} flex items-center gap-2 text-slate-600`}>
            <Clock size={14} className="text-slate-400" />
            {form.status === "paid" ? "Sudah dibayar" : "Menunggu pembayaran"}
          </div>
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className={LABEL}>Delivery Fee (bruto)</span>
          <input inputMode="numeric" className={FIELD} value={form.gross_total} onChange={(e) => set("gross_total")(e.target.value)} placeholder="0" />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>Diskon J&T</span>
          <input inputMode="numeric" className={FIELD} value={form.discount_total} onChange={(e) => set("discount_total")(e.target.value)} placeholder="0" />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>PPN (baris sendiri)</span>
          <input inputMode="numeric" className={FIELD} value={form.ppn_total} onChange={(e) => set("ppn_total")(e.target.value)} placeholder="0" />
        </label>
        <label className="space-y-1">
          <span className={LABEL}>Total Dibayar</span>
          <input inputMode="numeric" className={FIELD} value={form.paid_total} onChange={(e) => set("paid_total")(e.target.value)} placeholder="0" />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
        <label className="space-y-1">
          <span className={LABEL}>Catatan</span>
          <input className={FIELD} value={form.notes} onChange={(e) => set("notes")(e.target.value)} placeholder="mis. nomor VA, nomor invoice J&T, hal yang perlu ditanyakan" />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={simpan}
            disabled={saving}
            className="inline-flex h-[38px] items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Menyimpan…" : "Simpan Angka Invoice"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-slate-200 pt-3 text-xs">
        <span className="text-slate-500">
          Bruto {formatRp(gross)} − diskon {formatRp(discount)} = <span className="font-bold text-slate-700">DPP {formatRp(dpp)}</span>
        </span>
        <span className="text-slate-500">
          DPP + PPN = <span className="font-bold text-slate-700">{formatRp(hitungTotal)}</span>
        </span>
        {adaAngka && paid > 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold ${
              Math.abs(selisihTotal) < 1 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {Math.abs(selisihTotal) < 1 ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
            {Math.abs(selisihTotal) < 1 ? "Cocok dengan total dibayar" : `Selisih ${formatRp(selisihTotal)} dari total dibayar`}
          </motion.span>
        )}
      </div>

      <AnimatePresence>
        {message && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-3 text-xs font-semibold ${message.tone === "ok" ? "text-emerald-600" : "text-red-600"}`}
          >
            {message.text}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
