-- Stok guard tahap 3: penyebab increment yang tepat, unique index varian,
-- dan penanda anomali untuk reseller_create_order.
--
-- Read-only sudah diverifikasi sebelum menulis file ini:
--   product_variants = 571 baris, 571 pasangan unik (product_id, lower(color), lower(size)).
--   Tidak ada duplikat → unique index aman dipasang.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. samaqu_increment_stock: bedakan "stok tidak cukup" dari "varian tidak ada"
--
--    Sebelumnya penarikan stok (qty negatif) yang ditolak karena sisa stok kurang
--    tercatat sebagai 'increment_variant_not_found' — menyesatkan, karena barisnya
--    justru ADA. Sekarang dicatat 'increment_insufficient_stock'.
--
--    Nilai kembali tetap FALSE untuk kedua kasus.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_increment_stock(
  p_product_id text,
  p_color text,
  p_size text,
  p_qty integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_product_id text;
  v_base_size text;
  v_rows integer;
  v_variant_exists boolean;
  v_color_ci text := lower(coalesce(p_color, ''));
  v_size_ci text := lower(coalesce(p_size, ''));
begin
  if p_qty is null or p_qty = 0 then
    return false;
  end if;

  select base_product_id, base_size into v_base_product_id, v_base_size
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = v_color_ci
    and lower(coalesce(size, '')) = v_size_ci
  limit 1;

  if v_base_product_id is not null then
    p_product_id := v_base_product_id;
    p_size := upper(coalesce(v_base_size, p_size));
    v_size_ci := lower(coalesce(p_size, ''));
  end if;

  if p_qty < 0 then
    -- Batas bawah: stok tidak boleh jadi negatif.
    update public.product_variants
    set stock = stock + p_qty
    where product_id = p_product_id
      and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
      and lower(coalesce(size, '')) = v_size_ci
      and coalesce(stock, 0) + p_qty >= 0;
  else
    update public.product_variants
    set stock = coalesce(stock, 0) + p_qty
    where product_id = p_product_id
      and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
      and lower(coalesce(size, '')) = v_size_ci;
  end if;

  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return true;
  end if;

  -- Tidak ada baris ter-update. Pisahkan dua sebabnya supaya log bisa ditindaklanjuti.
  select exists(
    select 1 from public.product_variants
    where product_id = p_product_id
      and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
      and lower(coalesce(size, '')) = v_size_ci
  ) into v_variant_exists;

  insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
  values (
    p_product_id,
    p_color,
    p_size,
    p_qty,
    case when v_variant_exists then 'increment_insufficient_stock' else 'increment_variant_not_found' end,
    'increment_stock'
  );

  return false;
end;
$$;

revoke execute on function public.samaqu_increment_stock(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.samaqu_increment_stock(text, text, text, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Unique index varian (case-insensitive)
--
--    Mencegah dua baris yang hanya beda kapital ("navy" vs "Navy") untuk produk +
--    ukuran yang sama. Ini yang membuat pencarian varian di fungsi stok (lower())
--    selalu menunjuk tepat satu baris.
--
--    Prasyarat: sudah dicek tidak ada duplikat. Kalau ternyata ada saat migration
--    dijalankan, index GAGAL dibuat dan tidak ada perubahan lain yang ikut batal
--    (migration ini tidak membungkus semuanya dalam satu transaksi khusus).
-- ═══════════════════════════════════════════════════════════════════════════
create unique index if not exists product_variants_identity_uidx
  on public.product_variants (product_id, lower(coalesce(color, '')), lower(coalesce(size, '')));

comment on index public.product_variants_identity_uidx is
  'Satu varian per produk + nama varian + ukuran, tanpa membedakan huruf besar/kecil. Dipakai pencocokan fungsi stok.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. samaqu_reseller_create_order: bawa penanda STOCK_ANOMALY
--
--    Pesannya waktu itu polos 'Stok tidak mencukupi', sehingga pemanggil TS tidak
--    punya rincian untuk dicatat setelah transaksi rollback. Penanda ditambahkan di
--    sini (perilaku stok TIDAK berubah).
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_src text;
  v_before text;
  v_after text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_reseller_create_order';

  if v_src is null then
    raise notice 'samaqu_reseller_create_order tidak ditemukan - dilewati';
    return;
  end if;

  v_before := $old$        raise exception 'Stok tidak mencukupi (varian tidak ditemukan atau sisa kurang). Stok tidak berubah.';$old$;
  v_after  := $new$        raise exception 'Stok tidak mencukupi (varian tidak ditemukan atau sisa kurang). Stok tidak berubah. STOCK_ANOMALY:%',
          public.samaqu_anomaly_detail(
            v_item->>'product_id', v_item->>'color', v_item->>'size', (v_item->>'quantity')::int
          )::text;$new$;

  if position(v_before in v_src) > 0 then
    v_src := replace(v_src, v_before, v_after);
    execute v_src;
    raise notice 'samaqu_reseller_create_order: penanda ditambahkan';
  else
    raise notice 'samaqu_reseller_create_order: pola pesan tidak cocok, dilewati';
  end if;
end $$;
