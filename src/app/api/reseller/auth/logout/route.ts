import { NextRequest, NextResponse } from "next/server";
import { revokeResellerSession } from "@/lib/reseller/auth";

/** Logout reseller: hapus sesi (hash token) dari database. */
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  await revokeResellerSession(token);
  return NextResponse.json({ ok: true });
}
