import "@/app/(internal)/ops/ops.css";
import AbsensiView from "@/components/team/AbsensiView";

export default function AbsensiPage() {
  return (
    <div className="ops-root panel-ops" style={{ display: "grid", gap: 14 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1f2937" }}>Absensi</h1>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6b7280" }}>
          Catat jam masuk, istirahat, dan pulang Anda. Rekap bulanan dan riwayat harian ada di bawahnya.
        </p>
      </div>
      <AbsensiView />
    </div>
  );
}
