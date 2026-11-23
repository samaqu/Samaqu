import "@/app/(internal)/ops/ops.css";
import PerformaView from "@/components/team/PerformaView";

export default function PerformaAdminPage() {
  return (
    <div className="ops-root panel-ops" style={{ display: "grid", gap: 14 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1f2937" }}>Performa Admin</h1>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6b7280" }}>
          Kecepatan Anda membalas chat WhatsApp dan pencapaian SLA. Hanya Anda yang melihat data ini.
        </p>
      </div>
      <PerformaView />
    </div>
  );
}
