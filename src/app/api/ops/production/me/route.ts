import { NextRequest, NextResponse } from "next/server";
import { opsIdentity } from "@/lib/ops-auth";

/** Status akses menu Produksi untuk shell /ops (menu dirender dari jawaban ini). */
export async function GET(req: NextRequest) {
  const identity = await opsIdentity(req);
  if (!identity) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  const allowed = identity.role === "owner" || identity.role === "leader";
  return NextResponse.json({
    allowed,
    role: allowed ? identity.role : "other",
    can_write: identity.role === "owner",
    email: identity.email,
  });
}
