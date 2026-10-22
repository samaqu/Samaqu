import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { affiliateSession, affiliateUnauthorized } from "@/lib/affiliate/auth";
import { referralUrl } from "@/lib/affiliate/site";
import { AFFILIATE_LINK_SOURCES } from "@/lib/affiliate/settings";
import { loadAffiliateLinks } from "@/lib/affiliate/queries";
import type { AffiliateLinkRow } from "@/lib/affiliate/types";

/**
 * Tautan referral affiliate.
 *
 * Kode tautan dibuat server-side (unik) dan bentuknya:
 *   <kode affiliate>-<urutan>  →  https://samaqu.id/r/SAM-AF-00001-001
 * Halaman tujuan dibuat oleh route `/r/[code]` (catat klik + set cookie atribusi).
 */

async function nextLinkCode(affiliateCode: string, affiliateId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("affiliate_links")
    .select("code")
    .eq("affiliate_id", affiliateId);

  const prefix = `${affiliateCode}-`;
  let max = 0;
  for (const row of (data || []) as { code: string }[]) {
    if (!row.code?.startsWith(prefix)) continue;
    const n = Number.parseInt(row.code.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await affiliateSession(req);
  if (!session) return affiliateUnauthorized();

  const supabase = getSupabaseAdmin();
  const links = await loadAffiliateLinks(supabase, session.affiliate.id);

  const orderCounts = new Map<string, number>();
  if (links.length > 0) {
    const { data: commissions } = await supabase
      .from("affiliate_commissions")
      .select("link_id")
      .eq("affiliate_id", session.affiliate.id);
    for (const c of (commissions || []) as { link_id: string | null }[]) {
      if (!c.link_id) continue;
      orderCounts.set(c.link_id, (orderCounts.get(c.link_id) || 0) + 1);
    }
  }

  return NextResponse.json({
    links: links.map((link) => ({
      ...link,
      orders: orderCounts.get(link.id) || 0,
      url: `/r/${link.code}`,
    })),
    sources: AFFILIATE_LINK_SOURCES,
  });
}

export async function POST(req: NextRequest) {
  const session = await affiliateSession(req);
  if (!session) return affiliateUnauthorized();

  if (session.affiliate.status !== "aktif") {
    return NextResponse.json(
      { error: "Tautan referral baru bisa dibuat setelah akun disetujui admin." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const productId = String(body.productId || "").trim();
  const campaignInput = String(body.campaign || "").trim();
  const sourceInput = String(body.source || "").trim();
  const note = String(body.note || "").trim();

  if (!productId) {
    return NextResponse.json({ error: "Pilih produk yang ingin dipromosikan." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: product } = await supabase
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .maybeSingle();
  if (!product) {
    return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
  }

  // Nama kampanye tidak lagi diminta ke affiliate — otomatis pakai nama produk
  // (dipotong 40 karakter). Affiliate tetap boleh mengirim campaign eksplisit
  // lewat API bila perlu.
  const fallbackCampaign = String((product as { name?: string }).name || "Tautan affiliate").trim();
  const campaign = (campaignInput || fallbackCampaign).slice(0, 40);
  const source = sourceInput || null;
  if (source && !AFFILIATE_LINK_SOURCES.includes(source as (typeof AFFILIATE_LINK_SOURCES)[number])) {
    return NextResponse.json({ error: "Sumber promosi tidak dikenal." }, { status: 400 });
  }

  const code = await nextLinkCode(session.affiliate.affiliate_code, session.affiliate.id);

  const { data, error } = await supabase
    .from("affiliate_links")
    .insert({
      affiliate_id: session.affiliate.id,
      code,
      product_id: productId,
      campaign,
      source,
      note: note || null,
      is_active: true,
      click_count: 0,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("[affiliate] Gagal membuat tautan:", error.message);
    return NextResponse.json({ error: "Gagal membuat tautan." }, { status: 500 });
  }

  await supabase.from("affiliate_activity_log").insert({
    affiliate_id: session.affiliate.id,
    actor_type: "affiliate",
    actor_id: session.userId,
    action: "buat_tautan",
    note: `Tautan "${campaign}" dibuat.`,
  });

  const link = data as AffiliateLinkRow;
  return NextResponse.json({ link: { ...link, url: `/r/${link.code}` } });
}

export async function PATCH(req: NextRequest) {
  const session = await affiliateSession(req);
  if (!session) return affiliateUnauthorized();

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "ID tautan wajib diisi." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("affiliate_links")
    .select("*")
    .eq("id", id)
    .eq("affiliate_id", session.affiliate.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Tautan tidak ditemukan." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.campaign === "string") {
    const campaign = body.campaign.trim();
    if (campaign.length < 3) {
      return NextResponse.json({ error: "Nama kampanye minimal 3 karakter." }, { status: 400 });
    }
    patch.campaign = campaign;
  }
  if (typeof body.isActive === "boolean") patch.is_active = body.isActive;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("affiliate_links")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[affiliate] Gagal memperbarui tautan:", error.message);
    return NextResponse.json({ error: "Gagal memperbarui tautan." }, { status: 500 });
  }

  const link = data as AffiliateLinkRow;
  return NextResponse.json({ link: { ...link, url: `/r/${link.code}` } });
}

export async function DELETE(req: NextRequest) {
  const session = await affiliateSession(req);
  if (!session) return affiliateUnauthorized();

  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "ID tautan wajib diisi." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("affiliate_links")
    .select("id, campaign")
    .eq("id", id)
    .eq("affiliate_id", session.affiliate.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Tautan tidak ditemukan." }, { status: 404 });
  }

  // Tautan yang dihapus TIDAK menghapus pesanan/komisi yang sudah teratribusi —
  // riwayat tetap utuh, hanya link referensinya yang dilepas.
  await supabase.from("affiliate_links").update({ is_active: false }).eq("id", id);
  await supabase.from("affiliate_activity_log").insert({
    affiliate_id: session.affiliate.id,
    actor_type: "affiliate",
    actor_id: session.userId,
    action: "hapus_tautan",
    note: `Tautan "${(existing as { campaign: string }).campaign}" dinonaktifkan.`,
  });

  return NextResponse.json({ ok: true });
}
