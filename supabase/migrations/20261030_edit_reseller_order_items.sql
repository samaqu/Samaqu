-- Edit item pesanan RESELLER — HANYA ukuran/warna, tanpa mengubah baris lain.
--
-- Kenapa RPC terpisah: RPC umum `samaqu_edit_order_items` menghapus lalu membuat ulang
-- order_items, sehingga kolom reseller_buy_price/reseller_sell_price hilang dan total
-- dihitung ulang. Untuk pesanan reseller, qty/produk/harga/total/saldo/kekurangan TIDAK
-- boleh berubah. Fungsi ini hanya UPDATE color/size pada baris yang sama, memindahkan
-- stok lewat RPC stok yang sudah ada, lalu mencatat audit di `order_item_edits`.
--
-- Jalankan sekali di Supabase SQL Editor. Aman dijalankan ulang (create or replace).

create or replace function public.samaqu_edit_reseller_order_items(
  p_order_id text,
  p_actor text,
  p_items jsonb,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_row public.order_items%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_seen uuid[] := '{}';
  v_old_count int;
  v_old_items jsonb;
  v_new_items jsonb;
  v_delta record;
  v_color text;
  v_size text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan';
  end if;
  if v_order.reseller_id is null then
    raise exception 'Pesanan ini bukan pesanan reseller';
  end if;

  -- Syarat sama dengan sumber lain.
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

  select count(*)::int into v_old_count from public.order_items where order_id = p_order_id;
  if jsonb_array_length(p_items) <> v_old_count then
    raise exception 'Pesanan reseller: hanya ukuran dan warna yang bisa diubah. Untuk perubahan lain, batalkan lalu buat pesanan baru (saldo dan stok otomatis kembali).';
  end if;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id), '[]'::jsonb)
    into v_old_items
    from public.order_items oi
   where oi.order_id = p_order_id;

  -- Validasi: id baris harus milik pesanan ini, produk/qty/harga tidak berubah.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(trim(v_item->>'id'), '')::uuid;
    if v_item_id is null then
      raise exception 'Pesanan reseller: hanya ukuran dan warna yang bisa diubah.';
    end if;
    if v_item_id = any(v_seen) then
      raise exception 'Baris item duplikat.';
    end if;

    select * into v_row from public.order_items
     where id = v_item_id and order_id = p_order_id;
    if not found then
      raise exception 'Baris item tidak ditemukan pada pesanan ini.';
    end if;
    v_seen := array_append(v_seen, v_item_id);

    if trim(coalesce(v_item->>'product_id', '')) <> v_row.product_id then
      raise exception 'Pesanan reseller: hanya ukuran dan warna yang bisa diubah. Untuk perubahan produk, batalkan lalu buat pesanan baru.';
    end if;
    if coalesce((v_item->>'quantity')::int, -1) <> v_row.quantity then
      raise exception 'Pesanan reseller: jumlah tidak bisa diubah. Untuk perubahan lain, batalkan lalu buat pesanan baru.';
    end if;
    if nullif(trim(v_item->>'price'), '') is not null
       and round((v_item->>'price')::numeric) <> round(v_row.price) then
      raise exception 'Pesanan reseller: harga tidak bisa diubah. Untuk perubahan lain, batalkan lalu buat pesanan baru.';
    end if;

    v_color := coalesce(nullif(trim(v_item->>'color'), ''), 'default');
    v_size := upper(trim(coalesce(v_item->>'size', '')));
    if v_size = '' then
      raise exception 'Ukuran produk harus dipilih';
    end if;
    if not exists (
      select 1 from public.product_variants pv
       where pv.product_id = v_row.product_id
         and coalesce(pv.color, 'default') = v_color
         and upper(pv.size) = v_size
    ) then
      raise exception 'Ukuran % / warna % tidak tersedia untuk produk ini.', v_size, v_color;
    end if;
  end loop;

  if coalesce(array_length(v_seen, 1), 0) <> v_old_count then
    raise exception 'Pesanan reseller: hanya ukuran dan warna yang bisa diubah. Untuk perubahan lain, batalkan lalu buat pesanan baru.';
  end if;

  -- Delta stok: agregat dulu (decrement positif, restore negatif) supaya tukar varian
  -- antar baris tidak gagal karena stok sementara.
  drop table if exists _reseller_edit_stock;
  create temp table _reseller_edit_stock (
    product_id text,
    color text,
    size text,
    delta int
  ) on commit drop;

  insert into _reseller_edit_stock (product_id, color, size, delta)
  with old_stock as (
    select product_id,
           coalesce(nullif(trim(color), ''), 'default') as color,
           upper(trim(size)) as size,
           sum(quantity)::int as qty
      from public.order_items
     where order_id = p_order_id
       and coalesce(trim(product_id), '') <> ''
       and coalesce(trim(size), '') <> ''
       and coalesce(nullif(trim(color), ''), 'default') <> '-'
     group by 1, 2, 3
  ),
  new_stock as (
    select oi.product_id,
           coalesce(nullif(trim(x->>'color'), ''), 'default') as color,
           upper(trim(x->>'size')) as size,
           sum(oi.quantity)::int as qty
      from jsonb_array_elements(p_items) x
      join public.order_items oi
        on oi.id = (x->>'id')::uuid
       and oi.order_id = p_order_id
     group by 1, 2, 3
  )
  select coalesce(o.product_id, n.product_id),
         coalesce(o.color, n.color),
         coalesce(o.size, n.size),
         coalesce(n.qty, 0) - coalesce(o.qty, 0)
    from old_stock o
    full join new_stock n using (product_id, color, size)
   where coalesce(n.qty, 0) <> coalesce(o.qty, 0);

  for v_delta in select * from _reseller_edit_stock
  loop
    if v_delta.delta > 0 then
      if not public.samaqu_decrement_stock(
        v_delta.product_id, v_delta.color, v_delta.size, v_delta.delta::int
      ) then
        raise exception 'Stok ukuran baru tidak cukup untuk % / % / % (butuh %)',
          v_delta.product_id, v_delta.color, v_delta.size, v_delta.delta;
      end if;
    elsif v_delta.delta < 0 then
      perform public.samaqu_restore_stock(
        v_delta.product_id, v_delta.color, v_delta.size, (-v_delta.delta)::int
      );
    end if;
  end loop;

  -- HANYA kolom varian yang berubah. Kolom qty/harga/reseller_* tetap utuh.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item->>'id')::uuid;
    update public.order_items
       set color = coalesce(nullif(trim(v_item->>'color'), ''), 'default'),
           size = upper(trim(v_item->>'size'))
     where id = v_item_id
       and order_id = p_order_id;
  end loop;

  update public.orders
     set items_edited_at = now(),
         items_edited_after_resi = coalesce(nullif(awb_no, ''), '') <> '',
         updated_at = now()
   where id = p_order_id;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id), '[]'::jsonb)
    into v_new_items
    from public.order_items oi
   where oi.order_id = p_order_id;

  insert into public.order_item_edits (
    order_id, actor, had_awb, note, before_items, after_items, before_totals, after_totals
  ) values (
    p_order_id, p_actor, coalesce(nullif(v_order.awb_no, ''), '') <> '', p_note,
    v_old_items, v_new_items,
    jsonb_build_object('subtotal', v_order.subtotal, 'total', v_order.total, 'weight', v_order.weight),
    jsonb_build_object('subtotal', v_order.subtotal, 'total', v_order.total, 'weight', v_order.weight)
  );

  return jsonb_build_object(
    'subtotal', v_order.subtotal,
    'total', v_order.total,
    'weight', v_order.weight,
    'items_edited_after_resi', coalesce(nullif(v_order.awb_no, ''), '') <> ''
  );
end;
$$;

revoke execute on function public.samaqu_edit_reseller_order_items(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.samaqu_edit_reseller_order_items(text, text, jsonb, text) to service_role;
