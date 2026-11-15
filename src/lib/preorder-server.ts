import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isPotongPanjangLine } from "@/lib/layanan";
import { recordStockAnomaly, resolveFailureReason, stockFailureMessage } from "@/lib/stock-guard";
import {
  planPreorderReady,
  variantKey,
  type PreorderLine,
  type PreorderPlan,
  type PreorderPlanOrder,
} from "@/lib/preorder";

/**
 * Sisi server Pre-Order: membaca antrean PO, membaca stok, dan menandai "stok sudah ready".
 * Pemotongan stok memakai RPC yang SAMA dengan transaksi ops (`samaqu_decrement_stock`, ref = id
 * pesanan), jadi aturan stok bersama/komponen tidak ada versi kedua.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;

export interface WaitingPreorder extends PreorderPlanOrder {
  customer_name: string;
  customer_whatsapp: string;
  preorder_estimate: string | null;
  lines: Array<PreorderLine & { product_name: string }>;
}

/** Baris layanan (mis. jasa potong panjang) tidak punya stok. */
export const isServiceLine = (line: { product_id?: unknown; product_name?: unknown }) => isPotongPanjangLine(line);

/** Semua PO yang sudah Lunas dan menunggu stok, urut siapa transfer duluan. */
export async function loadWaitingPreorders(admin: Admin): Promise<WaitingPreorder[]> {
  const { data, error } = await admin
    .from("orders")
    .select(
      "id, order_number, created_at, customer_name, customer_whatsapp, preorder_estimate, order_items(product_id, product_name, color, size, quantity)",
    )
    .eq("is_preorder", true)
    .is("preorder_ready_at", null)
    .eq("status", "diproses")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  return (data || []).map((row: any) => {
    const lines = ((row.order_items || []) as any[]).map((item) => ({
      product_id: String(item.product_id || ""),
      product_name: String(item.product_name || ""),
      color: item.color ?? null,
      size: item.size ?? null,
      quantity: Number(item.quantity) || 0,
    }));
    return {
      id: String(row.id),
      order_number: String(row.order_number),
      created_at: String(row.created_at),
      customer_name: String(row.customer_name || ""),
      customer_whatsapp: String(row.customer_whatsapp || ""),
      preorder_estimate: row.preorder_estimate ?? null,
      items: lines,
      lines,
    };
  });
}

/** Stok efektif per varian (sumber yang sama dengan halaman ops: VIEW `product_variant_stock`). */
export async function effectiveStockMap(admin: Admin, productIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = [...new Set(productIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin
      .from("product_variant_stock")
      .select("product_id, color, size, effective_stock")
      .in("product_id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      map.set(variantKey(row as any), Math.max(0, Number((row as any).effective_stock) || 0));
    }
  }
  return map;
}

/** Rencana FIFO untuk PO yang menunggu, dari stok saat ini. */
export async function planWaitingPreorders(
  admin: Admin,
  waiting?: WaitingPreorder[],
): Promise<{ waiting: WaitingPreorder[]; stock: Map<string, number>; plan: PreorderPlan }> {
  const list = waiting ?? (await loadWaitingPreorders(admin));
  const stock = await effectiveStockMap(
    admin,
    list.flatMap((order) => order.items.map((item) => item.product_id)),
  );
  return { waiting: list, stock, plan: planPreorderReady(list, stock, isServiceLine) };
}

interface StockLine {
  product_id: string;
  color: string | null;
  size: string | null;
  quantity: number;
  product_name: string;
}

function stockedLines(lines: Array<PreorderLine & { product_name: string }>): StockLine[] {
  return lines
    .filter((line) => line.product_id && line.size && line.quantity > 0 && !isServiceLine(line))
    .map((line) => ({
      product_id: line.product_id,
      color: line.color ?? null,
      size: line.size ?? null,
      quantity: line.quantity,
      product_name: line.product_name,
    }));
}

async function deductLines(admin: Admin, lines: StockLine[], orderId: string) {
  const done: StockLine[] = [];
  for (const line of lines) {
    const { data, error } = await admin.rpc("samaqu_decrement_stock", {
      p_product_id: line.product_id,
      p_color: line.color,
      p_size: line.size,
      p_qty: line.quantity,
      p_ref_type: "component",
      p_ref_id: orderId,
    });
    if (error) return { ok: false as const, done, message: "Gagal memeriksa stok produk" };
    if (data === false) {
      const reason = await resolveFailureReason(admin, line.product_id, line.color ?? "", line.size ?? "");
      return {
        ok: false as const,
        done,
        message: stockFailureMessage(reason ?? "insufficient_stock", line.product_name, line.color ?? "", line.size ?? ""),
      };
    }
    done.push(line);
  }
  return { ok: true as const, done };
}

async function restoreLines(admin: Admin, lines: StockLine[], orderId: string) {
  for (const line of lines) {
    const { error } = await admin.rpc("samaqu_restore_stock", {
      p_product_id: line.product_id,
      p_color: line.color,
      p_size: line.size,
      p_qty: line.quantity,
      p_ref_type: "component",
      p_ref_id: orderId,
    });
    if (error) {
      console.error("[PREORDER] Rollback stok gagal:", { orderId, line, message: error.message });
      await recordStockAnomaly(admin, {
        productId: line.product_id,
        color: line.color,
        size: line.size,
        qty: line.quantity,
        reason: "rollback_restore_failed",
        orderId,
        source: "preorder-ready-rollback",
      });
    }
  }
}

export type ReadyResult = { ok: true } | { ok: false; message: string };

/**
 * Tandai satu PO "stok sudah ready": potong stok semua itemnya, lalu SEKALI tulis
 * `stock_reserved = true` + `preorder_ready_at`. Sesudahnya PO mengikuti alur pesanan reguler.
 *
 * Aman terhadap dobel klik/dua admin: penulisan akhir bersyarat (`preorder_ready_at is null`);
 * yang kalah membalikkan stoknya sendiri. Kalau stok kurang, tidak ada yang berubah.
 */
export async function markPreorderReady(admin: Admin, order: WaitingPreorder): Promise<ReadyResult> {
  const lines = stockedLines(order.lines);
  const deducted = await deductLines(admin, lines, order.id);
  if (!deducted.ok) {
    await restoreLines(admin, deducted.done, order.id);
    return { ok: false, message: deducted.message };
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("orders")
    .update({ stock_reserved: true, preorder_ready_at: now, updated_at: now })
    .eq("id", order.id)
    .eq("is_preorder", true)
    .is("preorder_ready_at", null)
    .eq("status", "diproses")
    .select("id");

  if (error || !data || data.length === 0) {
    await restoreLines(admin, deducted.done, order.id);
    if (error) {
      console.error("[PREORDER] Gagal menandai ready:", order.order_number, error.message);
      return { ok: false, message: "Gagal menyimpan status ready. Stok dikembalikan; coba lagi." };
    }
    return { ok: false, message: "Pre-order ini sudah ditandai ready atau tidak lagi menunggu stok." };
  }
  return { ok: true };
}
