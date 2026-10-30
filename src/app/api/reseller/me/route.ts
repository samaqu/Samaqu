import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { resellerSession, resellerUnauthorized } from "@/lib/reseller/auth";
import { getResellerBalance } from "@/lib/reseller/saldo";
import { getResellerSettings } from "@/lib/reseller/settings";
import { isBsiBank, normalizeBankValue } from "@/lib/reseller/banks";

/** Profil reseller + saldo + pengaturan (rekening BSI top up, biaya admin). */
export async function GET(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const { reseller } = session;
  const [balance, settings] = await Promise.all([
    getResellerBalance(reseller.id),
    getResellerSettings(),
  ]);

  return NextResponse.json({
    reseller: {
      id: reseller.id,
      store_name: reseller.store_name,
      owner_name: reseller.owner_name,
      whatsapp: reseller.whatsapp,
      city: reseller.city,
      store_info: reseller.store_info,
      social_media: reseller.social_media,
      bank_name: reseller.bank_name,
      bank_number: reseller.bank_number,
      bank_holder: reseller.bank_holder,
      status: reseller.status,
    },
    saldo: balance ?? { saldo_tersedia: 0, saldo_ditahan: 0, saldo_total: 0 },
    pengaturan: {
      admin_fee_non_bsi: settings.adminFeeNonBsi,
      bsi_bank_name: settings.bsiBankName,
      bsi_account_number: settings.bsiAccountNumber,
      bsi_account_holder: settings.bsiAccountHolder,
      qris_image_url: settings.qrisImageUrl,
      rekening_bsi: isBsiBank(reseller.bank_name),
    },
  });
}

/** Ubah rekening bank tujuan penarikan (milik sendiri). */
export async function PATCH(req: NextRequest) {
  const session = await resellerSession(req);
  if (!session) return resellerUnauthorized();

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const bankName = typeof body.bank_name === "string" ? body.bank_name.trim() : "";
  const bankNumber = typeof body.bank_number === "string" ? body.bank_number.trim() : "";
  const bankHolder = typeof body.bank_holder === "string" ? body.bank_holder.trim() : "";

  if (!bankName || !bankNumber || !bankHolder) {
    return NextResponse.json(
      { error: "Nama bank, nomor rekening, dan nama pemilik wajib diisi." },
      { status: 400 }
    );
  }
  if (bankNumber.replace(/\D/g, "").length < 6) {
    return NextResponse.json({ error: "Nomor rekening tidak valid." }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("resellers")
    .update({
      // Simpan KODE bank bila dikenal ("BSI", "BCA", …); "Lainnya" tetap teks bebas.
      bank_name: normalizeBankValue(bankName),
      bank_number: bankNumber,
      bank_holder: bankHolder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.reseller.id);

  if (error) {
    console.error("[RESELLER] Gagal menyimpan rekening:", error.message);
    return NextResponse.json({ error: "Gagal menyimpan rekening" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
