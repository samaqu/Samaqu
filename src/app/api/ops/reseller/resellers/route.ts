import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { normalizeWhatsappTarget } from "@/lib/fonnte";
import { notifyResellerAccountCreated } from "@/lib/reseller/notify";
import { normalizeBankValue } from "@/lib/reseller/banks";
import { getResellerBalance } from "@/lib/reseller/saldo";
import { parseResellerDiscount } from "@/lib/reseller/pricing";
import { getResellerLevels, getResellerSettings } from "@/lib/reseller/settings";
import { levelsForResellers } from "@/lib/reseller/level-server";

/**
 * Daftar reseller + saldo masing-masing (admin ops & panel admin).
 * Pendaftaran TIDAK publik — reseller hanya dibuat dari endpoint ini.
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const { data, error } = await getSupabaseAdmin()
    .from("resellers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[OPS-RESELLER] Gagal membaca daftar:", error.message);
    return NextResponse.json({ error: "Gagal memuat daftar reseller" }, { status: 500 });
  }

  // Level (Silver/Gold/Platinum) per reseller — aturan sama dengan portal reseller.
  const levelTiers = await getResellerLevels();
  const levels = await levelsForResellers(
    (data ?? []).map((row) => ({
      id: String(row.id),
      created_at: (row.created_at as string | null) ?? null,
      level_override: (row as { level_override?: string | null }).level_override ?? null,
    })),
    levelTiers
  );

  const rows = await Promise.all(
    (data ?? []).map(async (row) => ({
      ...row,
      level: levels.get(String(row.id)) ?? null,
      saldo: (await getResellerBalance(String(row.id))) ?? {
        saldo_tersedia: 0,
        saldo_ditahan: 0,
        saldo_total: 0,
      },
    }))
  );

  // Diskon default ikut dikirim supaya tabel bisa menulis "25% (default)" untuk reseller tanpa diskon khusus.
  const settings = await getResellerSettings();
  return NextResponse.json({ data: rows, default_discount_percent: settings.defaultDiscountPercent, levels: levelTiers });
}

/** Tambah reseller baru (langsung active) + kirim notifikasi WA akun dibuat. */
export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const identity = await opsIdentity(req);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const storeName = String(body.store_name ?? "").trim();
  const ownerName = String(body.owner_name ?? "").trim();
  const whatsapp = normalizeWhatsappTarget(String(body.whatsapp ?? ""));
  const city = String(body.city ?? "").trim();
  const storeInfo = String(body.store_info ?? "").trim();
  const socialMedia = String(body.social_media ?? "").trim();
  const bankName = normalizeBankValue(String(body.bank_name ?? ""));
  const bankNumber = String(body.bank_number ?? "").trim();
  const bankHolder = String(body.bank_holder ?? "").trim();
  const discount = parseResellerDiscount(body.discount_percent);
  if (!discount.ok) {
    return NextResponse.json({ error: "Diskon reseller harus angka 0 sampai 100 (kosongkan untuk ikut default)." }, { status: 400 });
  }

  if (!storeName || !ownerName || whatsapp.replace(/\D/g, "").length < 9) {
    return NextResponse.json(
      { error: "Nama toko, nama pemilik, dan nomor WhatsApp wajib diisi." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("resellers")
    .select("id")
    .eq("whatsapp", whatsapp)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Nomor WhatsApp ini sudah terdaftar sebagai reseller." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: created, error } = await supabase
    .from("resellers")
    .insert({
      store_name: storeName,
      owner_name: ownerName,
      whatsapp,
      city: city || null,
      store_info: storeInfo || null,
      social_media: socialMedia || null,
      bank_name: bankName || null,
      bank_number: bankNumber || null,
      bank_holder: bankHolder || null,
      discount_percent: discount.value,
      status: "active",
      approved_at: now,
      approved_by: identity?.email || "admin",
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[OPS-RESELLER] Gagal membuat reseller:", error?.message);
    return NextResponse.json({ error: "Gagal menyimpan reseller" }, { status: 500 });
  }

  // Notifikasi WA "akun dibuat" — satu kejadian = satu pesan (klaim unik).
  await notifyResellerAccountCreated(String(created.id));

  return NextResponse.json({ ok: true, id: created.id });
}
