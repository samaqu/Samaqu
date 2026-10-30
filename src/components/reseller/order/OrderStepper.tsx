"use client";

const STEPS = ["Produk", "Penerima", "Kirim"];

/** Indikator langkah mobile: 1-2-3. */
export default function OrderStepper({
  step,
  onStep,
}: {
  step: number;
  onStep: (step: number) => void;
}) {
  return (
    <div className="order-stepper" aria-label="Langkah membuat pesanan">
      {STEPS.map((label, index) => {
        const active = step === index;
        const done = step > index;
        return (
          <button
            key={label}
            type="button"
            className={`step ${active ? "on" : ""} ${done ? "done" : ""}`}
            onClick={() => onStep(index)}
            aria-current={active ? "step" : undefined}
          >
            <span className="num">{done ? "✓" : index + 1}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
