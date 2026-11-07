import "@/app/(internal)/ops/ops.css";
import "@/app/(internal)/panel-admin/panel-transaksi.css";
import PerluReviewView from "@/components/perlu-review/PerluReviewView";

export default function PerluReviewPage() {
  return (
    <div className="ops-root panel-ops panel-tx">
      <PerluReviewView />
    </div>
  );
}
