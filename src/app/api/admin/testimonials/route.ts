import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin } from "@/lib/ops-auth";
import { parseReviewStatus } from "@/lib/ulasan";

/**
 * Antrean moderasi ulasan untuk admin.
 *
 * GET /api/admin/testimonials?status=pending&limit=100
 * Hanya admin SAMAQU (tabel `admins`) yang boleh membaca semua status.
 */

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) {
    return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const status = parseReviewStatus(searchParams.get("status"));
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 100;

  let query = admin
    .from("testimonials")
    .select("id, customer_name, type, category, rating, verified, content, image_url, video_url, caption, product_id, series_name, user_id, order_id, order_item_id, status, source, admin_note, created_at, updated_at")
    .eq("source", "customer")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const [itemsRes, pendingRes, publishedRes, rejectedRes] = await Promise.all([
    query,
    admin.from("testimonials").select("id", { count: "exact", head: true }).eq("source", "customer").eq("status", "pending"),
    admin.from("testimonials").select("id", { count: "exact", head: true }).eq("source", "customer").eq("status", "published"),
    admin.from("testimonials").select("id", { count: "exact", head: true }).eq("source", "customer").eq("status", "rejected"),
  ]);

  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });

  return NextResponse.json({
    items: itemsRes.data || [],
    counts: {
      pending: pendingRes.count || 0,
      published: publishedRes.count || 0,
      rejected: rejectedRes.count || 0,
    },
  });
}
