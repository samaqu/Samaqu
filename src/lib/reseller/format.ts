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
  return { label: "Menunggu", tone: "warn" };
}

export function withdrawalStatus(status: string): RsStatus {
  if (status === "paid") return { label: "Ditransfer", tone: "ok" };
  if (status === "rejected") return { label: "Ditolak", tone: "err" };
  return { label: "Menunggu", tone: "warn" };
}

export function shortfallStatus(status: string): RsStatus {
  if (status === "approved") return { label: "Dikonfirmasi", tone: "ok" };
  if (status === "rejected") return { label: "Ditolak", tone: "err" };
  if (status === "pending") return { label: "Menunggu", tone: "warn" };
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

/* ── Tampilan status mutasi (satu helper untuk semua riwayat) ── */

export interface MutationDisplay {
  title: string;
  description: string;
  /** Baris kecil tambahan (mis. rincian transfer). */
  extra?: string | null;
  /** null = tanpa badge. */
  badge?: RsStatus | null;
}

/** Data penarikan yang ditempelkan API ledger ke baris withdrawal_*. */
export interface LedgerWithdrawalInfo {
  status: "pending" | "paid" | "rejected";
  bank_name: string | null;
  bank_last4: string;
  transfer_amount: number;
  admin_fee: number;
  created_at: string;
  paid_at: string | null;
  reject_reason: string | null;
}

/** Data top up yang ditempelkan API ledger ke baris topup. */
export interface LedgerTopupInfo {
  status: string;
  reviewed_at: string | null;
}

export interface LedgerRowView {
  type: string;
  amount: number;
  balance_after?: number;
  note: string | null;
  reference: string | null;
  created_at: string;
  withdrawal?: LedgerWithdrawalInfo | null;
  topup?: LedgerTopupInfo | null;
}

/** Empat digit terakhir rekening. */
export function last4Account(number: string | null | undefined): string {
  const digits = String(number || "").replace(/\D/g, "");
  return digits.slice(-4) || "????";
}

/**
 * Label/badge satu baris mutasi saldo. Baris penarikan memakai STATUS TERKINI
 * dari data `reseller_withdrawals` (bukan sekadar catatan hold), tanpa
 * menambah mutasi baru.
 */
export function describeLedgerRow(row: LedgerRowView): MutationDisplay {
  const date = tglJamID(row.created_at);

  if (row.type === "withdrawal_hold") {
    const wd = row.withdrawal;
    if (wd?.status === "paid") {
      return {
        title: "Tarik saldo",
        description: `Ditransfer ke ${wd.bank_name || "Rekening"} ••••${wd.bank_last4} · ${tglJamID(wd.paid_at || row.created_at)}`,
        extra: `Diterima ${rupiah(wd.transfer_amount)} · biaya admin ${rupiah(wd.admin_fee)}`,
        badge: { label: "Ditransfer", tone: "ok" },
      };
    }
    if (wd?.status === "rejected") {
      return {
        title: "Tarik saldo",
        description: `Penarikan ditolak admin · ${tglJamID(wd.created_at || row.created_at)}`,
        badge: { label: "Ditolak", tone: "err" },
      };
    }
    return {
      title: "Tarik saldo",
      description: `Menunggu transfer admin · ${tglJamID(wd?.created_at || row.created_at)}`,
      badge: { label: "Menunggu", tone: "warn" },
    };
  }

  if (row.type === "withdrawal_release") {
    const reason = row.withdrawal?.reject_reason || row.note || "—";
    return {
      title: "Penarikan ditolak, saldo dikembalikan",
      description: `Alasan: ${reason} · ${date}`,
      badge: { label: "Dikembalikan", tone: "ok" },
    };
  }

  if (row.type === "topup") {
    return {
      title: "Top up",
      description: `${row.reference || ""} · Dikonfirmasi ${tglJamID(row.topup?.reviewed_at || row.created_at)}`,
      badge: topupStatus(row.topup?.status || "approved"),
    };
  }

  return {
    title: ledgerTypeLabel(row.type),
    description: `${row.note || row.reference || "—"} · ${date}`,
    badge: null,
  };
}

/** Baris riwayat top up (halaman Top Up). */
export function topupDisplay(row: {
  status: string;
  code: string;
  created_at: string;
  reject_reason?: string | null;
}): MutationDisplay {
  return {
    title: "Top up",
    description: `${row.code} · ${tglJamID(row.created_at)}`,
    extra: row.status === "rejected" && row.reject_reason ? `Alasan: ${row.reject_reason}` : null,
    badge: topupStatus(row.status),
  };
}

/** Baris riwayat penarikan (halaman Tarik Saldo + Dashboard). */
export function withdrawalDisplay(row: {
  status: string;
  amount: number;
  bank_name: string | null;
  bank_number: string | null;
  admin_fee: number;
  transfer_amount: number;
  created_at: string;
  paid_at?: string | null;
  reject_reason?: string | null;
}): MutationDisplay {
  if (row.status === "paid") {
    return {
      title: "Tarik saldo",
      description: `Ditransfer ke ${row.bank_name || "Rekening"} ••••${last4Account(row.bank_number)} · ${tglJamID(row.paid_at || row.created_at)}`,
      extra: `Diterima ${rupiah(row.transfer_amount)} · biaya admin ${rupiah(row.admin_fee)}`,
      badge: { label: "Ditransfer", tone: "ok" },
    };
  }
  if (row.status === "rejected") {
    return {
      title: "Tarik saldo",
      description: `Ditolak: ${row.reject_reason || "—"} · ${tglJamID(row.created_at)}`,
      badge: { label: "Ditolak", tone: "err" },
    };
  }
  return {
    title: "Tarik saldo",
    description: `Menunggu transfer admin · ${tglJamID(row.created_at)}`,
    badge: { label: "Menunggu", tone: "warn" },
  };
}
