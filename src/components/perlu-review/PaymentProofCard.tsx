"use client";

const sectionLabel = "text-[10px] font-bold uppercase tracking-[0.12em]";

export default function PaymentProofCard({
  proofUrl,
  onView,
}: {
  proofUrl: string | null;
  onView: () => void;
}) {
  return (
    <section className="flex min-h-[190px] flex-col rounded-2xl border bg-white p-4 shadow-[0_1px_3px_rgba(20,20,20,0.04)]" style={{ borderColor: "#E7E6E1" }}>
      <p className={sectionLabel} style={{ color: "#8A8880" }}>Bukti transfer</p>
      {proofUrl ? (
        <>
          <button type="button" onClick={onView} className="mt-3 block overflow-hidden rounded-xl border bg-[#FAFAF9]" style={{ borderColor: "#E7E6E1" }} aria-label="Lihat bukti transfer">
            <img src={proofUrl} alt="Bukti transfer" width={640} height={360} loading="lazy" className="h-32 w-full object-cover" />
          </button>
          <button type="button" onClick={onView} className="mt-3 w-fit text-[11px] font-bold underline underline-offset-2" style={{ color: "#1F7A4D" }}>
            Lihat bukti transfer
          </button>
        </>
      ) : (
        <div className="mt-3 flex min-h-[112px] flex-1 items-center justify-center rounded-xl border border-dashed px-4 text-center text-[11px] leading-relaxed" style={{ borderColor: "#E1DED7", color: "#8A8880" }}>
          Belum ada bukti transfer.
        </div>
      )}
    </section>
  );
}
