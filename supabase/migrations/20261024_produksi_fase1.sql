-- SISTEM PRODUKSI & HPP — FASE 1
-- Master komponen, pembelian bahan, buku stok, stok awal, dan stok opname.
--
-- DIJALANKAN MANUAL di SQL Editor Supabase (atau lewat Management API).
-- Selama belum dijalankan, halaman /ops/produksi* menampilkan "belum siap".
--
-- ATURAN DATA (jangan diubah tanpa membahas ulang):
--   * Komponen disimpan TERPISAH dari `products` — tidak pernah muncul di katalog.
--   * Stok komponen SELALU = SUM(qty) di production_stock_movements. Tidak ada kolom
--     stok yang diedit manual.
--   * Buku stok append-only: UPDATE/DELETE ditolak trigger. Koreksi = transaksi baru.
--   * Harga Real = rata-rata tertimbang SEMUA barang masuk (stok awal + pembelian,
--     pembelian sudah termasuk ongkir). Harga Aman manual, tidak pernah dihitung ulang.
--   * Harga selalu per satuan pakai terkecil (per pcs / per yard), bukan per set.

create sequence if not exists production_purchase_seq start with 1;

-- ── Master komponen ───────────────────────────────────────────────────────────
create table if not exists production_components (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null check (category in (
    'kain', 'komponen_produk', 'kemasan_produk', 'packaging_pesanan', 'penunjang'
  )),
  -- Satuan pakai = satuan terkecil yang dipakai resep/HPP (yard, pcs, lembar, ...).
  unit_use text not null,
  -- Satuan beli (roll, pack, meter, ...) + isi per satuan beli dalam satuan pakai.
  unit_buy text not null,
  conversion numeric(14, 4) not null default 1 check (conversion > 0),
  min_stock numeric(14, 4) not null default 0,
  -- Harga Aman: diisi Owner, patokan HPP standar. TIDAK dihitung otomatis.
  safe_price numeric(14, 2) not null default 0,
  -- Harga Real: rata-rata tertimbang barang masuk (termasuk ongkir). Dihitung sistem.
  real_price numeric(14, 4) not null default 0,
  -- Harga beli terakhir per satuan pakai (sudah termasuk ongkir baris).
  last_buy_price numeric(14, 4) not null default 0,
  supplier text,
  notes text,
  -- Memakai tabel jenis kain yang sudah ada (bukan daftar baru).
  fabric_type_id uuid references jenis_kain (id) on delete set null,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_production_components_category on production_components (category);
create index if not exists idx_production_components_active on production_components (is_active);
create index if not exists idx_production_components_fabric on production_components (fabric_type_id);

-- ── Buku stok (append-only) ───────────────────────────────────────────────────
create table if not exists production_stock_movements (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references production_components (id) on delete restrict,
  movement_date date not null default current_date,
  -- Fase 1: stok_awal | pembelian | opname | rusak_hilang | penyesuaian.
  -- Sengaja TIDAK memakai CHECK supaya fase berikutnya (keluar_produksi,
  -- retur_sisa_bahan, packaging_pesanan) bisa ditambah tanpa migrasi kolom.
  type text not null,
  -- Positif = masuk, negatif = keluar. Selalu dalam satuan pakai.
  qty numeric(14, 4) not null check (qty <> 0),
  -- Harga per satuan pakai saat transaksi terjadi (pembelian sudah termasuk ongkir).
  unit_price numeric(14, 4) not null default 0,
  ref_type text,
  ref_id uuid,
  notes text,
  actor text,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_movements_component
  on production_stock_movements (component_id, movement_date, created_at);
create index if not exists idx_production_movements_type on production_stock_movements (type);
create index if not exists idx_production_movements_date on production_stock_movements (movement_date);
create index if not exists idx_production_movements_ref on production_stock_movements (ref_type, ref_id);

-- Buku stok tidak boleh diubah/dihapus. Koreksi lewat transaksi penyesuaian baru.
create or replace function production_guard_movement() returns trigger
language plpgsql as $$
begin
  raise exception 'Buku stok bersifat append-only. Koreksi lewat transaksi penyesuaian baru.';
end $$;

drop trigger if exists trg_production_movements_append_only on production_stock_movements;
create trigger trg_production_movements_append_only
  before update or delete on production_stock_movements
  for each row execute function production_guard_movement();

-- ── Pembelian bahan ───────────────────────────────────────────────────────────
create table if not exists production_purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_number text not null unique
    default ('PB-' || lpad(nextval('production_purchase_seq')::text, 4, '0')),
  purchase_date date not null default current_date,
  supplier text,
  -- Ongkir/biaya tambahan SATU pembelian (total, bukan per baris).
  additional_cost numeric(14, 2) not null default 0 check (additional_cost >= 0),
  items_value numeric(14, 2) not null default 0,
  total_value numeric(14, 2) not null default 0,
  notes text,
  actor text,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_purchases_date
  on production_purchases (purchase_date desc);
create index if not exists idx_production_purchases_supplier
  on production_purchases (supplier);

create table if not exists production_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references production_purchases (id) on delete cascade,
  component_id uuid not null references production_components (id) on delete restrict,
  component_code text not null,
  component_name text not null,
  qty_buy numeric(14, 4) not null check (qty_buy > 0),
  unit_buy text not null,
  price_buy numeric(14, 4) not null check (price_buy >= 0),
  conversion numeric(14, 4) not null check (conversion > 0),
  qty_use numeric(14, 4) not null check (qty_use > 0),
  line_value numeric(14, 2) not null default 0,
  -- Ongkir yang dialokasikan proporsional terhadap nilai baris.
  allocated_cost numeric(14, 2) not null default 0,
  -- Harga akhir per satuan pakai = (line_value + allocated_cost) / qty_use.
  final_unit_price numeric(14, 4) not null default 0,
  real_price_before numeric(14, 4) not null default 0,
  real_price_after numeric(14, 4) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_purchase_items_purchase
  on production_purchase_items (purchase_id);
create index if not exists idx_production_purchase_items_component
  on production_purchase_items (component_id);

-- ── View: komponen + stok + nama jenis kain ───────────────────────────────────
drop view if exists production_components_stock;
create view production_components_stock with (security_invoker = true) as
select
  c.*,
  coalesce(s.stock, 0)::numeric(14, 4) as stock,
  jk.name as fabric_type_name
from production_components c
left join (
  select component_id, sum(qty) as stock
  from production_stock_movements
  group by component_id
) s on s.component_id = c.id
left join jenis_kain jk on jk.id = c.fabric_type_id;

comment on view production_components_stock is
  'Komponen + stok (SUM buku stok) + nama jenis kain. Stok tidak pernah disimpan manual.';

-- ── Harga Real: rata-rata tertimbang semua barang masuk ──────────────────────
create or replace function production_recalc_price(p_component_id uuid)
returns numeric
language plpgsql as $$
declare
  v_price numeric := 0;
begin
  select coalesce(sum(qty * unit_price) / nullif(sum(qty), 0), 0)
    into v_price
  from production_stock_movements
  where component_id = p_component_id
    and qty > 0
    and type in ('stok_awal', 'pembelian', 'opname', 'penyesuaian');

  update production_components
     set real_price = round(v_price, 4),
         updated_at = now()
   where id = p_component_id;

  return round(v_price, 4);
end $$;

-- ── Simpan komponen (tambah/ubah) + stok awal opsional ───────────────────────
create or replace function production_save_component(
  p_component jsonb,
  p_initial_qty numeric default null,
  p_initial_price numeric default null,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_id uuid := nullif(p_component->>'id', '')::uuid;
  v_code text := btrim(coalesce(p_component->>'code', ''));
  v_name text := btrim(coalesce(p_component->>'name', ''));
  v_category text := btrim(coalesce(p_component->>'category', ''));
  v_unit_use text := btrim(coalesce(p_component->>'unit_use', ''));
  v_unit_buy text := btrim(coalesce(p_component->>'unit_buy', ''));
  v_conversion numeric := coalesce((p_component->>'conversion')::numeric, 1);
  v_min_stock numeric := coalesce((p_component->>'min_stock')::numeric, 0);
  v_safe numeric := coalesce((p_component->>'safe_price')::numeric, 0);
  v_supplier text := nullif(btrim(coalesce(p_component->>'supplier', '')), '');
  v_notes text := nullif(btrim(coalesce(p_component->>'notes', '')), '');
  v_fabric uuid := nullif(p_component->>'fabric_type_id', '')::uuid;
  v_active boolean := coalesce((p_component->>'is_active')::boolean, true);
  v_row production_components;
begin
  if v_code = '' then raise exception 'Kode komponen wajib diisi'; end if;
  if v_name = '' then raise exception 'Nama komponen wajib diisi'; end if;
  if v_category not in ('kain', 'komponen_produk', 'kemasan_produk', 'packaging_pesanan', 'penunjang') then
    raise exception 'Kategori komponen tidak dikenal';
  end if;
  if v_unit_use = '' then raise exception 'Satuan pakai wajib diisi'; end if;
  if v_unit_buy = '' then raise exception 'Satuan beli wajib diisi'; end if;
  if v_conversion <= 0 then raise exception 'Konversi satuan harus lebih dari 0'; end if;
  if v_min_stock < 0 then raise exception 'Stok minimum tidak boleh negatif'; end if;
  if v_safe < 0 then raise exception 'Harga Aman tidak boleh negatif'; end if;

  if v_id is null then
    insert into production_components (
      code, name, category, unit_use, unit_buy, conversion, min_stock,
      safe_price, supplier, notes, fabric_type_id, is_active, created_by
    ) values (
      v_code, v_name, v_category, v_unit_use, v_unit_buy, v_conversion, v_min_stock,
      v_safe, v_supplier, v_notes, v_fabric, v_active, nullif(p_actor, '')
    )
    returning * into v_row;
  else
    update production_components set
      code = v_code,
      name = v_name,
      category = v_category,
      unit_use = v_unit_use,
      unit_buy = v_unit_buy,
      conversion = v_conversion,
      min_stock = v_min_stock,
      safe_price = v_safe,
      supplier = v_supplier,
      notes = v_notes,
      fabric_type_id = v_fabric,
      is_active = v_active,
      updated_at = now()
    where id = v_id
    returning * into v_row;

    if v_row.id is null then raise exception 'Komponen tidak ditemukan'; end if;
  end if;

  if p_initial_qty is not null and p_initial_qty > 0 then
    insert into production_stock_movements (
      component_id, movement_date, type, qty, unit_price, ref_type, notes, actor
    ) values (
      v_row.id, current_date, 'stok_awal', p_initial_qty,
      coalesce(p_initial_price, 0), 'stok_awal', 'Stok awal saat komponen dibuat',
      nullif(p_actor, '')
    );
    perform production_recalc_price(v_row.id);
    select * into v_row from production_components where id = v_row.id;
  end if;

  return to_jsonb(v_row);
end $$;

-- ── Catat pembelian (ongkir dibagi proporsional) ─────────────────────────────
create or replace function production_record_purchase(
  p_header jsonb,
  p_items jsonb,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_purchase_id uuid;
  v_number text;
  v_date date := coalesce(nullif(p_header->>'purchase_date', '')::date, current_date);
  v_supplier text := nullif(btrim(coalesce(p_header->>'supplier', '')), '');
  v_notes text := nullif(btrim(coalesce(p_header->>'notes', '')), '');
  v_additional numeric := coalesce((p_header->>'additional_cost')::numeric, 0);
  v_total_lines numeric := 0;
  v_total_value numeric := 0;
  v_alloc_sum numeric := 0;
  v_item jsonb;
  v_comp production_components;
  v_qty_buy numeric;
  v_price_buy numeric;
  v_qty_use numeric;
  v_line numeric;
  v_alloc numeric;
  v_final numeric;
  v_before numeric;
  v_after numeric;
  v_index int := 0;
  v_count int;
  v_out jsonb := '[]'::jsonb;
begin
  if v_additional < 0 then raise exception 'Ongkir/biaya tambahan tidak boleh negatif'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu baris pembelian';
  end if;

  v_count := jsonb_array_length(p_items);

  -- Hitung nilai tiap baris lebih dulu (dasar alokasi ongkir proporsional).
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty_buy := coalesce((v_item->>'qty_buy')::numeric, 0);
    v_price_buy := coalesce((v_item->>'price_buy')::numeric, 0);
    if v_qty_buy <= 0 then raise exception 'Jumlah beli harus lebih dari 0'; end if;
    if v_price_buy < 0 then raise exception 'Harga beli tidak boleh negatif'; end if;
    if nullif(v_item->>'component_id', '') is null then raise exception 'Komponen wajib dipilih'; end if;
    v_total_lines := v_total_lines + (v_qty_buy * v_price_buy);
  end loop;

  v_total_value := v_total_lines + v_additional;

  insert into production_purchases (
    purchase_date, supplier, additional_cost, items_value, total_value, notes, actor
  ) values (
    v_date, v_supplier, v_additional, v_total_lines, v_total_value, v_notes, nullif(p_actor, '')
  )
  returning id, purchase_number into v_purchase_id, v_number;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_index := v_index + 1;

    select * into v_comp
      from production_components
     where id = (v_item->>'component_id')::uuid
     for update;
    if v_comp.id is null then raise exception 'Komponen pada baris % tidak ditemukan', v_index; end if;

    v_qty_buy := (v_item->>'qty_buy')::numeric;
    v_price_buy := coalesce((v_item->>'price_buy')::numeric, 0);
    v_qty_use := round(v_qty_buy * v_comp.conversion, 4);
    if v_qty_use <= 0 then raise exception 'Konversi baris % menghasilkan jumlah 0', v_index; end if;
    v_line := round(v_qty_buy * v_price_buy, 2);

    -- Baris terakhir menyerap sisa pembulatan supaya total alokasi = ongkir.
    if v_index = v_count then
      v_alloc := round(v_additional - v_alloc_sum, 2);
    elsif v_total_lines > 0 then
      v_alloc := round(v_additional * v_line / v_total_lines, 2);
    else
      v_alloc := round(v_additional / v_count, 2);
    end if;
    v_alloc_sum := v_alloc_sum + v_alloc;

    v_before := v_comp.real_price;
    v_final := round((v_line + v_alloc) / v_qty_use, 4);

    insert into production_purchase_items (
      purchase_id, component_id, component_code, component_name,
      qty_buy, unit_buy, price_buy, conversion, qty_use,
      line_value, allocated_cost, final_unit_price,
      real_price_before, real_price_after
    ) values (
      v_purchase_id, v_comp.id, v_comp.code, v_comp.name,
      v_qty_buy, v_comp.unit_buy, v_price_buy, v_comp.conversion, v_qty_use,
      v_line, v_alloc, v_final, v_before, v_before
    );

    insert into production_stock_movements (
      component_id, movement_date, type, qty, unit_price, ref_type, ref_id, notes, actor
    ) values (
      v_comp.id, v_date, 'pembelian', v_qty_use, v_final, 'purchase', v_purchase_id,
      nullif('Pembelian ' || v_number, ''), nullif(p_actor, '')
    );

    v_after := production_recalc_price(v_comp.id);
    update production_components
       set last_buy_price = v_final, updated_at = now()
     where id = v_comp.id;

    update production_purchase_items
       set real_price_after = v_after
     where purchase_id = v_purchase_id and component_id = v_comp.id;

    v_out := v_out || jsonb_build_object(
      'component_id', v_comp.id,
      'component_code', v_comp.code,
      'component_name', v_comp.name,
      'qty_buy', v_qty_buy,
      'unit_buy', v_comp.unit_buy,
      'price_buy', v_price_buy,
      'qty_use', v_qty_use,
      'allocated_cost', v_alloc,
      'final_unit_price', v_final,
      'real_price_after', v_after
    );
  end loop;

  return jsonb_build_object(
    'id', v_purchase_id,
    'purchase_number', v_number,
    'purchase_date', v_date,
    'supplier', v_supplier,
    'additional_cost', v_additional,
    'items_value', v_total_lines,
    'total_value', v_total_value,
    'items', v_out
  );
end $$;

-- ── Stok awal massal (batch) ─────────────────────────────────────────────────
create or replace function production_record_initial_stock(
  p_items jsonb,
  p_date date default current_date,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_item jsonb;
  v_component uuid;
  v_qty numeric;
  v_price numeric;
  v_count int := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu baris stok awal';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_component := nullif(v_item->>'component_id', '')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);
    if v_component is null then raise exception 'Komponen wajib dipilih'; end if;
    if v_qty <= 0 then raise exception 'Jumlah stok awal harus lebih dari 0'; end if;
    if v_price < 0 then raise exception 'Harga stok awal tidak boleh negatif'; end if;

    insert into production_stock_movements (
      component_id, movement_date, type, qty, unit_price, ref_type, notes, actor
    ) values (
      v_component, coalesce(p_date, current_date), 'stok_awal', v_qty, v_price,
      'stok_awal', 'Stok awal', nullif(p_actor, '')
    );
    perform production_recalc_price(v_component);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('saved', v_count);
end $$;

-- ── Stok opname (selisih → penyesuaian di buku stok) ─────────────────────────
create or replace function production_record_opname(
  p_component_id uuid,
  p_counted numeric,
  p_reason text,
  p_notes text default '',
  p_date date default current_date,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_stock numeric := 0;
  v_delta numeric;
  v_price numeric := 0;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_movement uuid;
  v_notes text;
begin
  if p_component_id is null then raise exception 'Komponen wajib dipilih'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Hitungan fisik tidak valid'; end if;

  select coalesce(sum(qty), 0) into v_stock
    from production_stock_movements where component_id = p_component_id;

  select real_price into v_price from production_components where id = p_component_id;
  if not found then raise exception 'Komponen tidak ditemukan'; end if;

  v_delta := round(p_counted - v_stock, 4);
  if v_delta = 0 then
    return jsonb_build_object(
      'changed', false, 'previous_stock', v_stock, 'counted_stock', p_counted, 'delta', 0
    );
  end if;

  if v_reason = '' then raise exception 'Alasan selisih wajib diisi'; end if;

  v_notes := 'Opname: ' || v_reason
    || case when btrim(coalesce(p_notes, '')) <> '' then ' — ' || btrim(p_notes) else '' end
    || ' (sistem ' || trim(to_char(v_stock, 'FM999999990.####'))
    || ' → fisik ' || trim(to_char(p_counted, 'FM999999990.####')) || ')';

  insert into production_stock_movements (
    component_id, movement_date, type, qty, unit_price, ref_type, notes, actor
  ) values (
    p_component_id, coalesce(p_date, current_date), 'opname', v_delta, v_price,
    'opname', v_notes, nullif(p_actor, '')
  ) returning id into v_movement;

  perform production_recalc_price(p_component_id);

  return jsonb_build_object(
    'changed', true,
    'movement_id', v_movement,
    'previous_stock', v_stock,
    'counted_stock', p_counted,
    'delta', v_delta
  );
end $$;

-- ── Pergerakan manual (Rusak/Hilang, koreksi) ────────────────────────────────
create or replace function production_record_movement(
  p_component_id uuid,
  p_type text,
  p_qty numeric,
  p_date date default current_date,
  p_notes text default '',
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_price numeric := 0;
  v_id uuid;
  v_stock numeric := 0;
begin
  if p_component_id is null then raise exception 'Komponen wajib dipilih'; end if;
  if p_type not in ('stok_awal', 'pembelian', 'opname', 'rusak_hilang', 'penyesuaian') then
    raise exception 'Jenis transaksi tidak dikenal';
  end if;
  if p_qty is null or p_qty = 0 then raise exception 'Jumlah tidak boleh 0'; end if;

  select real_price into v_price from production_components where id = p_component_id;
  if not found then raise exception 'Komponen tidak ditemukan'; end if;

  insert into production_stock_movements (
    component_id, movement_date, type, qty, unit_price, ref_type, notes, actor
  ) values (
    p_component_id, coalesce(p_date, current_date), p_type, p_qty, v_price,
    p_type, nullif(btrim(coalesce(p_notes, '')), ''), nullif(p_actor, '')
  ) returning id into v_id;

  if p_qty > 0 then perform production_recalc_price(p_component_id); end if;

  select coalesce(sum(qty), 0) into v_stock
    from production_stock_movements where component_id = p_component_id;

  return jsonb_build_object('id', v_id, 'stock_after', v_stock);
end $$;

-- ── Proteksi: hanya service role (route /api/ops/*) yang boleh akses ─────────
alter table production_components enable row level security;
alter table production_stock_movements enable row level security;
alter table production_purchases enable row level security;
alter table production_purchase_items enable row level security;

revoke all on function production_save_component(jsonb, numeric, numeric, text) from public;
revoke all on function production_record_purchase(jsonb, jsonb, text) from public;
revoke all on function production_record_initial_stock(jsonb, date, text) from public;
revoke all on function production_record_opname(uuid, numeric, text, text, date, text) from public;
revoke all on function production_record_movement(uuid, text, numeric, date, text, text) from public;
revoke all on function production_recalc_price(uuid) from public;

grant execute on function production_save_component(jsonb, numeric, numeric, text) to service_role;
grant execute on function production_record_purchase(jsonb, jsonb, text) to service_role;
grant execute on function production_record_initial_stock(jsonb, date, text) to service_role;
grant execute on function production_record_opname(uuid, numeric, text, text, date, text) to service_role;
grant execute on function production_record_movement(uuid, text, numeric, date, text, text) to service_role;
grant execute on function production_recalc_price(uuid) to service_role;

comment on table production_components is
  'Master komponen/bahan (terpisah dari products, tidak pernah tampil di katalog).';
comment on table production_stock_movements is
  'Buku stok append-only. Stok komponen = SUM(qty). Koreksi lewat transaksi baru.';
comment on table production_purchases is
  'Pembelian bahan. Ongkir dialokasikan proporsional ke nilai tiap baris.';
comment on table production_purchase_items is
  'Rincian pembelian: harga beli, ongkir teralokasi, harga akhir per satuan pakai.';
