import "@/app/(internal)/ops/ops.css";
import WaInboxPanelView from "@/components/wa-inbox/WaInboxPanelView";

export default function InboxWaPage() {
  return (
    <div className="ops-root panel-ops">
      <WaInboxPanelView />
    </div>
  );
}
