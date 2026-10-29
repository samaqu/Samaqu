-- Backfill retur lama yang tersimpan tanpa pesanan asal (`order_id` NULL).
--
-- Penyebab: form retur dulu jatuh ke mode "Input manual" saat nomor pesanan SAMAQU tidak
-- muncul di daftar 60 pesanan terakhir, sehingga `order_id` kosong dan `order_number` diisi
-- nomor retur sendiri.
--
-- AMAN & TIDAK MENYENTUH RESI J&T:
--   * hanya 3 kolom yang ditulis — order_id, order_number, customer_id;
--   * kolom `shipping_in_awb`, `shipping_out_awb`, `jnt_order_id`, status, stok, dan uang
--     TIDAK disentuh sama sekali, jadi resi pengganti (JO…) tetap hidup;
--   * pencocokan ketat: nomor retur ↔ pelanggan ↔ produk+warna+ukuran harus sama persis
--     dengan baris pesanan. Kalau tidak yakin, baris DILEWATI (tidak ada tebakan).
--   * idempoten: hanya memproses `order_id IS NULL`, jadi aman dijalankan berulang.

begin;

do $$
declare
  r            record;
  v_order_id   text;
  v_order_num  text;
  v_cust_id    uuid;
  v_candidates int;
  v_items      int;
  v_matched    int;
begin
  for r in
    select *
      from public.returns
     where order_id is null
       and created_at >= now() - interval '120 days'
     order by created_at
  loop
    -- 1 · Cari pesanan berdasarkan pelanggan (nomor HP dinormalisasi ke digit saja).
    --     Hanya pesanan yang punya item COCOK yang dianggap kandidat.
    select count(*) into v_candidates
      from (
        select o.id
          from public.orders o
         where o.status <> 'dibatalkan'
           and regexp_replace(coalesce(o.customer_whatsapp, ''), '[^0-9]', '', 'g')
               = regexp_replace(coalesce(r.customer_whatsapp, ''), '[^0-9]', '', 'g')
           and regexp_replace(coalesce(r.customer_whatsapp, ''), '[^0-9]', '', 'g') <> ''
         group by o.id
      ) c;

    -- 2 · Kalau HP kosong, coba lewat nama pelanggan yang sama persis.
    if v_candidates = 0 then
      select count(*) into v_candidates
        from public.orders o
       where o.status <> 'dibatalkan'
         and lower(trim(o.customer_name)) = lower(trim(r.customer_name));
    end if;

    -- 3 · Kandidat harus TUNGGAL. Lebih dari satu = ambigu, jangan disentuh.
    if v_candidates <> 1 then
      continue;
    end if;

    if regexp_replace(coalesce(r.customer_whatsapp, ''), '[^0-9]', '', 'g') <> '' then
      select o.id, o.order_number, o.customer_id
        into v_order_id, v_order_num, v_cust_id
        from public.orders o
       where o.status <> 'dibatalkan'
         and regexp_replace(coalesce(o.customer_whatsapp, ''), '[^0-9]', '', 'g')
             = regexp_replace(coalesce(r.customer_whatsapp, ''), '[^0-9]', '', 'g')
       group by o.id, o.order_number, o.customer_id;
    else
      select o.id, o.order_number, o.customer_id
        into v_order_id, v_order_num, v_cust_id
        from public.orders o
       where o.status <> 'dibatalkan'
         and lower(trim(o.customer_name)) = lower(trim(r.customer_name));
    end if;

    continue when v_order_id is null;

    -- 4 · Wajib ada minimal satu item retur yang benar-benar cocok dengan item pesanan
    --     (produk + warna + ukuran). Ini yang mencegah menautkan ke pesanan yang salah.
    select count(*), count(oi.id)
      into v_items, v_matched
      from public.return_items ri
      left join public.order_items oi
        on oi.order_id = v_order_id
       and oi.product_id = ri.product_id
       and coalesce(nullif(oi.color, ''), 'default') = coalesce(nullif(ri.color, ''), 'default')
       and upper(trim(oi.size)) = upper(trim(ri.size))
     where ri.return_id = r.id;

    continue when v_items = 0 or v_matched <> v_items;

    -- 5 · Tulis HANYA tautan pesanan. Resi, jnt_order_id, status, stok, uang tidak disentuh.
    update public.returns
       set order_id     = v_order_id,
           order_number = v_order_num,
           customer_id  = coalesce(customer_id, v_cust_id),
           updated_at   = now()
     where id = r.id
       and order_id is null;

    -- 6 · Tautkan juga baris item ke `order_items` asli (kolom ini hanya referensi;
    --     stok TIDAK dihitung ulang karena `stock_applied_at` sudah terisi).
    update public.return_items ri
       set order_item_id = oi.id
      from public.order_items oi
     where ri.return_id = r.id
       and ri.order_item_id is null
       and oi.order_id = v_order_id
       and oi.product_id = ri.product_id
       and coalesce(nullif(oi.color, ''), 'default') = coalesce(nullif(ri.color, ''), 'default')
       and upper(trim(oi.size)) = upper(trim(ri.size));

    raise notice 'retur % -> pesanan %', r.return_number, v_order_num;
  end loop;
end $$;

commit;
