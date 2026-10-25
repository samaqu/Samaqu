import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeKontak } from "@/lib/ops-followup";
import { cleanReviewContent, isCloudinaryImageUrl, maskCustomerName } from "@/lib/ulasan";

/**
 * Ulasan milik customer yang sedang login.
 *
 * GET  /api/customer/reviews  → daftar ulasan miliknya + status moderasi
 * POST /api/customer/reviews  → kirim ulasan baru (status `pending`)
 *
 * Ulasan hanya boleh untuk item dari pesanan berstatus `selesai` milik akun
 * yang sama. Verifikasi dilakukan di server memakai service role, bukan dari
 * data yang dikirim browser.
 */

function tokenOf(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

async function customerContext(req: NextRequest) {
  const admin = getSupabaseAdmin();
  const token = tokenOf(req);
  if (!token) return { admin, user: null, customer: null };

  const { data: authData, error } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (error || !user?.id) return { admin, user: null, customer: null };

  const { data: customer } = await admin
    .from("customers")
    .select("id, name, whatsapp")
    .eq("id", user.id)
    .maybeSingle();

  if (!customer) return { admin, user: null, customer: null };
  return { admin, user, customer };
}

function orderBelongsToCustomer(
  order: any,
  user: { id: string; email?: string | null },
  customer: { whatsapp?: string | null },
) {
  if (String(order?.customer_id || "") === String(user.id)) return true;

  const emailKey = String(user.email || "").trim().toLowerCase();
  if (emailKey && String(order?.customer_email || "").trim().toLowerCase() === emailKey) return true;

  const phoneKey = normalizeKontak(customer?.whatsapp);
  if (phoneKey && normalizeKontak(order?.customer_whatsapp) === phoneKey) return true;

  return false;
}

export async function GET(req: NextRequest) {
  const { admin, user } = await customerContext(req);
  if (!user) return NextResponse.json({ error: "Silakan masuk dulu." }, { status: 401 });

  const { data, error } = await admin
    .from("testimonials")
    .select("id, product_id, series_name, order_id, order_item_id, status, rating, content, image_url, admin_note, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reviews: data || [] });
}

export async function POST(req: NextRequest) {
  const { admin, user, customer } = await customerContext(req);
  if (!user || !customer) return NextResponse.json({ error: "Silakan masuk dulu." }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Data ulasan tidak valid." }, { status: 400 });
  }

  const orderItemId = String(body?.order_item_id || "").trim();
  const rating = Number(body?.rating);
  const content = cleanReviewContent(body?.content);
  const imageUrl = String(body?.image_url || "").trim();

  if (!orderItemId) return NextResponse.json({ error: "Item pesanan wajib dipilih." }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating harus 1 sampai 5." }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: "Ulasan harus 5–1000 karakter." }, { status: 400 });
  }
  if (!isCloudinaryImageUrl(imageUrl)) {
    return NextResponse.json({ error: "Foto ulasan tidak valid." }, { status: 400 });
  }

  const { data: item } = await admin
    .from("order_items")
    .select("id, order_id, product_id, product_name, series, color, size, quantity")
    .eq("id", orderItemId)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "Item pesanan tidak ditemukan." }, { status: 404 });

  const { data: order } = await admin
    .from("orders")
    .select("id, customer_id, customer_email, customer_whatsapp, customer_name, status")
    .eq("id", item.order_id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });
  if (!orderBelongsToCustomer(order, user, customer)) {
    return NextResponse.json({ error: "Pesanan ini bukan milik akun kamu." }, { status: 403 });
  }
  if (String(order.status || "").toLowerCase() !== "selesai") {
    return NextResponse.json({ error: "Ulasan bisa dikirim setelah pesanan selesai." }, { status: 400 });
  }

  const { data: existing } = await admin
    .from("testimonials")
    .select("id, status")
    .eq("order_item_id", orderItemId)
    .maybeSingle();
  if (existing && existing.status !== "rejected") {
    return NextResponse.json(
      { error: "Item ini sudah pernah diulas." },
      { status: 409 },
    );
  }

  const { data: product } = item.product_id
    ? await admin.from("products").select("id, name, category, series").eq("id", item.product_id).maybeSingle()
    : { data: null } as any;

  const displayName = maskCustomerName(customer.name || order.customer_name || user.email);

  const payload = {
    customer_name: displayName,
    type: imageUrl ? "image" : "text",
    category: String(product?.category || ""),
    rating,
    verified: true,
    content,
    image_url: imageUrl || null,
    video_url: null,
    caption: null,
    product_id: item.product_id || product?.id || null,
    series_name: item.series || product?.series || null,
    user_id: user.id,
    order_id: order.id,
    order_item_id: item.id,
    status: "pending",
    source: "customer",
    admin_note: null,
    updated_at: new Date().toISOString(),
  };

  const write = existing
    ? admin.from("testimonials").update(payload).eq("id", existing.id)
    : admin.from("testimonials").insert(payload);

  const { data: review, error } = await write
    .select("id, status, created_at")
    .maybeSingle();

  if (error) {
    if (String(error.code || "") === "23505") {
      return NextResponse.json({ error: "Item ini sudah pernah diulas." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ review }, { status: existing ? 200 : 201 });
}
