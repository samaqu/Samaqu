/**
 * Status kerja admin: tampilan bersama untuk header panel dan halaman Tim Admin.
 *
 * `status` = pilihan manual admin (tersimpan di database).
 * "Offline" bukan pilihan: admin yang berstatus Aktif tapi tab panelnya tidak terbuka (tidak terlihat di Presence)
 * ditampilkan sebagai Offline. Status Istirahat dan Pulang tidak berubah oleh Presence.
 */

import { wibDay } from "@/lib/absensi";

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

/**
 * Pilihan di menu status, bahasanya mengikuti keadaan sekarang (seperti mesin absen):
 * dari Pulang → "Absen Masuk"; dari Istirahat → "Lanjut kerja"; dari Aktif → "Istirahat" atau "Absen Pulang".
 * Pilihan yang sama dengan status sekarang tidak ditampilkan.
 */
export function optionsFor(current: WorkStatus): { value: WorkStatus; label: string; hint: string }[] {
  const masuk = { value: "aktif" as const, label: current === "istirahat" ? "Lanjut kerja" : "Absen Masuk", hint: current === "istirahat" ? "Selesai istirahat" : "Mulai bekerja" };
  const istirahat = { value: "istirahat" as const, label: "Istirahat", hint: "Sementara tidak menerima chat baru" };
  const pulang = { value: "pulang" as const, label: "Absen Pulang", hint: "Selesai bekerja hari ini" };
  if (current === "pulang") return [masuk];
  if (current === "istirahat") return [masuk, pulang];
  return [istirahat, pulang];
}

/**
 * Belum absen masuk hari ini: status Pulang, dan Pulang itu BUKAN dipilih hari ini (WIB).
 * Admin yang sudah Absen Pulang sore ini tidak diminta masuk lagi; yang belum pernah absen hari ini diminta.
 */
export function needsCheckIn(status: WorkStatus, statusAt: string | null, nowMs: number = Date.now()): boolean {
  if (status !== "pulang") return false;
  const at = statusAt ? Date.parse(statusAt) : NaN;
  return !Number.isFinite(at) || wibDay(at) !== wibDay(nowMs);
}

export const asWorkStatus = (v: unknown): WorkStatus => (v === "aktif" || v === "istirahat" ? v : "pulang");

/** Status yang ditampilkan: Aktif tapi tidak sedang membuka panel = Offline. */
export function shownStatus(status: WorkStatus, online: boolean): ShownStatus {
  return status === "aktif" && !online ? "offline" : status;
}

/** Penanda antar komponen di tab yang sama: header mengabarkan "status berubah" agar Tim Admin memuat ulang. */
export const STATUS_CHANGED_EVENT = "samaqu-admin-status-changed";
/** Kebalikannya: komponen mana pun (mis. kartu Absensi Saya) MEMINTA header mengganti status; header yang mengerjakannya (satu jalur, termasuk konfirmasi Absen Pulang). detail = { status }. */
export const STATUS_REQUEST_EVENT = "samaqu-admin-status-request";
