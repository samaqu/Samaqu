import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeKontak } from "@/lib/ops-followup";

/**
 * Pesanan milik customer yang sedang login.
 *
 * Selain `customer_id`, pesanan manual dari WhatsApp/IG sering tidak punya
 * `customer_id`. Supaya tetap bisa dilacak di dashboard customer, pesanan
 * tanpa ID dicocokkan lewat email akun atau nomor WhatsApp yang sama.
 *
 * Guard: Bearer token customer + baris `customers`. Service role dipakai agar
 * RLS `orders` yang hanya mengizinkan `customer_id = auth.uid()` tidak memblokir
 * pesanan manual yang belum tertaut.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const { data: authData, error: authError } = token
      ? await admin.auth.getUser(token)
      : { data: { user: null }, error: null };

    const user = authData?.user;
    if (authError || !user?.id) {
      return NextResponse.json({ error: "Silakan masuk dulu." }, { status: 401 });
    }

    const { data: customer } = await admin
      .from("customers")
      .select("id, whatsapp")
      .eq("id", user.id)
      .maybeSingle();
    if (!customer) {
      return NextResponse.json({ error: "Akun ini bukan akun pelanggan." }, { status: 401 });
    }

    // Email hanya boleh dipakai sebagai penghubung kalau sudah terverifikasi. Tanpa ini,
    // seseorang bisa mendaftar dengan email orang lain dan melihat riwayat pesanan tamunya.
    const emailVerified = Boolean((user as { email_confirmed_at?: string | null }).email_confirmed_at);
    const emailKey = emailVerified ? String(user.email || "").trim().toLowerCase() : "";
    const phoneKey = normalizeKontak(customer.whatsapp);
    const whatsapp = String(customer.whatsapp || "").trim();
    const digits = whatsapp.replace(/\D/g, "").replace(/^0+/, "");
    const phoneVariants = Array.from(
      new Set([whatsapp, digits, digits ? `0${digits}` : "", digits ? `62${digits}` : ""].filter(Boolean))
    );

    // Query hanya pesanan yang relevan — jangan ambil seluruh tabel `orders`.
    const filters = [`customer_id.eq.${user.id}`];
    if (emailKey) filters.push(`customer_email.eq.${emailKey}`);
    for (const value of phoneVariants) filters.push(`customer_whatsapp.eq.${value}`);

    const rawLimit = Number(new URL(req.url).searchParams.get("limit"));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 500;

    const { data, error } = await admin
      .from("orders")
      .select("*, order_items(*)")
      .or(filters.join(","))
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Pengaman kalau PostgREST mengembalikan baris di luar filter.
    const orders = (data || []).filter((order: any) => {
      if (String(order.customer_id || "") === String(user.id)) return true;
      if (emailKey && String(order.customer_email || "").trim().toLowerCase() === emailKey) return true;
      if (phoneKey && normalizeKontak(order.customer_whatsapp) === phoneKey) return true;
      return false;
    });

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("[CUSTOMER] orders:", error);
    return NextResponse.json({ error: "Gagal mengambil pesanan." }, { status: 500 });
  }
}
