"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Calendar, Coins, Loader2, Percent, Receipt, RefreshCw, Truck, Wallet } from "lucide-react";
import { base44 } from "@/lib/ops-api";
import GlassCard from "@/components/ops/GlassCard";
import JntInvoiceForm from "@/components/ops/JntInvoiceForm";
import JntItemsTable from "@/components/ops/JntItemsTable";
import JntUploadCard from "@/components/ops/JntUploadCard";
import {
  JNT_EXPENSE_BASIS_LABEL,
  JNT_INVOICE_SQL_FILE,
  JNT_ORDER_BASIS_LABEL,
  formatRp,
  formatPeriode,
  formatTanggalPendek,
  type JntInvoiceResponse,
} from "@/lib/jnt-invoice";

/**
 * Menu Ops → Keuangan → "Ongkir J&T".
 *
 * Tiga lapis angka, sengaja TIDAK digabung jadi satu nominal:
 *   1. tagihan J&T (bruto → diskon → net)         — basis TANGGAL PENGIRIMAN
 *   2. ongkir yang dibayar customer               — basis TANGGAL PESANAN
 *   3. omzet produk (tanpa ongkir)                — basis TANGGAL PESANAN
 * Margin ongkir = (2) − (1) net, hanya dari resi yang cocok ke pesanan; omzet produk
 * tidak pernah ikut ke angka margin itu.
 */

/** Bulan berjalan menurut WIB (bukan UTC, supaya tidak geser di awal/akhir bulan). */
function currentWibMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

export default function OngkirJntView() {
  const [period, setPeriod] = useState(currentWibMonth);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["ops-ongkir-jnt", period],
    queryFn: () => base44.entities.OngkirJnt.get(period),
  });

  const data: JntInvoiceResponse | undefined = query.data;
  const summary = data?.summary;
  const monthLabel = data?.monthLabel || formatPeriode(period);

  const bars = useMemo(() => {
    const gross = summary?.gross || 0;
    const discount = summary?.discount || 0;
    const net = summary?.net || 0;
    const base = gross || 1;
    return { netPct: (net / base) * 100, discountPct: (discount / base) * 100, gross };
  }, [summary]);

  function reload() {
    void queryClient.invalidateQueries({ queryKey: ["ops-ongkir-jnt"] });
  }

  return (
    <div className="space-y-5">
      {/* ── judul + pemilih bulan ─────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Keuangan</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900">Ongkir J&T</h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Beban ongkir dibukukan pada <span className="font-semibold text-slate-700">{JNT_EXPENSE_BASIS_LABEL}</span> ·
            omzet &amp; ongkir customer dihitung dari{" "}
            <span className="font-semibold text-slate-700">{JNT_ORDER_BASIS_LABEL}</span>. Diskon J&T diperlakukan sebagai
            pengurang biaya, bukan pendapatan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {data?.invoice?.due_date && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                data.invoice.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              <Calendar size={13} />
              {data.invoice.status === "paid" ? "Lunas" : "Jatuh tempo"} {formatTanggalPendek(data.invoice.due_date)}
            </span>
          )}
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Calendar size={14} className="text-slate-400" />
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value || currentWibMonth())}
              className="bg-transparent text-xs font-semibold text-slate-700 outline-none"
            />
          </label>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
            title="Muat ulang"
          >
            {query.isFetching ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        </div>
      </motion.header>

      {/* ── tabel belum dibuat ───────────────────────────────────────────── */}
      {data && !data.tableReady && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-bold">Tabel tagihan J&T belum dibuat di database.</p>
              <p className="mt-1 text-xs leading-relaxed">
                Jalankan file <span className="font-mono font-bold">{JNT_INVOICE_SQL_FILE}</span> di Supabase SQL Editor
                (sandbox tidak punya jalur DDL). Setelah itu halaman ini langsung bisa dipakai — tabelnya menyimpan header
                tagihan dan rincian per resi.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {query.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {(query.error as Error)?.message || "Gagal memuat data tagihan J&T."}
        </div>
      )}

      {/* ── kartu ringkasan ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {summary && (
          <motion.div
            key={period}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  icon: Truck,
                  label: "Resi Bulan Ini",
                  value: summary.shipments.toLocaleString("id-ID"),
                  caption: `basis ${JNT_EXPENSE_BASIS_LABEL}`,
                  tone: "default" as const,
                },
                {
                  icon: Receipt,
                  label: "Biaya J&T Bruto",
                  value: formatRp(summary.gross),
                  caption: "sebelum diskon (Delivery Fee)",
                  tone: "muted" as const,
                },
                {
                  icon: Percent,
                  label: "Diskon J&T",
                  value: `− ${formatRp(summary.discount)}`,
                  caption: "pengurang biaya, bukan pendapatan",
                  tone: "positive" as const,
                },
                {
                  icon: Wallet,
                  label: "Biaya J&T Dibayar",
                  value: formatRp(summary.net),
                  caption: "net setelah diskon — angka yang dibukukan",
                  tone: "default" as const,
                },
              ].map((card, index) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ y: -2 }}
                >
                  <GlassCard {...card} />
                </motion.div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                {
                  icon: Coins,
                  label: "Ongkir dari Customer",
                  value: formatRp(summary.customerShipping),
                  caption: `${summary.matched} resi cocok ke pesanan · basis tanggal pesanan`,
                  tone: "default" as const,
                },
                {
                  icon: Truck,
                  label: "Margin Ongkir",
                  value: formatRp(summary.margin),
                  caption: "ongkir customer − net J&T (hanya resi yang cocok)",
                  tone: summary.margin < 0 ? ("negative" as const) : ("positive" as const),
                },
                {
                  icon: Coins,
                  label: "Omzet Produk",
                  value: formatRp(summary.orders.productRevenue),
                  caption: `terpisah dari margin ongkir · ${summary.orders.count} pesanan (tanpa ongkir)`,
                  tone: "muted" as const,
                },
              ].map((card, index) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
                  whileHover={{ y: -2 }}
                >
                  <GlassCard {...card} />
                </motion.div>
              ))}
            </div>

            {summary.unmatched > 0 && (
              <p className="flex items-start gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-xs text-slate-600">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-slate-400" />
                {summary.unmatched} resi belum ketemu di pesanan sistem (nomor resinya tidak ada di data pesanan), jadi
                margin ongkir baru dihitung dari {summary.matched} resi yang cocok. Sisanya tetap masuk ke total biaya.
              </p>
            )}

            {/* ── komposisi bruto → diskon → net ─────────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Komposisi Tagihan J&T</p>
                <p className="text-xs text-slate-500">
                  Bruto <span className="font-bold text-slate-700">{formatRp(bars.gross)}</span>
                </p>
              </div>
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${bars.netPct}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className="h-full bg-slate-900"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${bars.discountPct}%` }}
                  transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
                  className="h-full bg-emerald-400"
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-900" /> Dibayar ke J&T {formatRp(summary.net)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> Diskon (penghematan biaya) {formatRp(summary.discount)}
                </span>
                {!!data?.invoice?.ppn_total && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-slate-300" /> PPN {formatRp(data.invoice.ppn_total)} — baris
                    sendiri, belum digabung ke biaya ongkir
                  </span>
                )}
              </div>
              <p className="mt-3 border-t border-dashed border-slate-200 pt-3 text-[11px] text-slate-400">
                Diskon bukan pendapatan: efeknya sudah otomatis masuk ke margin karena biaya yang dibukukan memakai angka net.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {query.isLoading && (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Memuat tagihan {monthLabel}…
        </div>
      )}

      {/* ── input angka invoice + upload + tabel ────────────────────────── */}
      {data?.tableReady && (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <JntInvoiceForm
              period={period}
              monthLabel={monthLabel}
              invoice={data.invoice}
              onSaved={reload}
            />
            <JntUploadCard period={period} monthLabel={monthLabel} onDone={reload} />
          </div>
          <JntItemsTable items={data.items} />
        </>
      )}
    </div>
  );
}
