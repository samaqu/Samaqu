-- PENERIMAAN HASIL & QC — FASE 4.
--
-- Stok barang jadi SELALU lewat RPC yang sama dengan menu Barang Masuk:
-- `samaqu_stock_in_batch` (total_price = 0 supaya products.hpp tidak berubah).
-- HPP varian disimpan di tabel baru production_finished_hpp.
--
-- Penerimaan bersifat append-only. Koreksi = penerimaan baru.

alter table production_schedules
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by text,
  add column if not exists closing_notes text,
  add column if not exists estimated_hpp numeric(14, 2),
  add column if not exists final_hpp numeric(14, 2),
  add column if not exists final_material_cost numeric(14, 2),
  add column if not exists final_non_material_cost numeric(14, 2),
  add column if not exists final_total_cost numeric(14, 2),
  add column if not exists final_lolos integer;

create sequence if not exists production_receipt_seq start 1;

create table if not exists production_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique
    default ('RC-' || to_char(current_date, 'YYYYMM') || '-' || lpad(nextval('production_receipt_seq')::text, 4, '0')),
  schedule_id uuid not null references production_schedules (id) on delete restrict,
  received_date date not null,
  notes text,
  total_lolos integer not null default 0,
  total_rework integer not null default 0,
  total_reject integer not null default 0,
  rework_to_lolos integer not null default 0,
  rework_to_reject integer not null default 0,
  material_cost numeric(14, 2) not null default 0,
  non_material_cost numeric(14, 2) not null default 0,
  total_cost numeric(14, 2) not null default 0,
  hpp_per_pcs numeric(14, 2) not null default 0,
  hpp_standard numeric(14, 2) not null default 0,
  actor text,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_receipts_schedule
  on production_receipts (schedule_id, received_date, created_at);

create table if not exists production_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references production_receipts (id) on delete cascade,
  target_id uuid not null references production_schedule_targets (id) on delete restrict,
  size text not null,
  qty_lolos integer not null default 0 check (qty_lolos >= 0),
  qty_rework integer not null default 0 check (qty_rework >= 0),
  qty_reject integer not null default 0 check (qty_reject >= 0),
  rework_to_lolos integer not null default 0 check (rework_to_lolos >= 0),
  rework_to_reject integer not null default 0 check (rework_to_reject >= 0),
  reject_reason text,
  notes text,
  created_at timestamptz not null default now(),
  unique (receipt_id, target_id, size)
);

create index if not exists idx_production_receipt_items_receipt
  on production_receipt_items (receipt_id);
create index if not exists idx_production_receipt_items_target
  on production_receipt_items (target_id, size);

create table if not exists production_receipt_costs (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references production_receipts (id) on delete cascade,
  name text not null,
  group_label text,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  source text not null default 'recipe',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_receipt_costs_receipt
  on production_receipt_costs (receipt_id, sort_order);

create table if not exists production_finished_hpp (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  color text not null default 'default',
  size text not null,
  qty_received numeric(14, 4) not null default 0,
  hpp_avg numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, color, size)
);

-- Kontribusi HPP per jadwal. Saat Selesai, nilai estimasi diganti final,
-- lalu production_finished_hpp dihitung ulang dari kontribusi ini.
create table if not exists production_schedule_hpp_contributions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references production_schedules (id) on delete cascade,
  receipt_id uuid not null references production_receipts (id) on delete restrict,
  product_id text not null,
  color text not null default 'default',
  size text not null,
  qty numeric(14, 4) not null check (qty > 0),
  hpp_value numeric(14, 2) not null default 0,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_production_hpp_contrib_schedule
  on production_schedule_hpp_contributions (schedule_id);
create index if not exists idx_production_hpp_contrib_variant
  on production_schedule_hpp_contributions (product_id, color, size);

-- Hitung ulang rata-rata HPP produksi untuk satu varian dari seluruh kontribusi.
create or replace function production_refresh_finished_hpp(
  p_product_id text,
  p_color text,
  p_size text
) returns void
language plpgsql as $$
declare
  v_qty numeric;
  v_value numeric;
begin
  select coalesce(sum(qty), 0), coalesce(sum(qty * hpp_value), 0)
    into v_qty, v_value
    from production_schedule_hpp_contributions
   where product_id = p_product_id
     and color = p_color
     and size = p_size;

  if v_qty > 0 then
    insert into production_finished_hpp (product_id, color, size, qty_received, hpp_avg, updated_at)
    values (p_product_id, p_color, p_size, v_qty, round(v_value / v_qty, 2), now())
    on conflict (product_id, color, size) do update set
      qty_received = excluded.qty_received,
      hpp_avg = excluded.hpp_avg,
      updated_at = now();
  else
    delete from production_finished_hpp
     where product_id = p_product_id and color = p_color and size = p_size;
  end if;
end $$;

-- Append-only untuk data penerimaan.
create or replace function production_guard_receipt() returns trigger
language plpgsql as $$
begin
  raise exception 'Penerimaan hasil bersifat append-only. Buat penerimaan penyesuaian baru.';
end $$;

drop trigger if exists trg_production_receipts_append_only on production_receipts;
create trigger trg_production_receipts_append_only
  before update or delete on production_receipts
  for each row execute function production_guard_receipt();

drop trigger if exists trg_production_receipt_items_append_only on production_receipt_items;
create trigger trg_production_receipt_items_append_only
  before update or delete on production_receipt_items
  for each row execute function production_guard_receipt();

drop trigger if exists trg_production_receipt_costs_append_only on production_receipt_costs;
create trigger trg_production_receipt_costs_append_only
  before update or delete on production_receipt_costs
  for each row execute function production_guard_receipt();

-- ── Keluarkan bahan tambahan saat Berjalan ──────────────────────────────────
create or replace function production_issue_schedule_materials(
  p_schedule_id uuid,
  p_items jsonb,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_row production_schedules;
  v_item jsonb;
  v_comp production_components;
  v_qty numeric;
  v_stock numeric;
  v_count int := 0;
begin
  select * into v_row from production_schedules where id = p_schedule_id for update;
  if v_row.id is null then raise exception 'Jadwal tidak ditemukan'; end if;
  if v_row.status <> 'berjalan' then raise exception 'Hanya jadwal Berjalan yang bisa menambah bahan'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu komponen';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_qty <= 0 then continue; end if;

    select * into v_comp from production_components
     where id = (v_item->>'component_id')::uuid for update;
    if v_comp.id is null then raise exception 'Komponen tidak ditemukan'; end if;

    if not exists (
      select 1 from production_schedule_requirements
      where schedule_id = p_schedule_id and component_id = v_comp.id
    ) then
      raise exception 'Komponen % bukan kebutuhan jadwal ini', v_comp.code;
    end if;

    select coalesce(sum(qty), 0) into v_stock
      from production_stock_movements where component_id = v_comp.id;
    if v_stock < v_qty then
      raise exception 'Stok % (%) tidak cukup: tersedia %, diminta %',
        v_comp.name, v_comp.code, v_stock, v_qty;
    end if;

    insert into production_stock_movements (
      component_id, movement_date, type, qty, unit_price, ref_type, ref_id, notes, actor
    ) values (
      v_comp.id, current_date, 'keluar_produksi', -v_qty, v_comp.real_price,
      'production_schedule', p_schedule_id,
      'Keluarkan Bahan Tambahan ' || v_row.schedule_number,
      nullif(p_actor, '')
    );
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'Tidak ada komponen dengan jumlah lebih dari 0'; end if;
  return jsonb_build_object('issued', v_count);
end $$;

-- ── Simpan penerimaan hasil + stock-in + HPP ───────────────────────────────
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

    select base_product_id, base_size
      into v_base_product, v_base_size
      from product_variants
     where product_id = v_hpp->>'product_id'
       and lower(coalesce(color, '')) = lower(coalesce(v_hpp->>'color', 'default'))
       and lower(coalesce(size, '')) = lower(coalesce(v_hpp->>'size', ''))
     limit 1;

    v_base_product := coalesce(v_base_product, v_hpp->>'product_id');
    v_base_size := upper(coalesce(v_base_size, v_hpp->>'size'));

    insert into production_schedule_hpp_contributions (
      schedule_id, receipt_id, product_id, color, size, qty, hpp_value, is_final
    ) values (
      p_schedule_id, v_receipt.id, v_base_product,
      coalesce(v_hpp->>'color', 'default'), v_base_size, v_qty, round(v_hpp_price, 2), false
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

-- ── Tutup jadwal: retur sisa + Selesai ─────────────────────────────────────
create or replace function production_complete_schedule(
  p_schedule_id uuid,
  p_items jsonb,
  p_notes text default '',
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_row production_schedules;
  v_item jsonb;
  v_comp production_components;
  v_qty numeric;
  v_issued numeric;
  v_returned numeric;
  v_outstanding numeric;
  v_issue_price numeric;
  v_final_material numeric;
  v_final_non_material numeric;
  v_final_total numeric;
  v_final_lolos numeric;
  v_estimated_total numeric;
  v_estimated_hpp numeric;
  v_final_hpp numeric;
  v_key record;
  v_count int := 0;
begin
  select * into v_row from production_schedules where id = p_schedule_id for update;
  if v_row.id is null then raise exception 'Jadwal tidak ditemukan'; end if;
  if v_row.status <> 'berjalan' then raise exception 'Hanya jadwal Berjalan yang bisa ditutup'; end if;

  select coalesce(sum(i.qty_rework), 0)
       - coalesce(sum(i.rework_to_lolos + i.rework_to_reject), 0)
    into v_outstanding
    from production_receipt_items i
    join production_receipts r on r.id = i.receipt_id
   where r.schedule_id = p_schedule_id;
  if v_outstanding > 0 then
    raise exception 'Masih ada % pcs rework yang belum diselesaikan', v_outstanding;
  end if;

  if jsonb_typeof(p_items) = 'array' then
    for v_item in select * from jsonb_array_elements(p_items) loop
      v_qty := coalesce((v_item->>'qty')::numeric, 0);
      if v_qty <= 0 then continue; end if;

      select * into v_comp from production_components
       where id = (v_item->>'component_id')::uuid for update;
      if v_comp.id is null then raise exception 'Komponen tidak ditemukan'; end if;

      if not exists (
        select 1 from production_schedule_requirements
        where schedule_id = p_schedule_id and component_id = v_comp.id
      ) then
        raise exception 'Komponen % bukan kebutuhan jadwal ini', v_comp.code;
      end if;

      select coalesce(sum(-qty), 0) into v_issued
        from production_stock_movements
       where component_id = v_comp.id and ref_type = 'production_schedule'
         and ref_id = p_schedule_id and type = 'keluar_produksi';
      select coalesce(sum(qty), 0) into v_returned
        from production_stock_movements
       where component_id = v_comp.id and ref_type = 'production_schedule'
         and ref_id = p_schedule_id and type = 'retur_sisa_bahan';

      if v_qty > v_issued - v_returned then
        raise exception 'Retur % (%) melebihi sisa yang dikeluarkan (%)',
          v_comp.name, v_comp.code, v_issued - v_returned;
      end if;

      -- Nilai retur memakai harga rata-rata saat bahan dikeluarkan, bukan
      -- harga komponen yang mungkin sudah berubah.
      select case
        when coalesce(sum(-qty), 0) > 0
          then sum((-qty) * unit_price) / sum(-qty)
        else v_comp.real_price
      end
        into v_issue_price
        from production_stock_movements
       where component_id = v_comp.id and ref_type = 'production_schedule'
         and ref_id = p_schedule_id and type = 'keluar_produksi';

      insert into production_stock_movements (
        component_id, movement_date, type, qty, unit_price, ref_type, ref_id, notes, actor
      ) values (
        v_comp.id, current_date, 'retur_sisa_bahan', v_qty, coalesce(v_issue_price, v_comp.real_price),
        'production_schedule', p_schedule_id,
        'Retur Sisa Bahan ' || v_row.schedule_number,
        nullif(p_actor, '')
      );
      v_count := v_count + 1;
    end loop;
  end if;

  -- Biaya bahan final = pemakaian aktual (keluar − retur) x harga saat keluar.
  select coalesce(sum(
    case when type = 'keluar_produksi' then (-qty) * unit_price
         else -qty * unit_price end
  ), 0)
    into v_final_material
    from production_stock_movements
   where ref_type = 'production_schedule' and ref_id = p_schedule_id
     and type in ('keluar_produksi', 'retur_sisa_bahan');
  v_final_material := greatest(0, round(v_final_material, 2));

  select coalesce(sum(non_material_cost), 0),
         coalesce(sum(total_cost), 0),
         coalesce(sum(total_lolos + rework_to_lolos), 0)
    into v_final_non_material, v_estimated_total, v_final_lolos
    from production_receipts
   where schedule_id = p_schedule_id;

  v_estimated_hpp := case when v_final_lolos > 0 then v_estimated_total / v_final_lolos else 0 end;
  v_final_total := round(v_final_material + v_final_non_material, 2);
  v_final_hpp := case when v_final_lolos > 0 then v_final_total / v_final_lolos else 0 end;

  -- Ganti kontribusi estimasi jadwal ini dengan HPP final, lalu hitung ulang
  -- rata-rata produksi per varian dari seluruh kontribusi.
  update production_schedule_hpp_contributions
     set hpp_value = round(v_final_hpp, 2),
         is_final = true,
         updated_at = now()
   where schedule_id = p_schedule_id;

  for v_key in
    select distinct product_id, color, size
      from production_schedule_hpp_contributions
     where schedule_id = p_schedule_id
  loop
    perform production_refresh_finished_hpp(v_key.product_id, v_key.color, v_key.size);
  end loop;

  update production_schedules set
    status = 'selesai',
    completed_at = now(),
    completed_by = nullif(p_actor, ''),
    closing_notes = nullif(btrim(coalesce(p_notes, '')), ''),
    estimated_hpp = round(v_estimated_hpp, 2),
    final_hpp = round(v_final_hpp, 2),
    final_material_cost = v_final_material,
    final_non_material_cost = round(v_final_non_material, 2),
    final_total_cost = v_final_total,
    final_lolos = v_final_lolos::int,
    updated_at = now()
  where id = p_schedule_id;

  return jsonb_build_object(
    'status', 'selesai',
    'returned', v_count,
    'estimated_hpp', round(v_estimated_hpp, 2),
    'final_hpp', round(v_final_hpp, 2),
    'final_material_cost', v_final_material,
    'final_non_material_cost', round(v_final_non_material, 2),
    'final_total_cost', v_final_total,
    'final_lolos', v_final_lolos::int
  );
end $$;

alter table production_receipts enable row level security;
alter table production_receipt_items enable row level security;
alter table production_receipt_costs enable row level security;
alter table production_finished_hpp enable row level security;
alter table production_schedule_hpp_contributions enable row level security;

revoke all on function production_issue_schedule_materials(uuid, jsonb, text) from public;
revoke all on function production_save_receipt(uuid, jsonb, text) from public;
revoke all on function production_complete_schedule(uuid, jsonb, text, text) from public;
revoke all on function production_refresh_finished_hpp(text, text, text) from public;

grant execute on function production_issue_schedule_materials(uuid, jsonb, text) to service_role;
grant execute on function production_save_receipt(uuid, jsonb, text) to service_role;
grant execute on function production_complete_schedule(uuid, jsonb, text, text) to service_role;
grant execute on function production_refresh_finished_hpp(text, text, text) to service_role;

comment on table production_receipts is
  'Penerimaan hasil produksi (append-only). Menyimpan total QC, biaya, HPP aktual & standar.';
comment on table production_receipt_items is
  'Rincian hasil per target/ukuran: lolos, rework, reject, resolusi rework.';
comment on table production_finished_hpp is
  'HPP rata-rata produksi per varian (basis stok sharing), dihitung dari kontribusi jadwal.';
comment on table production_schedule_hpp_contributions is
  'Kontribusi HPP per jadwal/varian. Estimasi diganti final saat jadwal Selesai.';
