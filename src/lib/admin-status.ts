/**
 * Status kerja admin: tampilan bersama untuk header panel dan halaman Tim Admin.
 *
 * `status` = pilihan manual admin (tersimpan di database).
 * "Offline" bukan pilihan: admin yang berstatus Aktif tapi tab panelnya tidak terbuka (tidak terlihat di Presence)
 * ditampilkan sebagai Offline. Status Istirahat dan Pulang tidak berubah oleh Presence.
 */

export type WorkStatus = "aktif" | "istirahat" | "pulang";
export type ShownStatus = WorkStatus | "offline";

export const STATUS_OPTIONS: { value: WorkStatus; label: string; hint: string }[] = [
  { value: "aktif", label: "Aktif", hint: "Siap menerima chat" },
  { value: "istirahat", label: "Istirahat", hint: "Sementara tidak menerima chat baru" },
  { value: "pulang", label: "Pulang", hint: "Selesai bekerja" },
];

export const STATUS_STYLE: Record<ShownStatus, { label: string; dot: string; bg: string; fg: string }> = {
  aktif: { label: "Aktif", dot: "#16a34a", bg: "#dcfce7", fg: "#166534" },
  istirahat: { label: "Istirahat", dot: "#f59e0b", bg: "#fef3c7", fg: "#92400e" },
  pulang: { label: "Pulang", dot: "#94a3b8", bg: "#f1f5f9", fg: "#475569" },
  offline: { label: "Offline", dot: "#ef4444", bg: "#fee2e2", fg: "#991b1b" },
};

export const asWorkStatus = (v: unknown): WorkStatus => (v === "aktif" || v === "istirahat" ? v : "pulang");

/** Status yang ditampilkan: Aktif tapi tidak sedang membuka panel = Offline. */
export function shownStatus(status: WorkStatus, online: boolean): ShownStatus {
  return status === "aktif" && !online ? "offline" : status;
}

/** Penanda antar komponen di tab yang sama: header mengabarkan "status berubah" agar Tim Admin memuat ulang. */
export const STATUS_CHANGED_EVENT = "samaqu-admin-status-changed";
