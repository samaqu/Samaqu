import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsActorEmail, unauthorized } from "@/lib/ops-auth";
import { getChatConfig } from "@/lib/chat-config";
import { waMediaSignedUrl } from "@/lib/wa-media";

/**
 * Menu "Perlu Review".
 *
 * - escalation: AI gagal menjawab -> admin memberi instruksi -> AI menyusun draft
 * - learning: instruksi admin disimpan untuk nomor itu / global
 * - order draft: AI menyiapkan draft; order/stok baru dibuat saat admin approve
 *
 * Route ini additive. Tidak mengubah /api/ops/transaksi, stok, lead, atau laporan.
 */

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

const sender62 = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
};

const FREE_COVER_SKU = "CVH-SHC";
const FREE_COVER_COLOR = "Cover Thobe + Hanger";

/**
 * Baris bonus Free Cover Hanger untuk draft transaksi.
 *
 * Hanya ditambahkan kalau `payload.free_cover_hanger === true` — agent yang memutuskan
 * setelah `cek_pesanan` (customer belum pernah order). Barisnya memakai HARGA KATALOG
 * supaya stok cover & hanger tetap terpotong; gratisnya diberikan admin sebagai diskon.
 */
async function withFreeCoverHanger(
  admin: ReturnType<typeof getSupabaseAdmin>,
  payload: any,
) {
  if (payload?.free_cover_hanger !== true) return payload;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const exists = items.some(
    (item: any) =>
      String(item?.color || "").trim().toLowerCase() === FREE_COVER_COLOR.toLowerCase(),
  );
  if (exists) return payload;

  const { data: product } = await admin
    .from("products")
    .select("id, name, sku, price")
    .ilike("sku", FREE_COVER_SKU)
    .maybeSingle();
  if (!product) return payload;

  return {
    ...payload,
    items: [
      ...items,
      {
        product_id: String(product.id),
        product_name: String(product.name || "Cover & Hanger"),
        color: FREE_COVER_COLOR,
        size: "ALL SIZE",
        quantity: 1,
        price: Number(product.price) || 0,
      },
    ],
  };
}

async function history(admin: ReturnType<typeof getSupabaseAdmin>, sender: string) {
  const { data } = await admin
    .from("wa_inbox")
    .select("id, created_at, message, reply_text, status, media_url, media_key")
    .eq("sender", sender)
    .order("created_at", { ascending: false })
    .limit(12);
  return (data || []).reverse().map((item) => ({
    ...item,
    media_url: waMediaSignedUrl(item.media_key) || item.media_url,
  }));
}

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();

  // Badge menu: cukup angka, tanpa mengambil daftar/transkrip.
  const countsOnly = new URL(req.url).searchParams.get("counts_only") === "1";

  if (countsOnly) {
    const [drafts, escalations] = await Promise.all([
      admin
        .from("order_drafts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("wa_escalations")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "claimed"]),
    ]);
    return NextResponse.json({
      counts: {
        drafts: drafts.count || 0,
        escalations: escalations.count || 0,
      },
    });
  }

  const [{ data: escalations, error: escalationError }, { data: drafts, error: draftError }] =
    await Promise.all([
      admin
        .from("wa_escalations")
        .select("*")
        .in("status", ["open", "claimed", "answered"])
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("order_drafts")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
  if (escalationError) return NextResponse.json({ error: escalationError.message }, { status: 500 });
  if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 });

  const escalationItems = [];
  for (const item of escalations || []) {
    escalationItems.push({ ...item, messages: await history(admin, String(item.sender)) });
  }
  const draftItems = (drafts || []).map((item) => ({
    ...item,
    // Tanda tangani ulang tiap kali dibaca: URL R2 private kedaluwarsa, jangan
    // mengandalkan proof_url yang tersimpan saat draft dibuat.
    proof_url: waMediaSignedUrl(item.proof_key) || item.proof_url,
  }));

  return NextResponse.json({
    escalations: escalationItems,
    drafts: draftItems,
    counts: {
      escalations: escalationItems.filter((item) => item.status === "open" || item.status === "claimed").length,
      drafts: draftItems.length,
    },
  });
}

async function makeAiReply(input: {
  instruction: string;
  summary: string;
  customerMessage?: string;
}) {
  const config = await getChatConfig();
  if (!config.apiKey) throw new Error("API key AI belum diisi.");
  const prompt = [
    "Kamu CS SAMAQU yang ramah, sopan, singkat, dan natural.",
    "Susun SATU balasan WhatsApp untuk customer berdasarkan instruksi admin di bawah.",
    "Maksimal 2-3 kalimat. Tanpa emoji. Jangan berlebihan memakai kata Kakak.",
    "Jangan menambah fakta, harga, stok, atau janji yang tidak ada di instruksi.",
    "Jangan menyebut bahwa ini instruksi admin atau hasil AI.",
    "",
    `Pesan/ringkasan customer: ${input.customerMessage || input.summary}`,
    `Instruksi admin: ${input.instruction}`,
  ].join("\n");

  const res = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.4,
      max_tokens: 260,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message || `AI gagal (${res.status})`);
  const reply = String(json?.choices?.[0]?.message?.content || "").trim();
  if (!reply) throw new Error("AI tidak menghasilkan balasan.");
  return reply;
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const admin = getSupabaseAdmin();
  const actor = (await opsActorEmail(req)) || "admin";
  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");

  if (action === "escalation_create") {
    const inboxId = body?.inbox_id ? String(body.inbox_id) : null;
    const sender = sender62(body?.sender);
    const summary = String(body?.summary || "").trim();
    if (!sender || !summary) return bad("sender dan summary wajib");
    const row = {
      inbox_id: inboxId,
      sender,
      sender_name: body?.sender_name ? String(body.sender_name) : null,
      customer_message: body?.customer_message ? String(body.customer_message) : null,
      summary,
      reason: body?.reason ? String(body.reason) : null,
    };
    const { data, error } = await admin.from("wa_escalations").insert(row).select().single();
    if (error) {
      if (String(error.code) === "23505") {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, item: data });
  }

  if (action === "draft_create") {
    const payload = body?.payload;
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.items) || !payload.items.length) {
      return bad("payload transaksi tidak valid");
    }
    const sourceInboxId = body?.source_inbox_id ? String(body.source_inbox_id) : null;
    let proofKey: string | null = null;
    if (sourceInboxId) {
      const { data: source } = await admin
        .from("wa_inbox")
        .select("media_key, sender")
        .eq("id", sourceInboxId)
        .maybeSingle();
      proofKey = source?.media_key || null;
      // Bot kadang menunjuk pesan teks, bukan pesan foto bukti. Ambil lampiran
      // terakhir dari nomor yang sama supaya bukti tetap masuk draft.
      if (!proofKey && source?.sender) {
        const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: recent } = await admin
          .from("wa_inbox")
          .select("media_key")
          .eq("sender", String(source.sender))
          .not("media_key", "is", null)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        proofKey = recent?.media_key || null;
      }
    }
    const row = {
      source_inbox_id: sourceInboxId,
      closing_id: body?.closing_id ? String(body.closing_id) : null,
      customer_name: String(payload.customer_name || body?.customer_name || "").trim() || null,
      customer_whatsapp: String(payload.customer_whatsapp || body?.customer_whatsapp || "").trim() || null,
      payload: await withFreeCoverHanger(admin, payload),
      proof_key: proofKey,
      proof_url: proofKey ? waMediaSignedUrl(proofKey) : body?.proof_url ? String(body.proof_url) : null,
      ai_note: body?.ai_note ? String(body.ai_note) : null,
    };
    const { data, error } = await admin.from("order_drafts").insert(row).select().single();
    if (error) {
      if (String(error.code) === "23505") return NextResponse.json({ ok: true, duplicate: true });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, item: data });
  }

  const id = String(body?.id || "").trim();
  if (!id) return bad("id wajib");

  if (action === "escalation_claim") {
    const { data, error } = await admin
      .from("wa_escalations")
      .update({ status: "claimed", claimed_by: actor, claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "open")
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }

  if (action === "escalation_instruction") {
    const instruction = String(body?.instruction || "").trim();
    if (!instruction) return bad("instruksi wajib");
    const scope = body?.scope === "global" ? "global" : "customer";
    const { data, error } = await admin
      .from("wa_escalations")
      .update({
        instruction,
        instruction_scope: scope,
        status: "claimed",
        claimed_by: actor,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }

  if (action === "draft_delete") {
    const { data, error } = await admin
      .from("order_drafts")
      .delete()
      .eq("id", id)
      .eq("status", "pending")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return bad("Draft sudah diproses atau tidak ditemukan.", 409);
    return NextResponse.json({ ok: true, deleted: true });
  }

  if (action === "draft_update") {
    const { data: draft, error: draftError } = await admin
      .from("order_drafts")
      .select("*")
      .eq("id", id)
      .eq("status", "pending")
      .maybeSingle();
    if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 });
    if (!draft) return bad("Draft sudah diproses atau tidak ditemukan.", 409);

    const payload = body?.payload;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const shipping = payload?.shipping || {};
    if (!items.length) return bad("Draft harus punya minimal 1 produk.");
    for (const key of ["address", "province", "city", "kecamatan", "postal_code"]) {
      if (!String(shipping[key] || "").trim()) return bad("Alamat draft belum lengkap.");
    }

    const productIds = [...new Set(items.map((item: any) => String(item?.product_id || "")).filter(Boolean))];
    const [{ data: products }, { data: variants }] = await Promise.all([
      admin.from("products").select("id, name, series, price").in("id", productIds),
      admin.from("product_variants").select("product_id, color, size, price_override").in("product_id", productIds),
    ]);
    const productMap = new Map((products || []).map((item) => [String(item.id), item]));
    const variantKey = (productId: string, color: string, size: string) =>
      `${productId}|${color || "default"}|${size}`;
    const variantMap = new Map(
      (variants || []).map((item) => [
        variantKey(String(item.product_id), String(item.color || "default"), String(item.size || "").toUpperCase()),
        item,
      ]),
    );
    // Produk yang warnanya menempel di nama ("Thobe Mint Karim") hanya punya varian
    // "default". Warna kiriman draft AI ("Mint") dipetakan ke "default" supaya tidak
    // ditolak saat draft disimpan/disetujui.
    const variantColors = new Map<string, Set<string>>();
    for (const item of variants || []) {
      const pid = String(item.product_id);
      if (!variantColors.has(pid)) variantColors.set(pid, new Set());
      variantColors.get(pid)!.add(String(item.color || "default"));
    }

    const normalized = [];
    for (const item of items) {
      const productId = String(item?.product_id || "").trim();
      const size = String(item?.size || "").trim().toUpperCase();
      let color = String(item?.color || "default").trim() || "default";
      const product = productMap.get(productId);
      if (!product || !size) return bad(`Produk ${productId || "(kosong)"} tidak valid.`);
      if (!variantMap.has(variantKey(productId, color, size))) {
        const colors = variantColors.get(productId);
        if (colors?.size === 1 && colors.has("default")) color = "default";
        if (!variantMap.has(variantKey(productId, color, size))) {
          return bad(`Ukuran ${size} untuk ${product.name} tidak tersedia.`);
        }
      }
      const quantity = Math.max(1, Math.min(99, Number(item?.quantity) || 1));
      const override = Number(variantMap.get(variantKey(productId, color, size))?.price_override);
      normalized.push({
        product_id: productId,
        product_name: product.name,
        color,
        size,
        quantity,
        price: override > 0 ? override : Number(product.price) || 0,
      });
    }

    const subtotal = normalized.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
      0,
    );
    const nextPayload = {
      ...payload,
      customer_name: draft.customer_name,
      customer_whatsapp: draft.customer_whatsapp,
      shipping: {
        address: String(shipping.address).trim(),
        province: String(shipping.province).trim(),
        city: String(shipping.city).trim(),
        kecamatan: String(shipping.kecamatan).trim(),
        postal_code: String(shipping.postal_code).trim(),
      },
      shipping_cost: Math.max(0, Math.round(Number(payload?.shipping_cost) || 0)),
      discount: Math.min(Math.max(0, Math.round(Number(payload?.discount) || 0)), subtotal),
      items: normalized,
    };
    const { data, error } = await admin
      .from("order_drafts")
      .update({ payload: nextPayload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return bad("Draft sudah diproses.", 409);
    return NextResponse.json({ ok: true, item: data });
  }

  if (action === "draft_reject") {
    const { error } = await admin
      .from("order_drafts")
      .update({
        status: "rejected",
        reject_reason: String(body?.reason || "Ditolak admin"),
        reviewed_by: actor,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "draft_approve") {
    const { data: draft, error } = await admin
      .from("order_drafts")
      .select("*")
      .eq("id", id)
      .eq("status", "pending")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!draft) return bad("Draft sudah diproses.", 409);
    const token = req.headers.get("authorization") || "";
    const txRes = await fetch(new URL("/api/ops/transaksi", req.url), {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(draft.payload),
    });
    const txJson = await txRes.json().catch(() => null);
    if (!txRes.ok) return bad(txJson?.error || `Gagal membuat transaksi (${txRes.status})`);
    await admin
      .from("order_drafts")
      .update({
        status: "approved",
        approved_order_number: txJson?.order_number || null,
        reviewed_by: actor,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json({ ok: true, order_number: txJson?.order_number, total: txJson?.total });
  }

  if (!action.startsWith("escalation_")) return bad("Aksi tidak dikenal.");

  const { data: escalation, error: escalationError } = await admin
    .from("wa_escalations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (escalationError) return NextResponse.json({ error: escalationError.message }, { status: 500 });
  if (!escalation) return bad("Eskalasi tidak ditemukan.", 404);

  if (action === "escalation_draft") {
    const instruction = String(body?.instruction || escalation.instruction || "").trim();
    if (!instruction) return bad("instruksi wajib");
    try {
      const reply = await makeAiReply({
        instruction,
        summary: String(escalation.summary || ""),
        customerMessage: String(escalation.customer_message || ""),
      });
      const { data, error } = await admin
        .from("wa_escalations")
        .update({
          instruction,
          instruction_scope: body?.scope === "global" ? "global" : escalation.instruction_scope || "customer",
          draft_reply: reply,
          status: "claimed",
          claimed_by: actor,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, item: data, reply });
    } catch (error) {
      return bad(error instanceof Error ? error.message : "Gagal menyusun balasan.");
    }
  }

  if (action === "escalation_send") {
    const reply = String(body?.reply || escalation.draft_reply || "").trim();
    const instruction = String(body?.instruction || escalation.instruction || "").trim();
    if (!reply || !instruction) return bad("instruksi dan balasan wajib");
    const sender = sender62(escalation.sender);
    const token = req.headers.get("authorization") || "";
    const sendRes = await fetch(new URL("/api/ops/wa-inbox", req.url), {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ target: sender, message: reply }),
    });
    const sendJson = await sendRes.json().catch(() => null);
    if (!sendRes.ok) return bad(sendJson?.error || `Gagal kirim (${sendRes.status})`);
    const scope = body?.scope === "global" ? "global" : "customer";
    const { data: learning, error: learningError } = await admin
      .from("wa_learnings")
      .insert({
        scope,
        sender: scope === "customer" ? sender : null,
        topic: String(body?.topic || escalation.reason || "Instruksi admin").slice(0, 120),
        instruction,
        example_question: String(escalation.customer_message || escalation.summary || "").slice(0, 500),
        source_escalation_id: id,
        created_by: actor,
      })
      .select("id")
      .single();
    if (learningError) return NextResponse.json({ error: learningError.message }, { status: 500 });
    const { data, error } = await admin
      .from("wa_escalations")
      .update({
        reply_text: reply,
        replied_at: new Date().toISOString(),
        status: "answered",
        learning_id: learning?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data, learning_id: learning?.id });
  }

  if (action === "escalation_close") {
    const { error } = await admin
      .from("wa_escalations")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return bad("Aksi tidak dikenal.");
}
