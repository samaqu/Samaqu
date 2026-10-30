import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { normalizeWhatsappTarget } from "@/lib/fonnte";
import { notifyResellerAccountCreated } from "@/lib/reseller/notify";
import { getResellerBalance } from "@/lib/reseller/saldo";

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

  const rows = await Promise.all(
    (data ?? []).map(async (row) => ({
      ...row,
      saldo: (await getResellerBalance(String(row.id))) ?? {
        saldo_tersedia: 0,
        saldo_ditahan: 0,
        saldo_total: 0,
      },
    }))
  );

  return NextResponse.json({ data: rows });
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
  const bankName = String(body.bank_name ?? "").trim();
  const bankNumber = String(body.bank_number ?? "").trim();
  const bankHolder = String(body.bank_holder ?? "").trim();

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
