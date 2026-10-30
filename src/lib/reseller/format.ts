/**
 * Format & label untuk portal reseller.
 * Rupiah dan tanggal memakai helper yang sudah ada (src/lib/akun-format.ts) —
 * tidak ada rumus kedua. Status dipetakan ke teks yang disepakati pemilik.
 */

import { rupiah, tglID, tglJamID } from "@/lib/akun-format";

export { rupiah, tglID, tglJamID };

export type RsTone = "ok" | "warn" | "err" | "muted";

export interface RsStatus {
  label: string;
  tone: RsTone;
}

/** Status pesanan reseller (pending = menunggu kekurangan/konfirmasi transfer). */
export function orderStatus(status: string): RsStatus {
  switch (status) {
    case "diproses":
      return { label: "Diproses", tone: "ok" };
    case "dikirim":
      return { label: "Dikirim", tone: "ok" };
    case "selesai":
      return { label: "Selesai", tone: "ok" };
    case "dibatalkan":
      return { label: "Dibatalkan", tone: "err" };
    default:
      return { label: "Menunggu konfirmasi", tone: "warn" };
  }
}

export function topupStatus(status: string): RsStatus {
  if (status === "approved") return { label: "Dikonfirmasi", tone: "ok" };
  if (status === "rejected") return { label: "Ditolak", tone: "err" };
  return { label: "Menunggu konfirmasi", tone: "warn" };
}

export function withdrawalStatus(status: string): RsStatus {
  if (status === "paid") return { label: "Ditransfer", tone: "ok" };
  if (status === "rejected") return { label: "Ditolak", tone: "err" };
  return { label: "Menunggu konfirmasi", tone: "warn" };
}

export function shortfallStatus(status: string): RsStatus {
  if (status === "approved") return { label: "Dikonfirmasi", tone: "ok" };
  if (status === "rejected") return { label: "Ditolak", tone: "err" };
  if (status === "pending") return { label: "Menunggu konfirmasi", tone: "warn" };
  return { label: "—", tone: "muted" };
}

/** Label jenis mutasi saldo (tabel reseller_ledger). */
export function ledgerTypeLabel(type: string): string {
  switch (type) {
    case "topup":
      return "Top up";
    case "order_debit":
      return "Pesanan";
    case "order_refund":
      return "Refund pesanan";
    case "withdrawal_hold":
      return "Tarik saldo";
    case "withdrawal_release":
      return "Penarikan ditolak";
    case "adjustment":
      return "Koreksi admin";
    default:
      return type;
  }
}

/** Tab riwayat saldo → daftar jenis yang ditampilkan. */
export const LEDGER_TABS: { key: string; label: string; jenis: string[] }[] = [
  { key: "semua", label: "Semua", jenis: [] },
  { key: "topup", label: "Top Up", jenis: ["topup"] },
  { key: "pesanan", label: "Pesanan", jenis: ["order_debit"] },
  { key: "refund", label: "Refund", jenis: ["order_refund"] },
  { key: "tarik", label: "Tarik", jenis: ["withdrawal_hold", "withdrawal_release"] },
  { key: "koreksi", label: "Koreksi", jenis: ["adjustment"] },
];

/** Nomor WA → tampilan "08xx…" untuk teks "Kode dikirim ke WhatsApp". */
export function waDisplay(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  return digits;
}

/** Detik → "0:59" untuk hitung mundur kirim ulang. */
export function countdownText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Nama bank + nomor rekening tersamar: "BSI ••••1234". */
export function maskAccount(bank: string | null | undefined, number: string | null | undefined): string {
  const digits = String(number || "").replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `${String(bank || "Rekening").trim()} ••••${last4 || "????"}`;
}
