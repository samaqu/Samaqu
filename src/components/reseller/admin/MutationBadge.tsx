import type { RsStatus } from "@/lib/reseller/format";

/** Badge status mutasi untuk sisi admin (warna mengikuti tone helper). */
const TONE: Record<RsStatus["tone"], string> = {
  ok: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  err: "bg-red-100 text-red-700",
  muted: "bg-slate-100 text-slate-500",
};

export default function MutationBadge({ status }: { status: RsStatus | null | undefined }) {
  if (!status) return null;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${TONE[status.tone]}`}>
      {status.label}
    </span>
  );
}
