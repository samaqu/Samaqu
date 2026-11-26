import { NextRequest, NextResponse } from "next/server";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";
import { readPromoAktif } from "@/lib/promo/ongkir-promo-server";

/**
 * Promo yang berlaku HARI INI (WIB) untuk bot WhatsApp: free ongkir Jabodetabek, potongan ongkir luar
 * Jabodetabek (+ persen), dan bonus Free Cover Hanger khusus bot. HANYA MEMBACA.
 *
 * Aturan saklar + tanggal dihitung di SATU tempat (`lib/promo/ongkir-promo.ts`) yang sama dipakai checkout
 * dan draft, jadi bot tidak menghitung tanggal sendiri. Promo FCH website (`promo_fch_*`) tidak dibaca di sini.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const promo = await readPromoAktif();
    return NextResponse.json({
      today: promo.today,
      ongkirJabodetabek: promo.jabo,
      ongkirLuar: promo.luar,
      ongkirLuarPersen: promo.luarPercent,
      // Batas maksimal potongan (Rp) per order; teks promo untuk customer dibaca dari angka ini, tidak ditulis di persona.
      ongkirJaboMax: promo.jaboMax,
      ongkirLuarMax: promo.luarMax,
      fchBot: promo.fchBot,
    });
  } catch (error) {
    console.error("[OPS] promo-status GET:", error);
    return NextResponse.json({ error: "Gagal membaca status promo" }, { status: 500 });
  }
}
