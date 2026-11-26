import AiPerformanceView from "@/components/ai-performance/AiPerformanceView";

/**
 * AI Performance di Office (ops.samaqu.id / office.samaqu.id) — supaya bos bisa melihat performa AI.
 *
 * Memakai komponen yang SAMA dengan panel admin (`panel-admin/(panel)/ai-performance`), bukan disalin,
 * jadi angka dan tampilannya selalu identik. Data dari `/api/ops/ai-performance` (hanya membaca).
 */
export default function OpsAiPerformancePage() {
  return <AiPerformanceView />;
}
