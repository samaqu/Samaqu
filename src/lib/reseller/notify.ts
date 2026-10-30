/**
 * Notifikasi WhatsApp ke RESELLER — template di file ini (bukan panel
 * Pengaturan), satu kejadian = satu pesan.
 *
 * Klaim "kirim sekali" memakai tabel `reseller_notifications` (UNIQUE
 * type+reference): INSERT ... ON CONFLICT DO NOTHING, yang berhasil
 * insert dialah yang boleh mengirim. Klaim tidak dilepas kalau kirim
 * gagal, supaya pesan tidak pernah dobel.
 *
 * Pesanan reseller = dropship: notifikasi otomatis pesanan (dibuat, lunas,
 * dikirim, diterima, dibatalkan) dikirim ke RESELLER, bukan customer akhir.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getFonnteConfigs, normalizeWhatsappTarget, sendFonnteMessage } from "@/lib/fonnte";
import { SITE_URL } from "@/lib/site-config";
import { greetingName } from "@/lib/greeting";
import { maskAccount } from "./format";

export type ResellerNotifyType =
  | "account_created"
  | "order_created"
  | "order_paid"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled"
  | "topup_approved"
  | "topup_rejected"
  | "withdrawal_paid"
  | "withdrawal_rejected"
  | "shortfall_approved"
  | "shortfall_rejected";

function rupiah(value: number): string {
  return `Rp ${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;
}

/**
 * Klaim satu peristiwa notifikasi reseller (atomik di database).
 * Mengembalikan true HANYA untuk pemanggil yang menang klaim.
 */
export async function claimResellerNotification(
  type: ResellerNotifyType,
  reference: string
): Promise<boolean> {
  if (!type || !reference) return false;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("reseller_notifications")
      .insert({ type, reference })
      .select("id");
    if (error) {
      // 23505 = sudah ada (konflik unik) → bukan error, hanya kalah klaim.
      if ((error as { code?: string }).code !== "23505") {
        console.error("[RESELLER-NOTIFY] Klaim gagal:", type, error.message);
      }
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (e) {
    console.error("[RESELLER-NOTIFY] Klaim error:", type, e);
    return false;
  }
}

/**
 * Klaim lalu kirim. Nama pemilik & nomor WA dibaca dari tabel resellers
 * saat itu juga, jadi pemanggil cukup punya reseller id / nomor pesanan.
 */
async function notifyOnce(
  type: ResellerNotifyType,
  reference: string,
  resellerId: string,
  build: (ownerName: string) => string
): Promise<boolean> {
  if (!(await claimResellerNotification(type, reference))) return false;

  let sent = false;
  try {
    const { data: reseller } = await getSupabaseAdmin()
      .from("resellers")
      .select("owner_name, whatsapp")
      .eq("id", resellerId)
      .maybeSingle();
    if (!reseller) return false;

    const { customer } = await getFonnteConfigs();
    if (!customer.enabled || !customer.token) return false;

    const target = normalizeWhatsappTarget(String(reseller.whatsapp ?? ""));
    if (!target) return false;

    sent = await sendFonnteMessage(
      customer.token,
      target,
      build(String(reseller.owner_name ?? ""))
    );
  } catch (e) {
    console.error(`[RESELLER-NOTIFY] ${type} error saat mengirim:`, reference, e);
  }

  if (sent) console.log(`[RESELLER-NOTIFY] ${type} terkirim:`, reference);
  else console.error(`[RESELLER-NOTIFY] ${type} GAGAL terkirim:`, reference);
  return sent;
}

/* ── Link portal (satu helper, selalu domain website) ── */

type PortalPage = "login" | "top-up" | "tarik-saldo" | "pesanan";

/**
 * URL halaman portal reseller di domain website (SITE_URL = www.samaqu.id),
 * BUKAN domain office. `orderNumber` hanya dipakai untuk halaman "pesanan".
 */
function portalUrl(page: PortalPage, orderNumber?: string): string {
  if (page === "pesanan") {
    return `${SITE_URL}/reseller/pesanan/${encodeURIComponent(String(orderNumber || "").trim())}`;
  }
  return `${SITE_URL}/reseller/${page}`;
}

/** Blok tautan polos di baris sendiri (WhatsApp otomatis menjadikannya bisa diklik). */
function linkBlock(intro: string, url: string): string[] {
  return ["", intro, url];
}

/* ── Penyusun pesan ── */

function buildAccountCreated(ownerName: string): string {
  const ka = greetingName(ownerName);
  return [
    `Halo ${ka},`,
    "",
    "Akun reseller SAMAQU kamu sudah aktif.",
    ...linkBlock("Masuk ke portal reseller di sini:", portalUrl("login")),
    "",
    "Kode OTP akan dikirim ke nomor WhatsApp ini setiap kali masuk.",
    "",
    "Terima kasih sudah menjadi bagian dari SAMAQU.",
  ].join("\n");
}

function buildOrderCreated(ownerName: string, shortfall: number, total: number, orderNumber: string): string {
  const ka = greetingName(ownerName);
  const lines = [
    `Halo ${ka},`,
    "",
    `Pesanan reseller ${orderNumber} sudah kami terima.`,
    "",
    `Total (harga beli + ongkir): ${rupiah(total)}`,
  ];
  if (shortfall > 0) {
    lines.push(
      "",
      `Saldo kamu kurang ${rupiah(shortfall)}. Silakan transfer kekurangannya ke rekening BSI SAMAQU lalu upload bukti di portal reseller.`,
      "",
      "Pesanan diproses setelah admin mengonfirmasi pembayaran kekurangan."
    );
  } else {
    lines.push("", "Pembayaran sudah dipotong dari saldo dan pesanan langsung diproses.");
  }
  lines.push(...linkBlock("Buka pesanan ini di portal reseller:", portalUrl("pesanan", orderNumber)));
  return lines.join("\n");
}

function buildOrderPaid(ownerName: string, orderNumber: string): string {
  const ka = greetingName(ownerName);
  return [
    `Halo ${ka},`,
    "",
    `Pembayaran kekurangan pesanan ${orderNumber} sudah dikonfirmasi. Pesanan kami proses.`,
    "",
    "Kami akan kirim nomor resi setelah pesanan dikirim.",
    ...linkBlock("Lihat pesanan di portal reseller:", portalUrl("pesanan", orderNumber)),
  ].join("\n");
}

function buildOrderShipped(ownerName: string, orderNumber: string, awbNo: string): string {
  const ka = greetingName(ownerName);
  return [
    `Halo ${ka},`,
    "",
    `Pesanan ${orderNumber} sudah dikirim, resi ${awbNo}.`,
    "",
    "Terima kasih telah berbelanja di SAMAQU.",
    ...linkBlock("Lacak pesanan di portal reseller:", portalUrl("pesanan", orderNumber)),
  ].join("\n");
}

function buildOrderDelivered(ownerName: string, orderNumber: string): string {
  const ka = greetingName(ownerName);
  return [
    `Halo ${ka},`,
    "",
    `Pesanan ${orderNumber} sudah diterima penerima.`,
    "",
    "Terima kasih telah berbelanja di SAMAQU.",
    ...linkBlock("Lihat pesanan di portal reseller:", portalUrl("pesanan", orderNumber)),
  ].join("\n");
}

function buildOrderCancelled(ownerName: string, orderNumber: string, reason: string): string {
  const ka = greetingName(ownerName);
  return [
    `Halo ${ka},`,
    "",
    `Pesanan ${orderNumber} dibatalkan: ${reason}.`,
    "",
    "Saldo yang terpotong sudah dikembalikan otomatis.",
    ...linkBlock("Lihat pesanan di portal reseller:", portalUrl("pesanan", orderNumber)),
  ].join("\n");
}

function buildTopupApproved(ownerName: string, amount: number, balanceAfter: number): string {
  const ka = greetingName(ownerName);
  return [
    `Halo ${ka},`,
    "",
    `Top up ${rupiah(amount)} sudah dikonfirmasi.`,
    `Saldo kamu sekarang ${rupiah(balanceAfter)}.`,
    ...linkBlock("Buka halaman Top Up di portal reseller:", portalUrl("top-up")),
    "",
    "Terima kasih,",
    "SAMAQU",
  ].join("\n");
}

function buildTopupRejected(ownerName: string, amount: number, reason: string): string {
  const ka = greetingName(ownerName);
  return [
    `Halo ${ka},`,
    "",
    `Top up ${rupiah(amount)} ditolak: ${reason}.`,
    "",
    "Silakan hubungi admin SAMAQU kalau ada pertanyaan.",
    ...linkBlock("Buka halaman Top Up di portal reseller:", portalUrl("top-up")),
  ].join("\n");
}

function buildWithdrawalPaid(
  ownerName: string,
  amount: number,
  transferAmount: number,
  bank: string,
  bankNumber: string
): string {
  const ka = greetingName(ownerName);
  return [
    `Halo ${ka},`,
    "",
    `Penarikan ${rupiah(amount)} sudah ditransfer ke ${maskAccount(bank, bankNumber)}.`,
    `Jumlah diterima: ${rupiah(transferAmount)}.`,
    ...linkBlock("Buka halaman Tarik Saldo di portal reseller:", portalUrl("tarik-saldo")),
    "",
    "Terima kasih,",
    "SAMAQU",
  ].join("\n");
}

function buildWithdrawalRejected(ownerName: string, amount: number, reason: string): string {
  const ka = greetingName(ownerName);
  return [
    `Halo ${ka},`,
    "",
    `Penarikan ${rupiah(amount)} ditolak: ${reason}.`,
    "",
    "Saldo yang ditahan sudah dikembalikan ke saldo kamu.",
    ...linkBlock("Buka halaman Tarik Saldo di portal reseller:", portalUrl("tarik-saldo")),
  ].join("\n");
}

function buildShortfallRejected(ownerName: string, orderNumber: string, reason: string): string {
  const ka = greetingName(ownerName);
  return [
    `Halo ${ka},`,
    "",
    `Bukti pembayaran kekurangan pesanan ${orderNumber} ditolak: ${reason}.`,
    "",
    "Pesanan dibatalkan dan saldo yang terpotong sudah dikembalikan otomatis.",
    ...linkBlock("Lihat pesanan di portal reseller:", portalUrl("pesanan", orderNumber)),
  ].join("\n");
}

/* ── Pemanggil publik ── */

export async function notifyResellerAccountCreated(resellerId: string): Promise<boolean> {
  return notifyOnce("account_created", resellerId, resellerId, buildAccountCreated);
}

export async function notifyResellerOrderCreated(
  resellerId: string,
  orderNumber: string,
  shortfall: number,
  total: number
): Promise<boolean> {
  return notifyOnce("order_created", orderNumber, resellerId, (name) =>
    buildOrderCreated(name, shortfall, total, orderNumber)
  );
}

/** Kekurangan pesanan dikonfirmasi admin (padanan "lunas" untuk reseller). */
export async function notifyResellerOrderPaid(
  resellerId: string,
  orderNumber: string
): Promise<boolean> {
  return notifyOnce("order_paid", orderNumber, resellerId, (name) =>
    buildOrderPaid(name, orderNumber)
  );
}

export async function notifyResellerOrderShipped(
  resellerId: string,
  orderNumber: string,
  awbNo: string
): Promise<boolean> {
  return notifyOnce("order_shipped", orderNumber, resellerId, (name) =>
    buildOrderShipped(name, orderNumber, awbNo)
  );
}

export async function notifyResellerOrderDelivered(
  resellerId: string,
  orderNumber: string
): Promise<boolean> {
  return notifyOnce("order_delivered", orderNumber, resellerId, (name) =>
    buildOrderDelivered(name, orderNumber)
  );
}

export async function notifyResellerOrderCancelled(
  resellerId: string,
  orderNumber: string,
  reason: string
): Promise<boolean> {
  return notifyOnce("order_cancelled", orderNumber, resellerId, (name) =>
    buildOrderCancelled(name, orderNumber, reason)
  );
}

export async function notifyResellerTopupApproved(
  resellerId: string,
  topupId: string,
  amount: number,
  balanceAfter: number
): Promise<boolean> {
  return notifyOnce("topup_approved", topupId, resellerId, (name) =>
    buildTopupApproved(name, amount, balanceAfter)
  );
}

export async function notifyResellerTopupRejected(
  resellerId: string,
  topupId: string,
  amount: number,
  reason: string
): Promise<boolean> {
  return notifyOnce("topup_rejected", topupId, resellerId, (name) =>
    buildTopupRejected(name, amount, reason)
  );
}

export async function notifyResellerWithdrawalPaid(
  resellerId: string,
  withdrawalId: string,
  amount: number,
  transferAmount: number,
  bank: string,
  bankNumber: string
): Promise<boolean> {
  return notifyOnce("withdrawal_paid", withdrawalId, resellerId, (name) =>
    buildWithdrawalPaid(name, amount, transferAmount, bank, bankNumber)
  );
}

export async function notifyResellerWithdrawalRejected(
  resellerId: string,
  withdrawalId: string,
  amount: number,
  reason: string
): Promise<boolean> {
  return notifyOnce("withdrawal_rejected", withdrawalId, resellerId, (name) =>
    buildWithdrawalRejected(name, amount, reason)
  );
}

export async function notifyResellerShortfallRejected(
  resellerId: string,
  orderNumber: string,
  reason: string
): Promise<boolean> {
  return notifyOnce("shortfall_rejected", orderNumber, resellerId, (name) =>
    buildShortfallRejected(name, orderNumber, reason)
  );
}
