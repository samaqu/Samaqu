-- Kabak → Box Kabak sebagai KOMPONEN.
--
-- Kabak dan Box Kabak adalah dua barang fisik terpisah, tetapi dijual sebagai satu paket
-- (harga Kabak Rp60.000 sudah termasuk box). Sekarang setiap kabak terjual ikut memotong
-- stok box 1:1, dan sebaliknya saat batal/retur/dikembalikan.
--
-- Aturan yang dipegang:
--   - Tidak mengoreksi stok mundur. Penjualan kabak SEBELUM migration ini tidak memotong box
--     dan tidak akan dikembalikan (lihat mekanisme ref di bawah).
--   - Varian kabak, harga, dan stok sharing (base_product_id/base_size) tidak disentuh.
--   - open_order_enabled / promo_fch_enabled tidak disentuh.
--
-- ── Kenapa memakai `stock_movements` sebagai catatan ──────────────────────────────
-- Pengembalian komponen harus tahu BERAPA yang dulu benar-benar terpotong. Sumbernya
-- `stock_movements` dengan `ref_type = 'component'` dan `ref_id = orders.id`:
--   dikembalikan = SUM(qty out) − SUM(qty in) untuk ref yang sama.
-- Order lama tidak punya baris ini → SUM = 0 → box tidak dikembalikan (benar).
-- Box yang sempat habis hanya terpotong sebagian → yang kembali hanya sebesar itu.
--
-- `ref_type = 'component'` dipilih supaya pergerakan ini bisa dibedakan dari penjualan
-- biasa (`return`, `stock_opname`) dan tidak dihitung sebagai penjualan box.
--
-- ── Signature fungsi ─────────────────────────────────────────────────────────────
-- DROP dulu lalu CREATE (bukan overload), supaya pemanggil RPC lama tidak pernah
-- menemukan dua fungsi yang sama-sama cocok ("function is not unique").
-- Parameter baru ber-default NULL sehingga pemanggil lama tetap jalan.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Tabel relasi produk → komponen
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.product_components (
  id bigserial primary key,
  product_id text not null,
  component_product_id text not null,
  component_color text,
  component_size text,
  qty integer not null default 1 check (qty > 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  constraint product_components_uniq unique (product_id, component_product_id, component_color, component_size)
);

comment on table public.product_components is
  'Komponen fisik yang ikut terpotong saat produk terjual. Dipakai kabak → box kabak.';

create index if not exists product_components_product_idx
  on public.product_components (product_id) where is_active;

create index if not exists product_components_component_idx
  on public.product_components (component_product_id) where is_active;

alter table public.product_components enable row level security;
revoke all on public.product_components from public, anon, authenticated;
grant select, insert, update, delete on public.product_components to service_role;
grant usage, select on sequence public.product_components_id_seq to service_role;

-- Satu baris: kabak memakai 1 box per pcs.
insert into public.product_components (product_id, component_product_id, component_color, component_size, qty, notes)
values ('kabak', 'box-kabak', 'Box', 'ALL SIZE', 1, 'Kabak dijual sebagai paket; harga Rp60.000 sudah termasuk box.')
on conflict (product_id, component_product_id, component_color, component_size) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Helper: komponen aktif sebuah produk
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_product_has_components(p_product_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.product_components
    where product_id = p_product_id and is_active
  );
$$;

revoke all on function public.samaqu_product_has_components(text) from public, anon, authenticated;
grant execute on function public.samaqu_product_has_components(text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Ambil baris komponen untuk sebuah produk (untuk dipotong/dikembalikan)
--    `p_offset` = qty komponen yang dicari untuk n pcs produk.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_component_plan(p_product_id text, p_qty integer)
returns table (component_product_id text, component_color text, component_size text, qty integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.component_product_id,
         coalesce(c.component_color, ''),
         coalesce(c.component_size, ''),
         c.qty * greatest(1, coalesce(p_qty, 1))
  from public.product_components c
  where c.product_id = p_product_id and c.is_active;
$$;

revoke all on function public.samaqu_component_plan(text, integer) from public, anon, authenticated;
grant execute on function public.samaqu_component_plan(text, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. decrement_stock — DROP lalu CREATE dengan p_ref_type / p_ref_id
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.samaqu_decrement_stock(text, text, text, integer);

create function public.samaqu_decrement_stock(
  p_product_id text,
  p_color text,
  p_size text,
  p_qty integer,
  p_ref_type text default null,
  p_ref_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
  v_base_product_id text;
  v_base_size text;
  v_product_exists boolean;
  v_color_ci text := lower(coalesce(p_color, ''));
  v_size_ci text := lower(coalesce(p_size, ''));
  v_comp record;
  v_comp_stock integer;
  v_take integer;
  v_need integer;
begin
  if p_qty is null or p_qty < 1 then
    return false;
  end if;

  -- Varian turunan (series sharing) diarahkan ke produk induk.
  select base_product_id, base_size into v_base_product_id, v_base_size
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = v_color_ci
    and lower(coalesce(size, '')) = v_size_ci
  limit 1;

  if v_base_product_id is not null and v_base_size is not null then
    p_product_id := v_base_product_id;
    p_size := v_base_size;
    v_size_ci := lower(coalesce(v_base_size, ''));
  end if;

  select stock into v_stock
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
    and lower(coalesce(size, '')) = v_size_ci
  for update;

  if v_stock is null then
    select exists(select 1 from public.products where id = p_product_id) into v_product_exists;

    if not v_product_exists then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
      values (p_product_id, p_color, p_size, p_qty, 'phantom_product', 'decrement_stock');
      return true;
    end if;

    insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
    values (p_product_id, p_color, p_size, p_qty, 'variant_not_found', 'decrement_stock');
    return false;
  end if;

  if v_stock < p_qty then
    return false;
  end if;

  update public.product_variants
  set stock = v_stock - p_qty
  where product_id = p_product_id
    and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
    and lower(coalesce(size, '')) = v_size_ci;

  -- ── Komponen (box kabak) ────────────────────────────────────────────────
  -- Dipotong SETELAH potongan produk utama berhasil, supaya tiap panggilan
  -- yang sukses selalu mewakili satu pengurangan nyata (tidak dobel).
  for v_comp in
    select * from public.samaqu_component_plan(p_product_id, p_qty)
  loop
    if p_ref_type is null or p_ref_id is null then
      -- Pemanggil belum mengirim ref → box tidak bisa dipotong/dikembalikan dengan
      -- benar. Dicatat supaya terlihat di halaman Anomali Stok, bukan hilang.
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source, order_id)
      values (v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
              v_comp.qty, 'component_missing_ref', 'decrement_stock', null);
      continue;
    end if;

    select stock into v_comp_stock
    from public.product_variants
    where product_id = v_comp.component_product_id
      and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
      and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''))
    for update;

    if v_comp_stock is null then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
      values (v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
              v_comp.qty, 'component_variant_not_found', 'decrement_stock');
      continue;
    end if;

    v_need := v_comp.qty;
    -- Boleh terpotong sebagian (sampai 0). Penjualan kabak TIDAK diblokir.
    v_take := least(v_need, v_comp_stock);

    if v_take > 0 then
      update public.product_variants
      set stock = v_comp_stock - v_take
      where product_id = v_comp.component_product_id
        and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
        and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''));

      -- CHECK qty > 0 di stock_movements: hanya tulis kalau benar-benar ada yang
      -- terpotong, supaya tidak memicu error yang menggagalkan checkout.
      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id,
        before_stock, after_stock, notes
      ) values (
        v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
        v_take, 'out', 'order', 'component', p_ref_id,
        v_comp_stock, v_comp_stock - v_take,
        'Komponen (dari penjualan) — ' || v_need || ' dibutuhkan, ' || v_take || ' terpotong'
      );
    end if;

    if v_take < v_need then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source, order_id)
      values (v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
              v_need - v_take, 'component_out_of_stock', 'decrement_stock', p_ref_id::text);
    end if;
  end loop;

  return true;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. restore_stock — DROP lalu CREATE dengan p_ref_type / p_ref_id
--
--    Komponen dikembalikan sebesar SELISIH yang dulu terpotong untuk ref ini:
--      sisa = SUM(qty out) − SUM(qty in)
--    Jadi order lama (tanpa baris) → 0 → tidak dikembalikan;
--    box yang sempat habis → hanya sebesar yang benar-benar terpotong.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.samaqu_restore_stock(text, text, text, integer);

create function public.samaqu_restore_stock(
  p_product_id text,
  p_color text,
  p_size text,
  p_qty integer,
  p_ref_type text default null,
  p_ref_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_product_id text;
  v_base_size text;
  v_rows integer;
  v_color_ci text := lower(coalesce(p_color, ''));
  v_size_ci text := lower(coalesce(p_size, ''));
  v_comp record;
  v_out integer;
  v_in integer;
  v_back integer;
  v_comp_stock integer;
begin
  if p_qty is null or p_qty < 1 then
    return;
  end if;

  select base_product_id, base_size into v_base_product_id, v_base_size
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = v_color_ci
    and lower(coalesce(size, '')) = v_size_ci
  limit 1;

  if v_base_product_id is not null and v_base_size is not null then
    p_product_id := v_base_product_id;
    p_size := v_base_size;
    v_size_ci := lower(coalesce(v_base_size, ''));
  end if;

  update public.product_variants
  set stock = stock + p_qty
  where product_id = p_product_id
    and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
    and lower(coalesce(size, '')) = v_size_ci;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
    values (p_product_id, p_color, p_size, p_qty, 'restore_variant_not_found', 'restore_stock');
  end if;

  -- ── Komponen ────────────────────────────────────────────────────────────
  for v_comp in
    select * from public.samaqu_component_plan(p_product_id, p_qty)
  loop
    if p_ref_type is null or p_ref_id is null then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source, order_id)
      values (v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
              v_comp.qty, 'component_missing_ref', 'restore_stock', null);
      continue;
    end if;

    -- Berapa yang dulu benar-benar terpotong untuk ref ini, dikurangi yang sudah kembali.
    select
      coalesce(sum(case when direction = 'out' then qty else 0 end), 0),
      coalesce(sum(case when direction = 'in'  then qty else 0 end), 0)
    into v_out, v_in
    from public.stock_movements
    where product_id = v_comp.component_product_id
      and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
      and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''))
      and ref_type = p_ref_type
      and ref_id = p_ref_id;

    v_back := least(v_comp.qty, greatest(0, v_out - v_in));

    if v_back <= 0 then
      -- Tidak ada pemotongan komponen untuk ref ini (mis. order lama).
      continue;
    end if;

    select stock into v_comp_stock
    from public.product_variants
    where product_id = v_comp.component_product_id
      and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
      and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''))
    for update;

    if v_comp_stock is null then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
      values (v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
              v_back, 'component_variant_not_found', 'restore_stock');
      continue;
    end if;

    update public.product_variants
    set stock = v_comp_stock + v_back
    where product_id = v_comp.component_product_id
      and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
      and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''));

    insert into public.stock_movements (
      product_id, color, size, qty, direction, source, ref_type, ref_id,
      before_stock, after_stock, notes
    ) values (
      v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
      v_back, 'in', 'order', 'component', p_ref_id,
      v_comp_stock, v_comp_stock + v_back,
      'Komponen dikembalikan (pembatalan/retur) — ' || v_back || ' dari ' || v_out || ' terpotong'
    );
  end loop;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Akses — tetap service_role saja
-- ═══════════════════════════════════════════════════════════════════════════
revoke execute on function public.samaqu_decrement_stock(text, text, text, integer, text, uuid) from public, anon, authenticated;
revoke execute on function public.samaqu_restore_stock(text, text, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.samaqu_decrement_stock(text, text, text, integer, text, uuid) to service_role;
grant execute on function public.samaqu_restore_stock(text, text, text, integer, text, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Retur: box ikut kembali saat retur diterima, dan ikut dikurangi lagi saat
--    retur dibatalkan. Ref-nya orders.id dari order asal retur — BUKAN return_id,
--    supaya pengembalian mencari pemotongan yang benar-benar terjadi.
-- ═══════════════════════════════════════════════════════════════════════════

-- Ambil ref order asli sebuah retur. NULL kalau retur manual tanpa order.
create or replace function public.samaqu_return_order_ref(p_return_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(order_id), '')::uuid
  from public.returns
  where id = p_return_id;
$$;

revoke all on function public.samaqu_return_order_ref(uuid) from public, anon, authenticated;
grant execute on function public.samaqu_return_order_ref(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Pasang ref order ke dua fungsi retur.
--    Isinya diambil dari definisi yang sedang aktif di database, lalu hanya baris
--    pemanggilan stok yang diberi ref — logika retur tidak diubah.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_src text;
  v_old text;
  v_new text;
  v_changed integer := 0;
begin
  ---------------------------------------------------------------------------
  -- samaqu_apply_return_stock — barang masuk: increment + (komponen ikut bertambah)
  ---------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_apply_return_stock';

  if v_src is not null then
    -- Tambah deklarasi variabel ref setelah deklarasi v_out_name.
    v_old := '  v_out_name text;';
    v_new := '  v_out_name text;' || chr(10) || '  v_ref uuid := public.samaqu_return_order_ref(p_return_id);';
    if position(v_old in v_src) > 0 and position('v_ref uuid' in v_src) = 0 then
      v_src := replace(v_src, v_old, v_new);
    end if;

    -- increment saat barang balik → komponen (box) ikut kembali.
    v_old := $old$      perform public.samaqu_increment_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty
      );$old$;
    v_new := $new$      -- Barang kembali: bila ada order asal, komponen (box) ikut kembali.
      -- Tanpa order asal (retur manual) refType NULL → dicatat 'component_missing_ref'.
      perform public.samaqu_restore_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty,
        case when v_ref is not null then 'component' else null end, v_ref
      );
      perform public.samaqu_increment_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty
      );$new$;
    if position(v_old in v_src) > 0 then
      v_src := replace(v_src, v_old, v_new);
      v_changed := v_changed + 1;
    end if;

    execute v_src;
  end if;

  ---------------------------------------------------------------------------
  -- samaqu_reverse_return_stock — retur dibatalkan: decrement + komponen dikurangi
  ---------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_reverse_return_stock';

  if v_src is not null then
    v_old := '  v_reason text;';
    v_new := '  v_reason text;' || chr(10) || '  v_ref uuid := public.samaqu_return_order_ref(p_return_id);';
    if position(v_old in v_src) > 0 and position('v_ref uuid' in v_src) = 0 then
      v_src := replace(v_src, v_old, v_new);
    end if;

    v_old := $old$      v_ok := public.samaqu_decrement_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty
      );$old$;
    v_new := $new$      v_ok := public.samaqu_decrement_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty,
        case when v_ref is not null then 'component' else null end, v_ref
      );$new$;
    if position(v_old in v_src) > 0 then
      v_src := replace(v_src, v_old, v_new);
      v_changed := v_changed + 1;
    end if;

    execute v_src;
  end if;

  raise notice 'Fungsi retur diperbarui: % dari 2', v_changed;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Muat ulang cache skema PostgREST (signature fungsi berubah)
-- ═══════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';
