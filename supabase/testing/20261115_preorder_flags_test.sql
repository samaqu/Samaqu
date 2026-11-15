-- Uji 20261115_preorder_flags.sql (Pre-Order Fase 0).
--
-- AMAN: seluruh pengujian berjalan dalam satu blok DO yang DIAKHIRI dengan RAISE EXCEPTION,
-- jadi semua data uji (order, item, riwayat edit) otomatis dibatalkan. Hasil tiap cek dibaca
-- dari pesan error "PREORDER_TEST: ...". Baris "FAIL" berarti ada cek yang gagal.
--
-- Prasyarat: migrasi sudah dijalankan (atau file ini digabung setelah isi migrasi dalam satu
-- transaksi seperti pada dry-run). Memakai produk nyata thobe-grey-indigo-nahawand ukuran S
-- hanya untuk MEMBACA stok sebelum/sesudah; stok tidak pernah ditulis.

do $test$
declare
  v_res text := '';
  v_order text := 'DRYRUN-PO-1';
  v_before int;
  v_after int;
  v_total numeric;
  v_edits int;
  v_qty int;
  v_msg text;
  v_real text;
  v_real_total int;
  v_old_flag_count int;
  v_all int;
  v_ok boolean;
begin
  -- 1. Migrasi: semua pesanan lama tetap reguler (is_preorder = false).
  select count(*) into v_all from orders;
  select count(*) into v_old_flag_count from orders where is_preorder is false;
  v_res := v_res || format(E'\n%s migrasi: %s dari %s pesanan lama is_preorder=false',
    case when v_all = v_old_flag_count then 'PASS' else 'FAIL' end, v_old_flag_count, v_all);

  -- 2. Hak akses fungsi baru = fungsi lama (hanya service_role).
  v_ok := has_function_privilege('service_role', 'public.samaqu_edit_preorder_items(text,text,jsonb,jsonb,numeric,integer,jsonb,text)', 'execute')
      and not has_function_privilege('anon', 'public.samaqu_edit_preorder_items(text,text,jsonb,jsonb,numeric,integer,jsonb,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.samaqu_edit_preorder_items(text,text,jsonb,jsonb,numeric,integer,jsonb,text)', 'execute');
  v_res := v_res || format(E'\n%s akses: hanya service_role yang boleh execute', case when v_ok then 'PASS' else 'FAIL' end);

  -- Stok awal (hanya dibaca).
  select effective_stock into v_before from product_variant_stock
   where product_id = 'thobe-grey-indigo-nahawand' and color = 'default' and size = 'S';

  -- PO uji: stok TIDAK dipotong, status Lunas.
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                      is_preorder, preorder_estimate, weight)
  values (v_order, v_order, 'Uji PO', '0000', 'Jl Uji 1', 'Jakarta', 359000, 368000, 9000, 0, 'diproses', false,
          'whatsapp', 'paid', true, '7-10 hari kerja', 1000);
  insert into order_items (order_id, product_id, product_name, color, size, quantity, price)
  values (v_order, 'thobe-grey-indigo-nahawand', 'Thobe Grey Indigo', 'default', 'S', 1, 359000);

  -- 3. Edit item: qty 1 -> 2. Total dihitung ulang, stok TIDAK berubah, jejak audit tertulis.
  perform public.samaqu_edit_preorder_items(
    v_order, 'uji',
    '[{"product_id":"thobe-grey-indigo-nahawand","product_name":"Thobe Grey Indigo","color":"default","size":"S","quantity":2,"price":359000}]'::jsonb,
    '[]'::jsonb, 0, 2000, null, 'uji dry-run');
  select total into v_total from orders where id = v_order;
  select sum(quantity) into v_qty from order_items where order_id = v_order;
  select count(*) into v_edits from order_item_edits where order_id = v_order;
  select effective_stock into v_after from product_variant_stock
   where product_id = 'thobe-grey-indigo-nahawand' and color = 'default' and size = 'S';
  v_res := v_res || format(E'\n%s edit: total %s (harapan 727000), qty %s (harapan 2)',
    case when v_total = 727000 and v_qty = 2 then 'PASS' else 'FAIL' end, v_total, v_qty);
  v_res := v_res || format(E'\n%s edit: riwayat order_item_edits = %s (harapan 1)',
    case when v_edits = 1 then 'PASS' else 'FAIL' end, v_edits);
  v_res := v_res || format(E'\n%s edit: stok varian sebelum %s sesudah %s (harus sama)',
    case when v_before is not distinct from v_after then 'PASS' else 'FAIL' end, v_before, v_after);

  -- 4. Edit dengan header (ongkir/diskon/estimasi berubah) memperbarui total dan estimasi.
  perform public.samaqu_edit_preorder_items(
    v_order, 'uji',
    '[{"product_id":"thobe-grey-indigo-nahawand","product_name":"Thobe Grey Indigo","color":"default","size":"S","quantity":1,"price":359000}]'::jsonb,
    '[]'::jsonb, 0, 1000,
    '{"shipping_cost":20000,"discount":9000,"preorder_estimate":"10 hari kerja"}'::jsonb, null);
  select total into v_total from orders where id = v_order;
  v_res := v_res || format(E'\n%s header: total %s (harapan 370000), estimasi=%s',
    case when v_total = 370000 and (select preorder_estimate from orders where id = v_order) = '10 hari kerja' then 'PASS' else 'FAIL' end,
    v_total, (select preorder_estimate from orders where id = v_order));

  -- 4b. (setelah 20261115_preorder_edit_header_fix.sql) header ikut menulis source dan created_at,
  --     dan header tanpa kunci itu TIDAK menimpa nilai lama.
  perform public.samaqu_edit_preorder_items(
    v_order, 'uji',
    '[{"product_id":"thobe-grey-indigo-nahawand","product_name":"Thobe Grey Indigo","color":"default","size":"S","quantity":1,"price":359000}]'::jsonb,
    '[]'::jsonb, 0, 1000,
    '{"shipping_cost":20000,"discount":9000,"source":"instagram","created_at":"2026-11-10T01:00:00Z"}'::jsonb, null);
  v_res := v_res || format(E'\n%s header: source=%s created_at=%s',
    case when (select source from orders where id = v_order) = 'instagram'
          and (select created_at from orders where id = v_order) = '2026-11-10T01:00:00Z'::timestamptz then 'PASS' else 'FAIL' end,
    (select source from orders where id = v_order), (select created_at from orders where id = v_order));
  perform public.samaqu_edit_preorder_items(
    v_order, 'uji',
    '[{"product_id":"thobe-grey-indigo-nahawand","product_name":"Thobe Grey Indigo","color":"default","size":"S","quantity":1,"price":359000}]'::jsonb,
    '[]'::jsonb, 0, 1000, '{"shipping_cost":20000,"discount":9000}'::jsonb, null);
  v_res := v_res || format(E'\n%s header tanpa source/created_at: nilai lama tidak tertimpa',
    case when (select source from orders where id = v_order) = 'instagram'
          and (select created_at from orders where id = v_order) = '2026-11-10T01:00:00Z'::timestamptz then 'PASS' else 'FAIL' end);

  -- 5. Penjaga: tiap kondisi terlarang harus menolak dengan error.
  -- 5a. stok sudah dipotong
  update orders set stock_reserved = true where id = v_order;
  begin
    perform public.samaqu_edit_preorder_items(v_order, 'uji', '[{"product_id":"thobe-grey-indigo-nahawand","color":"default","size":"S","quantity":1,"price":359000}]'::jsonb, '[]'::jsonb, 0, 1000);
    v_res := v_res || E'\nFAIL penjaga: stock_reserved=true seharusnya ditolak';
  exception when others then
    v_res := v_res || format(E'\nPASS penjaga: stock_reserved=true ditolak (%s)', left(sqlerrm, 50));
  end;
  update orders set stock_reserved = false where id = v_order;
  -- 5b. stok PO sudah ready
  update orders set preorder_ready_at = now() where id = v_order;
  begin
    perform public.samaqu_edit_preorder_items(v_order, 'uji', '[{"product_id":"thobe-grey-indigo-nahawand","color":"default","size":"S","quantity":1,"price":359000}]'::jsonb, '[]'::jsonb, 0, 1000);
    v_res := v_res || E'\nFAIL penjaga: preorder_ready_at terisi seharusnya ditolak';
  exception when others then
    v_res := v_res || format(E'\nPASS penjaga: sudah ready ditolak (%s)', left(sqlerrm, 50));
  end;
  update orders set preorder_ready_at = null where id = v_order;
  -- 5c. sudah dikirim
  update orders set status = 'dikirim' where id = v_order;
  begin
    perform public.samaqu_edit_preorder_items(v_order, 'uji', '[{"product_id":"thobe-grey-indigo-nahawand","color":"default","size":"S","quantity":1,"price":359000}]'::jsonb, '[]'::jsonb, 0, 1000);
    v_res := v_res || E'\nFAIL penjaga: status dikirim seharusnya ditolak';
  exception when others then
    v_res := v_res || format(E'\nPASS penjaga: status dikirim ditolak (%s)', left(sqlerrm, 50));
  end;
  update orders set status = 'diproses' where id = v_order;
  -- 5d. bukan PO
  update orders set is_preorder = false where id = v_order;
  begin
    perform public.samaqu_edit_preorder_items(v_order, 'uji', '[{"product_id":"thobe-grey-indigo-nahawand","color":"default","size":"S","quantity":1,"price":359000}]'::jsonb, '[]'::jsonb, 0, 1000);
    v_res := v_res || E'\nFAIL penjaga: bukan PO seharusnya ditolak';
  exception when others then
    v_res := v_res || format(E'\nPASS penjaga: bukan PO ditolak (%s)', left(sqlerrm, 50));
  end;
  update orders set is_preorder = true where id = v_order;
  -- 5e. item kosong
  begin
    perform public.samaqu_edit_preorder_items(v_order, 'uji', '[]'::jsonb, '[]'::jsonb, 0, 1000);
    v_res := v_res || E'\nFAIL penjaga: item kosong seharusnya ditolak';
  exception when others then
    v_res := v_res || format(E'\nPASS penjaga: item kosong ditolak (%s)', left(sqlerrm, 50));
  end;

  -- 6. Pesanan REGULER nyata tidak boleh bisa disentuh fungsi PO, dan datanya tidak berubah.
  select id, total into v_real, v_real_total from orders
   where is_preorder is false and stock_reserved is true and status in ('diproses','pending')
   order by created_at desc limit 1;
  if v_real is not null then
    begin
      perform public.samaqu_edit_preorder_items(v_real, 'uji', '[{"product_id":"x","color":"default","size":"S","quantity":1,"price":1}]'::jsonb, '[]'::jsonb, 0, 1);
      v_res := v_res || E'\nFAIL pesanan reguler: seharusnya ditolak';
    exception when others then
      v_res := v_res || format(E'\nPASS pesanan reguler ditolak (%s)', left(sqlerrm, 50));
    end;
    v_res := v_res || format(E'\n%s pesanan reguler: total tetap %s',
      case when (select total from orders where id = v_real) = v_real_total then 'PASS' else 'FAIL' end, v_real_total);
  else
    v_res := v_res || E'\nSKIP pesanan reguler: tidak ada contoh aktif';
  end if;

  -- Selalu batalkan seluruh data uji.
  raise exception 'PREORDER_TEST:%', v_res;
end;
$test$;
