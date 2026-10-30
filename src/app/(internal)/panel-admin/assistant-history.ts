"use client";

/**
 * Penyimpanan riwayat percakapan Asisten Operasional SAMAQU.
 *
 * Dipisah dari komponen `assistant/page.tsx` supaya logika penting — memfilter jawaban
 * terpotong, mengarsipkan percakapan lama, dan memisahkan data per akun — bisa diuji
 * langsung tanpa React/browser. Semua data hanya ada di localStorage browser admin
 * (tidak ada penyimpanan di server).
 */

export interface HistoryMsg {
  role: "user" | "assistant";
  content: string;
  /** Jawaban terpotong (Stop / batas waktu server) — TIDAK pernah dianggap jawaban lengkap. */
  incomplete?: boolean;
}

export interface StorageKeys {
  session: string;
  history: string;
  archive: string;
}

export interface ArchiveEntry {
  at: string;
  sessionId: string;
  messages: HistoryMsg[];
}

/** Batas riwayat percakapan aktif yang disimpan. */
export const HISTORY_MAX = 30;
/** Batas jumlah percakapan lama yang disimpan saat memulai percakapan baru. */
export const ARCHIVE_MAX = 5;
/** Kunci versi lama (sebelum riwayat dipisah per akun) — dibaca sekali untuk migrasi. */
export const LEGACY_SESSION_KEY = "samaqu_admin_ai_sid";
export const LEGACY_HISTORY_KEY = "samaqu_admin_ai_history";

/** Namespace akun dari email admin — hash pendek supaya email tidak ditulis apa adanya. */
export function accountNs(email: string | null): string {
  const src = (email || "anon").trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Riwayat & sesi disimpan per akun supaya admin berbeda tidak saling melihat percakapan. */
export function storageKeys(ns: string): StorageKeys {
  return {
    session: `samaqu_admin_ai_sid::${ns}`,
    history: `samaqu_admin_ai_history::${ns}`,
    archive: `samaqu_admin_ai_archive::${ns}`,
  };
}

/** Hanya jawaban lengkap yang disimpan/dimuat — jawaban terpotong dibuang, terbaru dipertahankan. */
export function completeMessages(messages: HistoryMsg[]): HistoryMsg[] {
  return messages.filter((m) => !m.incomplete).slice(-HISTORY_MAX);
}

/** Baca riwayat dari JSON mentah. JSON rusak / bentuk tak dikenal → daftar kosong. */
export function parseHistory(raw: string | null): HistoryMsg[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is HistoryMsg => {
        if (!m || typeof m !== "object") return false;
        const c = m as Partial<HistoryMsg>;
        return (
          typeof c.content === "string" &&
          (c.role === "user" || c.role === "assistant") &&
          c.incomplete !== true
        );
      })
      .slice(-HISTORY_MAX)
      .map((m) => ({ role: m.role, content: m.content }));
  } catch {
    return [];
  }
}

/** Tambahkan percakapan lama ke arsip, simpan hanya ARCHIVE_MAX percakapan terakhir. */
export function appendArchive(rawArchive: string | null, entry: ArchiveEntry): string {
  let list: ArchiveEntry[] = [];
  try {
    const parsed: unknown = rawArchive ? JSON.parse(rawArchive) : [];
    if (Array.isArray(parsed)) list = parsed as ArchiveEntry[];
  } catch {
    list = [];
  }
  list.push(entry);
  return JSON.stringify(list.slice(-ARCHIVE_MAX));
}

/**
 * Sapaan pembuka hanya ditambahkan saat percakapan benar-benar kosong. Percakapan yang sudah
 * ada (termasuk yang dipulihkan dari riwayat) dikembalikan apa adanya — jadi sapaan tidak
 * pernah berulang atau terduplikasi.
 */
export function seedIfEmpty(messages: HistoryMsg[], greeting: string): HistoryMsg[] {
  return messages.length ? messages : [{ role: "assistant", content: greeting }];
}

/** Apakah percakapan sudah punya pertanyaan dari admin (untuk arsip & tombol reset). */
export function hasUserTurn(messages: HistoryMsg[]): boolean {
  return messages.some((m) => m.role === "user");
}
