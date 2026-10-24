-- KOREKSI LOLOS QC (turun) setelah jadwal Selesai.
--
-- Prinsip:
--   * Riwayat penerimaan tidak diubah.
--   * Koreksi dicatat sebagai audit baru + movement stok keluar.
--   * Stok barang jadi memakai stock_movements (bukan tabel stok baru).
--   * Kontribusi HPP jadwal dikurangi, lalu production_finished_hpp dihitung ulang
--     memakai fungsi production_refresh_finished_hpp yang sudah ada.

create table if not exists production_qc_corrections (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  schedule_id uuid not null references production_schedules (id) on delete restrict,
  product_id text not null,
  product_name text,
  color text not null default 'default',
  size text not null,
  qty_before integer not null,
  qty_after integer not null,
  delta integer not null check (delta > 0),
  stock_before integer not null,
  stock_after integer not null,
  hpp_before numeric(14, 2),
  hpp_after numeric(14, 2),
  final_lolos_before integer,
  final_lolos_after integer,
  reason text not null,
  actor text,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_qc_corrections_schedule
  on production_qc_corrections (schedule_id, created_at desc);

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

  select stock into v_stock
    from product_variants
   where product_id = p_product_id
     and lower(coalesce(color, '')) = lower(v_color)
     and upper(size) = v_size
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
   where product_id = p_product_id
     and lower(coalesce(color, '')) = lower(v_color)
     and upper(size) = v_size;

  insert into stock_movements (
    product_id, color, size, qty, direction, source, ref_type, ref_id,
    before_stock, after_stock, actor_name, notes
  ) values (
    p_product_id, v_color, v_size, v_delta, 'out', 'koreksi_produksi',
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

alter table production_qc_corrections enable row level security;

revoke all on function production_correct_qc(uuid, text, text, text, integer, text, text, text) from public;
grant execute on function production_correct_qc(uuid, text, text, text, integer, text, text, text) to service_role;

comment on table production_qc_corrections is
  'Audit koreksi lolos QC turun. Riwayat penerimaan asli tidak diubah.';
comment on function production_correct_qc(uuid, text, text, text, integer, text, text, text) is
  'Koreksi lolos QC turun: stok keluar, audit, kontribusi HPP, dan HPP final dihitung ulang.';
