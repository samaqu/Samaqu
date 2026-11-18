"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ShippingOption } from "@/lib/reseller/client";
import { rupiah } from "@/lib/reseller/format";
import { CUSTOM_COURIER_MAX_COST, CUSTOM_COURIER_NAME_MAX, CUSTOM_COURIER_SERVICE_MAX } from "@/lib/custom-courier";
import { AdminApiError, opsResellerApi, type ShippingFillOptions } from "./api";
import { Modal } from "./Modal";

/**
 * "Isi Ongkir" untuk pesanan reseller berstatus "Menunggu ongkir".
 *
 * Dua cara, sama-sama memotong saldo reseller (baris mutasi terpisah dari produk) dan memakai jalur
 * kekurangan yang sama kalau saldo kurang:
 *  - "Ekspedisi lain" (default, karena ongkir menyusul biasanya untuk paket yang tidak cocok dengan tarif J&T,
 *    mis. paket berat): admin mengisi nama ekspedisi + nominal. Nominal TIDAK diverifikasi ke tarif.
 *  - "J&T": opsi layanan dihitung server dari berat + tujuan yang tersimpan; server memverifikasi ulang tarifnya.
 * Ringkasan (ongkir, total baru, saldo, kekurangan) tampil SEBELUM konfirmasi.
 */

type Mode = "custom" | "jnt";

/** "558000" -> "558.000" (hanya angka; titik pemisah ribuan ditambahkan otomatis saat mengetik). */
function formatDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function digitsToNumber(formatted: string): number {
  const digits = formatted.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

const INPUT =
  "w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const LABEL = "text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5";

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
  const [mode, setMode] = useState<Mode>("custom");
  const [selected, setSelected] = useState<ShippingOption | null>(null);
  const [courierName, setCourierName] = useState("");
  const [courierService, setCourierService] = useState("");
  const [customCost, setCustomCost] = useState("");
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
  const customAmount = digitsToNumber(customCost);
  const customTooBig = customAmount > CUSTOM_COURIER_MAX_COST;
  const customReady = courierName.trim().length >= 2 && customAmount > 0 && !customTooBig;
  const cost = mode === "custom" ? customAmount : selected?.cost ?? 0;
  const ready = mode === "custom" ? customReady : Boolean(selected);
  const total = (info?.order.total ?? 0) + cost;
  const deducted = Math.min(Math.max(saldo, 0), cost);
  const shortfall = Math.max(0, cost - deducted);

  const submit = async () => {
    if (!ready || inflight.current) return;
    inflight.current = true;
    setSubmitting(true);
    setError("");
    try {
      if (mode === "custom") {
        await opsResellerApi.fillShipping(orderNumber, {
          method: "",
          cost: customAmount,
          custom: { name: courierName.trim(), service: courierService.trim() },
        });
      } else if (selected) {
        await opsResellerApi.fillShipping(orderNumber, { method: selected.service, cost: selected.cost });
      }
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
        <p className="text-sm text-slate-400 py-6 text-center">Memuat data pesanan…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-slate-600">
            Pesanan atas nama <b className="text-slate-900">{resellerName}</b>
            {info.weight ? ` · berat ±${(info.weight / 1000).toFixed(info.weight % 1000 === 0 ? 0 : 1)} kg` : ""}. Ongkir dipotong dari
            saldo reseller (tanpa diskon).
          </p>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100" role="tablist" aria-label="Jenis ekspedisi">
            {(
              [
                ["custom", "Ekspedisi lain"],
                ["jnt", "J&T (tarif otomatis)"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => {
                  setMode(key);
                  setError("");
                }}
                className={`px-3 py-2 rounded-lg text-[12.5px] font-bold transition-colors ${
                  mode === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "custom" ? (
            <div className="space-y-3">
              <div>
                <label className={LABEL} htmlFor="ongkir-kurir">
                  Nama ekspedisi <span className="text-red-500">*</span>
                </label>
                <input
                  id="ongkir-kurir"
                  className={INPUT}
                  value={courierName}
                  maxLength={CUSTOM_COURIER_NAME_MAX}
                  onChange={(e) => setCourierName(e.target.value)}
                  placeholder="Misal: Indah Cargo, Dakota, Lion Parcel"
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL} htmlFor="ongkir-layanan">
                    Layanan <span className="text-slate-400 normal-case font-semibold">(opsional)</span>
                  </label>
                  <input
                    id="ongkir-layanan"
                    className={INPUT}
                    value={courierService}
                    maxLength={CUSTOM_COURIER_SERVICE_MAX}
                    onChange={(e) => setCourierService(e.target.value)}
                    placeholder="Misal: Darat, Reguler"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={LABEL} htmlFor="ongkir-nominal">
                    Ongkir <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 pointer-events-none">Rp</span>
                    <input
                      id="ongkir-nominal"
                      className={`${INPUT} !pl-9 text-right`}
                      inputMode="numeric"
                      value={customCost}
                      onChange={(e) => setCustomCost(formatDigits(e.target.value))}
                      placeholder="0"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
              {customTooBig ? (
                <p className="text-[12px] text-red-600 font-semibold">
                  Ongkir terlalu besar (maksimal {rupiah(CUSTOM_COURIER_MAX_COST)}). Periksa angkanya.
                </p>
              ) : (
                <p className="text-[12px] text-slate-500">
                  Nominal diisi manual dan tidak dicocokkan dengan tarif, jadi pastikan sama dengan tagihan ekspedisi. Nomor resi
                  diinput manual di menu Transaksi (tanpa tracking otomatis).
                </p>
              )}
            </div>
          ) : options.length === 0 ? (
            <p className="text-sm text-red-600 font-semibold">
              {info.error || "Tidak ada layanan J&T untuk tujuan ini. Pakai tab “Ekspedisi lain”, atau periksa alamat pesanan."}
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

          {ready ? (
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
          ) : ready ? (
            <p className="text-[12.5px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Saldo cukup: pesanan langsung lanjut seperti pesanan biasa
              {mode === "custom" ? " (resi diinput manual)." : " (resi bisa dibuat)."}
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
              disabled={!ready || submitting}
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
