import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, opsIdentity, unauthorized } from "@/lib/ops-auth";
import { preorderDemand, variantKey } from "@/lib/preorder";
import {
  isServiceLine,
  loadWaitingPreorders,
  markPreorderReady,
  planWaitingPreorders,
  type WaitingPreorder,
} from "@/lib/preorder-server";

/**
 * Menu "Pre-Order": ringkasan antrean PO dan tombol "stok sudah ready".
 *
 * - GET  : PO yang menunggu stok, kebutuhan per produk/warna/ukuran vs stok saat ini, dan rencana
 *          alokasi urut siapa transfer duluan (FIFO).
 * - POST : `{ action: "ready", order_number }` satu PO, atau `{ action: "ready_all" }` semua PO yang
 *          stoknya cukup, urut siapa transfer duluan. PO yang stoknya belum cukup DILEWATI tanpa
 *          menghalangi PO lain. Satu PO diproses seluruhnya (semua item dikirim bersamaan) atau tidak sama sekali.
 *
 * Tidak ada WA di sini: customer sudah dikabari saat PO dicatat. Resi tetap dibuat manual lewat alur reguler.
 */

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const admin = getSupabaseAdmin();
    const { waiting, stock, plan } = await planWaitingPreorders(admin);

    const readyIds = new Set(plan.ready.map((order) => order.id));
    const shortById = new Map(plan.skipped.map((entry) => [entry.order.id, entry.short]));

    const demand = preorderDemand(waiting, isServiceLine);
    const productIds = [...new Set(demand.map((row) => row.product_id))];
    const { data: products } = productIds.length
      ? await admin.from("products").select("id, name, series").in("id", productIds)
      : { data: [] as any[] };
    const nameOf = new Map((products || []).map((p: any) => [String(p.id), { name: String(p.name || ""), series: p.series ?? null }]));

    return NextResponse.json({
      waiting_count: waiting.length,
      ready_now_count: plan.ready.length,
      orders: waiting.map((order) => ({
        id: order.id,
        order_number: order.order_number,
        created_at: order.created_at,
        customer_name: order.customer_name,
        preorder_estimate: order.preorder_estimate,
        can_ready: readyIds.has(order.id),
        short: (shortById.get(order.id) || []).map((entry) => ({ ...entry })),
      })),
      demand: demand.map((row) => ({
        ...row,
        product_name: nameOf.get(row.product_id)?.name || row.product_id,
        series: nameOf.get(row.product_id)?.series ?? null,
        stock: stock.get(variantKey(row)) ?? 0,
      })),
    });
  } catch (e) {
    console.error("[OPS] preorder GET:", e);
    return NextResponse.json({ error: "Gagal memuat antrean pre-order" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const admin = getSupabaseAdmin();
    const actor = String((await opsIdentity(req))?.email || "ops");

    if (action === "ready") {
      const orderNumber = String(body?.order_number || "").trim();
      if (!orderNumber) return bad("Nomor pesanan wajib diisi");
      const waiting = await loadWaitingPreorders(admin);
      const order = waiting.find((entry) => entry.order_number === orderNumber);
      if (!order) return bad("Pre-order ini tidak sedang menunggu stok (sudah ready, dibatalkan, atau bukan pre-order).");
      const result = await markPreorderReady(admin, order);
      if (!result.ok) return bad(result.message);
      console.log("[PREORDER] ready:", orderNumber, "oleh", actor);
      return NextResponse.json({ ok: true, order_number: orderNumber });
    }

    if (action === "ready_all") {
      const { plan } = await planWaitingPreorders(admin);
      const readied: string[] = [];
      const failed: { order_number: string; message: string }[] = [];
      for (const planned of plan.ready) {
        const order = planned as WaitingPreorder;
        const result = await markPreorderReady(admin, order);
        if (result.ok) readied.push(order.order_number);
        else failed.push({ order_number: order.order_number, message: result.message });
      }
      console.log("[PREORDER] ready_all:", readied.length, "siap,", failed.length, "gagal, oleh", actor);
      return NextResponse.json({
        ok: true,
        readied,
        failed,
        skipped: plan.skipped.map((entry) => ({
          order_number: entry.order.order_number,
          short: entry.short,
        })),
      });
    }

    return bad("Aksi tidak dikenal");
  } catch (e) {
    console.error("[OPS] preorder POST:", e);
    return NextResponse.json({ error: "Gagal memproses pre-order" }, { status: 500 });
  }
}
