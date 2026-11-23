/**
 * Hitungan lead untuk Performa Admin (MURNI, diuji). Sumber: tabel `leads` (kolom tanggal, status, pic).
 *
 *  - Admin: lead yang PIC-nya dirinya sendiri ("Lea" cocok dengan akun "Lea Virani"), mulai `fromDay` (tanggal berlaku aturan).
 *  - Bot: lead ber-PIC "Agent" (dicatat bot WhatsApp), seluruh periode.
 *  - Tim admin: semua lead ber-PIC selain "Agent" dan bukan kosong, mulai `fromDay`.
 *  - Tanpa PIC: dihitung terpisah supaya terlihat berapa lead yang belum punya pemilik (tidak masuk siapa pun).
 * "Jadi closing" = lead berstatus closing.
 */

import { isOwnLead, type LeadActor } from "@/lib/lead-guard";

export interface LeadRow {
  tanggal: string;
  status: string | null;
  pic: string | null;
}

export interface LeadCount {
  total: number;
  closing: number;
}

const BOT_PIC = "agent";
const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();
const tally = (rows: LeadRow[]): LeadCount => ({ total: rows.length, closing: rows.filter((r) => r.status === "closing").length });
const since = (rows: LeadRow[], fromDay?: string) => (fromDay ? rows.filter((r) => String(r.tanggal) >= fromDay) : rows);

/** Lead milik satu admin, mulai `fromDay`. */
export function countMine(rows: LeadRow[], actor: LeadActor, fromDay?: string): LeadCount {
  return tally(since(rows, fromDay).filter((r) => isOwnLead(actor, r.pic)));
}

/** Lead yang dicatat bot (PIC "Agent"), seluruh periode. */
export function countBot(rows: LeadRow[]): LeadCount {
  return tally(rows.filter((r) => norm(r.pic) === BOT_PIC));
}

/** Semua lead ber-PIC admin (bukan "Agent", bukan kosong), mulai `fromDay`. */
export function countTeam(rows: LeadRow[], fromDay?: string): LeadCount {
  return tally(since(rows, fromDay).filter((r) => norm(r.pic) !== "" && norm(r.pic) !== BOT_PIC));
}

/** Lead tanpa PIC pada rentang. */
export function countUnassigned(rows: LeadRow[]): number {
  return rows.filter((r) => norm(r.pic) === "").length;
}
