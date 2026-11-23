import { NextRequest, NextResponse } from "next/server";
import { opsIdentity, unauthorized } from "@/lib/ops-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { assignUnownedChats, filterBulkSenders, guardPic, ownersFor, picRestrictionOff, takePic } from "@/lib/wa-assign";

/**
 * Penerus (proxy) Inbox WhatsApp untuk panel admin → fungsi `wa-admin` di Academy.
 *
 * Seluruh logika inbox (daftar chat, riwayat, balas, ambil alih) tetap SATU: dijalankan `wa-admin` yang sudah
 * teruji dan dipakai bot. Route ini hanya (1) memastikan pemanggil admin panel, (2) menyertakan kunci rahasia
 * server-ke-server + email admin yang login, (3) meneruskan HANYA aksi yang diizinkan di bawah.
 *
 * Aksi yang diizinkan: baca (conversations, messages, stats) dan tulis (reply, takeover, release). Semua dijalankan
 * fungsi `wa-admin` yang sama dengan inbox Academy; bot (`wa-agent`) tidak tersentuh.
 *
 * Variabel lingkungan (hanya NAMA, nilainya diisi di Vercel):
 *   ACADEMY_SUPABASE_URL      — sudah dipakai route wa-inbox
 *   WA_ADMIN_PROXY_SECRET     — kunci acak (min. 24 karakter) yang SAMA dengan secret Edge Function wa-admin
 * Saklar darurat: hapus WA_ADMIN_PROXY_SECRET → jalur ini mati, bot dan inbox Academy tidak terpengaruh.
 *
 * Gembok PIC (tahap 5b-2, `lib/wa-assign.ts`): reply, takeover, release, mark-replied ditolak (403) bila chat itu PIC-nya
 * admin lain; Owner/Leader harus "Ambil alih" dulu (`take-pic`, tercatat di wa_chat_owner_log). Chat tanpa PIC boleh
 * ditangani siapa saja dan yang menangani jadi PIC. "Tandai semua dibalas": admin biasa hanya chat miliknya/tanpa PIC.
 * Saklar darurat gembok: env `WA_PIC_RESTRICT=off` (tanpa deploy). Gagal membaca tabel PIC = diizinkan (fail-open).
 * Inbox Academy TIDAK dibatasi.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACADEMY_URL = (process.env.ACADEMY_SUPABASE_URL || "").replace(/\/+$/, "");

/** Harus sama dengan PROXY_ACTIONS di wa-admin. Tahap 2: ditambah reply, takeover, release. */
const ALLOWED_ACTIONS = new Set(["conversations", "messages", "stats", "reply", "takeover", "release"]);

const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Batas isi permintaan Vercel ±4,5 MB; foto dikecilkan di browser (±1 MB), jadi 4 juta karakter base64 sudah longgar. */
const MAX_PHOTO_B64 = 4_000_000;
const MAX_TEXT = 4000;

/**
 * "Sudah dibalas di HP": admin membalas langsung dari aplikasi WhatsApp di HP, sehingga sistem tidak tahu chat itu
 * sudah dijawab (webhook Fonnte hanya melaporkan pesan MASUK). Aksi ini menutup pesan `pending` chat tersebut
 * TANPA mengirim apa pun ke pelanggan dan TANPA mengubah handover bot. Hanya menyentuh `wa_inbox` di database
 * Samaqu (pola yang sama dengan penutupan pending saat "Ambil alih"), jadi Edge Function wa-admin dan bot tidak ikut berubah.
 */
async function markRepliedOnPhone(sender: string, adminName: string) {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("wa_inbox")
    .update({
      status: "skipped",
      error: `dibalas di HP (${adminName})`,
      claimed_at: null,
      updated_at: now,
    })
    .eq("sender", sender)
    .in("status", ["pending", "processing"])
    .select("id");
  if (error) {
    console.error("[WA-PANEL] gagal menandai dibalas di HP:", error.message);
    return NextResponse.json({ ok: false, error: "Gagal menutup pesan. Coba lagi." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, closed: data?.length ?? 0 }, { headers: { "Cache-Control": "no-store, private" } });
}

const MAX_BULK_SENDERS = 500;
const BULK_CHUNK = 100;

/**
 * "Tandai semua dibalas": versi massal dari markRepliedOnPhone. Pengaman:
 *  - hanya nomor yang DIKIRIM pemanggil (yang tampil di layarnya), bukan "semua pesan pending";
 *  - hanya pesan yang masuk SEBELUM `before` (saat daftar dimuat), jadi pelanggan yang menulis sesudahnya tidak ikut tertutup;
 *  - batas 500 nomor per permintaan; tiap nomor divalidasi.
 */
async function markAllRepliedOnPhone(senders: string[], before: string, adminName: string, skipped = 0) {
  const now = new Date().toISOString();
  const db = getSupabaseAdmin();
  let closed = 0;
  const touched = new Set<string>();
  for (let i = 0; i < senders.length; i += BULK_CHUNK) {
    const { data, error } = await db
      .from("wa_inbox")
      .update({ status: "skipped", error: `dibalas di HP (${adminName})`, claimed_at: null, updated_at: now })
      .in("sender", senders.slice(i, i + BULK_CHUNK))
      .in("status", ["pending", "processing"])
      .lte("created_at", before)
      .select("id, sender");
    if (error) {
      console.error("[WA-PANEL] gagal menandai massal dibalas di HP:", error.message);
      return NextResponse.json({ ok: false, error: "Gagal menutup sebagian pesan. Muat ulang lalu coba lagi.", closed }, { status: 500 });
    }
    closed += data?.length ?? 0;
    for (const row of data || []) touched.add(String(row.sender));
  }
  return NextResponse.json({ ok: true, closed, chats: touched.size, skipped }, { headers: { "Cache-Control": "no-store, private" } });
}

const forbiddenJson = (error: string) => NextResponse.json({ ok: false, error }, { status: 403, headers: { "Cache-Control": "no-store, private" } });

export async function POST(req: NextRequest) {
  const identity = await opsIdentity(req);
  if (!identity) return unauthorized();

  // Aksi lokal (database Samaqu), tidak lewat penerus ke Academy, jadi tidak butuh WA_ADMIN_PROXY_SECRET.
  const rawBody = (await req.clone().json().catch(() => null)) as { action?: unknown; sender?: unknown; senders?: unknown; before?: unknown } | null;
  if (String(rawBody?.action ?? "") === "mark-replied-all") {
    const list = Array.isArray(rawBody?.senders) ? (rawBody?.senders as unknown[]).map((s) => String(s)) : [];
    const senders = [...new Set(list)];
    if (senders.length === 0) return NextResponse.json({ ok: false, error: "Tidak ada chat yang dipilih." }, { status: 400 });
    if (senders.length > MAX_BULK_SENDERS) {
      return NextResponse.json({ ok: false, error: `Terlalu banyak chat sekaligus (maks ${MAX_BULK_SENDERS}).` }, { status: 400 });
    }
    if (!senders.every((s) => /^\d{6,20}$/.test(s))) {
      return NextResponse.json({ ok: false, error: "Ada nomor pengirim yang tidak valid." }, { status: 400 });
    }
    const beforeMs = Date.parse(String(rawBody?.before ?? ""));
    if (!Number.isFinite(beforeMs)) return NextResponse.json({ ok: false, error: "Waktu batas tidak valid." }, { status: 400 });
    // Batas tidak boleh di masa depan: pesan yang belum masuk tidak mungkin sudah dibalas.
    const before = new Date(Math.min(beforeMs, Date.now())).toISOString();

    // Gembok PIC: admin biasa hanya boleh menutup chat miliknya atau yang belum bertuan; Owner/Leader semua.
    let allowed = senders;
    let skipped = 0;
    if (!picRestrictionOff()) {
      try {
        const owners = await ownersFor(senders);
        const ownerOf = new Map([...owners].map(([sender, owner]) => [sender, owner.userId] as [string, string]));
        ({ allowed, skipped } = filterBulkSenders(senders, ownerOf, identity.userId, identity.role));
      } catch (error) {
        console.error("[WA-PANEL] gembok massal gagal dibaca, diizinkan:", error); // fail-open
      }
      if (allowed.length === 0) return forbiddenJson("Semua chat yang dipilih milik admin lain, jadi tidak bisa ditutup oleh Anda.");
    }
    return markAllRepliedOnPhone(allowed, before, identity.name || identity.email, skipped);
  }
  if (String(rawBody?.action ?? "") === "mark-replied") {
    const sender = String(rawBody?.sender ?? "");
    if (!/^\d{6,20}$/.test(sender)) {
      return NextResponse.json({ ok: false, error: "Nomor pengirim tidak valid." }, { status: 400 });
    }
    const guard = await guardPic(sender, identity.userId, identity.role, { claim: true });
    if (!guard.ok) return forbiddenJson(guard.error);
    return markRepliedOnPhone(sender, identity.name || identity.email);
  }
  if (String(rawBody?.action ?? "") === "take-pic") {
    // "Ambil alih dari [nama]": PIC chat pindah ke pemanggil dan tercatat (Owner/Leader untuk chat milik orang lain).
    const sender = String(rawBody?.sender ?? "");
    if (!/^\d{6,20}$/.test(sender)) {
      return NextResponse.json({ ok: false, error: "Nomor pengirim tidak valid." }, { status: 400 });
    }
    const result = await takePic(sender, identity.userId, identity.role);
    if (!result.ok) return forbiddenJson(result.error);
    return NextResponse.json({ ok: true, from: result.from }, { headers: { "Cache-Control": "no-store, private" } });
  }

  const secret = process.env.WA_ADMIN_PROXY_SECRET || "";
  if (!ACADEMY_URL || secret.length < 24) {
    return NextResponse.json(
      { ok: false, error: "Jalur Inbox panel belum diaktifkan (WA_ADMIN_PROXY_SECRET belum diisi)." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    sender?: unknown;
    limit?: unknown;
    message?: unknown;
    media?: { data?: unknown; mime?: unknown } | null;
  } | null;
  const action = String(body?.action ?? "");
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: "Aksi tidak tersedia." }, { status: 400 });
  }

  const payload: Record<string, unknown> = { action };
  if (action === "messages") {
    const sender = String(body?.sender ?? "").replace(/\D/g, "");
    if (!sender) return NextResponse.json({ ok: false, error: "Nomor pengirim kosong." }, { status: 400 });
    payload.sender = sender;
    payload.limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 200);
  }

  // Aksi yang MENGUBAH sesuatu: nomor harus persis angka (sama dengan yang tersimpan), tidak dibersihkan diam-diam.
  if (action === "reply" || action === "takeover" || action === "release") {
    const sender = String(body?.sender ?? "");
    if (!/^\d{6,20}$/.test(sender)) {
      return NextResponse.json({ ok: false, error: "Nomor pengirim tidak valid." }, { status: 400 });
    }
    payload.sender = sender;
    // Gembok PIC: chat milik admin lain ditolak (Owner/Leader harus "Ambil alih" dulu). Membalas atau mengambil alih
    // dari bot pada chat yang belum bertuan membuat pemanggil jadi PIC; mengembalikan ke bot tidak mengklaim.
    const guard = await guardPic(sender, identity.userId, identity.role, { claim: action !== "release" });
    if (!guard.ok) return forbiddenJson(guard.error);
  }
  if (action === "reply") {
    const message = String(body?.message ?? "").trim();
    if (message.length > MAX_TEXT) {
      return NextResponse.json({ ok: false, error: `Pesan terlalu panjang (maks ${MAX_TEXT} karakter).` }, { status: 400 });
    }
    payload.message = message;
    const mime = String(body?.media?.mime ?? "");
    const data = String(body?.media?.data ?? "");
    if (data) {
      if (!PHOTO_MIMES.has(mime)) {
        return NextResponse.json({ ok: false, error: "Format foto harus JPG, PNG, atau WebP." }, { status: 400 });
      }
      if (data.length > MAX_PHOTO_B64) {
        return NextResponse.json({ ok: false, error: "Foto terlalu besar. Pilih foto yang lebih kecil." }, { status: 413 });
      }
      payload.media = { data, mime };
    }
    if (!message && !data) {
      return NextResponse.json({ ok: false, error: "Pesan atau foto wajib diisi." }, { status: 400 });
    }
  }

  try {
    const res = await fetch(`${ACADEMY_URL}/functions/v1/wa-admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-samaqu-proxy": secret,
        "x-samaqu-admin": identity.email,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error || `Inbox tidak merespons (HTTP ${res.status})` },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Tahap 5a: sisipkan pemilik chat (nama admin penanggung jawab) ke tiap percakapan. Kegagalan di sini tidak boleh
    // merusak Inbox: tanpa info pemilik, daftar tetap tampil seperti biasa.
    if (action === "conversations" && Array.isArray(data.items)) {
      try {
        await assignUnownedChats();
        const owners = await ownersFor(data.items.map((c: { sender?: unknown }) => String(c.sender ?? "")));
        data.items = data.items.map((c: { sender?: unknown }) => ({ ...c, owner: owners.get(String(c.sender ?? "")) ?? null }));
      } catch (ownerError) {
        console.error("[WA-PANEL] gagal menambahkan pemilik chat:", ownerError);
      }
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("[WA-PANEL] gagal menghubungi wa-admin:", error);
    return NextResponse.json({ ok: false, error: "Inbox tidak bisa dihubungi. Coba lagi sebentar." }, { status: 502 });
  }
}
