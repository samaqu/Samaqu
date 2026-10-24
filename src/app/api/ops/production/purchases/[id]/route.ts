import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { productionGuard } from "@/lib/ops-auth";

/**
 * Hapus pembelian beserta movement stoknya.
 * Hanya Owner. RPC menolak kalau stok dari pembelian itu sudah terpakai.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await productionGuard(req, { write: true });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  let reason = "";
  try {
    const body = await req.json();
    reason = String(body?.reason || "").trim();
  } catch {
    // Body opsional.
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("production_delete_purchase", {
    p_purchase_id: id,
    p_reason: reason || null,
    p_actor: access.email,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ result: data });
}
