import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsActorEmail, unauthorized } from "@/lib/ops-auth";
import { getChatConfig } from "@/lib/chat-config";
import { waMediaSignedUrl } from "@/lib/wa-media";
import { POTONG_PANJANG_ID, POTONG_PANJANG_NAME, POTONG_PANJANG_PRICE } from "@/lib/layanan";

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
const FREE_COVER_SIZE = "ALL SIZE";

/** Diskon promo gratis cover: satu item "Cover Thobe + Hanger" = Rp35.000. */
const COVER_DISCOUNT = 35000;

/**
 * Semua baris cover pada draft — Thobe maupun Koko (`cover-hanger` punya 3 varian warna).
 * Dipakai supaya guard hanya membuang bonus yang stoknya benar-benar habis, bukan
 * semua jenis cover sekaligus.
 */
const isCoverLine = (item: any) =>
  String(item?.product_id || "").trim() === "cover-hanger" ||
  /^cover\b.*hanger$/i.test(String(item?.color || "").trim());

/**
 * Stok efektif satu varian — sumber yang sama dengan halaman ops dan bot WA:
 * VIEW `product_variant_stock` (stok sendiri → induk sharing → MIN komponen),
 * cadangannya RPC `samaqu_effective_stock_map`.
 * Dibaca dengan retry berbatas supaya gangguan sesaat tidak membuat bonus dibuang
 * padahal stoknya ada. `null` = benar-benar tidak terbaca.
 */
async function effectiveStock(
  admin: ReturnType<typeof getSupabaseAdmin>,
  productId: string,
  color: string,
  size: string,
  attempt = 0,
): Promise<number | null> {
  const view = await admin
    .from("product_variant_stock")
    .select("effective_stock")
    .eq("product_id", productId)
    .eq("color", color)
    .eq("size", size)
    .maybeSingle();
  const fromView = Number((view.data as any)?.effective_stock);
  if (!view.error && Number.isFinite(fromView)) return fromView;

  const rpc = await admin.rpc("samaqu_effective_stock_map");
  if (!rpc.error && Array.isArray(rpc.data)) {
    const row = (rpc.data as any[]).find(
      (item) =>
        String(item?.product_id) === productId &&
        String(item?.color || "").trim().toLowerCase() === color.trim().toLowerCase() &&
        String(item?.size || "").trim().toLowerCase() === size.trim().toLowerCase(),
    );
    if (row) return Number(row.effective_stock) || 0;
  }

  if (attempt >= 2) return null;
  await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  return effectiveStock(admin, productId, color, size, attempt + 1);
}

/**
 * Buang baris bonus cover tertentu dari draft (per warna) + batalkan diskon promonya.
 */
function stripFreeCoverBonus(payload: any, alasan: string, habis: string[] = [FREE_COVER_COLOR]) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const drop = new Set(habis.map((color) => color.trim().toLowerCase()));
  const tersisa = items.filter((item: any) => !drop.has(String(item?.color || "").trim().toLowerCase()));
  const masihAdaCover = tersisa.some(isCoverLine);
  // Diskon promo hanya dibatalkan kalau tidak ada lagi baris cover yang tersisa.
  const promoDiscount = Math.round(Number(payload?.discount) || 0) === COVER_DISCOUNT;
  return {
    ...payload,
    ...(promoDiscount && !masihAdaCover ? { discount: 0 } : {}),
    free_cover_hanger: masihAdaCover ? payload?.free_cover_hanger === true : false,
    items: tersisa,
    notes: [String(payload?.notes || "").trim(), `Bonus Free Cover Hanger tidak dimasukkan: ${alasan}.`]
      .filter(Boolean)
      .join(" - "),
  };
}

/**
 * Buang baris bonus cover yang stoknya tidak tersedia, per baris.
 *
 * Dipakai jalur create, edit, dan approve. Tidak pernah MENAMBAH baris — jadi kalau
 * admin sengaja menghapus bonus saat mengedit, baris itu tidak muncul lagi. Draft lama
 * / manual yang masih membawa cover padahal stok 0 ikut dibersihkan supaya tidak gagal
 * di `samaqu_decrement_stock` saat approve.
 *
 * Dicek per warna: stok "Cover Thobe + Hanger" habis tidak boleh ikut membuang
 * "Cover Koko + Hanger" yang stoknya masih ada.
 */
async function guardFreeCoverStock(
  admin: ReturnType<typeof getSupabaseAdmin>,
  payload: any,
) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const coverLines = items.filter(isCoverLine);
  if (!coverLines.length) return payload;

  const habis: string[] = [];
  for (const line of coverLines) {
    const color = String(line?.color || "").trim();
    const size = String(line?.size || FREE_COVER_SIZE).trim();
    const stock = await effectiveStock(admin, String(line?.product_id || "cover-hanger"), color, size);
    if (stock === null || stock <= 0) habis.push(color);
  }
  if (!habis.length) return payload;

  const alasan = habis
    .map((color) => `${color} ${color === FREE_COVER_COLOR ? "habis (0)" : "tidak tersedia"}`)
    .join(", ");
  return stripFreeCoverBonus(payload, alasan, habis);
}

/**
 * Baris bonus Free Cover Hanger untuk draft transaksi.
 *
 * Hanya ditambahkan kalau `payload.free_cover_hanger === true` — agent yang memutuskan
 * setelah `cek_pesanan` (customer belum pernah order). Barisnya memakai HARGA KATALOG
 * supaya stok cover & hanger tetap terpotong; gratisnya diberikan admin sebagai diskon.
 *
 * Kalau stok efektif cover habis / tidak terbaca, bonus TIDAK dimasukkan. Tanpa ini
 * draft terlanjur membawa Rp35.000 dan baru gagal saat approve.
 */
async function withFreeCoverHanger(
  admin: ReturnType<typeof getSupabaseAdmin>,
  payload: any,
) {
  if (payload?.free_cover_hanger !== true) return payload;

  // Buang dulu baris cover yang stoknya habis (termasuk kiriman AI / draft lama).
  const checked = await guardFreeCoverStock(admin, payload);
  if (checked?.free_cover_hanger !== true) return checked;

  const items = Array.isArray(checked.items) ? checked.items : [];
  if (items.some(isCoverLine)) return checked;

  const { data: product } = await admin
    .from("products")
    .select("id, name, sku, price")
    .ilike("sku", FREE_COVER_SKU)
    .maybeSingle();
  if (!product) return checked;

  // Pastikan stoknya masih ada sebelum baris ditambahkan — draft yang tidak bisa
  // di-approve lebih buruk daripada draft tanpa bonus.
  const stock = await effectiveStock(
    admin,
    String(product.id),
    FREE_COVER_COLOR,
    FREE_COVER_SIZE,
  );
  if (stock === null || stock <= 0) {
    return stripFreeCoverBonus(
      checked,
      stock === null ? "stok Cover Thobe + Hanger tidak terbaca" : "stok Cover Thobe + Hanger habis (0)",
      [FREE_COVER_COLOR],
    );
  }

  return {
    ...checked,
    items: [
      ...items,
      {
        product_id: String(product.id),
        product_name: String(product.name || "Cover & Hanger"),
        color: FREE_COVER_COLOR,
        size: FREE_COVER_SIZE,
        quantity: 1,
        price: Number(product.price) || 0,
      },
    ],
  };
}

const ADDRESS_FIELDS = ["address", "province", "city", "kecamatan", "postal_code"] as const;

/**
 * Alamat draft harus benar-benar alamat, bukan cuma nama kecamatan/kota.
 *
 * Pernah kejadian: bot mengambil "Megamendung" (nama kecamatan) sebagai `shipping.address`
 * karena membaca bukti transfer, sehingga resi J&T terbit tanpa alamat kirim. Draft seperti
 * itu ditolak supaya admin memperbaiki, bukan terlanjur di-approve.
 */
function addressProblem(shipping: any): string | null {
  const address = String(shipping?.address || "").trim();
  const kecamatan = String(shipping?.kecamatan || "").trim();
  const city = String(shipping?.city || "").trim();
  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!address) return "Alamat draft kosong.";
  // Hanya nama kecamatan / kota / gabungan keduanya = bukan alamat.
  const only = [kecamatan, city, `${kecamatan}${city}`, `${city}${kecamatan}`]
    .filter(Boolean)
    .map(normalize);
  const flat = normalize(address);
  if (flat.length < 15 || only.includes(flat)) {
    return "Alamat draft cuma kecamatan/kota. Tulis alamat lengkap (jalan, RT/RW, desa, nomor rumah).";
  }
  return null;
}

/**
 * Harga & identitas baris draft selalu dihitung ulang dari master produk.
 * Dipakai saat draft dibuat (AI) dan saat draft diedit admin, supaya harga
 * kiriman AI tidak pernah dipakai dan draft selalu bisa di-approve.
 */
async function normalizeItems(
  admin: ReturnType<typeof getSupabaseAdmin>,
  items: any[],
): Promise<{ rows?: any[]; error?: string }> {
  const productIds = [...new Set(items.map((item: any) => String(item?.product_id || "").trim()).filter(Boolean))];
  if (!productIds.length) return { error: "Draft harus punya minimal 1 produk." };

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

  const rows = [];
  for (const item of items) {
    const productId = String(item?.product_id || "").trim();
    const size = String(item?.size || "").trim().toUpperCase();
    let color = String(item?.color || "default").trim() || "default";
    const product = productMap.get(productId);
    if (!product || !size) return { error: `Produk ${productId || "(kosong)"} tidak valid.` };
    if (!variantMap.has(variantKey(productId, color, size))) {
      const colors = variantColors.get(productId);
      if (colors?.size === 1 && colors.has("default")) color = "default";
      if (!variantMap.has(variantKey(productId, color, size))) {
        return { error: `Ukuran ${size} untuk ${product.name} tidak tersedia.` };
      }
    }
    const quantity = Math.max(1, Math.min(99, Number(item?.quantity) || 1));
    const override = Number(variantMap.get(variantKey(productId, color, size))?.price_override);
    rows.push({
      product_id: productId,
      product_name: product.name,
      series: product.series ?? null,
      color,
      size,
      quantity,
      price: override > 0 ? override : Number(product.price) || 0,
    });
  }
  return { rows };
}

/**
 * Lepas klaim approve kalau pembuatan order gagal, supaya draft kembali ke antrean.
 * Hanya menyentuh draft yang belum punya nomor order.
 */
async function releaseDraftClaim(
  admin: ReturnType<typeof getSupabaseAdmin>,
  id: string,
) {
  await admin
    .from("order_drafts")
    .update({
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "approved")
    .is("approved_order_number", null);
}

/**
 * Tambahkan baris jasa potong panjang (Rp35.000) kalau AI/admin menandainya.
 * Baris jasa tidak punya stok; kategori "Jasa" dilewati oleh jalur stok.
 */
function withPotongPanjang(payload: any) {
  const ukuran = String(payload?.potong_panjang || "").trim();
  if (!ukuran) return payload;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const catatan = /potong panjang/i.test(String(payload?.notes || ""))
    ? String(payload?.notes || "").trim()
    : [String(payload?.notes || "").trim(), `Potong panjang Thobe: ${ukuran} - Rp35.000`]
        .filter(Boolean)
        .join(" - ");
  if (items.some((item: any) => String(item?.product_id || "") === POTONG_PANJANG_ID)) {
    return { ...payload, notes: catatan };
  }
  return {
    ...payload,
    notes: catatan,
    items: [
      ...items,
      {
        product_id: POTONG_PANJANG_ID,
        product_name: POTONG_PANJANG_NAME,
        color: "Jasa",
        size: "ALL SIZE",
        quantity: 1,
        price: POTONG_PANJANG_PRICE,
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
  const draftProductIds = [
    ...new Set(
      (drafts || []).flatMap((draft) => {
        const rows = Array.isArray(draft.payload?.items) ? draft.payload.items : [];
        return rows.map((row: any) => String(row?.product_id || "")).filter(Boolean);
      }),
    ),
  ];
  // Draft dari AI tidak menyimpan `series`/foto/kain, padahal admin butuh itu saat mereview.
  // Lengkapi dari master produk saat dibaca supaya draft lama ikut tampil lengkap.
  const { data: draftProducts } = draftProductIds.length
    ? await admin
        .from("products")
        .select("id, name, series, image, jenis_kain(name)")
        .in("id", draftProductIds)
    : { data: [] as any[] };
  // `products.image` sering berupa video. Foto asli ada di `product_images`, jadi
  // ambil foto pertama yang bukan video (utamakan yang warnanya cocok).
  const { data: draftImageRows } = draftProductIds.length
    ? await admin
        .from("product_images")
        .select("product_id, url, is_video, color, display_order")
        .in("product_id", draftProductIds)
        .order("display_order", { ascending: true })
    : { data: [] as any[] };
  const photosByProduct = new Map<string, { color: string; url: string }[]>();
  for (const row of draftImageRows || []) {
    const url = String((row as any)?.url || "").trim();
    if (!url || (row as any)?.is_video) continue;
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) continue;
    const id = String((row as any).product_id);
    if (!photosByProduct.has(id)) photosByProduct.set(id, []);
    photosByProduct.get(id)!.push({ color: String((row as any).color || "").trim(), url });
  }
  const photoFor = (productId: string, color: string) => {
    const list = photosByProduct.get(productId) || [];
    if (!list.length) return "";
    const wanted = color.trim().toLowerCase();
    const match = wanted ? list.find((photo) => photo.color.toLowerCase() === wanted) : null;
    return (match || list[0]).url;
  };
  const productById = new Map((draftProducts || []).map((row: any) => [String(row.id), row]));
  const draftItems = (drafts || []).map((item) => {
    const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
    const rows = Array.isArray(payload.items)
      ? payload.items.map((row: any) => {
          const product = productById.get(String(row?.product_id || ""));
          const fallbackImage = String(product?.image || "").trim();
          const galleryPhoto = photoFor(String(row?.product_id || ""), String(row?.color || ""));
          const safeFallback = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(fallbackImage) ? "" : fallbackImage;
          return {
            ...row,
            // Nama dari master produk: payload AI kadang menempelkan series di nama
            // ("Thobe Grey Indigo Jiharkah") sehingga tampil dobel dengan chip series.
            product_name: product?.name ?? row?.product_name,
            series: row?.series ?? product?.series ?? null,
            image: row?.image ?? (galleryPhoto || safeFallback || null),
            kain: row?.kain ?? product?.jenis_kain?.name ?? null,
          };
        })
      : payload.items;
    return {
      ...item,
      payload: applyCoverDiscount({ ...payload, items: rows }),
      // Tanda tangani ulang tiap kali dibaca: URL R2 private kedaluwarsa, jangan
      // mengandalkan proof_url yang tersimpan saat draft dibuat.
      proof_url: waMediaSignedUrl(item.proof_key) || item.proof_url,
    };
  });

  return NextResponse.json({
    escalations: escalationItems,
    drafts: draftItems,
    counts: {
      escalations: escalationItems.filter((item) => item.status === "open" || item.status === "claimed").length,
      drafts: draftItems.length,
    },
  });
}

/**
 * Samakan diskon draft dengan promo cover hanger. Dipakai saat draft dibuat, dibaca,
 * diedit, dan disetujui supaya angka di layar = angka yang dibukukan.
 * Diskon yang lebih besar dari promo (diisi admin) tidak diturunkan.
 */
function applyCoverDiscount(payload: any) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const subtotal = items.reduce(
    (sum: number, item: any) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0),
    0,
  );
  const current = Math.max(0, Math.round(Number(payload?.discount) || 0));
  const coverQty = items
    .filter(
      (item: any) =>
        String(item?.product_id || "") === "cover-hanger" &&
        /cover\s*thobe/i.test(String(item?.color || "")),
    )
    .reduce((sum: number, item: any) => sum + Math.max(1, Number(item?.quantity) || 1), 0);
  const target = coverQty ? Math.min(COVER_DISCOUNT * coverQty, subtotal) : 0;
  return { ...payload, discount: Math.min(Math.max(current, target), subtotal) };
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
    // Draft dari AI baru boleh masuk kalau alamatnya sudah lengkap.
    const shipping = payload.shipping || {};
    for (const key of ADDRESS_FIELDS) {
      if (!String(shipping[key] || "").trim()) return bad("Alamat draft belum lengkap.");
    }
    const addressIssue = addressProblem(shipping);
    if (addressIssue) return bad(addressIssue);
    // Harga dari AI tidak dipakai: semua baris dihitung ulang dari master produk,
    // sama seperti saat admin mengedit draft.
    const priced = await normalizeItems(admin, payload.items);
    if (priced.error) return bad(priced.error);
    const normalizedPayload = { ...payload, items: priced.rows };
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
      payload: applyCoverDiscount(await withFreeCoverHanger(admin, withPotongPanjang(normalizedPayload))),
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
    for (const key of ADDRESS_FIELDS) {
      if (!String(shipping[key] || "").trim()) return bad("Alamat draft belum lengkap.");
    }

    const priced = await normalizeItems(admin, items);
    if (priced.error) return bad(priced.error);
    const normalized = priced.rows || [];

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
    // Admin bisa mengembalikan/menambah baris cover saat mengedit; kalau stoknya habis
    // baris itu dibuang lagi supaya draft tetap bisa di-approve.
    const checked = await guardFreeCoverStock(admin, nextPayload);
    const { data, error } = await admin
      .from("order_drafts")
      .update({ payload: applyCoverDiscount(checked), updated_at: new Date().toISOString() })
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
    // Klaim atomik: hanya satu request yang boleh mengubah pending -> approved.
    // Double click / dua admin bersamaan akan kena 409 dan tidak membuat order kedua.
    const claimedAt = new Date().toISOString();
    const { data: draft, error } = await admin
      .from("order_drafts")
      .update({
        status: "approved",
        reviewed_by: actor,
        reviewed_at: claimedAt,
        updated_at: claimedAt,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!draft) return bad("Draft sudah diproses.", 409);
    const token = req.headers.get("authorization") || "";
    let txRes: Response;
    try {
      // Guard stok bonus diulang saat approve: draft yang dibuat sebelum aturan ini
      // (atau draft manual) bisa saja masih membawa baris cover padahal stoknya 0.
      // Tanpa ini approve gagal di `samaqu_decrement_stock` dan draft balik ke antrean.
      const draftPayload = await guardFreeCoverStock(admin, draft.payload);
      txRes = await fetch(new URL("/api/ops/transaksi", req.url), {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify(applyCoverDiscount(draftPayload)),
      });
    } catch (err) {
      await releaseDraftClaim(admin, id);
      return bad(err instanceof Error ? err.message : "Gagal membuat transaksi.");
    }
    const txJson = await txRes.json().catch(() => null);
    if (!txRes.ok) {
      // Gagal bikin order: draft kembali ke antrean supaya bisa diperbaiki admin.
      await releaseDraftClaim(admin, id);
      return bad(txJson?.error || `Gagal membuat transaksi (${txRes.status})`);
    }
    await admin
      .from("order_drafts")
      .update({
        approved_order_number: txJson?.order_number || null,
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
