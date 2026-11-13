"use client";

import { Check } from "lucide-react";

const STEPS = ["Produk", "Penerima", "Kirim"];

/**
 * Indikator langkah 1-2-3 (desktop dan HP): lingkaran bernomor + garis penghubung, centang hijau kalau
 * langkahnya sudah lengkap, dan keterangan satu baris (mis. "1 item", nama penerima, "EZ · Rp15.000")
 * supaya pengguna langsung tahu mana yang sudah dan belum diisi. Semua langkah tetap bisa diketuk.
 */
export default function OrderStepper({
  step,
  onStep,
  done,
  hints,
}: {
  step: number;
  onStep: (step: number) => void;
  /** Apakah tiap langkah sudah lengkap (hanya tampilan; tidak mengunci langkah). */
  done: boolean[];
  /** Keterangan singkat di bawah nama langkah. */
  hints: string[];
}) {
  return (
    <nav className="order-stepper" aria-label="Langkah membuat pesanan">
      {STEPS.map((label, index) => {
        const active = step === index;
        const complete = Boolean(done[index]) && !active;
        const linked = index > 0 && Boolean(done[index - 1]);
        return (
          <button
            key={label}
            type="button"
            className={`step${active ? " on" : ""}${complete ? " done" : ""}${linked ? " link" : ""}`}
            onClick={() => onStep(index)}
            aria-current={active ? "step" : undefined}
          >
            <span className="num">{complete ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : index + 1}</span>
            <span className="lbl">{label}</span>
            <span className="sub">{hints[index]}</span>
          </button>
        );
      })}
    </nav>
  );
}
