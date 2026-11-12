import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";

/**
 * Baca pesanan untuk dashboard admin (menggantikan baca langsung dari browser pakai anon key).
 *
 * Dipakai supaya policy RLS `orders`/`order_items` bisa ditutup: halaman admin & halaman label
 * membaca lewat route ini (Bearer token admin → diverifikasi `isOpsAdmin`), sedangkan customer
 * membaca pesanannya sendiri lewat policy `auth.uid() = customer_id`.
 *
 *   GET /api/ops/orders?limit=50                  → 50 pesanan terbaru
 *   GET /api/ops/orders?from=…&to=…&limit=1000    → pesanan pada rentang tanggal (dashboard bulan)
 *   GET /api/ops/orders?order_number=SMQ-…        → satu pesanan + item (halaman label & detail)
 *   GET /api/ops/orders?search=ali                → cari nama pemesan / no WhatsApp / nomor pesanan
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();

  const sp = new URL(req.url).searchParams;
  const orderNumber = String(sp.get("order_number") || "").trim();
  const search = String(sp.get("search") || "").trim();
  const from = String(sp.get("from") || "").trim();
  const to = String(sp.get("to") || "").trim();
  const limitRaw = Number(sp.get("limit") || 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 50;
  // Grafik/ringkasan hanya butuh kolom order; jangan ikut menarik semua order_items.
  const includeItems = sp.get("include_items") !== "0";

  const client = getSupabaseAdmin();

  if (orderNumber) {
    const { data, error } = await client
      .from("orders")
      .select("*, order_items(*)")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });

    // Pesanan reseller: sertakan nama toko + WA untuk label pengirim & blok reseller.
    if ((data as { reseller_id?: string | null }).reseller_id) {
      const { data: reseller } = await client
        .from("resellers")
        .select("store_name, owner_name, whatsapp")
        .eq("id", String((data as { reseller_id: string }).reseller_id))
        .maybeSingle();
      if (reseller) (data as Record<string, unknown>).reseller = reseller;
    }

    // Nomor toko untuk header label. Dibaca dari `store_settings.whatsapp` supaya label
    // ikut pengaturan toko, bukan teks tetap. Aditif: field baru, pemakai lain tidak berubah.
    const { data: store } = await client
      .from("store_settings")
      .select("whatsapp, store_name")
      .eq("id", 1)
      .maybeSingle();
    if (store) (data as Record<string, unknown>).store = store;

    return NextResponse.json({ order: data });
  }

  let query = client
    .from("orders")
    .select(includeItems ? "*, order_items(*)" : "*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lt("created_at", to);

  if (search) {
    // `.or()` PostgREST memakai koma & tanda kurung sebagai pemisah — buang dari kata kunci
    // supaya pencarian tidak mengubah sintaks filternya.
    const term = search.replace(/[,()%*\\"']/g, " ").replace(/\s+/g, " ").trim();
    if (term) {
      query = query.or(
        `order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_whatsapp.ilike.%${term}%`,
      );
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data || [] });
}
