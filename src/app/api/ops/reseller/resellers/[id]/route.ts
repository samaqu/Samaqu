import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { normalizeWhatsappTarget } from "@/lib/fonnte";

/**
 * Ubah data reseller / aktif-nonaktifkan. Setiap perubahan status mencatat
 * siapa & kapan. Menonaktifkan reseller otomatis mematikan sesi login-nya
 * (guard sesi hanya menerima status active).
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const identity = await opsIdentity(req);
  const actor = identity?.email || "admin";

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const textFields = ["store_name", "owner_name", "city", "store_info", "social_media", "bank_name", "bank_number", "bank_holder"] as const;
  for (const field of textFields) {
    if (typeof body[field] === "string") patch[field] = String(body[field]).trim() || null;
  }
  if (typeof body.whatsapp === "string") {
    const target = normalizeWhatsappTarget(body.whatsapp);
    if (target.replace(/\D/g, "").length < 9) {
      return NextResponse.json({ error: "Nomor WhatsApp tidak valid." }, { status: 400 });
    }
    patch.whatsapp = target;
  }

  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (status) {
    if (!["active", "suspended", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Status tidak dikenal." }, { status: 400 });
    }
    patch.status = status;
    const now = new Date().toISOString();
    if (status === "active") {
      patch.approved_at = now;
      patch.approved_by = actor;
    } else {
      patch.rejected_at = now;
      patch.rejected_by = actor;
      patch.reject_reason = typeof body.reason === "string" ? body.reason.trim() || null : null;
    }
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin().from("resellers").update(patch).eq("id", id);
  if (error) {
    console.error("[OPS-RESELLER] Gagal update:", error.message);
    return NextResponse.json({ error: "Gagal menyimpan perubahan" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
