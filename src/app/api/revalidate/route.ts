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

  const productId = typeof body.productId === "string" ? body.productId.trim() : "";

  /*
   * Sengaja SEMPIT: setiap `revalidatePath` = satu penulisan cache (ISR write), dan pola
   * dinamis seperti `/[locale]/katalog/[id]` membuang cache SEMUA produk (111 × 2 bahasa)
   * hanya karena satu produk disimpan. Pemakaian ISR write paket Hobby ada batasnya
   * (200K/bulan), jadi di sini hanya yang benar-benar berubah yang disegarkan.
   *
   * - Home: menampilkan produk unggulan/terbaru → tetap disegarkan.
   * - Daftar katalog: menampilkan status stok/harga → tetap disegarkan.
   * - Detail produk: HANYA produk yang disebut. Tanpa `productId`, halaman detail tidak
   *   disentuh sama sekali dan mengandalkan `revalidate` berkala milik layout-nya.
   */
  revalidatePath("/");
  revalidatePath("/[locale]", "page");
  revalidatePath("/katalog");
  revalidatePath("/[locale]/katalog", "page");
  // Bio statis (tanpa revalidate berkala) — disegarkan hanya saat admin menyimpan
  // konten bio / jendela Open Order.
  revalidatePath("/bio");
  // FAQ juga statis; disegarkan saat admin menyimpan konten website.
  revalidatePath("/[locale]/faq", "page");

  if (productId) {
    for (const locale of LOCALES) {
      revalidatePath(`/${locale}/katalog/${productId}`);
    }
    // Pola dinamis TIDAK dipakai lagi — itu yang membuang cache seluruh katalog.
  }

  return NextResponse.json({ revalidated: true, productId: productId || null, timestamp: Date.now() });
}
