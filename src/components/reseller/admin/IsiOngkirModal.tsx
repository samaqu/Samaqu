"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ShippingOption } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import { AdminApiError, opsResellerApi, type ShippingFillOptions } from "./api";
import { Modal } from "./Modal";

/**
 * "Isi Ongkir" untuk pesanan reseller berstatus "Menunggu ongkir".
 *
 * Opsi layanan J&T dihitung server dari berat + tujuan yang tersimpan di pesanan. Ringkasan (ongkir, total
 * baru, saldo, kekurangan) tampil SEBELUM konfirmasi. Saat dikonfirmasi, server memverifikasi ulang tarif,
 * memotong saldo (baris mutasi terpisah dari produk), dan bila saldo kurang memakai jalur bayar kekurangan.
 */
export default function IsiOngkirModal({
  orderNumber,
  resellerName,
  onClose,
  onDone,
}: {
  orderNumber: string;
  resellerName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [info, setInfo] = useState<ShippingFillOptions | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<ShippingOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inflight = useRef(false);

  useEffect(() => {
    let alive = true;
    opsResellerApi
      .shippingOptions(orderNumber)
      .then((res) => {
        if (!alive) return;
        setInfo(res);
        const list = res.data || [];
        // EZ dipilih otomatis kalau tersedia (sama seperti form pesanan); selain itu opsi termurah.
        setSelected(list.find((option) => option.serviceCode === "EZ") || list[0] || null);
      })
      .catch((e) => alive && setLoadError(e instanceof AdminApiError ? e.message : "Gagal memuat opsi ongkir."));
    return () => {
      alive = false;
    };
  }, [orderNumber]);

  const options = info?.data || [];
  const saldo = info?.saldo.saldo_tersedia ?? 0;
  const cost = selected?.cost ?? 0;
  const total = (info?.order.total ?? 0) + cost;
  const deducted = Math.min(Math.max(saldo, 0), cost);
  const shortfall = Math.max(0, cost - deducted);

  const submit = async () => {
    if (!selected || inflight.current) return;
    inflight.current = true;
    setSubmitting(true);
    setError("");
    try {
      await opsResellerApi.fillShipping(orderNumber, { method: selected.service, cost: selected.cost });
      onDone();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menyimpan ongkir. Coba lagi.");
    } finally {
      inflight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Isi ongkir ${orderNumber}`} onClose={() => (submitting ? undefined : onClose())} width={480}>
      {loadError ? (
        <p className="text-sm text-red-600 font-semibold">{loadError}</p>
      ) : !info ? (
        <p className="text-sm text-slate-400 py-6 text-center">Memuat opsi ongkir…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-slate-600">
            Pesanan atas nama <b className="text-slate-900">{resellerName}</b>
            {info.weight ? ` · berat ±${(info.weight / 1000).toFixed(info.weight % 1000 === 0 ? 0 : 1)} kg` : ""}. Ongkir dipotong dari
            saldo reseller (tanpa diskon).
          </p>

          {options.length === 0 ? (
            <p className="text-sm text-red-600 font-semibold">
              {info.error || "Tidak ada layanan J&T untuk tujuan ini. Periksa alamat pesanan."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Layanan pengiriman">
              {options.map((option) => {
                const active = selected?.serviceCode === option.serviceCode;
                return (
                  <button
                    key={option.serviceCode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelected(option)}
                    className={`flex items-center justify-between gap-3 text-left rounded-xl border-2 px-3.5 py-3 transition-colors ${
                      active ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span>
                      <span className="block text-[13px] font-extrabold text-slate-900">{option.service}</span>
                      <span className="block text-[11.5px] text-slate-500">{option.etd ? `Estimasi ${option.etd}` : "J&T"}</span>
                    </span>
                    <span className="text-[14px] font-extrabold text-slate-900">{rupiah(option.cost)}</span>
                  </button>
                );
              })}
            </div>
          )}

          {selected ? (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-[13px]">
              <Line label="Total sekarang (produk)" value={rupiah(info.order.total)} />
              <Line label="Ongkir" value={rupiah(cost)} />
              <Line label="Total baru" value={rupiah(total)} strong />
              <Line label="Saldo reseller" value={rupiah(saldo)} />
              <Line label="Dipotong dari saldo" value={rupiah(deducted)} />
              {shortfall > 0 ? <Line label="Kekurangan" value={rupiah(shortfall)} warn /> : null}
            </div>
          ) : null}

          {shortfall > 0 ? (
            <p className="text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Saldo kurang {rupiah(shortfall)}: pesanan kembali ke <b>Belum Bayar</b> dan menunggu pembayaran kekurangan oleh reseller
              (batas 24 jam sejak sekarang, lalu batal otomatis dan saldo kembali).
            </p>
          ) : selected ? (
            <p className="text-[12.5px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Saldo cukup: pesanan langsung lanjut seperti pesanan biasa (resi bisa dibuat).
            </p>
          ) : null}

          {error ? <p className="text-sm text-red-600 font-semibold">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!selected || submitting}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {submitting ? <Loader2 size={15} /> : null}
              {submitting ? "Menyimpan…" : "Isi ongkir & potong saldo"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Line({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-bold ${warn ? "text-amber-700" : strong ? "text-slate-900" : "text-slate-700"}`}>{value}</span>
    </div>
  );
}
