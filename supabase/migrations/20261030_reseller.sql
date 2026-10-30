-- =====================================================================
-- SAMAQU — Sistem Reseller Tahap 1 (2026-10-30)
--
-- HANYA database: tabel + kolom + RPC saldo. UI & API route menyusul
-- di tahap berikutnya.
--
-- ATURAN BISNIS (ringkas, final):
--   * Reseller daftar → wajib di-approve admin.
--   * Harga beli = harga katalog − diskon reseller per produk (persen).
--   * Harga jual dicatat; minimal = max(harga minimum produk, harga beli).
--   * order_items.price untuk pesanan reseller DIISI harga beli reseller
--     (aturan aplikasi di tahap 2) supaya omset/laba/terlaris existing
--     tetap benar tanpa mengubah logic yang sudah jalan.
--   * Ongkir J&T dipotong dari saldo, tanpa diskon.
--   * Saldo kurang → kekurangan dibayar manual + bukti, admin konfirmasi.
--   * Top up = transfer manual ke BSI + bukti, admin konfirmasi.
--   * Tarik saldo: tanpa minimal, wajib approve admin. Biaya admin
--     Rp2.500 kalau tujuan bukan BSI. Saldo langsung ditahan saat
--     diajukan; ditolak → saldo kembali.
--   * Pesanan dibatalkan → potongan saldo kembali otomatis (sekali saja
--     per pesanan).
--   * Top up adalah TITIPAN, bukan omset.
--
-- IDEMPOTEN: aman dijalankan ulang (IF NOT EXISTS / DO block / drop-if).
-- ADITIF: tidak menghapus/rename kolom, tidak mengubah data lama.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. resellers — profil reseller, pola login sama dengan affiliate
-- ---------------------------------------------------------------------
create table if not exists public.resellers (
  id uuid primary key default gen_random_uuid(),
  /** Relasi ke auth.users. NULL = pendaftaran belum menyelesaikan verifikasi email. */
  user_id uuid unique references auth.users(id) on delete cascade,
  store_name text not null,
  owner_name text not null,
  whatsapp text,
  city text,
  /** Info toko / sosmed (teks bebas). */
  store_info text,
  social_media text,
  /** Rekening tujuan penarikan saldo. */
  bank_name text,
  bank_number text,
  bank_holder text,
  /** pending | active | rejected | suspended */
  status text not null default 'pending' check (status in ('pending','active','rejected','suspended')),
  reject_reason text,
  approved_at timestamptz,
  /** Email/identitas admin yang memproses (teks, bukan uuid — audit ramah manusia). */
  approved_by text,
  rejected_at timestamptz,
  rejected_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resellers_status_idx on public.resellers (status);
create index if not exists resellers_whatsapp_idx on public.resellers (whatsapp);

-- ---------------------------------------------------------------------
-- 2. reseller_ledger — buku saldo, APPEND-ONLY (trigger menolak
--    UPDATE/DELETE), unik per (type, reference) supaya satu kejadian
--    tidak bisa tercatat dua kali.
-- ---------------------------------------------------------------------
create table if not exists public.reseller_ledger (
  id bigint generated always as identity primary key,
  reseller_id uuid not null references public.resellers(id) on delete restrict,
  /** topup | order_debit | order_refund | withdrawal_hold | withdrawal_release | adjustment */
  type text not null check (type in ('topup','order_debit','order_refund','withdrawal_hold','withdrawal_release','adjustment')),
  /** Bertanda: + = saldo masuk, − = saldo keluar. */
  amount integer not null,
  /** Saldo setelah mutasi ini (dihitung atomik di RPC). */
  balance_after integer not null,
  /** Referensi kejadian: kode top up / nomor/id pesanan / id penarikan. NULL hanya untuk adjustment tanpa referensi. */
  reference text,
  note text,
  /** Admin (email) atau 'sistem'. */
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists reseller_ledger_reseller_idx on public.reseller_ledger (reseller_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reseller_ledger_type_reference_unique'
  ) then
    alter table public.reseller_ledger
      add constraint reseller_ledger_type_reference_unique unique (type, reference);
  end if;
end $$;

-- Jaring pengaman append-only: menolak UPDATE & DELETE untuk SEMUA peran
-- (termasuk service role; koreksi harus lewat baris adjustment baru).
create or replace function public.reseller_ledger_append_only_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception 'reseller_ledger bersifat append-only: baris tidak boleh di-update atau di-delete';
end;
$$;

drop trigger if exists reseller_ledger_no_update on public.reseller_ledger;
create trigger reseller_ledger_no_update
  before update or delete on public.reseller_ledger
  for each row execute function public.reseller_ledger_append_only_guard();

-- ---------------------------------------------------------------------
-- 3. reseller_topups — pengajuan top up (transfer manual ke BSI)
-- ---------------------------------------------------------------------
create table if not exists public.reseller_topups (
  id uuid primary key default gen_random_uuid(),
  /** TOP-YYYYMMDD-NNN (dibuat aplikasi, tahap 2). */
  code text not null unique,
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  amount integer not null check (amount > 0),
  proof_url text,
  /** pending | approved | rejected */
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  reviewed_by text,
  reject_reason text,
  created_at timestamptz not null default now()
);

create index if not exists reseller_topups_reseller_idx on public.reseller_topups (reseller_id, created_at desc);
create index if not exists reseller_topups_status_idx on public.reseller_topups (status);

-- ---------------------------------------------------------------------
-- 4. reseller_withdrawals — pengajuan penarikan saldo
-- ---------------------------------------------------------------------
create table if not exists public.reseller_withdrawals (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  amount integer not null check (amount > 0),
  bank_name text not null,
  bank_number text not null,
  bank_holder text not null,
  /** true = rekening BSI (bebas biaya admin). */
  is_bsi boolean not null default false,
  /** Biaya admin saat ini (0 kalau BSI, atau nilai pengaturan). Dibekukan di baris. */
  admin_fee integer not null default 0,
  /** Yang benar-benar ditransfer = amount − admin_fee. */
  transfer_amount integer not null default 0,
  /** pending | paid | rejected */
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  reviewed_at timestamptz,
  reviewed_by text,
  reject_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reseller_withdrawals_reseller_idx on public.reseller_withdrawals (reseller_id, created_at desc);
create index if not exists reseller_withdrawals_status_idx on public.reseller_withdrawals (status);

-- ---------------------------------------------------------------------
-- 5. reseller_order_payments — bukti transfer manual kekurangan saldo
-- ---------------------------------------------------------------------
create table if not exists public.reseller_order_payments (
  id uuid primary key default gen_random_uuid(),
  /** orders.id di database ini bertipe TEXT. */
  order_id text not null references public.orders(id) on delete cascade,
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  amount integer not null check (amount > 0),
  proof_url text,
  /** pending | approved | rejected */
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  reviewed_by text,
  reject_reason text,
  created_at timestamptz not null default now()
);

create index if not exists reseller_order_payments_order_idx on public.reseller_order_payments (order_id);
create index if not exists reseller_order_payments_reseller_idx on public.reseller_order_payments (reseller_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Kolom tambahan di tabel existing (semua nullable/default, tidak
--    memengaruhi baris & alur lama)
-- ---------------------------------------------------------------------

-- products: diskon reseller per produk (persen). NULL = produk tidak dijual ke reseller.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name = 'reseller_discount_percent'
  ) then
    alter table public.products
      add column reseller_discount_percent numeric(5,2)
      check (reseller_discount_percent >= 0 and reseller_discount_percent <= 100);
  end if;
end $$;

-- orders: atribut pesanan reseller.
alter table public.orders
  add column if not exists reseller_id uuid references public.resellers(id) on delete set null,
  add column if not exists reseller_balance_deduction integer not null default 0,
  add column if not exists reseller_shortfall_amount integer not null default 0,
  add column if not exists reseller_shortfall_status text not null default 'none'
    check (reseller_shortfall_status in ('none','pending','approved','rejected')),
  add column if not exists show_reseller_name_on_label boolean not null default false;

create index if not exists orders_reseller_idx on public.orders (reseller_id);

-- order_items: harga beli & harga jual reseller (untuk pesanan reseller).
alter table public.order_items
  add column if not exists reseller_buy_price integer,
  add column if not exists reseller_sell_price integer;

-- ---------------------------------------------------------------------
-- 7. Pengaturan reseller di store_settings (baris tunggal id = 1)
-- ---------------------------------------------------------------------
alter table public.store_settings
  add column if not exists reseller_admin_fee_non_bsi integer not null default 2500,
  add column if not exists reseller_bsi_bank_name text not null default 'Bank Syariah Indonesia (BSI)',
  add column if not exists reseller_bsi_account_number text,
  add column if not exists reseller_bsi_account_holder text;

insert into public.store_settings (id, reseller_admin_fee_non_bsi, reseller_bsi_bank_name)
values (1, 2500, 'Bank Syariah Indonesia (BSI)')
on conflict (id) do update set
  reseller_admin_fee_non_bsi = coalesce(store_settings.reseller_admin_fee_non_bsi, excluded.reseller_admin_fee_non_bsi),
  reseller_bsi_bank_name = coalesce(nullif(store_settings.reseller_bsi_bank_name, ''), excluded.reseller_bsi_bank_name);

-- =====================================================================
-- RPC ATOMIK — SECURITY DEFINER, hanya service_role.
--
-- Semua mutasi saldo mengunci baris reseller (FOR UPDATE) supaya dua
-- request bersamaan tidak bisa membaca saldo yang sama (anti race).
-- =====================================================================

-- ── Saldo reseller: tersedia + ditahan (penarikan pending) ──
create or replace function public.samaqu_reseller_saldo(p_reseller_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tersedia integer;
  v_ditahan integer;
begin
  select coalesce(sum(amount), 0) into v_tersedia
  from reseller_ledger
  where reseller_id = p_reseller_id;

  select coalesce(sum(amount), 0) into v_ditahan
  from reseller_withdrawals
  where reseller_id = p_reseller_id and status = 'pending';

  return jsonb_build_object(
    'saldo_tersedia', v_tersedia,
    'saldo_ditahan', v_ditahan,
    'saldo_total', v_tersedia + v_ditahan
  );
end;
$$;

-- ── Debit saldo untuk pesanan reseller ──
-- Menolak kalau saldo tidak cukup (saldo tidak boleh minus).
-- Unik (type, reference) mencegah debit ganda untuk pesanan yang sama.
create or replace function public.samaqu_reseller_debit_order(
  p_reseller_id uuid,
  p_order_id text,
  p_jumlah integer,
  p_dibuat_oleh text default 'sistem'
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
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah debit harus lebih dari 0';
  end if;

  -- Kunci baris reseller sampai transaksi selesai → saldo tidak bisa
  -- dibaca-baca bersamaan oleh request lain.
  perform 1 from resellers where id = p_reseller_id for update;

  select coalesce(sum(amount), 0) into v_saldo
  from reseller_ledger
  where reseller_id = p_reseller_id;

  if v_saldo < p_jumlah then
    raise exception 'Saldo reseller tidak cukup (tersedia: %, dibutuhkan: %)', v_saldo, p_jumlah;
  end if;

  v_saldo_setelah := v_saldo - p_jumlah;

  insert into reseller_ledger (reseller_id, type, amount, balance_after, reference, note, created_by)
  values (p_reseller_id, 'order_debit', -p_jumlah, v_saldo_setelah, p_order_id, 'Potongan saldo untuk pesanan', p_dibuat_oleh);

  return jsonb_build_object('ok', true, 'saldo_setelah', v_saldo_setelah);
end;
$$;

-- ── Refund pesanan reseller dibatalkan (sekali saja per pesanan) ──
create or replace function public.samaqu_reseller_refund_order(
  p_reseller_id uuid,
  p_order_id text,
  p_jumlah integer,
  p_dibuat_oleh text default 'sistem'
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
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah refund harus lebih dari 0';
  end if;

  perform 1 from resellers where id = p_reseller_id for update;

  select coalesce(sum(amount), 0) into v_saldo
  from reseller_ledger
  where reseller_id = p_reseller_id;

  v_saldo_setelah := v_saldo + p_jumlah;

  begin
    insert into reseller_ledger (reseller_id, type, amount, balance_after, reference, note, created_by)
    values (p_reseller_id, 'order_refund', p_jumlah, v_saldo_setelah, p_order_id, 'Pengembalian saldo — pesanan dibatalkan', p_dibuat_oleh);
  exception when unique_violation then
    raise exception 'Refund untuk pesanan ini sudah pernah dicatat (sekali saja per pesanan)';
  end;

  return jsonb_build_object('ok', true, 'saldo_setelah', v_saldo_setelah);
end;
$$;

-- ── Konfirmasi top up: status + ledger dalam satu transaksi ──
create or replace function public.samaqu_reseller_konfirmasi_topup(
  p_topup_id uuid,
  p_disetujui boolean,
  p_dibuat_oleh text,
  p_alasan_tolak text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topup public.reseller_topups%rowtype;
  v_saldo integer;
  v_saldo_setelah integer;
begin
  select * into v_topup from reseller_topups where id = p_topup_id for update;
  if not found then
    raise exception 'Top up tidak ditemukan';
  end if;
  if v_topup.status <> 'pending' then
    raise exception 'Top up sudah diproses sebelumnya (status: %)', v_topup.status;
  end if;

  if p_disetujui then
    select coalesce(sum(amount), 0) into v_saldo
    from reseller_ledger
    where reseller_id = v_topup.reseller_id;
    v_saldo_setelah := v_saldo + v_topup.amount;

    update reseller_topups
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = nullif(p_dibuat_oleh, '')
    where id = p_topup_id;

    insert into reseller_ledger (reseller_id, type, amount, balance_after, reference, note, created_by)
    values (v_topup.reseller_id, 'topup', v_topup.amount, v_saldo_setelah, v_topup.code, 'Top up dikonfirmasi admin', p_dibuat_oleh);
  else
    update reseller_topups
    set status = 'rejected',
        reviewed_at = now(),
        reviewed_by = nullif(p_dibuat_oleh, ''),
        reject_reason = p_alasan_tolak
    where id = p_topup_id;
  end if;

  return jsonb_build_object('ok', true, 'status', case when p_disetujui then 'approved' else 'rejected' end);
end;
$$;

-- ── Ajukan penarikan: buat baris + tahan saldo (ledger) atomik ──
create or replace function public.samaqu_reseller_ajukan_penarikan(
  p_reseller_id uuid,
  p_jumlah integer,
  p_bank text,
  p_nomor_rekening text,
  p_nama_rekening text,
  p_is_bsi boolean,
  p_dibuat_oleh text default 'sistem'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo integer;
  v_saldo_setelah integer;
  v_biaya integer;
  v_transfer integer;
  v_withdrawal_id uuid;
begin
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah penarikan harus lebih dari 0';
  end if;

  perform 1 from resellers where id = p_reseller_id for update;

  select coalesce(sum(amount), 0) into v_saldo
  from reseller_ledger
  where reseller_id = p_reseller_id;

  if v_saldo < p_jumlah then
    raise exception 'Saldo reseller tidak cukup (tersedia: %, diajukan: %)', v_saldo, p_jumlah;
  end if;

  -- Biaya admin dibekukan di baris (nilai pengaturan saat pengajuan).
  v_biaya := case when p_is_bsi then 0
                  else coalesce((select reseller_admin_fee_non_bsi from store_settings where id = 1), 2500)
             end;
  v_transfer := p_jumlah - v_biaya;

  insert into reseller_withdrawals (reseller_id, amount, bank_name, bank_number, bank_holder, is_bsi, admin_fee, transfer_amount)
  values (p_reseller_id, p_jumlah, p_bank, p_nomor_rekening, p_nama_rekening, p_is_bsi, v_biaya, v_transfer)
  returning id into v_withdrawal_id;

  v_saldo_setelah := v_saldo - p_jumlah;

  insert into reseller_ledger (reseller_id, type, amount, balance_after, reference, note, created_by)
  values (p_reseller_id, 'withdrawal_hold', -p_jumlah, v_saldo_setelah, v_withdrawal_id::text, 'Saldo ditahan — penarikan diajukan', p_dibuat_oleh);

  return jsonb_build_object(
    'ok', true,
    'withdrawal_id', v_withdrawal_id,
    'biaya_admin', v_biaya,
    'jumlah_ditransfer', v_transfer,
    'saldo_setelah', v_saldo_setelah
  );
end;
$$;

-- ── Putuskan penarikan: setujui = paid, tolak = kembalikan saldo ──
create or replace function public.samaqu_reseller_putuskan_penarikan(
  p_withdrawal_id uuid,
  p_disetujui boolean,
  p_dibuat_oleh text,
  p_alasan_tolak text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wd public.reseller_withdrawals%rowtype;
  v_saldo integer;
  v_saldo_setelah integer;
begin
  select * into v_wd from reseller_withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'Penarikan tidak ditemukan';
  end if;
  if v_wd.status <> 'pending' then
    raise exception 'Penarikan sudah diproses sebelumnya (status: %)', v_wd.status;
  end if;

  if p_disetujui then
    update reseller_withdrawals
    set status = 'paid',
        reviewed_at = now(),
        reviewed_by = nullif(p_dibuat_oleh, ''),
        paid_at = now()
    where id = p_withdrawal_id;
  else
    update reseller_withdrawals
    set status = 'rejected',
        reviewed_at = now(),
        reviewed_by = nullif(p_dibuat_oleh, ''),
        reject_reason = p_alasan_tolak
    where id = p_withdrawal_id;

    -- Saldo yang ditahan kembali utuh (termasuk biaya admin yang belum terpakai).
    select coalesce(sum(amount), 0) into v_saldo
    from reseller_ledger
    where reseller_id = v_wd.reseller_id;
    v_saldo_setelah := v_saldo + v_wd.amount;

    insert into reseller_ledger (reseller_id, type, amount, balance_after, reference, note, created_by)
    values (v_wd.reseller_id, 'withdrawal_release', v_wd.amount, v_saldo_setelah, v_wd.id::text, 'Penarikan ditolak — saldo dikembalikan', p_dibuat_oleh);
  end if;

  return jsonb_build_object('ok', true, 'status', case when p_disetujui then 'paid' else 'rejected' end);
end;
$$;

-- ── Akses RPC: hanya service_role (server). ──
revoke execute on function public.samaqu_reseller_saldo(uuid) from public, anon, authenticated;
revoke execute on function public.samaqu_reseller_debit_order(uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.samaqu_reseller_refund_order(uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.samaqu_reseller_konfirmasi_topup(uuid, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.samaqu_reseller_ajukan_penarikan(uuid, integer, text, text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.samaqu_reseller_putuskan_penarikan(uuid, boolean, text, text) from public, anon, authenticated;

grant execute on function public.samaqu_reseller_saldo(uuid) to service_role;
grant execute on function public.samaqu_reseller_debit_order(uuid, text, integer, text) to service_role;
grant execute on function public.samaqu_reseller_refund_order(uuid, text, integer, text) to service_role;
grant execute on function public.samaqu_reseller_konfirmasi_topup(uuid, boolean, text, text) to service_role;
grant execute on function public.samaqu_reseller_ajukan_penarikan(uuid, integer, text, text, text, boolean, text) to service_role;
grant execute on function public.samaqu_reseller_putuskan_penarikan(uuid, boolean, text, text) to service_role;

-- =====================================================================
-- ROW LEVEL SECURITY
--
-- Reseller HANYA boleh BACA baris miliknya sendiri (join ke resellers
-- via user_id). Anon tidak bisa baca apa pun. Semua perubahan
-- saldo/status hanya lewat server (service role) — tidak ada policy
-- tulis untuk browser.
-- =====================================================================

alter table public.resellers enable row level security;
alter table public.reseller_ledger enable row level security;
alter table public.reseller_topups enable row level security;
alter table public.reseller_withdrawals enable row level security;
alter table public.reseller_order_payments enable row level security;

-- Pastikan tabel baru terbaca lewat Data API untuk peran yang diberi policy.
grant select on public.resellers to authenticated;
grant select on public.reseller_ledger to authenticated;
grant select on public.reseller_topups to authenticated;
grant select on public.reseller_withdrawals to authenticated;
grant select on public.reseller_order_payments to authenticated;

drop policy if exists "reseller read own profile" on public.resellers;
create policy "reseller read own profile" on public.resellers for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "reseller read own ledger" on public.reseller_ledger;
create policy "reseller read own ledger" on public.reseller_ledger for select to authenticated
  using (exists (select 1 from public.resellers r where r.id = reseller_ledger.reseller_id and r.user_id = auth.uid()));

drop policy if exists "reseller read own topups" on public.reseller_topups;
create policy "reseller read own topups" on public.reseller_topups for select to authenticated
  using (exists (select 1 from public.resellers r where r.id = reseller_topups.reseller_id and r.user_id = auth.uid()));

drop policy if exists "reseller read own withdrawals" on public.reseller_withdrawals;
create policy "reseller read own withdrawals" on public.reseller_withdrawals for select to authenticated
  using (exists (select 1 from public.resellers r where r.id = reseller_withdrawals.reseller_id and r.user_id = auth.uid()));

drop policy if exists "reseller read own order payments" on public.reseller_order_payments;
create policy "reseller read own order payments" on public.reseller_order_payments for select to authenticated
  using (exists (select 1 from public.resellers r where r.id = reseller_order_payments.reseller_id and r.user_id = auth.uid()));

-- Defense in depth: cabut hak tulis langsung dari browser.
revoke insert, update, delete on public.resellers from anon, authenticated;
revoke insert, update, delete on public.reseller_ledger from anon, authenticated;
revoke insert, update, delete on public.reseller_topups from anon, authenticated;
revoke insert, update, delete on public.reseller_withdrawals from anon, authenticated;
revoke insert, update, delete on public.reseller_order_payments from anon, authenticated;
