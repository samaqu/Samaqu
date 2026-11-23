/**
 * Label PIC chat di Inbox WA (murni, diuji). Berdasarkan JAM SEKARANG:
 *  - Chat punya pemilik (PIC admin)  → "PIC: nama".
 *  - Tanpa pemilik, menunggu, JAM ADMIN (Sen-Sab 07.30-16.40) → "Antrean (menunggu admin)".
 *  - Tanpa pemilik, menunggu, di luar jam admin (sore sampai pagi, Minggu) → "PIC: Agent WhatsApp": malam hari PIC-nya
 *    bot, jadi tidak ada antrean admin.
 *  - Dijawab bot (tidak diambil alih admin, tidak menunggu, pesan terakhir dari kita) → "PIC: Agent WhatsApp".
 *  - Selain itu (mis. pesan pelanggan terakhir yang dilewati bot di jam kerja admin) → tidak ada label.
 * Hanya TAMPILAN: tidak ada pemilik palsu di database, jadi gembok PIC dan alur "membalas mengambil alih dari bot" tidak berubah.
 */

import { isAdminHours } from "@/lib/admin-hours";

export interface PicLabelInput {
  owner?: { name: string } | null;
  pending: number;
  handover: boolean;
  lastFrom?: "customer" | "kita";
}

/** Nama akun bot di tampilan (sama dengan nama akun bot di tabel admins). */
export const BOT_NAME = "Agent WhatsApp";

/** Chat ini termasuk ANTREAN admin sekarang? Hanya di jam admin: di luar jam itu yang bertanggung jawab adalah bot. */
export function isAdminQueue(c: Pick<PicLabelInput, "owner" | "pending">, nowMs: number = Date.now()): boolean {
  return !c.owner && c.pending > 0 && isAdminHours(nowMs);
}

export function picLabel(c: PicLabelInput, nowMs: number = Date.now()): { text: string; color: string } | null {
  if (c.owner) return { text: `PIC: ${c.owner.name}`, color: "#4338ca" };
  if (c.pending > 0) {
    return isAdminHours(nowMs)
      ? { text: "Antrean (menunggu admin)", color: "#b45309" }
      : { text: `PIC: ${BOT_NAME}`, color: "#0f766e" };
  }
  if (!c.handover && c.lastFrom === "kita") return { text: `PIC: ${BOT_NAME}`, color: "#0f766e" };
  return null;
}
