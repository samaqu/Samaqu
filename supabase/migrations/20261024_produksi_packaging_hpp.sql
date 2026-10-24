-- FASE 5: packaging pesanan + snapshot HPP order.
--
-- Titik "dikemas" = saat resi terbit (createJnt / manualResi), karena stage
-- `sudah_dipacking` di order-flow memang diturunkan dari `awb_no`.
--
-- Riwayat produk tetap di product_variants/stock_movements. Packaging memakai
-- ledger komponen production_stock_movements dengan jenis keluar_packaging /
-- retur_packaging.

create table if not exists production_order_hpp (
  order_id text primary key references orders (id) on delete cascade,
  hpp_goods numeric(14, 2) not null default 0,
  packaging_cost numeric(14, 2) not null default 0,
  total_hpp numeric(14, 2) not null default 0,
  packaging_status text not null default 'belum',
  use_cover_hanger boolean not null default false,
  packaging_warning boolean not null default false,
  request_id text unique,
  packaged_at timestamptz,
  packaged_by text,
  returned_at timestamptz,
  return_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists production_order_hpp_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders (id) on delete cascade,
  order_item_id uuid not null references order_items (id) on delete cascade,
  product_id text not null,
  product_name text,
  color text,
  size text,
  quantity integer not null default 0,
  hpp_unit numeric(14, 2),
  hpp_total numeric(14, 2),
  source text not null default 'none' check (source in ('aktual', 'standar', 'none')),
  created_at timestamptz not null default now(),
  unique (order_item_id)
);

create index if not exists idx_production_order_hpp_items_order
  on production_order_hpp_items (order_id);

create table if not exists production_order_packaging_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references orders (id) on delete cascade,
  component_id uuid not null references production_components (id) on delete restrict,
  component_code text not null,
  component_name text not null,
  unit_use text,
  qty numeric(14, 4) not null check (qty > 0),
  unit_price numeric(14, 4) not null default 0,
  total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (order_id, component_id)
);

create index if not exists idx_production_order_packaging_order
  on production_order_packaging_items (order_id);

alter table production_stock_movements
  add column if not exists ref_order_number text;

create index if not exists idx_production_movements_order
  on production_stock_movements (ref_order_number);

-- Packing atomik + idempoten per order.
create or replace function production_pack_order(
  p_order_id text,
  p_items jsonb,
  p_use_cover_hanger boolean default false,
  p_request_id text default '',
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_order record;
  v_header production_order_hpp;
  v_item jsonb;
  v_comp production_components;
  v_qty numeric;
  v_price numeric;
  v_total numeric := 0;
  v_stock_before numeric;
  v_stock_after numeric;
  v_warning boolean := false;
  v_count int := 0;
begin
  if nullif(btrim(coalesce(p_request_id, '')), '') is null then
    raise exception 'request_id wajib diisi';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Paket kemasan kosong';
  end if;

  select id, order_number, status into v_order
    from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  if v_order.status = 'dibatalkan' then raise exception 'Pesanan sudah dibatalkan'; end if;

  select * into v_header from production_order_hpp where order_id = p_order_id for update;
  -- Sudah dikemas dan belum diretur = jangan potong dua kali.
  -- Kalau sebelumnya sudah diretur (mis. resi gagal dibuat), izinkan pack ulang.
  if v_header.packaged_at is not null and v_header.returned_at is null then
    return jsonb_build_object('already', true, 'packaging_cost', v_header.packaging_cost, 'order_number', v_order.order_number);
  end if;

  -- Packing ulang setelah retur (mis. resi gagal): ganti snapshot item lama.
  if v_header.returned_at is not null then
    delete from production_order_packaging_items where order_id = p_order_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_qty <= 0 then continue; end if;

    select * into v_comp from production_components
     where id = (v_item->>'component_id')::uuid for update;
    if v_comp.id is null then raise exception 'Komponen kemasan tidak ditemukan'; end if;

    v_price := coalesce(v_comp.real_price, 0);
    select coalesce(sum(qty), 0) into v_stock_before
      from production_stock_movements where component_id = v_comp.id;
    v_stock_after := v_stock_before - v_qty;
    if v_stock_after < 0 then v_warning := true; end if;

    insert into production_stock_movements (
      component_id, movement_date, type, qty, unit_price, ref_type, ref_id,
      ref_order_number, notes, actor
    ) values (
      v_comp.id, current_date, 'keluar_packaging', -v_qty, v_price,
      'order', null, v_order.order_number,
      'Packaging ' || v_order.order_number, nullif(p_actor, '')
    );

    insert into production_order_packaging_items (
      order_id, component_id, component_code, component_name, unit_use,
      qty, unit_price, total
    ) values (
      p_order_id, v_comp.id, v_comp.code, v_comp.name, v_comp.unit_use,
      v_qty, v_price, round(v_qty * v_price, 2)
    )
    on conflict (order_id, component_id) do update set
      qty = excluded.qty,
      unit_price = excluded.unit_price,
      total = excluded.total;

    v_total := v_total + round(v_qty * v_price, 2);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'Tidak ada komponen kemasan dengan qty lebih dari 0'; end if;

  insert into production_order_hpp (
    order_id, hpp_goods, packaging_cost, total_hpp, packaging_status,
    use_cover_hanger, packaging_warning, request_id, packaged_at, packaged_by, updated_at
  ) values (
    p_order_id, 0, v_total, v_total, 'sudah',
    p_use_cover_hanger, v_warning, p_request_id, now(), nullif(p_actor, ''), now()
  )
  on conflict (order_id) do update set
    packaging_cost = excluded.packaging_cost,
    total_hpp = production_order_hpp.hpp_goods + excluded.packaging_cost,
    packaging_status = 'sudah',
    use_cover_hanger = excluded.use_cover_hanger,
    packaging_warning = excluded.packaging_warning,
    request_id = excluded.request_id,
    packaged_at = now(),
    packaged_by = nullif(p_actor, ''),
    returned_at = null,
    return_reason = null,
    updated_at = now();

  return jsonb_build_object(
    'already', false,
    'order_number', v_order.order_number,
    'items', v_count,
    'packaging_cost', v_total,
    'warning', v_warning
  );
end $$;

-- Retur packaging saat pesanan batal SEBELUM dikirim.
create or replace function production_return_order_packaging(
  p_order_id text,
  p_reason text default '',
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_order record;
  v_header production_order_hpp;
  v_item production_order_packaging_items;
  v_count int := 0;
begin
  select id, order_number into v_order from orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Pesanan tidak ditemukan'; end if;

  select * into v_header from production_order_hpp where order_id = p_order_id for update;
  if v_header.order_id is null or v_header.packaged_at is null then
    return jsonb_build_object('returned', 0);
  end if;
  if v_header.returned_at is not null then
    return jsonb_build_object('returned', 0, 'already', true);
  end if;

  for v_item in select * from production_order_packaging_items where order_id = p_order_id loop
    insert into production_stock_movements (
      component_id, movement_date, type, qty, unit_price, ref_type, ref_id,
      ref_order_number, notes, actor
    ) values (
      v_item.component_id, current_date, 'retur_packaging', v_item.qty, v_item.unit_price,
      'order', null, v_order.order_number,
      'Retur Packaging ' || v_order.order_number || case when btrim(coalesce(p_reason, '')) <> '' then ' — ' || btrim(p_reason) else '' end,
      nullif(p_actor, '')
    );
    v_count := v_count + 1;
  end loop;

  update production_order_hpp
     set packaging_status = 'diretur',
         packaging_cost = 0,
         total_hpp = hpp_goods,
         returned_at = now(),
         return_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where order_id = p_order_id;

  return jsonb_build_object('returned', v_count);
end $$;

alter table production_order_hpp enable row level security;
alter table production_order_hpp_items enable row level security;
alter table production_order_packaging_items enable row level security;

revoke all on function production_pack_order(text, jsonb, boolean, text, text) from public;
revoke all on function production_return_order_packaging(text, text, text) from public;
grant execute on function production_pack_order(text, jsonb, boolean, text, text) to service_role;
grant execute on function production_return_order_packaging(text, text, text) to service_role;
