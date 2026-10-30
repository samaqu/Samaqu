import UlasanModerationPanel from "@/components/admin/UlasanModerationPanel";

export const metadata = {
  title: "SAMAQU · Ulasan Pelanggan",
};

/**
 * Moderasi ulasan pelanggan di panel admin.
 * Memakai komponen yang sama dengan dashboard /admin supaya aturan setujui/tolak
 * tidak pernah berbeda antar dashboard.
 */
export default function PanelUlasanPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-extrabold text-slate-900">Ulasan Pelanggan</h1>
        <p className="mt-1 text-sm text-slate-500">
          Setujui ulasan pembeli sebelum tampil di halaman Testimoni.
        </p>
      </div>
      <UlasanModerationPanel />
    </div>
  );
}
