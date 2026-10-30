-- =====================================================================
-- SAMAQU — Sistem Reseller Tahap 2 (2026-10-30)
--
-- Tambahan ADITIF di atas tahap 1 (20261030_reseller.sql):
--   1. reseller_otps           — OTP login reseller (WhatsApp)
--   2. reseller_sessions       — token sesi portal reseller
--   3. reseller_notifications  — klaim kirim WA reseller (anti dobel)
--   4. RPC samaqu_reseller_create_order — pembuatan pesanan reseller
--      yang SEPENUHNYA atomik (stok + saldo + insert order/item dalam
--      satu transaksi; kalau satu langkah gagal, semuanya rollback)
--   5. RPC samaqu_reseller_adjust       — koreksi saldo admin (wajib catatan)
--
-- IDEMPOTEN & ADITIF: tidak mengubah tabel/kolom/RPC tahap 1, tidak
-- menyentuh data lama.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. reseller_otps — OTP login reseller (nomor WA = identitas)
--    Pola sama dengan password_reset_otp: hash HMAC, TTL 5 menit,
--    maksimal 5 percobaan. Tanpa policy RLS (hanya service role).
-- ---------------------------------------------------------------------
create table if not exists public.reseller_otps (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  requested_ip text,
  created_at timestamptz not null default now()
);

create index if not exists reseller_otps_reseller_idx on public.reseller_otps (reseller_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. reseller_sessions — token sesi portal reseller
--    Yang tersimpan hanya hash token; logout = hapus baris.
-- ---------------------------------------------------------------------
create table if not exists public.reseller_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists reseller_sessions_reseller_idx on public.reseller_sessions (reseller_id);

-- ---------------------------------------------------------------------
-- 3. reseller_notifications — klaim "kirim sekali" untuk WA reseller
--    Klaim = INSERT ... ON CONFLICT DO NOTHING; yang berhasil insert
--    dialah yang boleh mengirim. UNIQUE (type, reference) = anti dobel
--    di level database.
-- ---------------------------------------------------------------------
create table if not exists public.reseller_notifications (
  id bigint generated always as identity primary key,
  type text not null check (type in (
    'account_created',
    'order_created',
    'order_paid',
    'order_shipped',
    'order_delivered',
    'order_cancelled',
    'topup_approved',
    'topup_rejected',
    'withdrawal_paid',
    'withdrawal_rejected',
    'shortfall_approved',
    'shortfall_rejected'
  )),
  /** id pesanan / top up / penarikan / reseller (sesuai type). */
  reference text not null,
  created_at timestamptz not null default now(),
  unique (type, reference)
);

create index if not exists reseller_notifications_ref_idx on public.reseller_notifications (reference, created_at desc);

-- Lookup reseller dari nomor WhatsApp (normalisasi di aplikasi).
create index if not exists resellers_whatsapp_idx on public.resellers (whatsapp);

-- ---------------------------------------------------------------------
-- RLS: ketiga tabel hanya diakses service role (pola password_reset_otp)
-- ---------------------------------------------------------------------
alter table public.reseller_otps enable row level security;
alter table public.reseller_sessions enable row level security;
alter table public.reseller_notifications enable row level security;

revoke all on public.reseller_otps from anon, authenticated;
revoke all on public.reseller_sessions from anon, authenticated;
revoke all on public.reseller_notifications from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC: pembuatan pesanan reseller — SATU transaksi penuh
--    (stok → validasi → debit saldo → order + item + kekurangan).
--    Dipanggil hanya lewat service role; input harga sudah divalidasi
--    server sebelum RPC ini dipanggil, dan subtotal DIHITUNG ULANG di
--    sini dari item supaya angka yang tersimpan tidak mungkin beda.
-- ---------------------------------------------------------------------
create or replace function public.samaqu_reseller_create_order(
  p_reseller_id uuid,
  p_order_number text,
  p_items jsonb,
  p_customer_name text,
  p_customer_whatsapp text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_kecamatan text,
  p_shipping_province text,
  p_shipping_postal_code text,
  p_shipping_notes text,
  p_shipping_method text,
  p_shipping_cost integer,
  p_weight integer,
  p_subtotal integer,
  p_total integer,
  p_show_label boolean,
  p_created_by text default 'sistem'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reseller public.resellers%rowtype;
  v_saldo integer;
  v_deduct integer;
  v_shortfall integer;
  v_status text;
  v_payment_status text;
  v_paid_at timestamptz;
  v_order_id text;
  v_item jsonb;
  v_ok boolean;
  v_subtotal_check integer := 0;
begin
  -- Kunci baris reseller: dua pesanan bersamaan tidak bisa membaca saldo yang sama.
  select * into v_reseller from public.resellers where id = p_reseller_id for update;
  if not found then
    raise exception 'Reseller tidak ditemukan';
  end if;
  if v_reseller.status <> 'active' then
    raise exception 'Akun reseller tidak aktif';
  end if;

  if p_total is null or p_total < 0 then
    raise exception 'Total pesanan tidak valid';
  end if;

  select coalesce(sum(amount), 0) into v_saldo
  from public.reseller_ledger where reseller_id = p_reseller_id;

  -- Saldo cukup → langsung diproses & lunas. Kurang → potong semua yang ada,
  -- catat kekurangan, status menunggu konfirmasi admin.
  if v_saldo >= p_total then
    v_deduct := p_total;
    v_shortfall := 0;
    v_status := 'diproses';
    v_payment_status := 'paid';
    v_paid_at := now();
  else
    v_deduct := v_saldo;
    v_shortfall := p_total - v_saldo;
    v_status := 'pending';
    v_payment_status := 'unpaid';
    v_paid_at := null;
  end if;

  -- Stok atomik per item (RPC stok lama; gagal = seluruh transaksi rollback).
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item->>'quantity') is null or (v_item->>'quantity')::int < 1 then
      raise exception 'Jumlah item tidak valid';
    end if;
    if (v_item->>'color') is not null and (v_item->>'size') is not null
       and (v_item->>'color') <> '' and (v_item->>'color') <> '-' then
      v_ok := public.samaqu_decrement_stock(
        v_item->>'product_id', v_item->>'color', v_item->>'size', (v_item->>'quantity')::int
      );
      if not v_ok then
        raise exception 'Stok tidak mencukupi';
      end if;
    end if;
    v_subtotal_check := v_subtotal_check
      + round((v_item->>'buy_price')::numeric)::int * (v_item->>'quantity')::int;
  end loop;

  if v_subtotal_check <> p_subtotal then
    raise exception 'Subtotal tidak sesuai perhitungan server';
  end if;

  -- Debit saldo. UNIQUE (type, reference) mencegah pesanan yang sama
  -- didebit dua kali; reference = nomor pesanan.
  if v_deduct > 0 then
    insert into public.reseller_ledger
      (reseller_id, type, amount, balance_after, reference, note, created_by)
    values
      (p_reseller_id, 'order_debit', -v_deduct, v_saldo - v_deduct,
       p_order_number, 'Potongan saldo untuk pesanan', p_created_by);
  end if;

  insert into public.orders (
    order_number, reseller_id, customer_name, customer_whatsapp,
    shipping_address, shipping_city, shipping_kecamatan, shipping_province,
    shipping_postal_code, shipping_notes, shipping_method, shipping_cost,
    payment_method, subtotal, discount, total, status, payment_status,
    paid_at, stock_reserved, source, weight,
    reseller_balance_deduction, reseller_shortfall_amount,
    reseller_shortfall_status, show_reseller_name_on_label
  ) values (
    p_order_number, p_reseller_id, p_customer_name, p_customer_whatsapp,
    p_shipping_address, p_shipping_city, p_shipping_kecamatan, p_shipping_province,
    p_shipping_postal_code, p_shipping_notes, p_shipping_method, p_shipping_cost,
    'reseller', p_subtotal, 0, p_total, v_status, v_payment_status,
    v_paid_at, true, 'reseller', p_weight,
    v_deduct, v_shortfall,
    case when v_shortfall > 0 then 'pending' else 'none' end, p_show_label
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, product_name, product_image, color, size,
    series, kain, quantity, price, reseller_buy_price, reseller_sell_price
  )
  select
    v_order_id,
    v->>'product_id',
    v->>'product_name',
    nullif(v->>'image', ''),
    nullif(v->>'color', ''),
    nullif(v->>'size', ''),
    nullif(v->>'series', ''),
    nullif(v->>'kain', ''),
    (v->>'quantity')::int,
    -- order_items.price = harga BELI reseller → omset/laba/terlaris lama
    -- tetap benar tanpa mengubah aturan SALE_STATUSES.
    round((v->>'buy_price')::numeric)::int,
    round((v->>'buy_price')::numeric)::int,
    round((v->>'sell_price')::numeric)::int
  from jsonb_array_elements(p_items) v;

  if v_shortfall > 0 then
    insert into public.reseller_order_payments (order_id, reseller_id, amount, status)
    values (v_order_id, p_reseller_id, v_shortfall, 'pending');
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'balance_deduction', v_deduct,
    'shortfall', v_shortfall,
    'status', v_status
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RPC: koreksi saldo admin (adjustment) — catatan WAJIB
-- ---------------------------------------------------------------------
create or replace function public.samaqu_reseller_adjust(
  p_reseller_id uuid,
  p_jumlah integer,
  p_catatan text,
  p_dibuat_oleh text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo integer;
  v_saldo_setelah integer;
begin
  if nullif(btrim(p_catatan), '') is null then
    raise exception 'Koreksi saldo wajib memakai catatan';
  end if;
  if p_jumlah is null or p_jumlah = 0 then
    raise exception 'Jumlah koreksi tidak boleh 0';
  end if;

  perform 1 from public.resellers where id = p_reseller_id for update;

  select coalesce(sum(amount), 0) into v_saldo
  from public.reseller_ledger where reseller_id = p_reseller_id;

  v_saldo_setelah := v_saldo + p_jumlah;

  insert into public.reseller_ledger
    (reseller_id, type, amount, balance_after, reference, note, created_by)
  values
    (p_reseller_id, 'adjustment', p_jumlah, v_saldo_setelah, null, p_catatan, p_dibuat_oleh);

  return jsonb_build_object('ok', true, 'saldo_setelah', v_saldo_setelah);
end;
$$;

-- ── Akses: hanya service_role (server) ──
revoke execute on function public.samaqu_reseller_create_order(uuid, text, jsonb, text, text, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, text) from public, anon, authenticated;
revoke execute on function public.samaqu_reseller_adjust(uuid, integer, text, text) from public, anon, authenticated;

grant execute on function public.samaqu_reseller_create_order(uuid, text, jsonb, text, text, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, text) to service_role;
grant execute on function public.samaqu_reseller_adjust(uuid, integer, text, text) to service_role;
