/**
 * Jam kerja admin WhatsApp (MURNI, tanpa dependensi server, aman dipakai tampilan dan server).
 *
 * Senin–Sabtu 07.30–16.40 WIB = jam ADMIN (bot tidak membalas, pesannya dilewati pengaman wa-agent).
 * Selain itu (sore sampai pagi, dan Minggu penuh) = jam BOT: PIC chat adalah bot.
 * Jam ini SAMA dengan `isAdminHoursMessage` di repo Academy (`_shared/wa/schedule.mjs`); ubah keduanya bersama.
 */

export const ADMIN_START_MIN = 7 * 60 + 30;
export const ADMIN_HANDOFF_MIN = 16 * 60 + 40;
const WIB_MS = 7 * 3600_000;

/** Apakah waktu `ms` (epoch) jatuh di jam kerja admin (WIB, Senin-Sabtu 07.30-16.40)? */
export function isAdminHours(ms: number): boolean {
  const w = new Date(ms + WIB_MS);
  if (w.getUTCDay() === 0) return false; // Minggu: admin libur
  const minutes = w.getUTCHours() * 60 + w.getUTCMinutes();
  return minutes >= ADMIN_START_MIN && minutes < ADMIN_HANDOFF_MIN;
}
