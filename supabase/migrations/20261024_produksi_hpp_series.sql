-- HPP PRODUKSI PER SERIES + WARNING KELENGKAPAN
--
-- * Kontribusi HPP disimpan pada produk series yang diproduksi, bukan produk induk
--   tempat stok menumpang. Stok tetap memakai jalur sharing yang sama.
-- * Koreksi QC mengurangi stok di produk induk, tetapi kontribusi/HPP tetap series.
-- * Data lama TIDAK dihapus. Baris lama yang sudah terlanjur memakai product_id induk
--   tetap ada dan perlu dibackfill terpisah bila ingin rata-rata historis per series.
--
-- Jalankan sekali di Supabase SQL Editor.

alter table production_order_hpp_items
  add column if not exists hpp_warning text;
create or replace function production_save_receipt(
  p_schedule_id uuid,
  p_payload jsonb,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_schedule production_schedules;
  v_receipt production_receipts;
  v_item jsonb;
  v_cost jsonb;
  v_stock jsonb;
  v_hpp jsonb;
  v_number text;
  v_prefix text;
  v_next int;
  v_total_lolos int := 0;
  v_total_rework int := 0;
  v_total_reject int := 0;
  v_resolved_lolos int := 0;
  v_resolved_reject int := 0;
  v_outstanding numeric;
  v_base_product text;
  v_base_size text;
  v_old_qty numeric;
  v_old_hpp numeric;
  v_new_qty numeric;
  v_new_hpp numeric;
  v_qty numeric;
  v_hpp_price numeric;
  v_key record;
  v_sort int := 0;
begin
  select * into v_schedule from production_schedules where id = p_schedule_id for update;
  if v_schedule.id is null then raise exception 'Jadwal tidak ditemukan'; end if;
  if v_schedule.status <> 'berjalan' then raise exception 'Penerimaan hanya untuk jadwal Berjalan'; end if;
  if jsonb_typeof(p_payload->'items') <> 'array' or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'Minimal satu baris hasil';
  end if;

  -- Validasi outstanding rework sebelum menerima resolusi rework.
  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    if not exists (
      select 1 from production_schedule_targets
      where id = (v_item->>'target_id')::uuid and schedule_id = p_schedule_id
    ) then
      raise exception 'Baris target bukan milik jadwal ini';
    end if;

    select coalesce(sum(i.qty_rework), 0)
         - coalesce(sum(i.rework_to_lolos + i.rework_to_reject), 0)
      into v_outstanding
      from production_receipt_items i
      join production_receipts r on r.id = i.receipt_id
     where r.schedule_id = p_schedule_id
       and i.target_id = (v_item->>'target_id')::uuid
       and i.size = v_item->>'size';

    if coalesce((v_item->>'rework_to_lolos')::int, 0)
       + coalesce((v_item->>'rework_to_reject')::int, 0) > v_outstanding then
      raise exception 'Rework yang diselesaikan melebihi rework tersisa untuk target/ukuran %', v_item->>'size';
    end if;

    if (coalesce((v_item->>'qty_reject')::int, 0) > 0
        or coalesce((v_item->>'rework_to_reject')::int, 0) > 0)
       and nullif(btrim(coalesce(v_item->>'reject_reason', '')), '') is null then
      raise exception 'Alasan reject wajib diisi';
    end if;

    v_total_lolos := v_total_lolos + coalesce((v_item->>'qty_lolos')::int, 0);
    v_total_rework := v_total_rework + coalesce((v_item->>'qty_rework')::int, 0);
    v_total_reject := v_total_reject + coalesce((v_item->>'qty_reject')::int, 0);
    v_resolved_lolos := v_resolved_lolos + coalesce((v_item->>'rework_to_lolos')::int, 0);
    v_resolved_reject := v_resolved_reject + coalesce((v_item->>'rework_to_reject')::int, 0);
  end loop;

  if v_total_lolos + v_total_rework + v_total_reject + v_resolved_lolos + v_resolved_reject = 0 then
    raise exception 'Isi minimal satu jumlah lolos, rework, reject, atau resolusi rework';
  end if;

  v_prefix := 'RC-' || to_char(coalesce(nullif(p_payload->>'date', '')::date, current_date), 'YYYYMM') || '-';
  select coalesce(max(substring(receipt_number from length(v_prefix) + 1)::int), 0) + 1
    into v_next
    from production_receipts
   where receipt_number like v_prefix || '%';
  v_number := v_prefix || lpad(v_next::text, 4, '0');

  insert into production_receipts (
    receipt_number, schedule_id, received_date, notes,
    total_lolos, total_rework, total_reject,
    rework_to_lolos, rework_to_reject,
    material_cost, non_material_cost, total_cost,
    hpp_per_pcs, hpp_standard, actor
  ) values (
    v_number, p_schedule_id,
    coalesce(nullif(p_payload->>'date', '')::date, current_date),
    nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
    v_total_lolos, v_total_rework, v_total_reject,
    v_resolved_lolos, v_resolved_reject,
    coalesce((p_payload->>'material_cost')::numeric, 0),
    coalesce((p_payload->>'non_material_cost')::numeric, 0),
    coalesce((p_payload->>'total_cost')::numeric, 0),
    coalesce((p_payload->>'hpp_per_pcs')::numeric, 0),
    coalesce((p_payload->>'hpp_standard')::numeric, 0),
    nullif(p_actor, '')
  ) returning * into v_receipt;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    insert into production_receipt_items (
      receipt_id, target_id, size, qty_lolos, qty_rework, qty_reject,
      rework_to_lolos, rework_to_reject, reject_reason, notes
    ) values (
      v_receipt.id,
      (v_item->>'target_id')::uuid,
      v_item->>'size',
      coalesce((v_item->>'qty_lolos')::int, 0),
      coalesce((v_item->>'qty_rework')::int, 0),
      coalesce((v_item->>'qty_reject')::int, 0),
      coalesce((v_item->>'rework_to_lolos')::int, 0),
      coalesce((v_item->>'rework_to_reject')::int, 0),
      nullif(btrim(coalesce(v_item->>'reject_reason', '')), ''),
      nullif(btrim(coalesce(v_item->>'notes', '')), '')
    );
  end loop;

  for v_cost in select * from jsonb_array_elements(coalesce(p_payload->'costs', '[]'::jsonb)) loop
    v_sort := v_sort + 1;
    insert into production_receipt_costs (receipt_id, name, group_label, amount, source, sort_order)
    values (
      v_receipt.id,
      btrim(v_cost->>'name'),
      nullif(btrim(coalesce(v_cost->>'group_label', '')), ''),
      coalesce((v_cost->>'amount')::numeric, 0),
      coalesce(nullif(v_cost->>'source', ''), 'recipe'),
      v_sort
    );
  end loop;

  -- Stok barang jadi lewat jalur Barang Masuk yang sama.
  if jsonb_typeof(p_payload->'stock_items') = 'array'
     and jsonb_array_length(p_payload->'stock_items') > 0 then
    perform samaqu_stock_in_batch(
      coalesce(nullif(p_payload->>'date', '')::date, current_date),
      p_payload->'stock_items',
      'Produksi ' || v_schedule.schedule_number,
      'receipt:' || v_receipt.id::text
    );
  end if;

  -- Kontribusi HPP estimasi per varian (basis stok setelah resolusi sharing).
  for v_hpp in select * from jsonb_array_elements(coalesce(p_payload->'hpp_items', '[]'::jsonb)) loop
    v_qty := coalesce((v_hpp->>'qty')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    v_hpp_price := coalesce((v_hpp->>'hpp_per_pcs')::numeric, 0);

    -- HPP disimpan pada produk SERIES yang benar-benar diproduksi. Stok tetap
    -- masuk lewat `samaqu_stock_in_batch` yang mengarahkan ke base_product_id.
    insert into production_schedule_hpp_contributions (
      schedule_id, receipt_id, product_id, color, size, qty, hpp_value, is_final
    ) values (
      p_schedule_id, v_receipt.id, v_hpp->>'product_id',
      coalesce(v_hpp->>'color', 'default'), upper(coalesce(v_hpp->>'size', '')),
      v_qty, round(v_hpp_price, 2), false
    );
  end loop;

  for v_key in
    select distinct product_id, color, size
      from production_schedule_hpp_contributions
     where receipt_id = v_receipt.id
  loop
    perform production_refresh_finished_hpp(v_key.product_id, v_key.color, v_key.size);
  end loop;

  return jsonb_build_object(
    'receipt_id', v_receipt.id,
    'receipt_number', v_receipt.receipt_number,
    'total_lolos', v_total_lolos,
    'total_rework', v_total_rework,
    'total_reject', v_total_reject
  );
end $$;

create or replace function production_correct_qc(
  p_schedule_id uuid,
  p_product_id text,
  p_color text,
  p_size text,
  p_new_lolos integer,
  p_reason text,
  p_request_id text,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_schedule production_schedules;
  v_existing production_qc_corrections;
  v_product_name text;
  v_color text := coalesce(nullif(btrim(p_color), ''), 'default');
  v_size text := upper(btrim(p_size));
  v_qty_before numeric;
  v_delta integer;
  v_remaining numeric;
  v_take numeric;
  v_row record;
  v_stock integer;
  v_stock_after integer;
  v_final_lolos integer;
  v_new_final_lolos integer;
  v_final_total numeric;
  v_new_hpp numeric;
  v_key record;
  v_base_product text;
  v_base_size text;
  v_base_color text;
begin
  if nullif(btrim(coalesce(p_request_id, '')), '') is null then
    raise exception 'request_id wajib diisi';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Alasan koreksi wajib diisi';
  end if;
  if p_new_lolos is null or p_new_lolos < 1 then
    raise exception 'Lolos QC baru minimal 1. Lolos 0 tidak didukung; gunakan pembatalan/koreksi terpisah.';
  end if;

  select * into v_schedule
    from production_schedules
   where id = p_schedule_id
   for update;
  if v_schedule.id is null then
    raise exception 'Jadwal tidak ditemukan';
  end if;
  if v_schedule.status <> 'selesai' then
    raise exception 'Koreksi hanya untuk jadwal berstatus Selesai';
  end if;

  -- Idempotensi request. Request kedua dengan request_id sama tidak memotong stok lagi.
  select * into v_existing
    from production_qc_corrections
   where request_id = p_request_id;
  if found then
    if v_existing.schedule_id <> p_schedule_id
       or v_existing.product_id <> p_product_id
       or lower(v_existing.color) <> lower(v_color)
       or upper(v_existing.size) <> v_size then
      raise exception 'request_id sudah dipakai untuk koreksi lain';
    end if;
    return jsonb_build_object(
      'already', true,
      'request_id', p_request_id,
      'qty_after', v_existing.qty_after,
      'delta', v_existing.delta
    );
  end if;

  select coalesce(sum(qty), 0)
    into v_qty_before
    from production_schedule_hpp_contributions
   where schedule_id = p_schedule_id
     and product_id = p_product_id
     and lower(color) = lower(v_color)
     and upper(size) = v_size;

  if v_qty_before <= 0 then
    raise exception 'Varian ini tidak punya kontribusi produksi di jadwal';
  end if;
  if p_new_lolos > v_qty_before then
    raise exception 'Koreksi naik tidak didukung. Gunakan penerimaan susulan.';
  end if;
  if p_new_lolos = v_qty_before then
    raise exception 'Tidak ada perubahan: qty lolos sudah %', v_qty_before;
  end if;

  v_delta := (v_qty_before - p_new_lolos)::integer;
  if v_delta <= 0 then
    raise exception 'Selisih koreksi tidak valid';
  end if;

  v_final_lolos := coalesce(
    v_schedule.final_lolos,
    (select coalesce(sum(total_lolos + rework_to_lolos), 0)
       from production_receipts where schedule_id = p_schedule_id)
  )::integer;
  if v_final_lolos <= 0 then
    raise exception 'Lolos QC final jadwal tidak valid';
  end if;

  v_new_final_lolos := v_final_lolos - v_delta;
  if v_new_final_lolos < 1 then
    raise exception 'Lolos QC final akan menjadi 0. Koreksi ini tidak didukung.';
  end if;

  v_final_total := v_schedule.final_total_cost;
  if v_final_total is null then
    raise exception 'HPP final jadwal belum tersedia';
  end if;
  v_new_hpp := round(v_final_total / v_new_final_lolos, 2);

  select name into v_product_name from products where id = p_product_id;

  -- Kontribusi HPP memakai produk series; stok tetap di produk induk (sharing).
  select base_product_id, base_size, color
    into v_base_product, v_base_size, v_base_color
    from product_variants
   where product_id = p_product_id
     and lower(coalesce(color, '')) = lower(v_color)
     and upper(size) = v_size
   limit 1;
  v_base_product := coalesce(v_base_product, p_product_id);
  v_base_size := upper(coalesce(v_base_size, v_size));
  v_base_color := coalesce(nullif(v_base_color, ''), v_color);

  select stock into v_stock
    from product_variants
   where product_id = v_base_product
     and lower(coalesce(color, '')) = lower(v_base_color)
     and upper(size) = v_base_size
   for update;
  if not found then
    raise exception 'Varian stok % ukuran % tidak ditemukan', p_product_id, v_size;
  end if;
  if v_stock < v_delta then
    raise exception 'Stok barang jadi saat ini % pcs, koreksi %, kurang % pcs. Koreksi ditolak.',
      v_stock, v_delta, v_delta - v_stock;
  end if;

  v_stock_after := v_stock - v_delta;

  update product_variants
     set stock = v_stock_after
   where product_id = v_base_product
     and lower(coalesce(color, '')) = lower(v_base_color)
     and upper(size) = v_base_size;

  insert into stock_movements (
    product_id, color, size, qty, direction, source, ref_type, ref_id,
    before_stock, after_stock, actor_name, notes
  ) values (
    v_base_product, v_base_color, v_base_size, v_delta, 'out', 'koreksi_produksi',
    'production_schedule', p_schedule_id, v_stock, v_stock_after,
    nullif(p_actor, ''),
    'Koreksi Produksi ' || v_schedule.schedule_number || ' — ' || btrim(p_reason)
  );

  insert into production_qc_corrections (
    request_id, schedule_id, product_id, product_name, color, size,
    qty_before, qty_after, delta, stock_before, stock_after,
    hpp_before, hpp_after, final_lolos_before, final_lolos_after,
    reason, actor
  ) values (
    p_request_id, p_schedule_id, p_product_id, v_product_name, v_color, v_size,
    v_qty_before::integer, p_new_lolos, v_delta, v_stock, v_stock_after,
    v_schedule.final_hpp, v_new_hpp, v_final_lolos, v_new_final_lolos,
    btrim(p_reason), nullif(p_actor, '')
  );

  -- Kurangi qty kontribusi varian ini. Baris yang habis dihapus.
  v_remaining := v_delta;
  for v_row in
    select id, qty
      from production_schedule_hpp_contributions
     where schedule_id = p_schedule_id
       and product_id = p_product_id
       and lower(color) = lower(v_color)
       and upper(size) = v_size
     order by created_at asc
     for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_row.qty, v_remaining);

    if v_row.qty - v_take <= 0 then
      delete from production_schedule_hpp_contributions where id = v_row.id;
    else
      update production_schedule_hpp_contributions
         set qty = qty - v_take,
             updated_at = now()
       where id = v_row.id;
    end if;

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Kontribusi varian tidak cukup untuk koreksi % pcs', v_delta;
  end if;

  update production_schedule_hpp_contributions
     set hpp_value = v_new_hpp,
         is_final = true,
         updated_at = now()
   where schedule_id = p_schedule_id;

  update production_schedules
     set final_lolos = v_new_final_lolos,
         final_hpp = v_new_hpp,
         updated_at = now()
   where id = p_schedule_id;

  perform production_refresh_finished_hpp(p_product_id, v_color, v_size);

  for v_key in
    select distinct product_id, color, size
      from production_schedule_hpp_contributions
     where schedule_id = p_schedule_id
       and not (product_id = p_product_id and lower(color) = lower(v_color) and upper(size) = v_size)
  loop
    perform production_refresh_finished_hpp(v_key.product_id, v_key.color, v_key.size);
  end loop;

  return jsonb_build_object(
    'already', false,
    'request_id', p_request_id,
    'qty_before', v_qty_before,
    'qty_after', p_new_lolos,
    'delta', v_delta,
    'stock_before', v_stock,
    'stock_after', v_stock_after,
    'hpp_before', v_schedule.final_hpp,
    'hpp_after', v_new_hpp,
    'final_lolos_before', v_final_lolos,
    'final_lolos_after', v_new_final_lolos
  );
end $$;
comment on function production_save_receipt(uuid, jsonb, text) is
  'Penerimaan hasil: stok lewat stock-in bersama, kontribusi HPP pada produk series.';
comment on function production_correct_qc(uuid, text, text, text, integer, text, text, text) is
  'Koreksi QC: stok induk berkurang, kontribusi/HPP tetap pada produk series.';