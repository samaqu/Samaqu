-- Pre-Order (PO) — Fase 0: database.
--
-- ADITIF SEMUA. Tidak mengubah baris yang ada, tidak mengubah fungsi lama
-- (samaqu_edit_order_items dan fungsi stok tetap persis seperti sebelumnya).
--
-- Konsep: PO = baris `orders` biasa + penanda. Bukan tabel terpisah dan bukan status baru,
-- supaya laporan (SALE_STATUSES), kartu, stok, kemasan, dan retur tetap membaca satu tabel.
--
--   is_preorder        true = pesanan pre-order. Default false => semua pesanan lama tetap reguler.
--   preorder_estimate  teks estimasi untuk customer, mis. "7-10 hari kerja" (bisa diedit per pesanan).
--   preorder_ready_at  diisi saat stok PO sudah dipotong ("stok sudah ready"). NULL = masih menunggu.
--
-- Rollback: supabase/rollback/20261115_preorder_flags_rollback.sql
-- Uji:      supabase/testing/20261115_preorder_flags_test.sql (selalu di-rollback)

begin;

alter table public.orders
  add column if not exists is_preorder boolean not null default false,
  add column if not exists preorder_estimate text,
  add column if not exists preorder_ready_at timestamptz;

-- Antrean PO yang masih menunggu stok (menu Pre-Order, urut siapa transfer duluan).
-- Parsial, jadi kecil: hanya PO yang belum ready.
create index if not exists idx_orders_preorder_waiting
  on public.orders (created_at)
  where is_preorder = true and preorder_ready_at is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- Edit item PO yang MASIH MENUNGGU STOK.
--
-- Salinan samaqu_edit_order_items TANPA bagian stok: PO belum memotong stok
-- (stock_reserved = false), jadi mengubah item tidak boleh memotong atau mengembalikan stok.
-- Jejak audit (order_item_edits) dan snapshot HPP ditulis seperti fungsi aslinya.
--
-- Hanya untuk transaksi manual ops. Setelah stok ready (preorder_ready_at terisi) PO diperlakukan
-- seperti pesanan reguler, dan itu memakai samaqu_edit_order_items yang lama.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_edit_preorder_items(
  p_order_id text,
  p_actor text,
  p_items jsonb,
  p_hpp_items jsonb,
  p_hpp_goods numeric,
  p_new_weight integer,
  p_header jsonb default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order orders;
  v_subtotal numeric := 0;
  v_shipping numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_old_total numeric;
  v_old_subtotal numeric;
  v_old_weight integer;
  v_old_items jsonb;
  v_new_items jsonb;
  v_item jsonb;
  v_hpp jsonb;
  v_item_ids uuid[] := '{}';
  v_item_id uuid;
  v_idx int;
  v_old_hpp production_order_hpp;
  v_packaging_cost numeric := 0;
  v_packaging_status text := 'belum';
  v_use_cover_hanger boolean := false;
  v_packaging_warning boolean := false;
  v_request_id text;
  v_packaged_at timestamptz;
  v_packaged_by text;
  v_returned_at timestamptz;
  v_return_reason text;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan';
  end if;

  if v_order.is_preorder is not true then
    raise exception 'Bukan pesanan pre-order. Gunakan edit item pesanan biasa.';
  end if;
  if v_order.preorder_ready_at is not null then
    raise exception 'Stok pre-order sudah ready. Item terkunci seperti pesanan biasa; untuk koreksi gunakan batal atau retur.';
  end if;
  if v_order.stock_reserved is true then
    raise exception 'Stok pesanan ini sudah dipotong sistem. Gunakan edit item pesanan biasa.';
  end if;
  if upper(coalesce(v_order.order_number, '')) like 'CYO-%'
     or upper(coalesce(v_order.order_number, '')) like 'SMQ-%'
     or lower(coalesce(v_order.source, '')) = 'website' then
    raise exception 'Pre-order hanya untuk transaksi manual ops.';
  end if;
  if v_order.status not in ('pending', 'diproses') then
    raise exception 'Item hanya bisa diubah saat status Belum Bayar atau Lunas. Untuk koreksi gunakan batal.';
  end if;
  if coalesce(nullif(trim(v_order.shipping_status), ''), '') not in ('', 'menunggu_pickup') then
    raise exception 'Item terkunci karena pengiriman sudah berjalan.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu produk harus diisi';
  end if;

  v_old_weight := coalesce(v_order.weight, 0);

  select coalesce(sum((x->>'quantity')::numeric * (x->>'price')::numeric), 0)
    into v_subtotal
    from jsonb_array_elements(p_items) x;

  v_shipping := coalesce((p_header->>'shipping_cost')::numeric, v_order.shipping_cost, 0);
  v_discount := coalesce((p_header->>'discount')::numeric, v_order.discount, 0);
  v_total := round(v_subtotal + v_shipping - v_discount, 2);
  v_old_total := round(coalesce(v_order.total, 0), 2);

  -- Audit: kondisi sebelum.
  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id), '[]'::jsonb)
    into v_old_items
    from order_items oi
   where oi.order_id = p_order_id;
  v_old_subtotal := coalesce(v_order.subtotal, 0);

  -- Snapshot HPP: simpan field kemasan yang sudah ada, lalu ganti isi barang.
  select * into v_old_hpp from production_order_hpp where order_id = p_order_id;
  if found then
    v_packaging_cost := coalesce(v_old_hpp.packaging_cost, 0);
    v_packaging_status := coalesce(v_old_hpp.packaging_status, 'belum');
    v_use_cover_hanger := coalesce(v_old_hpp.use_cover_hanger, false);
    v_packaging_warning := coalesce(v_old_hpp.packaging_warning, false);
    v_request_id := v_old_hpp.request_id;
    v_packaged_at := v_old_hpp.packaged_at;
    v_packaged_by := v_old_hpp.packaged_by;
    v_returned_at := v_old_hpp.returned_at;
    v_return_reason := v_old_hpp.return_reason;
  end if;
  delete from production_order_hpp where order_id = p_order_id;

  -- TIDAK ADA pemotongan/pengembalian stok di sini (PO belum memegang stok).

  delete from order_items where order_id = p_order_id;

  for v_item, v_idx in
    select value, (ordinality - 1)::int
      from jsonb_array_elements(p_items) with ordinality
  loop
    insert into order_items (
      order_id, product_id, product_name, series, kain, color, size,
      quantity, price, customer_price, minimum_price, product_image
    ) values (
      p_order_id,
      trim(v_item->>'product_id'),
      nullif(trim(v_item->>'product_name'), ''),
      nullif(trim(v_item->>'series'), ''),
      nullif(trim(v_item->>'kain'), ''),
      coalesce(nullif(trim(v_item->>'color'), ''), 'default'),
      nullif(upper(trim(v_item->>'size')), ''),
      greatest(1, (v_item->>'quantity')::int),
      coalesce((v_item->>'price')::numeric, 0),
      nullif(v_item->>'customer_price', '')::numeric,
      nullif(v_item->>'minimum_price', '')::numeric,
      nullif(trim(v_item->>'product_image'), '')
    ) returning id into v_item_id;
    v_item_ids := array_append(v_item_ids, v_item_id);
  end loop;

  if p_hpp_items is not null and jsonb_typeof(p_hpp_items) = 'array' then
    for v_hpp in select value from jsonb_array_elements(p_hpp_items)
    loop
      v_idx := (v_hpp->>'line_index')::int;
      if v_idx is not null and v_idx >= 0 and v_idx < array_length(v_item_ids, 1) then
        insert into production_order_hpp_items (
          order_id, order_item_id, product_id, product_name, color, size,
          quantity, hpp_unit, hpp_total, source, hpp_warning
        ) values (
          p_order_id,
          v_item_ids[v_idx + 1],
          trim(v_hpp->>'product_id'),
          nullif(trim(v_hpp->>'product_name'), ''),
          nullif(trim(v_hpp->>'color'), ''),
          nullif(trim(v_hpp->>'size'), ''),
          coalesce((v_hpp->>'quantity')::int, 0),
          nullif(v_hpp->>'hpp_unit', '')::numeric,
          nullif(v_hpp->>'hpp_total', '')::numeric,
          coalesce(nullif(v_hpp->>'source', ''), 'none'),
          nullif(v_hpp->>'hpp_warning', '')
        );
      end if;
    end loop;
  end if;

  insert into production_order_hpp (
    order_id, hpp_goods, packaging_cost, total_hpp, packaging_status,
    use_cover_hanger, packaging_warning, request_id, packaged_at, packaged_by,
    returned_at, return_reason, updated_at
  ) values (
    p_order_id, coalesce(p_hpp_goods, 0), v_packaging_cost,
    coalesce(p_hpp_goods, 0) + v_packaging_cost, v_packaging_status,
    v_use_cover_hanger, v_packaging_warning, v_request_id, v_packaged_at, v_packaged_by,
    v_returned_at, v_return_reason, now()
  )
  on conflict (order_id) do update set
    hpp_goods = excluded.hpp_goods,
    packaging_cost = excluded.packaging_cost,
    total_hpp = excluded.total_hpp,
    packaging_status = excluded.packaging_status,
    use_cover_hanger = excluded.use_cover_hanger,
    packaging_warning = excluded.packaging_warning,
    request_id = excluded.request_id,
    packaged_at = excluded.packaged_at,
    packaged_by = excluded.packaged_by,
    returned_at = excluded.returned_at,
    return_reason = excluded.return_reason,
    updated_at = now();

  if p_header is not null then
    update orders set
      customer_name = coalesce(nullif(trim(p_header->>'customer_name'), ''), customer_name),
      customer_whatsapp = coalesce(nullif(trim(p_header->>'customer_whatsapp'), ''), customer_whatsapp),
      customer_id = coalesce(nullif(trim(p_header->>'customer_id'), '')::uuid, customer_id),
      shipping_address = coalesce(nullif(trim(p_header->>'shipping_address'), ''), shipping_address),
      shipping_city = coalesce(nullif(trim(p_header->>'shipping_city'), ''), shipping_city),
      shipping_kecamatan = coalesce(nullif(trim(p_header->>'shipping_kecamatan'), ''), shipping_kecamatan),
      shipping_province = coalesce(nullif(trim(p_header->>'shipping_province'), ''), shipping_province),
      shipping_postal_code = coalesce(nullif(trim(p_header->>'shipping_postal_code'), ''), shipping_postal_code),
      shipping_notes = nullif(trim(p_header->>'shipping_notes'), ''),
      shipping_cost = v_shipping,
      shipping_method = coalesce(nullif(trim(p_header->>'shipping_method'), ''), shipping_method),
      discount = v_discount,
      preorder_estimate = coalesce(nullif(trim(p_header->>'preorder_estimate'), ''), preorder_estimate),
      subtotal = v_subtotal,
      total = v_total,
      weight = p_new_weight,
      items_edited_at = now(),
      items_edited_after_resi = false,
      updated_at = now()
    where id = p_order_id;
  else
    update orders set
      subtotal = v_subtotal,
      total = v_total,
      weight = p_new_weight,
      items_edited_at = now(),
      items_edited_after_resi = false,
      updated_at = now()
    where id = p_order_id;
  end if;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id), '[]'::jsonb)
    into v_new_items
    from order_items oi
   where oi.order_id = p_order_id;

  insert into order_item_edits (
    order_id, actor, had_awb, note, before_items, after_items, before_totals, after_totals
  ) values (
    p_order_id, p_actor, false, p_note,
    v_old_items, v_new_items,
    jsonb_build_object('subtotal', v_old_subtotal, 'total', v_old_total, 'weight', v_old_weight),
    jsonb_build_object('subtotal', v_subtotal, 'total', v_total, 'weight', p_new_weight)
  );

  return jsonb_build_object(
    'subtotal', v_subtotal,
    'total', v_total,
    'weight', p_new_weight
  );
end;
$function$;

-- Sama seperti fungsi edit lama: hanya service_role yang boleh memanggil.
revoke all on function public.samaqu_edit_preorder_items(text, text, jsonb, jsonb, numeric, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.samaqu_edit_preorder_items(text, text, jsonb, jsonb, numeric, integer, jsonb, text)
  to service_role;

commit;
