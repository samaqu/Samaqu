-- Edit item transaksi (manual, website SMQ-, Open Order CYO-) — SATU jalur atomik.
--
-- Jalankan sekali di Supabase SQL Editor SEBELUM memakai tombol Ubah pada pesanan
-- website/Open Order. Tidak ada backfill data lama.
--
-- Yang dilakukan RPC:
--   1. lock baris order + validasi guard (stock_reserved, status, status kirim)
--   2. hitung delta stok per product+warna+ukuran, potong dulu lalu restore
--   3. ganti order_items + snapshot HPP dalam transaksi yang sama
--   4. hitung ulang subtotal/total/berat sesuai rumus sumber
--   5. catat audit sebelum/sesudah
--
-- Stok tetap memakai samaqu_decrement_stock / samaqu_restore_stock yang sudah ada.

alter table orders
  add column if not exists items_edited_at timestamptz,
  add column if not exists items_edited_after_resi boolean not null default false;

create table if not exists order_item_edits (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders (id) on delete cascade,
  actor text,
  edited_at timestamptz not null default now(),
  had_awb boolean not null default false,
  note text,
  before_items jsonb not null default '[]'::jsonb,
  after_items jsonb not null default '[]'::jsonb,
  before_totals jsonb not null default '{}'::jsonb,
  after_totals jsonb not null default '{}'::jsonb
);

create index if not exists idx_order_item_edits_order
  on order_item_edits (order_id, edited_at desc);

alter table order_item_edits enable row level security;

create or replace function public.samaqu_edit_order_items(
  p_order_id text,
  p_actor text,
  p_items jsonb,
  p_hpp_items jsonb,
  p_hpp_goods numeric,
  p_new_weight integer,
  p_addon_product_id text default '',
  p_header jsonb default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders;
  v_group text;
  v_old_weight integer;
  v_old_total numeric;
  v_old_subtotal numeric;
  v_subtotal numeric := 0;
  v_addon numeric := 0;
  v_order_subtotal numeric := 0;
  v_shipping numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_old_items jsonb;
  v_new_items jsonb;
  v_item jsonb;
  v_hpp jsonb;
  v_item_ids uuid[] := '{}';
  v_item_id uuid;
  v_idx int;
  v_old_addon_key text;
  v_new_addon_key text;
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
  v_stock record;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan';
  end if;

  -- Sumber: CYO- dulu, baru SMQ-/website, sisanya manual.
  v_group := case
    when upper(coalesce(v_order.order_number, '')) like 'CYO-%' then 'open_order'
    when upper(coalesce(v_order.order_number, '')) like 'SMQ-%'
      or lower(coalesce(v_order.source, '')) = 'website' then 'website'
    else 'manual'
  end;

  if v_order.stock_reserved is not true then
    raise exception 'Item terkunci karena stok pesanan ini tidak dipotong sistem. Untuk koreksi gunakan batal atau retur.';
  end if;
  if v_order.status not in ('pending', 'diproses') then
    raise exception 'Item hanya bisa diubah saat status Belum Bayar atau Lunas. Untuk koreksi gunakan batal atau retur.';
  end if;
  if coalesce(nullif(trim(v_order.shipping_status), ''), '') not in ('', 'menunggu_pickup') then
    raise exception 'Item terkunci karena pengiriman sudah berjalan. Untuk koreksi gunakan batal atau retur.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu produk harus diisi';
  end if;

  v_old_weight := coalesce(v_order.weight, 0);
  -- Berat baru tidak boleh melebihi berat lama. Pesanan lama tanpa berat tidak dibatasi.
  if v_old_weight > 0 and coalesce(p_new_weight, 0) > v_old_weight then
    raise exception 'Berat item baru melebihi berat pesanan lama. Kurangi qty/berat atau gunakan batal lalu buat order baru.';
  end if;

  -- Baris add-on Open Order tidak boleh berubah (qty, harga, warna, ukuran).
  if v_group = 'open_order' and coalesce(p_addon_product_id, '') <> '' then
    select string_agg(
             coalesce(color, '') || '|' || coalesce(size, '') || '|' ||
             quantity::text || '|' || price::text,
             ',' order by coalesce(color, ''), coalesce(size, ''), price, quantity
           )
      into v_old_addon_key
      from order_items
     where order_id = p_order_id and product_id = p_addon_product_id;

    select string_agg(
             coalesce(x->>'color', '') || '|' || coalesce(x->>'size', '') || '|' ||
             coalesce(x->>'quantity', '0') || '|' || coalesce(x->>'price', '0'),
             ',' order by coalesce(x->>'color', ''), coalesce(x->>'size', ''), coalesce(x->>'price', '0'), coalesce(x->>'quantity', '0')
           )
      into v_new_addon_key
      from jsonb_array_elements(p_items) x
     where x->>'product_id' = p_addon_product_id;

    if coalesce(v_old_addon_key, '') <> coalesce(v_new_addon_key, '') then
      raise exception 'Baris Extra Cover & Hanger tidak boleh diubah.';
    end if;
  end if;

  -- Hitung subtotal & total. Rumus per sumber tidak diubah.
  select
    coalesce(sum(case when x->>'product_id' = p_addon_product_id then 0 else (x->>'quantity')::numeric * (x->>'price')::numeric end), 0),
    coalesce(sum(case when x->>'product_id' = p_addon_product_id then (x->>'quantity')::numeric * (x->>'price')::numeric else 0 end), 0)
    into v_subtotal, v_addon
    from jsonb_array_elements(p_items) x;

  if v_group = 'manual' then
    v_order_subtotal := v_subtotal + v_addon;
    v_shipping := coalesce((p_header->>'shipping_cost')::numeric, v_order.shipping_cost, 0);
    v_discount := coalesce((p_header->>'discount')::numeric, v_order.discount, 0);
    v_total := v_order_subtotal + v_shipping - v_discount;
  elsif v_group = 'open_order' then
    v_order_subtotal := v_subtotal;
    v_shipping := coalesce(v_order.shipping_cost, 0);
    v_discount := coalesce(v_order.discount, 0);
    v_total := v_subtotal + v_addon + v_shipping;
  else
    v_order_subtotal := v_subtotal + v_addon;
    v_shipping := coalesce(v_order.shipping_cost, 0);
    v_discount := coalesce(v_order.discount, 0);
    v_total := v_order_subtotal + v_shipping - v_discount;
  end if;

  v_total := round(v_total, 2);
  v_old_total := round(coalesce(v_order.total, 0), 2);
  if v_group in ('website', 'open_order') and v_total <> v_old_total then
    raise exception 'Total berubah (Rp % → Rp %). Untuk pesanan website/Open Order, gunakan batal lalu buat order baru.', v_old_total, v_total;
  end if;

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

  -- Potong stok tambahan DULU, baru restore yang berkurang.
  for v_stock in
    with old_stock as (
      select product_id,
             coalesce(nullif(trim(color), ''), 'default') as color,
             upper(trim(size)) as size,
             sum(quantity)::int as qty
        from order_items
       where order_id = p_order_id
         and coalesce(trim(product_id), '') <> ''
         and coalesce(trim(product_id), '') <> coalesce(p_addon_product_id, '')
         and coalesce(trim(size), '') <> ''
         and coalesce(nullif(trim(color), ''), 'default') <> '-'
       group by 1, 2, 3
    ),
    new_stock as (
      select trim(x->>'product_id') as product_id,
             coalesce(nullif(trim(x->>'color'), ''), 'default') as color,
             upper(trim(x->>'size')) as size,
             sum((x->>'quantity')::int)::int as qty
        from jsonb_array_elements(p_items) x
       where coalesce(trim(x->>'product_id'), '') <> ''
         and coalesce(trim(x->>'product_id'), '') <> coalesce(p_addon_product_id, '')
         and coalesce(trim(x->>'size'), '') <> ''
         and coalesce(nullif(trim(x->>'color'), ''), 'default') <> '-'
       group by 1, 2, 3
    )
    select coalesce(o.product_id, n.product_id) as product_id,
           coalesce(o.color, n.color) as color,
           coalesce(o.size, n.size) as size,
           coalesce(n.qty, 0) - coalesce(o.qty, 0) as delta
      from old_stock o
      full join new_stock n using (product_id, color, size)
     where coalesce(n.qty, 0) <> coalesce(o.qty, 0)
  loop
    if v_stock.delta > 0 then
      if not public.samaqu_decrement_stock(v_stock.product_id, v_stock.color, v_stock.size, v_stock.delta::int) then
        raise exception 'Stok tambahan tidak cukup untuk % / % / % (butuh %)',
          v_stock.product_id, v_stock.color, v_stock.size, v_stock.delta;
      end if;
    elsif v_stock.delta < 0 then
      perform public.samaqu_restore_stock(v_stock.product_id, v_stock.color, v_stock.size, (-v_stock.delta)::int);
    end if;
  end loop;

  -- Ganti item. id baru dipakai untuk memasangkan snapshot HPP.
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
      case when trim(v_item->>'product_id') = coalesce(p_addon_product_id, '')
           then null
           else coalesce(nullif(trim(v_item->>'color'), ''), 'default') end,
      case when trim(v_item->>'product_id') = coalesce(p_addon_product_id, '')
           then null
           else nullif(upper(trim(v_item->>'size')), '') end,
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

  -- Update header order. Untuk website/CYO hanya field item/berat yang berubah;
  -- payment/invoice/source/alamat tidak disentuh.
  if v_group = 'manual' and p_header is not null then
    update orders set
      customer_name = coalesce(nullif(trim(p_header->>'customer_name'), ''), customer_name),
      customer_whatsapp = coalesce(nullif(trim(p_header->>'customer_whatsapp'), ''), customer_whatsapp),
      customer_id = coalesce(nullif(trim(p_header->>'customer_id'), ''), customer_id),
      source = coalesce(nullif(trim(p_header->>'source'), ''), source),
      shipping_address = coalesce(nullif(trim(p_header->>'shipping_address'), ''), shipping_address),
      shipping_city = coalesce(nullif(trim(p_header->>'shipping_city'), ''), shipping_city),
      shipping_kecamatan = coalesce(nullif(trim(p_header->>'shipping_kecamatan'), ''), shipping_kecamatan),
      shipping_province = coalesce(nullif(trim(p_header->>'shipping_province'), ''), shipping_province),
      shipping_postal_code = coalesce(nullif(trim(p_header->>'shipping_postal_code'), ''), shipping_postal_code),
      shipping_notes = nullif(trim(p_header->>'shipping_notes'), ''),
      shipping_cost = v_shipping,
      shipping_method = coalesce(nullif(trim(p_header->>'shipping_method'), ''), shipping_method),
      discount = v_discount,
      created_at = coalesce(nullif(p_header->>'created_at', '')::timestamptz, created_at),
      subtotal = v_order_subtotal,
      total = v_total,
      weight = p_new_weight,
      items_edited_at = now(),
      items_edited_after_resi = coalesce(nullif(v_order.awb_no, ''), '') <> '',
      updated_at = now()
    where id = p_order_id;
  else
    update orders set
      subtotal = v_order_subtotal,
      total = v_total,
      weight = p_new_weight,
      items_edited_at = now(),
      items_edited_after_resi = coalesce(nullif(v_order.awb_no, ''), '') <> '',
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
    p_order_id, p_actor, coalesce(nullif(v_order.awb_no, ''), '') <> '', p_note,
    v_old_items, v_new_items,
    jsonb_build_object('subtotal', v_old_subtotal, 'total', v_old_total, 'weight', v_old_weight),
    jsonb_build_object('subtotal', v_order_subtotal, 'total', v_total, 'weight', p_new_weight)
  );

  return jsonb_build_object(
    'subtotal', v_subtotal,
    'total', v_total,
    'weight', p_new_weight,
    'items_edited_after_resi', coalesce(nullif(v_order.awb_no, ''), '') <> ''
  );
end;
$$;

revoke execute on function public.samaqu_edit_order_items(text, text, jsonb, jsonb, numeric, integer, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.samaqu_edit_order_items(text, text, jsonb, jsonb, numeric, integer, text, jsonb, text) to service_role;
