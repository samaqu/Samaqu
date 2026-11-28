-- Uji 20261128_preorder_mixed_fix_edit_guard.sql
--
-- AMAN: seluruh pengujian berjalan dalam satu blok DO yang DIAKHIRI dengan RAISE EXCEPTION,
-- jadi semua data uji otomatis dibatalkan. Hasil tiap cek dibaca dari pesan error
-- "PREORDER_EDIT_GUARD_FIX_TEST: ...". Baris "FAIL" berarti ada cek yang gagal.

do $test$
declare
  v_res text := '';
  v_ok boolean;
  v_err text;
begin
  -- Pesanan CAMPURAN: stock_reserved = true (baris ready sudah kepotong), masih menunggu
  -- (preorder_ready_at null). Sebelum perbaikan, edit PO ditolak SELALU karena stock_reserved true.
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                      is_preorder, preorder_estimate, preorder_deadline)
  values ('DRYRUN-GUARDFIX-1', 'DRYRUN-GUARDFIX-1', 'Uji Guard Fix', '0000', 'Jl Uji', 'Jakarta',
          150000, 150000, 0, 0, 'diproses', true, 'whatsapp', 'paid', true, '7-10 hari kerja', '2026-12-15');
  insert into order_items (order_id, product_id, product_name, color, size, quantity, price, is_preorder_item)
  values
    ('DRYRUN-GUARDFIX-1', 'PRODUK-READY', 'Produk Ready', 'default', 'M', 1, 50000, false),
    ('DRYRUN-GUARDFIX-1', 'PRODUK-PO', 'Produk PO', 'default', 'L', 2, 50000, true);

  begin
    perform samaqu_edit_preorder_items(
      'DRYRUN-GUARDFIX-1', 'uji',
      jsonb_build_array(
        jsonb_build_object('product_id', 'PRODUK-READY', 'product_name', 'Produk Ready', 'color', 'default', 'size', 'M', 'quantity', 1, 'price', 50000, 'is_preorder_item', false),
        jsonb_build_object('product_id', 'PRODUK-PO', 'product_name', 'Produk PO', 'color', 'default', 'size', 'L', 'quantity', 5, 'price', 50000, 'is_preorder_item', true)
      ),
      null, 0, 0, null
    );
    v_ok := true;
  exception when others then
    v_ok := false;
    v_err := sqlerrm;
  end;
  v_res := v_res || format(E'\n%s edit PO pada pesanan campuran (stock_reserved=true) tidak lagi ditolak%s',
    case when v_ok then 'PASS' else 'FAIL' end, case when v_ok then '' else format(' (error: %s)', v_err) end);

  -- Qty baris PO berubah sesuai payload (edit beneran jalan, bukan cuma lolos tanpa efek).
  perform 1 from order_items where order_id = 'DRYRUN-GUARDFIX-1' and product_id = 'PRODUK-PO' and quantity = 5;
  v_res := v_res || format(E'\n%s qty baris PO ikut berubah jadi 5', case when found then 'PASS' else 'FAIL' end);

  -- Pesanan PO MURNI (stock_reserved=false, perilaku lama) tetap bisa diedit seperti biasa (tidak regresi).
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                      is_preorder, preorder_estimate, preorder_deadline)
  values ('DRYRUN-GUARDFIX-2', 'DRYRUN-GUARDFIX-2', 'Uji PO Murni', '0000', 'Jl Uji', 'Jakarta',
          100000, 100000, 0, 0, 'diproses', false, 'whatsapp', 'paid', true, '7-10 hari kerja', '2026-12-15');
  insert into order_items (order_id, product_id, product_name, color, size, quantity, price, is_preorder_item)
  values ('DRYRUN-GUARDFIX-2', 'PRODUK-PO2', 'Produk PO 2', 'default', 'L', 1, 50000, true);

  begin
    perform samaqu_edit_preorder_items(
      'DRYRUN-GUARDFIX-2', 'uji',
      jsonb_build_array(
        jsonb_build_object('product_id', 'PRODUK-PO2', 'product_name', 'Produk PO 2', 'color', 'default', 'size', 'L', 'quantity', 3, 'price', 50000, 'is_preorder_item', true)
      ),
      null, 0, 0, null
    );
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_res := v_res || format(E'\n%s edit PO murni (stock_reserved=false) tetap jalan seperti biasa', case when v_ok then 'PASS' else 'FAIL' end);

  -- PO yang sudah ready (preorder_ready_at terisi) TETAP ditolak edit lewat jalur ini (perilaku lama, tidak berubah).
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                      is_preorder, preorder_ready_at)
  values ('DRYRUN-GUARDFIX-3', 'DRYRUN-GUARDFIX-3', 'Uji Sudah Ready', '0000', 'Jl Uji', 'Jakarta',
          50000, 50000, 0, 0, 'diproses', true, 'whatsapp', 'paid', true, now());
  insert into order_items (order_id, product_id, product_name, color, size, quantity, price, is_preorder_item)
  values ('DRYRUN-GUARDFIX-3', 'PRODUK-READY3', 'Produk', 'default', 'L', 1, 50000, true);

  begin
    perform samaqu_edit_preorder_items(
      'DRYRUN-GUARDFIX-3', 'uji',
      jsonb_build_array(jsonb_build_object('product_id', 'PRODUK-READY3', 'product_name', 'Produk', 'color', 'default', 'size', 'L', 'quantity', 2, 'price', 50000)),
      null, 0, 0, null
    );
    v_ok := false; -- harusnya exception, kalau lolos berarti FAIL
  exception when others then
    v_ok := true;
  end;
  v_res := v_res || format(E'\n%s PO yang sudah ready tetap ditolak edit lewat jalur ini', case when v_ok then 'PASS' else 'FAIL' end);

  raise exception 'PREORDER_EDIT_GUARD_FIX_TEST: %', v_res;
end
$test$;
