import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { getResellerLevels, getResellerSettings } from "@/lib/reseller/settings";
import { validateLevels } from "@/lib/reseller/level";

/**
 * Pengaturan reseller: biaya admin penarikan non-BSI dan rekening BSI
 * tujuan top up. Nilai disimpan di `store_settings` (baris id = 1).
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const [settings, levels] = await Promise.all([getResellerSettings(), getResellerLevels()]);
  return NextResponse.json({ data: { ...settings, levels } });
}

export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.default_discount_percent !== undefined) {
    const value = Number(body.default_discount_percent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return NextResponse.json({ error: "Diskon default harus 0–100" }, { status: 400 });
    }
    patch.reseller_default_discount_percent = Math.round(value * 100) / 100;
  }
  if (body.admin_fee_non_bsi !== undefined) {
    const fee = Math.round(Number(body.admin_fee_non_bsi));
    if (!Number.isFinite(fee) || fee < 0) {
      return NextResponse.json({ error: "Biaya admin tidak valid" }, { status: 400 });
    }
    patch.reseller_admin_fee_non_bsi = fee;
  }
  const textFields = ["bsi_bank_name", "bsi_account_number", "bsi_account_holder", "qris_image_url"] as const;
  for (const field of textFields) {
    if (typeof body[field] === "string") {
      const column = `reseller_${field}`;
      patch[column] = String(body[field]).trim() || null;
    }
  }

  // Batas level (Silver/Gold/Platinum). null = kembali ke batas standar.
  if (body.levels !== undefined) {
    if (body.levels === null) {
      patch.reseller_levels = null;
    } else {
      const checked = validateLevels(body.levels);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      patch.reseller_levels = checked.value;
    }
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin().from("store_settings").update(patch).eq("id", 1);
  if (error) {
    console.error("[OPS-RESELLER] Gagal menyimpan pengaturan:", error.message);
    if (/reseller_levels/.test(error.message)) {
      return NextResponse.json(
        { error: "Kolom batas level belum dibuat di database (migrasi 20261114_reseller_levels.sql belum dijalankan)." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Gagal menyimpan pengaturan" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
