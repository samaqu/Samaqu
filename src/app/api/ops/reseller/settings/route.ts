import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { getResellerSettings } from "@/lib/reseller/settings";

/**
 * Pengaturan reseller: biaya admin penarikan non-BSI dan rekening BSI
 * tujuan top up. Nilai disimpan di `store_settings` (baris id = 1).
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const settings = await getResellerSettings();
  return NextResponse.json({ data: settings });
}

export async function PATCH(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.admin_fee_non_bsi !== undefined) {
    const fee = Math.round(Number(body.admin_fee_non_bsi));
    if (!Number.isFinite(fee) || fee < 0) {
      return NextResponse.json({ error: "Biaya admin tidak valid" }, { status: 400 });
    }
    patch.reseller_admin_fee_non_bsi = fee;
  }
  const textFields = ["bsi_bank_name", "bsi_account_number", "bsi_account_holder"] as const;
  for (const field of textFields) {
    if (typeof body[field] === "string") {
      const column = `reseller_${field}`;
      patch[column] = String(body[field]).trim() || null;
    }
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin().from("store_settings").update(patch).eq("id", 1);
  if (error) {
    console.error("[OPS-RESELLER] Gagal menyimpan pengaturan:", error.message);
    return NextResponse.json({ error: "Gagal menyimpan pengaturan" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
