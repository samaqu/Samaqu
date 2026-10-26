import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isOpsAdmin } from "@/lib/ops-auth";

const LOCALES = ["id", "en"];

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { secret?: string; productId?: string };

  // Dua jalur sah: server-to-server memakai REVALIDATE_SECRET, atau admin yang sudah login
  // (token Supabase) — browser admin TIDAK lagi membawa secret apa pun.
  const serverSecret = String(process.env.REVALIDATE_SECRET || "");
  const secretOk = Boolean(serverSecret) && body.secret === serverSecret;
  const adminOk = await isOpsAdmin(request);
  if (!secretOk && !adminOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const productId = typeof body.productId === "string" ? body.productId : null;

  // Home + katalog: tanpa prefix bahasa (route lama, sebagian halaman masih diakses begini)…
  revalidatePath("/");
  revalidatePath("/katalog");
  // …dan pola route dinamis (localePrefix default = "always") untuk Home, katalog, & detail produk.
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/katalog", "page");
  revalidatePath("/[locale]/katalog/[id]", "page");

  // Bila komponen pemanggil menyebut id produk tertentu, segarkan halamannya langsung
  // (lebih pasti daripada hanya mengandalkan pola route dinamis).
  if (productId) {
    for (const locale of LOCALES) {
      revalidatePath(`/${locale}`);
      revalidatePath(`/${locale}/katalog`);
      revalidatePath(`/${locale}/katalog/${productId}`);
    }
  }

  return NextResponse.json({ revalidated: true, timestamp: Date.now() });
}
