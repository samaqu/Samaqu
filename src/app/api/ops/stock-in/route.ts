import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isOpsAdmin, unauthorized } from "@/lib/ops-auth";

/**
 * Barang masuk (entity `StockIn` Base44).
 *
 * Satu POST = satu paket barang masuk. Semua baris disimpan atomik lewat RPC
 * `samaqu_stock_in_batch`: insert stock_in + increment stok + update HPP.
 * RPC juga mengarahkan stok series turunan ke produk basis dan memakai
 * `request_id` untuk idempotensi (double submit tidak menggandakan stok).
 */
export async function GET(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "1000", 10) || 1000, 1), 3000);
  const desc = (sp.get("sort") || "").includes("desc");

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("stock_in")
    .select("*")
    .order("created_at", { ascending: !desc })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

type StockInItem = {
  product_id: string;
  variant_color: string;
  variant_size: string;
  qty: number;
  total_price: number;
};

function readItems(body: Record<string, any> | null): StockInItem[] {
  const raw = Array.isArray(body?.items) ? body.items : body ? [body] : [];
  return raw.map((item: Record<string, any>) => ({
    product_id: String(item?.product_id ?? "").trim(),
    variant_color: String(item?.variant_color ?? item?.color ?? "default").trim() || "default",
    variant_size: String(item?.variant_size ?? item?.size ?? "").trim().toUpperCase(),
    qty: Number(item?.qty),
    total_price: Number(item?.total_price ?? 0),
  }));
}

export async function POST(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const body = await req.json();
    const date = String(body?.date ?? "").trim();
    const notes = body?.notes ? String(body.notes) : null;
    const requestId = String(body?.request_id ?? "").trim() || randomUUID();
    const items = readItems(body);

    if (!date) {
      return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "Minimal satu barang masuk" }, { status: 400 });
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = `Baris ${i + 1}`;
      if (!item.product_id) {
        return NextResponse.json({ error: `${row}: pilih produk` }, { status: 400 });
      }
      if (!item.variant_size) {
        return NextResponse.json({ error: `${row}: pilih ukuran` }, { status: 400 });
      }
      if (!Number.isFinite(item.qty) || !Number.isInteger(item.qty) || item.qty < 0) {
        return NextResponse.json({ error: `${row}: jumlah tidak boleh negatif` }, { status: 400 });
      }
      if (!Number.isFinite(item.total_price) || item.total_price < 0) {
        return NextResponse.json({ error: `${row}: total harga tidak valid` }, { status: 400 });
      }
    }

    // Qty 0 = baris dilewati (tidak membuat riwayat stok kosong), tapi batch tetap
    // harus punya minimal satu baris dengan qty > 0.
    const positiveItems = items.filter((item) => item.qty > 0);
    if (positiveItems.length === 0) {
      return NextResponse.json({ error: "Minimal satu barang dengan jumlah lebih dari 0" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("samaqu_stock_in_batch", {
      p_date: date,
      p_items: positiveItems,
      p_notes: notes,
      p_request_id: requestId,
    });

    if (error) {
      // Pesan dari RPC sengaja diteruskan agar admin tahu baris mana yang gagal.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ...(data || {}), request_id: requestId });
  } catch (e) {
    console.error("[OPS] stock-in POST:", e);
    return NextResponse.json({ error: "Gagal menyimpan barang masuk" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isOpsAdmin(req))) return unauthorized();
  try {
    const body = await req.json().catch(() => null);
    const id = body?.id || new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: row } = await admin.from("stock_in").select("*").eq("id", id).maybeSingle();

    // Baris otomatis (pembatalan/retur/tukar size) tidak boleh dihapus dari sini:
    // stoknya sudah diterapkan oleh alur asalnya dan pembalikannya harus lewat alur itu.
    if (row && ["batal", "tukar_size", "return"].includes(String(row.source || ""))) {
      return NextResponse.json(
        { error: "Baris otomatis dari retur/pembatalan tidak bisa dihapus dari sini" },
        { status: 400 },
      );
    }

    // Tarik kembali stoknya LEBIH DULU, baru hapus barisnya.
    // Urutan ini penting: kalau stok tidak cukup untuk ditarik, penghapusan dibatalkan
    // supaya tidak ada baris "barang masuk" hilang tanpa stok ikut berkurang.
    if (row && row.variant_color && row.variant_size && Number(row.qty) > 0) {
      const { data: stokOk, error: stokError } = await admin.rpc("samaqu_increment_stock", {
        p_product_id: row.product_id,
        p_color: String(row.variant_color),
        p_size: String(row.variant_size),
        p_qty: -Math.abs(Number(row.qty)),
      });

      if (stokError) {
        console.error("[OPS] stock-in DELETE tarik stok:", stokError);
        return NextResponse.json(
          { error: "Gagal menarik stok untuk penghapusan ini. Barang masuk tidak dihapus." },
          { status: 500 },
        );
      }

      if (stokOk === false) {
        /*
         * Pesan "sisa X" harus akurat. Fungsi stok mencocokkan case-insensitive dan
         * mengarahkan series turunan ke produk induk (`base_product_id` → `base_size`),
         * jadi pencarian di sini WAJIB memakai aturan yang sama. Kalau tidak, admin diberi
         * angka sisa dari baris yang salah (atau "tidak ditemukan" padahal ada).
         */
        const warna = String(row.variant_color).trim();
        const ukuran = String(row.variant_size).trim();

        // Baris asal (bisa berupa series turunan) untuk menemukan induknya.
        const { data: asalRows } = await admin
          .from("product_variants")
          .select("base_product_id, base_size")
          .eq("product_id", row.product_id)
          .ilike("color", warna)
          .ilike("size", ukuran)
          .limit(1);
        const asal = Array.isArray(asalRows) ? asalRows[0] : null;

        const targetProduct = asal?.base_product_id || row.product_id;
        const targetSize = asal?.base_product_id && asal?.base_size ? String(asal.base_size) : ukuran;

        const { data: targetRows } = await admin
          .from("product_variants")
          .select("stock")
          .eq("product_id", targetProduct)
          .ilike("color", warna)
          .ilike("size", targetSize)
          .limit(1);
        const target = Array.isArray(targetRows) ? targetRows[0] : null;

        const sisa = target?.stock ?? null;
        return NextResponse.json(
          {
            error:
              sisa === null
                ? `Varian ${row.product_name || row.product_id} (${row.variant_color} / ${row.variant_size}) tidak ditemukan di data stok. Barang masuk tidak dihapus.`
                : `Stok ${row.product_name || row.product_id} (${row.variant_color} / ${row.variant_size}) hanya tersisa ${sisa}, tidak cukup untuk menarik ${Math.abs(Number(row.qty))}. Barang masuk tidak dihapus.`,
          },
          { status: 400 },
        );
      }
    }

    const { error, count } = await admin.from("stock_in").delete({ count: "exact" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deleted: count ?? 0 });
  } catch (e) {
    console.error("[OPS] stock-in DELETE:", e);
    return NextResponse.json({ error: "Gagal menghapus barang masuk" }, { status: 500 });
  }
}
