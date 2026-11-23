/**
 * Atribusi affiliate untuk pesanan yang DICATAT ADMIN (menu Transaksi), mis. order yang masuk lewat chat WhatsApp.
 *
 * Checkout website mengatribusikan lewat cookie link referral. Order lewat WA tidak punya cookie, jadi admin
 * memasukkan KODE AFFILIATE (kode utama `SAM-AF-xxxxx` atau kode link). Aturan komisinya SAMA dengan checkout:
 * kode harus milik affiliate yang berstatus aktif, komisi dicatat "menunggu" lewat `recordCommissionForOrder`
 * (persentase dari pengaturan saat pesanan dicatat), lalu disetujui setelah pesanan selesai dan masa validasi.
 *
 * Pembelian sendiri (nomor HP / email pembeli sama dengan affiliate) tidak dikomisi, KECUALI affiliate itu
 * dikecualikan lewat kolom `affiliates.allow_self_purchase` (hanya berlaku di jalur ini, bukan checkout website).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveReferralCode } from "./referral";
import { recordCommissionForOrder, syncCommissionStatus } from "./commission";

const phoneKey = (value: string | null | undefined) => String(value ?? "").replace(/\D/g, "").replace(/^62/, "0");
const emailKey = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

export interface PartyContact {
  phone?: string | null;
  email?: string | null;
}

/** Pembeli sama dengan affiliate? (nomor HP atau email yang sama; kosong tidak pernah cocok). */
export function isSelfPurchase(buyer: PartyContact, affiliate: PartyContact): boolean {
  const bp = phoneKey(buyer.phone);
  const ap = phoneKey(affiliate.phone);
  if (bp && ap && bp === ap) return true;
  const be = emailKey(buyer.email);
  const ae = emailKey(affiliate.email);
  return Boolean(be && ae && be === ae);
}

export type ManualAttribution =
  | { ok: true; affiliateId: string; linkId: string | null; code: string; name: string; selfAllowed: boolean }
  | { ok: false; error: string };

/** Cek kode affiliate dan kewajarannya untuk pembeli ini. Tidak menulis apa pun. */
export async function resolveManualAttribution(db: SupabaseClient, rawCode: string | null | undefined, buyer: PartyContact): Promise<ManualAttribution> {
  const code = String(rawCode ?? "").trim();
  if (!code) return { ok: false, error: "Kode affiliate kosong." };

  const referral = (await resolveReferralCode(db, code)) ?? (await resolveReferralCode(db, code.toUpperCase()));
  if (!referral) return { ok: false, error: "Kode affiliate tidak ditemukan atau affiliate-nya belum aktif." };

  const { data: affiliate } = await db
    .from("affiliates")
    .select("full_name, display_name, email, phone, allow_self_purchase")
    .eq("id", referral.affiliateId)
    .maybeSingle();
  if (!affiliate) return { ok: false, error: "Kode affiliate tidak ditemukan atau affiliate-nya belum aktif." };

  const selfAllowed = (affiliate as { allow_self_purchase?: boolean }).allow_self_purchase === true;
  if (!selfAllowed && isSelfPurchase(buyer, { phone: (affiliate as { phone?: string }).phone, email: (affiliate as { email?: string }).email })) {
    return { ok: false, error: "Nomor HP pembeli sama dengan milik affiliate ini. Pembelian sendiri tidak mendapat komisi, jadi kode tidak dipasang." };
  }

  const name = String((affiliate as { display_name?: string; full_name?: string }).display_name || (affiliate as { full_name?: string }).full_name || "").trim();
  return { ok: true, affiliateId: referral.affiliateId, linkId: referral.linkId, code: referral.code, name, selfAllowed };
}

/** Kolom atribusi yang ditulis ke baris `orders` saat pesanan dibuat. */
export function attributionColumns(attribution: Extract<ManualAttribution, { ok: true }>, nowIso: string) {
  return {
    affiliate_id: attribution.affiliateId,
    referral_code: attribution.code,
    referral_link_id: attribution.linkId,
    referral_attributed_at: nowIso,
  };
}

/**
 * Setelah pesanan (dan item-nya) tersimpan: catat komisi, selaraskan statusnya dengan status pesanan, dan tulis riwayat affiliate.
 * `writeOrderColumns` = true bila atribusi baru dipasang pada pesanan yang sudah ada (bukan dibawa saat insert).
 * Mengembalikan nominal komisi (null bila gagal dicatat).
 */
export async function recordManualAttribution(
  db: SupabaseClient,
  params: {
    orderId: string;
    orderNumber: string;
    attribution: Extract<ManualAttribution, { ok: true }>;
    items: { productId: string; price: number; quantity: number }[];
    actor: string;
    writeOrderColumns?: boolean;
  },
): Promise<number | null> {
  const { orderId, orderNumber, attribution, items, actor } = params;

  if (params.writeOrderColumns) {
    const { error } = await db.from("orders").update(attributionColumns(attribution, new Date().toISOString())).eq("id", orderId);
    if (error) throw new Error(`Gagal memasang atribusi di pesanan: ${error.message}`);
  }

  const commission = await recordCommissionForOrder(db, {
    orderId,
    orderNumber,
    affiliateId: attribution.affiliateId,
    linkId: attribution.linkId,
    items,
    actor,
  });
  if (commission) {
    await db.from("orders").update({ affiliate_commission_amount: commission.amount }).eq("id", orderId);
    // Komisi mengikuti status pesanan (belum lunas / dibatalkan tidak boleh langsung dihitung).
    await syncCommissionStatus(db, orderId, { actor });
  }

  await db.from("affiliate_activity_log").insert({
    affiliate_id: attribution.affiliateId,
    actor_type: "admin",
    actor_id: actor,
    action: "atribusi_manual",
    amount: commission?.amount ?? null,
    note: `Pesanan ${orderNumber} dikreditkan ke ${attribution.code} oleh ${actor} (dicatat lewat menu Transaksi).${attribution.selfAllowed ? " Affiliate dikecualikan dari aturan pembelian sendiri." : ""}${commission ? "" : " Komisi GAGAL dicatat, cek manual."}`,
  });

  return commission ? commission.amount : null;
}
