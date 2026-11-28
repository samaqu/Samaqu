-- Uji 20261128_edit_order_items_notes_fix.sql
--
-- AMAN: seluruh pengujian berjalan dalam satu blok DO yang DIAKHIRI dengan RAISE EXCEPTION,
-- jadi semua data uji otomatis dibatalkan. Hasil tiap cek dibaca dari pesan error
-- "EDIT_ORDER_NOTES_FIX_TEST: ...". Baris "FAIL" berarti ada cek yang gagal.
--
-- Fokus: (1) Catatan sekarang tersimpan untuk SMQ (website) dan CYO (open_order), (2) catatan
-- kosong TIDAK menimpa catatan lama jadi kosong untuk keduanya, (3) SMQ/CYO/manual berperilaku
-- PERSIS SAMA seperti sebelumnya untuk alamat/identitas/total/stok (tidak ada regresi).

do $test$
declare
  v_res text := '';
  v_ok boolean;
  v_err text;
  v_notes text;
  v_addr text;
  v_total numeric;
begin
  -- ── Pesanan SMQ (website) ──
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      shipping_kecamatan, shipping_province, shipping_postal_code, shipping_notes,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status)
  values ('DRYRUN-SMQ-1', 'SMQ-20261128-001', 'Uji SMQ', '0000', 'Jl Lama 1', 'Jakarta',
          'Kec Lama', 'DKI Jakarta', '10110', 'catatan lama smq',
          100000, 100000, 0, 0, 'diproses', true, 'website', 'paid');
  insert into order_items (order_id, product_id, product_name, color, size, quantity, price)
  values ('DRYRUN-SMQ-1', 'PRODUK-SMQ', 'Produk SMQ', 'default', 'M', 1, 100000);

  -- Edit: isi catatan baru, total/qty TIDAK berubah (SMQ wajib sama).
  perform samaqu_edit_order_items(
    'DRYRUN-SMQ-1', 'uji',
    jsonb_build_array(jsonb_build_object('product_id', 'PRODUK-SMQ', 'product_name', 'Produk SMQ', 'color', 'default', 'size', 'M', 'quantity', 1, 'price', 100000)),
    null, 0, 0, '', jsonb_build_object('shipping_notes', 'catatan baru dari admin'), null, ''
  );
  select shipping_notes, shipping_address, total into v_notes, v_addr, v_total from orders where id = 'DRYRUN-SMQ-1';
  v_res := v_res || format(E'\n%s SMQ: catatan baru tersimpan (dapat "%s")', case when v_notes = 'catatan baru dari admin' then 'PASS' else 'FAIL' end, v_notes);
  v_res := v_res || format(E'\n%s SMQ: alamat TIDAK berubah (masih "%s")', case when v_addr = 'Jl Lama 1' then 'PASS' else 'FAIL' end, v_addr);
  v_res := v_res || format(E'\n%s SMQ: total TIDAK berubah (masih %s)', case when v_total = 100000 then 'PASS' else 'FAIL' end, v_total);

  -- Edit lagi dengan catatan KOSONG: catatan lama harus TETAP (tidak ditimpa kosong).
  perform samaqu_edit_order_items(
    'DRYRUN-SMQ-1', 'uji',
    jsonb_build_array(jsonb_build_object('product_id', 'PRODUK-SMQ', 'product_name', 'Produk SMQ', 'color', 'default', 'size', 'M', 'quantity', 1, 'price', 100000)),
    null, 0, 0, '', jsonb_build_object('shipping_notes', ''), null, ''
  );
  select shipping_notes into v_notes from orders where id = 'DRYRUN-SMQ-1';
  v_res := v_res || format(E'\n%s SMQ: catatan kosong tidak menimpa catatan lama (masih "%s")', case when v_notes = 'catatan baru dari admin' then 'PASS' else 'FAIL' end, v_notes);

  -- Edit tanpa p_header sama sekali (null): perilaku lama, tidak boleh error.
  begin
    perform samaqu_edit_order_items(
      'DRYRUN-SMQ-1', 'uji',
      jsonb_build_array(jsonb_build_object('product_id', 'PRODUK-SMQ', 'product_name', 'Produk SMQ', 'color', 'default', 'size', 'M', 'quantity', 1, 'price', 100000)),
      null, 0, 0, '', null, null, ''
    );
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  v_res := v_res || format(E'\n%s SMQ: edit tanpa p_header (null) tetap jalan seperti biasa', case when v_ok then 'PASS' else 'FAIL' end);

  -- SMQ: total berubah harus TETAP ditolak (perilaku lama tidak berubah).
  begin
    perform samaqu_edit_order_items(
      'DRYRUN-SMQ-1', 'uji',
      jsonb_build_array(jsonb_build_object('product_id', 'PRODUK-SMQ', 'product_name', 'Produk SMQ', 'color', 'default', 'size', 'M', 'quantity', 2, 'price', 100000)),
      null, 0, 0, '', jsonb_build_object('shipping_notes', 'coba ubah qty'), null, ''
    );
    v_ok := false; -- harusnya exception
  exception when others then
    v_ok := true;
  end;
  v_res := v_res || format(E'\n%s SMQ: total berubah tetap ditolak (perilaku lama)', case when v_ok then 'PASS' else 'FAIL' end);

  -- ── Pesanan CYO (open_order) ──
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      shipping_notes, subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status)
  values ('DRYRUN-CYO-1', 'CYO-20261128-001', 'Uji CYO', '0000', 'Jl Lama CYO', 'Jakarta',
          null, 80000, 80000, 0, 0, 'diproses', true, 'website', 'paid');
  insert into order_items (order_id, product_id, product_name, color, size, quantity, price)
  values ('DRYRUN-CYO-1', 'PRODUK-CYO', 'Produk CYO', 'default', 'L', 1, 80000);

  perform samaqu_edit_order_items(
    'DRYRUN-CYO-1', 'uji',
    jsonb_build_array(jsonb_build_object('product_id', 'PRODUK-CYO', 'product_name', 'Produk CYO', 'color', 'default', 'size', 'L', 'quantity', 1, 'price', 80000)),
    null, 0, 0, '', jsonb_build_object('shipping_notes', 'minta dikirim sore'), null, ''
  );
  select shipping_notes, shipping_address into v_notes, v_addr from orders where id = 'DRYRUN-CYO-1';
  v_res := v_res || format(E'\n%s CYO: catatan tersimpan (dapat "%s")', case when v_notes = 'minta dikirim sore' then 'PASS' else 'FAIL' end, v_notes);
  v_res := v_res || format(E'\n%s CYO: alamat TIDAK berubah (masih "%s")', case when v_addr = 'Jl Lama CYO' then 'PASS' else 'FAIL' end, v_addr);

  -- ── Pesanan manual: perilaku lama (bisa kosongkan catatan, alamat ikut berubah) TIDAK berubah ──
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      shipping_kecamatan, shipping_province, shipping_postal_code, shipping_notes,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status)
  values ('DRYRUN-MANUAL-1', 'DRYRUN-MANUAL-1', 'Uji Manual', '0000', 'Jl Lama Manual', 'Jakarta',
          'Kec Lama', 'DKI Jakarta', '10110', 'catatan manual lama',
          50000, 50000, 0, 0, 'diproses', true, 'whatsapp', 'paid');
  insert into order_items (order_id, product_id, product_name, color, size, quantity, price)
  values ('DRYRUN-MANUAL-1', 'PRODUK-MANUAL', 'Produk Manual', 'default', 'S', 1, 50000);

  perform samaqu_edit_order_items(
    'DRYRUN-MANUAL-1', 'uji',
    jsonb_build_array(jsonb_build_object('product_id', 'PRODUK-MANUAL', 'product_name', 'Produk Manual', 'color', 'default', 'size', 'S', 'quantity', 1, 'price', 50000)),
    null, 0, 0, '',
    jsonb_build_object('shipping_address', 'Jl Baru Manual', 'shipping_city', 'Jakarta', 'shipping_kecamatan', 'Kec Lama', 'shipping_province', 'DKI Jakarta', 'shipping_postal_code', '10110', 'shipping_notes', ''),
    null, ''
  );
  select shipping_notes, shipping_address into v_notes, v_addr from orders where id = 'DRYRUN-MANUAL-1';
  v_res := v_res || format(E'\n%s Manual: alamat TETAP bisa diubah (dapat "%s")', case when v_addr = 'Jl Baru Manual' then 'PASS' else 'FAIL' end, v_addr);
  v_res := v_res || format(E'\n%s Manual: catatan kosong TETAP mengosongkan (perilaku lama, dapat "%s")', case when v_notes is null then 'PASS' else 'FAIL' end, coalesce(v_notes, '(null)'));

  raise exception 'EDIT_ORDER_NOTES_FIX_TEST: %', v_res;
end
$test$;
