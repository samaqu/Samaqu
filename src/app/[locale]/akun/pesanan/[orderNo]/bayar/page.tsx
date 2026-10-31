"use client";

/**
 * Halaman instruksi pembayaran pesanan customer.
 *
 * Tujuan: tombol "Bayar Sekarang" di daftar & detail pesanan punya tujuan yang jelas untuk
 * metode pembayaran MANUAL (transfer bank, QRIS, e-wallet). Untuk pembayaran online (Mayar)
 * tombolnya langsung ke tautan bayar, jadi halaman ini menampilkan tautan tersebut.
 *
 * Isi halaman:
 *  - nominal yang harus dibayar + nomor pesanan (untuk dicantumkan saat transfer)
 *  - rekening tujuan / gambar QRIS / info akun sesuai metode yang dipilih customer
 *  - tombol "Konfirmasi Pembayaran" → WhatsApp admin dengan pesan otomatis berisi
 *    nomor pesanan, nama, dan nominal.
 *
 * Data pesanan dibaca dari sumber yang sama dengan halaman lain (`getCustomerOrders`),
 * jadi tidak ada query baru dan tidak ada data yang disimpan ulang.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getCustomerOrders } from "@/lib/customer-auth";
import { useAkunCustomer } from "@/components/akun/AkunContext";
import { useSafeLocale } from "@/lib/safe-i18n";
import { useResolvedPaymentMethod } from "@/lib/use-payment-methods";
import { rupiah, tglID } from "@/lib/akun-format";
import { waLink } from "@/lib/whatsapp";
import { ADMIN_WA_NUMBER } from "@/lib/promo/free-cover-hanger";
import { isAwaitingPayment } from "@/components/akun/PayNowButton";

type CustomerOrder = Record<string, any>;

/** Baris data (label kiri, nilai kanan). */
function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-[12px] font-semibold text-slate-500">{label}</span>
      <span
        className={`text-right text-[13px] break-words ${strong ? "font-extrabold text-slate-900" : "font-semibold text-slate-800"}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function BayarPesananPage() {
  const params = useParams();
  const orderNo = decodeURIComponent(String(params.orderNo));
  const locale = useSafeLocale();
  const to = (href: string) => `/${locale}${href}`;

  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { customer, ready } = useAkunCustomer();

  useEffect(() => {
    if (!ready) return;
    if (!customer) {
      setLoading(false);
      return;
    }
    let alive = true;
    getCustomerOrders(customer.id)
      .then((orders) => {
        if (!alive) return;
        const found = (orders as CustomerOrder[]).find((row) => row.order_number === orderNo);
        if (!found) setNotFound(true);
        else setOrder(found);
      })
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [orderNo, customer, ready]);

  // Metode pembayaran pesanan (label, tipe, rekening/QRIS) — sumber yang sama dengan checkout.
  const { type, method } = useResolvedPaymentMethod(order?.payment_method ?? null);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      /* clipboard diblokir browser — abaikan, teks tetap terbaca di layar */
    }
  }

  if (loading) {
    return (
      <div className="-mx-4 -mt-4 min-h-screen bg-[#F7F5F0] px-4 py-6 md:mx-0 md:mt-0 md:px-0">
        <div className="mx-auto w-full max-w-[520px]">
          <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="-mx-4 -mt-4 min-h-screen bg-[#F7F5F0] px-4 py-6 md:mx-0 md:mt-0 md:px-0">
        <div className="mx-auto w-full max-w-[520px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-base font-extrabold text-slate-900">Pesanan tidak ditemukan</p>
            <p className="mt-1 text-sm text-slate-500">
              Pastikan akun yang dipakai sama dengan pesanan ini.
            </p>
            <Link
              href={to("/akun/pesanan")}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
            >
              Kembali ke Pesanan Saya
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const amount = Number(order.total) || 0;
  const awaiting = isAwaitingPayment(order);
  const isOnline = type === "mayar";
  const accountNumber = method?.account_number || "";
  const bankName = method?.bank_name || method?.label || "";

  // Pesan konfirmasi otomatis — nomor pesanan & nominal supaya admin tahu pesanan mana.
  const confirmMessage =
    `Halo SAMAQU, saya sudah melakukan pembayaran.\n` +
    `No. Pesanan: ${order.order_number}\n` +
    `Nama: ${order.customer_name || customer?.name || "-"}\n` +
    `Nominal: ${rupiah(amount)}`;
  const confirmHref = waLink(ADMIN_WA_NUMBER, confirmMessage);

  return (
    <div className="-mx-4 -mt-4 min-h-screen bg-[#F7F5F0] px-4 py-6 md:mx-0 md:mt-0 md:px-0">
      <div className="mx-auto w-full max-w-[520px]">
        <Link
          href={to(`/akun/pesanan/${orderNo}`)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B6257] hover:text-[#1F1B16]"
        >
          ← Detail Pesanan
        </Link>

        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Pembayaran
            </p>
            <h1 className="mt-0.5 text-lg font-extrabold text-slate-900">Selesaikan Pembayaran</h1>
            <p className="mt-0.5 font-mono text-xs font-semibold text-slate-500">{order.order_number}</p>
          </header>

          {/* Nominal — bagian paling penting, dibuat paling menonjol. */}
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Total yang harus dibayar
            </p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{rupiah(amount)}</p>
            <p className="mt-1 text-[12px] text-slate-500">Dibuat {tglID(order.created_at)}</p>
          </div>

          {!awaiting ? (
            <div className="px-5 py-4">
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-emerald-700">
                Pesanan ini sudah tidak menunggu pembayaran.
              </p>
            </div>
          ) : isOnline ? (
            /* Pembayaran online: tombol "Bayar Sekarang" di halaman lain mengarah langsung
               ke tautan ini. Kalau dibuka manual, beri jalan yang sama. */
            <div className="px-5 py-4">
              <Row label="Metode" value={method?.label || "Pembayaran Online"} />
              <Row
                label="Status"
                value={<span style={{ color: "#b45309" }}>Belum dibayar</span>}
              />
              <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
                Pembayaran online diproses di halaman pembayaran. Klik tombol di detail pesanan
                untuk melanjutkan.
              </p>
            </div>
          ) : (
            <div className="px-5 py-4">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Tujuan Pembayaran
              </p>
              <div className="rounded-2xl border border-slate-200 px-4">
                <Row label="Metode" value={method?.label || "Transfer"} />
                {bankName ? <Row label="Bank" value={bankName} /> : null}
                {method?.account_name ? <Row label="Atas nama" value={method.account_name} /> : null}
                {accountNumber ? (
                  <Row
                    label="Nomor rekening"
                    value={
                      <span className="inline-flex items-center gap-2">
                        <b className="font-mono tabular-nums">{accountNumber}</b>
                        <button
                          type="button"
                          onClick={() => copy(accountNumber, "acc")}
                          className="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          {copied === "acc" ? "Tersalin" : "Salin"}
                        </button>
                      </span>
                    }
                  />
                ) : null}
                {method?.account_info ? <Row label="Info" value={method.account_info} /> : null}
                <Row
                  label="Nominal"
                  strong
                  value={
                    <span className="inline-flex items-center gap-2">
                      <b className="tabular-nums">{rupiah(amount)}</b>
                      <button
                        type="button"
                        onClick={() => copy(String(amount), "amt")}
                        className="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        {copied === "amt" ? "Tersalin" : "Salin"}
                      </button>
                    </span>
                  }
                />
              </div>

              {method?.qr_image_url ? (
                <div className="mt-3 rounded-2xl border border-slate-200 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Atau scan QRIS
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={method.qr_image_url}
                    alt="QRIS pembayaran"
                    className="mx-auto w-[220px] rounded-lg"
                  />
                </div>
              ) : null}

              <div className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-800">
                Cantumkan <b>{order.order_number}</b> pada berita transfer supaya pembayaranmu mudah
                dicocokkan.
              </div>

              {method?.instructions ? (
                <p className="mt-3 whitespace-pre-line text-[12px] leading-relaxed text-slate-600">
                  {method.instructions}
                </p>
              ) : null}
            </div>
          )}

          <footer className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4">
            {awaiting && !isOnline ? (
              <a
                href={confirmHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
              >
                Konfirmasi Pembayaran via WhatsApp
              </a>
            ) : null}
            <Link
              href={to(`/akun/pesanan/${orderNo}`)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Kembali ke Detail Pesanan
            </Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
