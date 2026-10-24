import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ownerProductionGuard } from "@/lib/ops-auth";

/**
 * Koreksi lolos QC turun untuk jadwal Selesai.
 * Riwayat penerimaan tidak diubah; koreksi masuk audit + stock_movements.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await ownerProductionGuard(req);
  if (!access.ok) return access.response;

  const { id } = await context.params;
  try {
    const body = await req.json();
    const productId = String(body?.product_id || "").trim();
    const color = String(body?.color || "default").trim() || "default";
    const size = String(body?.size || "").trim();
    const newLolos = Number(body?.new_lolos);
    const reason = String(body?.reason || "").trim();
    const requestId = String(body?.request_id || "").trim();

    if (!productId || !size) {
      return NextResponse.json({ error: "Varian yang dikoreksi wajib dipilih." }, { status: 400 });
    }
    if (!Number.isFinite(newLolos) || newLolos < 1) {
      return NextResponse.json(
        { error: "Lolos QC baru minimal 1. Lolos 0 tidak didukung; gunakan pembatalan/koreksi terpisah." },
        { status: 400 },
      );
    }
    if (!reason) {
      return NextResponse.json({ error: "Alasan koreksi wajib diisi." }, { status: 400 });
    }
    if (!requestId) {
      return NextResponse.json({ error: "request_id wajib diisi." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("production_correct_qc", {
      p_schedule_id: id,
      p_product_id: productId,
      p_color: color,
      p_size: size,
      p_new_lolos: Math.round(newLolos),
      p_reason: reason,
      p_request_id: requestId,
      p_actor: access.email,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data });
  } catch (e) {
    console.error("[PRODUKSI] koreksi QC:", e);
    return NextResponse.json({ error: "Gagal menyimpan koreksi lolos QC." }, { status: 500 });
  }
}
