import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// ── Config cache (server-side, 5 min TTL) ──

interface CachedConfig {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

let cachedConfig: CachedConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getConfig(): Promise<CachedConfig | null> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL) return cachedConfig;

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("store_settings")
      .select("meta_pixel_id, meta_access_token, meta_pixel_enabled, meta_test_event_code")
      .eq("id", 1)
      .single();

    if (data?.meta_pixel_id && data?.meta_pixel_enabled && data?.meta_access_token) {
      cachedConfig = {
        pixelId: data.meta_pixel_id,
        accessToken: data.meta_access_token,
        testEventCode: data.meta_test_event_code || undefined,
      };
      cacheTimestamp = now;
      return cachedConfig;
    }

    // Fallback: Pixel ID dari environment (NEXT_PUBLIC_META_PIXEL_ID / META_PIXEL_ID) —
    // dipakai kalau dashboard belum menyimpan Pixel ID. Access token tetap wajib ada.
    const envPixelId = (process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();
    const dbPixelId = (data?.meta_pixel_id || "").trim();
    const pixelId = dbPixelId || envPixelId;
    const enabled = dbPixelId ? Boolean(data?.meta_pixel_enabled) : Boolean(envPixelId);
    if (pixelId && enabled && data?.meta_access_token) {
      cachedConfig = {
        pixelId,
        accessToken: data.meta_access_token,
        testEventCode: data.meta_test_event_code || undefined,
      };
      cacheTimestamp = now;
      return cachedConfig;
    }
  } catch {
    // Return cached if available
  }

  return cachedConfig;
}

// ── Helpers ──

function hashValue(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// ── POST handler ──

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventName, eventId, customData, userData } = body;

    if (!eventName || !eventId) {
      return NextResponse.json({ error: "Missing eventName or eventId" }, { status: 400 });
    }

    const config = await getConfig();
    if (!config) {
      return NextResponse.json({ error: "Meta Pixel not configured" }, { status: 200 });
    }

    // Build user_data with hashed values
    const hashedUserData: Record<string, any> = {};
    if (userData?.email) {
      hashedUserData.em = [hashValue(userData.email)];
    }
    if (userData?.phone) {
      // Normalize Indonesian phone: remove spaces/dashes, convert 08xx to 628xx
      const normalized = userData.phone.replace(/[\s\-]/g, "").replace(/^0/, "62");
      hashedUserData.ph = [hashValue(normalized)];
    }
    if (userData?.externalId) {
      hashedUserData.external_id = [hashValue(userData.externalId)];
    }

    // Build CAPI payload
    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          user_data: hashedUserData,
          custom_data: customData || {},
          action_source: "website",
        },
      ],
    };

    // Send to Meta Conversions API
    const url = `https://graph.facebook.com/v19.0/${config.pixelId}/events?access_token=${config.accessToken}`;
    const bodyToSend: Record<string, any> = { ...payload };
    if (config.testEventCode) {
      bodyToSend.test_event_code = config.testEventCode;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyToSend),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[Meta CAPI] Error:", result);
      return NextResponse.json({ error: "CAPI request failed", details: result }, { status: 200 });
    }

    return NextResponse.json({ success: true, events_received: result.events_received });
  } catch (error) {
    console.error("[Meta CAPI] Unexpected error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 200 });
  }
}
