-- Tukar Series (Tukar Size lintas produk/series) + tagihan + tracking pengganti.
--
-- ADDITIVE. Semua kolom nullable atau punya default yang menjaga perilaku lama:
--   * `replacement_product_id` kosong  -> tukar ukuran dalam produk yang sama (perilaku lama persis).
--   * `replacement_product_id` terisi  -> stok keluar dari produk pengganti.
--
-- Karena itu tidak ada retur lama yang perilakunya berubah.

-- ---------------------------------------------------------------------------
-- 1. Item: produk/warna pengganti
-- ---------------------------------------------------------------------------
alter table public.return_items add column if not exists replacement_product_id text;
alter table public.return_items add column if not exists replacement_color text;

comment on column public.return_items.replacement_product_id is
  'Produk pengganti untuk tukar series. NULL = tukar ukuran pada produk yang sama (perilaku lama).';
comment on column public.return_items.replacement_color is
  'Warna pengganti; NULL = pakai warna asal.';

-- ---------------------------------------------------------------------------
-- 2. Header: tagihan + penanda notifikasi pengganti diterima
-- ---------------------------------------------------------------------------
alter table public.returns add column if not exists total_tagihan integer not null default 0;
alter table public.returns add column if not exists billing_status text not null default 'tidak_ada';
alter table public.returns add column if not exists billing_settled_at timestamptz;
alter table public.returns add column if not exists replacement_delivered_notified_at timestamptz;
alter table public.returns add column if not exists replacement_delivered_at timestamptz;

comment on column public.returns.total_tagihan is
  'Selisih harga produk + ongkir pengganti. Negatif = perlu refund ke customer. 0 = tidak ada tagihan.';
comment on column public.returns.billing_status is
  'tidak_ada (total 0) | belum | lunas. Dipakai badge dan tombol Kirim Tagihan / Sudah Lunas.';

-- Status lama tidak diubah. Baris lama dengan selisih != 0 diberi status 'belum'
-- supaya badge tetap benar; yang selisihnya 0 tetap 'tidak_ada'.
update public.returns
   set billing_status = case when coalesce(price_difference_total, 0) <> 0 then 'belum' else 'tidak_ada' end
 where billing_status = 'tidak_ada'
   and coalesce(price_difference_total, 0) <> 0;

alter table public.returns drop constraint if exists returns_billing_status_check;
alter table public.returns
  add constraint returns_billing_status_check
  check (billing_status in ('tidak_ada', 'belum', 'lunas'));

-- ---------------------------------------------------------------------------
-- 3. Riwayat scan J&T untuk resi pengganti (pola sama order_tracking_events)
-- ---------------------------------------------------------------------------
create table if not exists public.return_tracking_events (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete cascade,
  awb_no text not null,
  event_key text not null,
  code text,
  description text,
  city text,
  occurred_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (return_id, event_key)
);

create index if not exists return_tracking_events_return_idx
  on public.return_tracking_events (return_id, occurred_at desc);

comment on table public.return_tracking_events is
  'Riwayat pemindaian J&T untuk AWB resi pengganti retur. `event_key` unik per retur agar cron idempoten.';

alter table public.return_tracking_events enable row level security;
-- Tanpa policy: hanya service role yang boleh baca/tulis (sama seperti `returns`).

-- ---------------------------------------------------------------------------
-- 4. RPC stok: sumber produk pengganti dengan fallback ke produk asal
-- ---------------------------------------------------------------------------
-- Logika TIDAK ditulis ulang — hanya `product_id` sumbernya:
--   masuk  : selalu produk ASAL (barang lama pulang)
--   keluar : `replacement_product_id` kalau ada, kalau tidak produk asal (perilaku lama)

create or replace function public.samaqu_apply_return_stock(p_return_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  r public.returns%rowtype;
  it public.return_items%rowtype;
  v_date date := (now() at time zone 'Asia/Jakarta')::date;
  v_out_product text;
  v_out_color text;
  v_out_name text;
begin
  select * into r from public.returns where id = p_return_id for update;
  if not found then
    raise exception 'Retur tidak ditemukan';
  end if;
  if r.stock_applied_at is not null then
    return jsonb_build_object('ok', true, 'already_applied', true);
  end if;
  if r.status not in ('disetujui', 'barang_diterima') then
    raise exception 'Status retur belum siap menerapkan stok';
  end if;

  for it in select * from public.return_items where return_id = p_return_id loop
    if it.condition = 'sellable' and not it.stock_in_applied then
      perform public.samaqu_increment_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty
      );
      insert into public.stock_in (
        date, product_id, product_name, sku, variant_color, variant_size,
        qty, cost_per_unit, notes, source, ref_return_id
      ) values (
        v_date, it.product_id, it.product_name,
        coalesce((select sku from public.products where id = it.product_id), ''),
        coalesce(nullif(it.color, ''), 'default'), it.size,
        it.qty, 0, 'Pengembalian stok - ' || r.return_number, r.type, r.id
      );
      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id, notes
      ) values (
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty,
        'in', r.type, 'return', r.id, 'Barang balik ' || r.return_number
      );
      update public.return_items set stock_in_applied = true where id = it.id;
    end if;

    if r.type = 'tukar_size' and it.replacement_size is not null and not it.stock_out_applied then
      -- Produk pengganti kalau ada; kalau tidak, produk asal (perilaku lama).
      v_out_product := coalesce(nullif(it.replacement_product_id, ''), it.product_id);
      v_out_color := coalesce(nullif(it.replacement_color, ''), nullif(it.color, ''), 'default');
      v_out_name := coalesce(
        (select name from public.products where id = v_out_product),
        it.product_name
      );

      if not public.samaqu_decrement_stock(v_out_product, v_out_color, it.replacement_size, it.qty) then
        raise exception 'Stok ukuran % tidak cukup untuk %', it.replacement_size, v_out_name;
      end if;
      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id, notes
      ) values (
        v_out_product, v_out_color, it.replacement_size, it.qty,
        'out', 'tukar_size', 'return', r.id, 'Pengganti ' || r.return_number
      );
      update public.return_items set stock_out_applied = true where id = it.id;
    end if;
  end loop;

  update public.returns
     set stock_applied_at = now(), stock_reversed_at = null, updated_at = now()
   where id = p_return_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.samaqu_reverse_return_stock(p_return_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  r public.returns%rowtype;
  it public.return_items%rowtype;
  v_out_product text;
  v_out_color text;
begin
  select * into r from public.returns where id = p_return_id for update;
  if not found then
    raise exception 'Retur tidak ditemukan';
  end if;
  if r.stock_applied_at is null or r.stock_reversed_at is not null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  for it in select * from public.return_items where return_id = p_return_id loop
    if it.stock_in_applied then
      perform public.samaqu_decrement_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty
      );
      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id, notes
      ) values (
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty,
        'out', r.type, 'return', r.id, 'Pembatalan retur ' || r.return_number
      );
      update public.return_items set stock_in_applied = false where id = it.id;
    end if;

    if it.stock_out_applied and it.replacement_size is not null then
      v_out_product := coalesce(nullif(it.replacement_product_id, ''), it.product_id);
      v_out_color := coalesce(nullif(it.replacement_color, ''), nullif(it.color, ''), 'default');

      perform public.samaqu_increment_stock(
        v_out_product, v_out_color, it.replacement_size, it.qty
      );
      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id, notes
      ) values (
        v_out_product, v_out_color, it.replacement_size, it.qty,
        'in', 'tukar_size', 'return', r.id, 'Pembatalan retur ' || r.return_number
      );
      update public.return_items set stock_out_applied = false where id = it.id;
    end if;
  end loop;

  delete from public.stock_in where ref_return_id = p_return_id;

  update public.returns
     set stock_applied_at = null, stock_reversed_at = now(), updated_at = now()
   where id = p_return_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Grant HARUS setelah kedua fungsi dibuat.
revoke all on function public.samaqu_apply_return_stock(uuid) from public;
revoke all on function public.samaqu_reverse_return_stock(uuid) from public;
grant execute on function public.samaqu_apply_return_stock(uuid) to service_role;
grant execute on function public.samaqu_reverse_return_stock(uuid) to service_role;
