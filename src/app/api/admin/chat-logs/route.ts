import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { clearKnowledgeCache } from "@/lib/chat-knowledge";

// Log percakapan live chat untuk dashboard admin.
//
// Tabel `chat_logs` tanpa policy RLS (hanya service role), jadi akses lewat route ini:
// hanya admin (session Supabase + terdaftar di `admins`) yang boleh membaca.

async function isAdmin(req: NextRequest): Promise<boolean> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;

  try {
    const admin = getSupabaseAdmin();
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return false;

    const { data } = await admin.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    return !!data;
  } catch (e) {
    console.error("[ADMIN] Verifikasi admin gagal:", e);
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10) || 100, 1), 500);

  const { data, error } = await getSupabaseAdmin()
    .from("chat_logs")
    .select(
      "id, session_id, locale, customer_name, customer_phone, question, question_images, answer, tools_used, escalated, error, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[ADMIN] Gagal membaca chat_logs:", error.message);
    return NextResponse.json({ error: "Gagal membaca log chat" }, { status: 500 });
  }

  return NextResponse.json({ logs: data || [] });
}

/**
 * Ubah satu percakapan menjadi entri FAQ (tabel `faq_items`) supaya asisten "belajar":
 * FAQ otomatis ikut masuk ke knowledge base. Admin tetap bisa menyuntingnya nanti.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.action !== "toFaq" || typeof body.id !== "string") {
    return NextResponse.json({ error: "Permintaan tidak valid" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: log } = await admin
    .from("chat_logs")
    .select("question, answer")
    .eq("id", body.id)
    .maybeSingle();

  const question = (log?.question as string) || "";
  const answer = (log?.answer as string) || "";
  if (!question.trim() || !answer.trim()) {
    return NextResponse.json({ error: "Percakapan ini tidak punya pertanyaan/jawaban lengkap" }, { status: 400 });
  }

  // Jangan duplikat kalau pertanyaannya sudah ada di FAQ/knowledge.
  const { data: existing } = await admin
    .from("faq_items")
    .select("id")
    .eq("question", question)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { data: last } = await admin
    .from("faq_items")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.display_order as number) || 0) + 1;

  const { error } = await admin.from("faq_items").insert({
    question,
    answer,
    category: "Lainnya",
    // type "chat" = pengetahuan AI saja. Halaman /faq publik hanya menampilkan type "full",
    // jadi entri ini TIDAK muncul di /faq dan tidak mengganggu FAQ yang sudah ada.
    type: "chat",
    display_order: nextOrder,
    is_active: true,
  });

  if (error) {
    console.error("[ADMIN] Gagal menambah knowledge dari log:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  clearKnowledgeCache(); // knowledge base berikutnya memuat entri baru ini
  return NextResponse.json({ ok: true });
}
