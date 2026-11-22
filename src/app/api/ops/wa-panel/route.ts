import { NextRequest, NextResponse } from "next/server";
import { opsIdentity, unauthorized } from "@/lib/ops-auth";

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

export async function POST(req: NextRequest) {
  const identity = await opsIdentity(req);
  if (!identity) return unauthorized();

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
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    console.error("[WA-PANEL] gagal menghubungi wa-admin:", error);
    return NextResponse.json({ ok: false, error: "Inbox tidak bisa dihubungi. Coba lagi sebentar." }, { status: 502 });
  }
}
