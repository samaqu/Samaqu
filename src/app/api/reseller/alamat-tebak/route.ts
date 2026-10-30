import { NextRequest, NextResponse } from "next/server";
import { WILAYAH_PROVINSI, citiesOfProvince, districtsOfCity, provinceOfCity } from "@/lib/kota";
import { kodePosDariWilayah } from "@/lib/kodepos";
import { deteksiAlamat } from "@/lib/alamat-deteksi";
import { checkRateLimit } from "@/lib/rate-limit";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";

/**
 * "Tempel alamat, isi otomatis" untuk form pesanan reseller.
 *
 * Logika deteksi TIDAK diubah — memanggil `deteksiAlamat` yang sama dengan
 * endpoint admin (/api/ops/alamat-tebak), hanya guard-nya sesi reseller dan
 * diberi rate limit karena bisa diakses portal.
 *
 *   POST /api/reseller/alamat-tebak  { text }  →  hasil deteksi
 * Hanya membaca: tidak menulis database dan tidak memanggil layanan luar.
 */
export async function POST(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const limited = await checkRateLimit(req, "reseller-alamat-tebak", 30, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "");
    if (!text.trim()) return NextResponse.json({ error: "Teks alamat masih kosong" }, { status: 400 });

    return NextResponse.json(
      deteksiAlamat(text, {
        provinces: WILAYAH_PROVINSI,
        citiesOf: citiesOfProvince,
        districtsOf: districtsOfCity,
        provinceOfCity,
        postalOf: kodePosDariWilayah,
      })
    );
  } catch (error) {
    console.error("[RESELLER] alamat-tebak:", error);
    return NextResponse.json({ error: "Gagal membaca teks alamat" }, { status: 500 });
  }
}
