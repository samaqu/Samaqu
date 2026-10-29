-- Perbaikan bug: "COALESCE types text and uuid cannot be matched" (SQLSTATE 42804)
-- saat menyimpan Ubah Transaksi manual di menu Transaksi.
--
-- Gejala: semua transaksi manual (OPS-…) berstatus Lunas/diproses gagal disimpan, dengan
-- pesan error mentah dari Postgres. Pesanan website (SMQ-) tidak terpengaruh karena cabang
-- header manual tidak dijalankan.
--
-- Penyebab: di `samaqu_edit_order_items`, cabang header manual menulis
--     customer_id = coalesce(nullif(trim(p_header->>'customer_id'), ''), customer_id)
-- `orders.customer_id` bertipe uuid, sedangkan `trim(...)` menghasilkan text. Postgres tidak
-- punya coalesce(text, uuid) sehingga SELURUH UPDATE ditolak — bukan hanya kolom pelanggan.
-- Nilai kosong ("" — dikirim UI saat pelanggan tidak dipilih) membuat baris selalu error.
--
-- Perbaikan: cast eksplisit `::uuid`. `nullif(..., '')` membuat string kosong menjadi NULL,
-- lalu `coalesce` mempertahankan customer_id lama. Isi fungsi tidak diubah selain itu.

do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid)
    into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'samaqu_edit_order_items'
   limit 1;

  if v_src is null then
    raise exception 'Fungsi public.samaqu_edit_order_items tidak ditemukan';
  end if;

  -- Sudah benar? jangan sentuh apa pun.
  if v_src like '%trim(p_header->>''customer_id''), '''')::uuid%' then
    raise notice 'samaqu_edit_order_items sudah memakai cast ::uuid — tidak ada perubahan.';
    return;
  end if;

  -- Ganti HANYA ekspresi customer_id pada cabang header manual.
  v_src := replace(
    v_src,
    'coalesce(nullif(trim(p_header->>''customer_id''), ''''), customer_id)',
    'coalesce(nullif(trim(p_header->>''customer_id''), '''')::uuid, customer_id)'
  );

  if v_src like '%coalesce(nullif(trim(p_header->>''customer_id''), ''''), customer_id)%' then
    raise exception 'Pola customer_id tidak berhasil diganti — batalkan, periksa manual.';
  end if;

  execute v_src;
  raise notice 'samaqu_edit_order_items diperbaiki: customer_id di-cast ke uuid.';
end $$;
