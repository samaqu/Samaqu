/**
 * Menu Return panel admin.
 *
 * Memakai komponen yang sama dengan /ops/retur supaya logika & data tidak drift;
 * `variant="panel"` hanya mengganti aksen menjadi pink/rose khas panel admin.
 */
import "@/app/(internal)/ops/ops.css";
import ReturnsView from "@/components/ops/returns/ReturnsView";

export default function PanelReturnPage() {
  return (
    <div className="ops-root panel-ops">
      <ReturnsView variant="panel" />
    </div>
  );
}
