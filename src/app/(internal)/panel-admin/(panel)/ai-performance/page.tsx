import "@/app/(internal)/ops/ops.css";
import "@/app/(internal)/panel-admin/panel-transaksi.css";
import AiPerformanceView from "@/components/ai-performance/AiPerformanceView";

export default function AiPerformancePage() {
  return (
    <div className="ops-root panel-ops panel-tx">
      <AiPerformanceView />
    </div>
  );
}
