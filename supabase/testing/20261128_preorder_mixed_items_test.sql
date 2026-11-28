-- Uji 20261128_preorder_mixed_items.sql (kolom `order_items.is_preorder_item` + backfill + edit PO).
--
-- AMAN: seluruh pengujian berjalan dalam satu blok DO yang DIAKHIRI dengan RAISE EXCEPTION,
-- jadi semua data uji otomatis dibatalkan. Hasil tiap cek dibaca dari pesan error
-- "PREORDER_MIXED_TEST: ...". Baris "FAIL" berarti ada cek yang gagal.
--
-- Prasyarat: migrasi sudah dijalankan. Tidak menyentuh stok maupun pesanan nyata.

do $test$
declare
  v_res text := '';
  v_count int;
  v_flag boolean;
begin
  -- 1. Kolom baru: pesanan non-PO yang sudah ada tetap false (bawaan).
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status)
  values ('DRYRUN-MIX-REG', 'DRYRUN-MIX-REG', 'Uji Reguler', '0000', 'Jl Uji', 'Jakarta',
          100000, 100000, 0, 0, 'diproses', true, 'whatsapp', 'paid');
  insert into order_items (order_id, product_id, product_name, color, size, quantity, price)
  values ('DRYRUN-MIX-REG', 'PRODUK-UJI', 'Produk Uji', 'default', 'L', 2, 50000);
  select is_preorder_item into v_flag from order_items where order_id = 'DRYRUN-MIX-REG';
  v_res := v_res || format(E'\n%s pesanan reguler: is_preorder_item bawaan false (dapat %s)',
    case when v_flag is false then 'PASS' else 'FAIL' end, v_flag);

  -- 2. Pesanan CAMPURAN: 1 baris ready (is_preorder_item manual false), 1 baris PO (true).
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                      is_preorder, preorder_estimate, preorder_deadline)
  values ('DRYRUN-MIX-1', 'DRYRUN-MIX-1', 'Uji Campur', '0000', 'Jl Uji', 'Jakarta',
          150000, 150000, 0, 0, 'diproses', true, 'whatsapp', 'paid', true, '7-10 hari kerja', '2026-12-15');
  insert into order_items (order_id, product_id, product_name, color, size, quantity, price, is_preorder_item)
  values
    ('DRYRUN-MIX-1', 'PRODUK-READY', 'Produk Ready', 'default', 'M', 1, 50000, false),
    ('DRYRUN-MIX-1', 'PRODUK-PO', 'Produk PO', 'default', 'L', 2, 50000, true);
  select count(*) into v_count from order_items where order_id = 'DRYRUN-MIX-1' and is_preorder_item = true;
  v_res := v_res || format(E'\n%s pesanan campuran: 1 baris PO tersimpan (dapat %s dari 2 baris)',
    case when v_count = 1 then 'PASS' else 'FAIL' end, v_count);

  -- 3. Backfill: PO LAMA (dibuat sebelum migrasi ini, semua baris masih false) harus
  --    ikut jadi true oleh UPDATE backfill migrasi (disimulasikan ulang di sini supaya
  --    dry-run ini tidak bergantung urutan menjalankan file).
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                      is_preorder, preorder_estimate, preorder_deadline)
  values ('DRYRUN-MIX-OLD', 'DRYRUN-MIX-OLD', 'Uji PO Lama', '0000', 'Jl Uji', 'Jakarta',
          50000, 50000, 0, 0, 'diproses', false, 'whatsapp', 'paid', true, '7-10 hari kerja', '2026-12-20');
  insert into order_items (order_id, product_id, product_name, color, size, quantity, price, is_preorder_item)
  values ('DRYRUN-MIX-OLD', 'PRODUK-LAMA', 'Produk PO Lama', 'default', 'XL', 1, 50000, false);
  update order_items oi set is_preorder_item = true
    from orders o where o.id = oi.order_id and o.is_preorder = true and oi.is_preorder_item = false;
  select is_preorder_item into v_flag from order_items where order_id = 'DRYRUN-MIX-OLD';
  v_res := v_res || format(E'\n%s backfill PO lama: baris jadi is_preorder_item true (dapat %s)',
    case when v_flag is true then 'PASS' else 'FAIL' end, v_flag);
  -- Baris campuran yang sudah manual false TIDAK boleh ikut ter-backfill jadi true.
  select is_preorder_item into v_flag from order_items where order_id = 'DRYRUN-MIX-1' and product_id = 'PRODUK-READY';
  v_res := v_res || format(E'\n%s backfill tidak menimpa baris ready yang sudah di-set manual (dapat %s, harap false)',
    case when v_flag is false then 'PASS' else 'FAIL' end, v_flag);

  -- 4. samaqu_edit_preorder_items menyimpan is_preorder_item dari payload per baris.
  perform samaqu_edit_preorder_items(
    'DRYRUN-MIX-1', 'uji',
    jsonb_build_array(
      jsonb_build_object('product_id', 'PRODUK-READY', 'product_name', 'Produk Ready', 'color', 'default', 'size', 'M', 'quantity', 1, 'price', 50000, 'is_preorder_item', false),
      jsonb_build_object('product_id', 'PRODUK-PO', 'product_name', 'Produk PO', 'color', 'default', 'size', 'L', 'quantity', 3, 'price', 50000, 'is_preorder_item', true)
    ),
    null, 0, 0, null
  );
  select count(*) into v_count from order_items where order_id = 'DRYRUN-MIX-1' and is_preorder_item = true and quantity = 3;
  v_res := v_res || format(E'\n%s edit PO menyimpan is_preorder_item + qty baru per baris (dapat %s)',
    case when v_count = 1 then 'PASS' else 'FAIL' end, v_count);

  -- 5. Payload TANPA is_preorder_item (field tidak dikirim): default false, bukan error.
  perform samaqu_edit_preorder_items(
    'DRYRUN-MIX-1', 'uji',
    jsonb_build_array(
      jsonb_build_object('product_id', 'PRODUK-READY', 'product_name', 'Produk Ready', 'color', 'default', 'size', 'M', 'quantity', 1, 'price', 50000)
    ),
    null, 0, 0, null
  );
  select is_preorder_item into v_flag from order_items where order_id = 'DRYRUN-MIX-1';
  v_res := v_res || format(E'\n%s edit tanpa is_preorder_item di payload: default false (dapat %s)',
    case when v_flag is false then 'PASS' else 'FAIL' end, v_flag);

  -- Selalu dibatalkan: pesan ini membawa hasil uji.
  raise exception 'PREORDER_MIXED_TEST: %', v_res;
end
$test$;
