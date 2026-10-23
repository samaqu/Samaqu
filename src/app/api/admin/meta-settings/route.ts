import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { clearMetaCapiConfigCache } from "@/lib/meta-capi";

/**
 * Pengaturan Meta Pixel untuk dashboard admin.
 *
 * Pixel ID / status / test event code tidak rahasia (dipakai base code di browser), tetapi
 * ACCESS TOKEN CAPI disimpan di tabel `meta_settings` yang tanpa policy RLS — nilainya tidak
 * pernah dikirim balik ke browser, hanya status `hasToken`.
 */

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

  const admin = getSupabaseAdmin();
  const { data: settings } = await admin
    .from("store_settings")
    .select("meta_pixel_id, meta_pixel_enabled, meta_test_event_code")
    .eq("id", 1)
    .maybeSingle();

  let tableReady = true;
  let hasToken = false;

  const { data: secret, error: secretError } = await admin
    .from("meta_settings")
    .select("access_token")
    .eq("id", 1)
    .maybeSingle();

  if (secretError) {
    // Tabel belum dibuat. Token tidak lagi disimpan di store_settings.
    tableReady = false;
  }
  hasToken = !!secret?.access_token;

  return NextResponse.json({
    tableReady,
    pixelId: settings?.meta_pixel_id || "",
    enabled: settings?.meta_pixel_enabled === true,
    testEventCode: settings?.meta_test_event_code || "",
    hasToken,
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const pixelId = typeof body.pixelId === "string" ? body.pixelId.trim() : "";
  const testEventCode = typeof body.testEventCode === "string" ? body.testEventCode.trim() : "";
  const enabled = body.enabled === true;
  const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

  if (pixelId && !/^\d{8,20}$/.test(pixelId)) {
    return NextResponse.json({ error: "Pixel ID harus berupa angka (8–20 digit)" }, { status: 400 });
  }
  if (testEventCode && !/^[A-Za-z0-9]{1,32}$/.test(testEventCode)) {
    return NextResponse.json({ error: "Test Event Code hanya boleh huruf/angka" }, { status: 400 });
  }
  if (enabled && !pixelId) {
    return NextResponse.json({ error: "Pixel ID wajib diisi jika tracking diaktifkan" }, { status: 400 });
  }
  if (accessToken.length > 2000) {
    return NextResponse.json({ error: "Access token terlalu panjang" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Field non-rahasia tetap di store_settings.
  const { error: settingsError } = await admin.from("store_settings").upsert({
    id: 1,
    meta_pixel_id: pixelId || null,
    meta_pixel_enabled: enabled,
    meta_test_event_code: testEventCode || null,
    updated_at: new Date().toISOString(),
  });

  if (settingsError) {
    console.error("[ADMIN] Gagal menyimpan pengaturan Meta Pixel:", settingsError.message);
    return NextResponse.json({ error: "Gagal menyimpan pengaturan Meta Pixel" }, { status: 500 });
  }

  // Token hanya ditulis kalau diisi (field kosong = jangan ubah token lama).
  if (accessToken) {
    const { error: secretError } = await admin.from("meta_settings").upsert({
      id: 1,
      access_token: accessToken,
      updated_at: new Date().toISOString(),
    });

    if (secretError) {
      console.error("[ADMIN] Gagal menyimpan token CAPI:", secretError.message);
      return NextResponse.json({
        error:
          "Token CAPI gagal disimpan. Jalankan supabase/migrations/20261023_meta_settings.sql di Supabase SQL Editor dulu.",
      }, { status: 500 });
    }
  }

  clearMetaCapiConfigCache();
  return NextResponse.json({ ok: true });
}
