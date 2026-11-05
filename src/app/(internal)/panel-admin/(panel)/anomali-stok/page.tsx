/**
 * Anomali Stok di panel Admin Operasional — memakai komponen yang sama dengan dashboard ops,
 * jadi tampilan dan aturannya satu sumber.
 */
import "@/app/(internal)/ops/ops.css";
import StockAnomalyList from "@/components/ops/StockAnomalyList";

export default function PanelStockAnomalyPage() {
  return (
    <div className="ops-root panel-ops">
      <StockAnomalyList />
    </div>
  );
}
