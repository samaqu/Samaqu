import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  DEFAULT_CHAT_BASE_URL,
  DEFAULT_CHAT_MODEL,
  clearChatConfigCache,
  getChatConfig,
} from "@/lib/chat-config";
import { clearKnowledgeCache, getKnowledgeContext } from "@/lib/chat-knowledge";

// Pengaturan live chat AI untuk dashboard admin.
//
// Tabel `chat_settings` sengaja tanpa policy RLS (tidak bisa dibaca/ditulis anon client),
// jadi semua akses lewat route ini: hanya admin (session Supabase + terdaftar di `admins`)
// yang boleh baca/simpan. API key tidak pernah dikirim balik ke browser — hanya status
// terisi dan sebagian disamarkan.

const PUBLIC_FIELDS = ["base_url", "model", "greeting", "extra_instructions"] as const;

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

function maskToken(token: string): string {
  return `${token.slice(0, 6)}${"*".repeat(Math.max(0, token.length - 10))}${token.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("chat_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const envKey = !!process.env.MIMO_API_KEY;
  const envBaseUrl = process.env.MIMO_BASE_URL || "";
  const envModel = process.env.MIMO_MODEL || "";

  if (error) {
    console.warn("[ADMIN] chat_settings belum siap:", error.message);
    return NextResponse.json({
      tableReady: false,
      enabled: false,
      hasKey: false,
      keyPreview: "",
      baseUrl: DEFAULT_CHAT_BASE_URL,
      model: DEFAULT_CHAT_MODEL,
      greeting: "",
      extraInstructions: "",
      envKey,
      envBaseUrl,
      envModel,
    });
  }

  const row = (data || {}) as Record<string, unknown>;
  const key = (row.api_key as string) || "";

  return NextResponse.json({
    tableReady: true,
    enabled: row.enabled === true,
    hasKey: !!key,
    keyPreview: key ? maskToken(key) : "",
    baseUrl: (row.base_url as string) || DEFAULT_CHAT_BASE_URL,
    model: (row.model as string) || DEFAULT_CHAT_MODEL,
    greeting: (row.greeting as string) || "",
    extraInstructions: (row.extra_instructions as string) || "",
    envKey,
    envBaseUrl,
    envModel,
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Aksi "test": kirim satu pertanyaan contoh ke AI memakai konfigurasi aktif.
  if (body.action === "test") {
    const config = await getChatConfig();
    if (!config.apiKey) {
      return NextResponse.json({ ok: false, error: "API key belum diisi" }, { status: 400 });
    }

    const knowledge = await getKnowledgeContext();
    const baseUrl = config.baseUrl.replace(/\/+$/, "");
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: `Kamu CS SAMAQU. Jawab singkat pakai data ini:\n${knowledge.slice(0, 4000)}` },
            { role: "user", content: "Halo, produknya ada apa aja?" },
          ],
          temperature: 0.4,
          max_tokens: 1500,
          chat_template_kwargs: { enable_thinking: false },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = (await res.json().catch(() => null)) as
        | { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } }
        | null;
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: data?.error?.message || `HTTP ${res.status}` });
      }
      const reply = data?.choices?.[0]?.message?.content?.trim();
      return NextResponse.json({ ok: !!reply, reply, error: reply ? undefined : "Balasan kosong" });
    } catch (e) {
      console.error("[ADMIN] Tes chat gagal:", e);
      return NextResponse.json({ ok: false, error: "Gagal menghubungi penyedia AI" });
    }
  }

  const payload: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };

  if (typeof body.enabled === "boolean") payload.enabled = body.enabled;

  // API key kosong = jangan ubah nilai lama (key lama tidak pernah dikirim ke browser).
  if (typeof body.apiKey === "string" && body.apiKey.trim()) payload.api_key = body.apiKey.trim();
  for (const field of PUBLIC_FIELDS) {
    const camel = field.replace(/_(.)/g, (_, c: string) => c.toUpperCase());
    const value = typeof body[camel] === "string" ? body[camel].trim() : undefined;
    if (value !== undefined) payload[field] = value || null;
  }

  const { error } = await getSupabaseAdmin().from("chat_settings").upsert(payload);
  if (error) {
    console.error("[ADMIN] Gagal menyimpan pengaturan chat:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  clearChatConfigCache();
  clearKnowledgeCache();
  return NextResponse.json({ ok: true });
}
