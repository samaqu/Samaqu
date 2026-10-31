import { PROMO_QUOTA } from "@/lib/promo/free-cover-hanger";

/**
 * Bar sisa kuota bonus. Disembunyikan lewat flag `PROMO_FLAGS.showQuota`.
 *
 * Program ini mockup: TIDAK menampilkan angka dan TIDAK menyambung ke database.
 * Bentuknya sengaja dipertahankan supaya nanti tinggal diisi.
 */
export function QuotaBar({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: "#3D3D3D" }}>{PROMO_QUOTA.label}</span>
        <span className="fch-disp" style={{ fontSize: 24, fontWeight: 900, lineHeight: 1 }} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className="fch-fu2 fch-quota"
      style={{
        border: "1.5px solid #000000",
        borderRadius: 18,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: 520,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="fch-live" style={{ width: 8, height: 8, borderRadius: "50%", background: "#000000" }} />
          {PROMO_QUOTA.label}
        </span>
        <span aria-hidden="true" />
      </div>
      <div style={{ height: 12, background: "#EEEDE8", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: 0, background: "#000000", borderRadius: 999 }} />
      </div>
      <div style={{ fontSize: 14, color: "#3D3D3D" }}>{PROMO_QUOTA.note}</div>
    </div>
  );
}
