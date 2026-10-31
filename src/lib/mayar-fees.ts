/**
 * Biaya transaksi Mayar per pesanan — untuk laporan ops.
 *
 * Sumber kebenaran: endpoint Mayar `GET /hl/v2/transactions`. Field `fee` di sana HANYA
 * terisi setelah transaksi berstatus `settled` (dana cair). Selama masih `paid`, `fee`
 * kosong — jadi biaya BELUM diketahui.
 *
 * Karena itu modul ini sengaja TIDAK menaksir biaya apa pun. Kalau Mayar belum memberi
 * angka, hasilnya `null`, dan laporan menampilkan "belum cair" — bukan angka karangan.
 *
 * Pencocokan ke pesanan memakai `orders.payment_ref` (id invoice Mayar) ↔
 * `transactions[].paymentLinkId` (id invoice yang sama di sisi transaksi).
 */

import { getMayarConfig, mayarReady } from "./mayar";

const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

export type MayarFeeEntry = {
  /** Total biaya yang dipotong Mayar (xendit_fee + mayar_fee + lainnya). */
  fee: number;
  /** Dana bersih yang masuk saldo = amount − fee. */
  net: number;
  /** Status transaksi di Mayar. */
  status: string;
  /** Metode yang benar-benar dipakai di Mayar (QRIS, Alfamart, Dana, …). */
  channel: string | null;
  paidAt: number | null;
};

function sumFee(fee: unknown): number {
  if (!Array.isArray(fee)) return 0;
  return fee.reduce((total, item) => {
    const debit = Number((item as { debit?: unknown })?.debit) || 0;
    return total + Math.max(0, debit);
  }, 0);
}

/**
 * Ambil seluruh transaksi Mayar lalu kembalikan peta `invoiceId → biaya`.
 *
 * Gagal / belum dikonfigurasi → peta kosong, laporan tetap jalan tanpa kolom biaya.
 * Hasilnya di-cache singkat karena laporan sering di-refresh dan Mayar membatasi laju.
 */
const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; map: Map<string, MayarFeeEntry> } | null = null;

export async function loadMayarFees(): Promise<Map<string, MayarFeeEntry>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;

  const config = await getMayarConfig();
  if (!mayarReady(config)) return new Map();

  const base = config.env === "sandbox" ? "https://api.mayar.io/hl/v2" : "https://api.mayar.id/hl/v2";
  const map = new Map<string, MayarFeeEntry>();
  let cursor: number | null = null;

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      // `startingAfter` memakai `createdAt` transaksi terakhir (epoch ms) — paginasi Mayar.
      if (cursor) params.set("startingAfter", String(cursor));
      const res = await fetch(`${base}/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.error("[LAPORAN] Mayar transactions gagal:", res.status);
        break;
      }
      const body = (await res.json().catch(() => null)) as
        | { data?: Array<Record<string, unknown>>; hasMore?: boolean; nextStartingAfter?: number }
        | null;

      const rows = body?.data ?? [];
      for (const row of rows) {
        const invoiceId = String(row.paymentLinkId ?? "").trim();
        if (!invoiceId) continue;
        const amount = Number(row.amount) || 0;
        const fee = sumFee(row.fee);
        const status = String(row.status ?? "");
        map.set(invoiceId, {
          // `fee` kosong = belum cair → biaya memang belum diketahui (bukan 0).
          fee: status === "settled" ? fee : Number.NaN,
          net: status === "settled" ? amount - fee : Number.NaN,
          status,
          channel: row.paymentMethod ? String(row.paymentMethod) : null,
          paidAt: null,
        });
      }

      if (!body?.hasMore || !body.nextStartingAfter) break;
      cursor = body.nextStartingAfter;
    }

    cache = { at: Date.now(), map };
    return map;
  } catch (error) {
    console.error("[LAPORAN] gagal memuat biaya Mayar:", error);
    return new Map();
  }
}
