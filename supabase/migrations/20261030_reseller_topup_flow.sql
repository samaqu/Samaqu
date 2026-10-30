-- =====================================================================
-- SAMAQU — Reseller: alur top up 3 langkah (2026-10-30)
--
-- ADITIF & idempoten:
--   1. reseller_topups.status boleh: menunggu_bayar | pending | approved |
--      rejected | kedaluwarsa | dibatalkan
--      - menunggu_bayar : data dibuat, BELUM upload bukti (tidak masuk antrean admin)
--      - pending        : bukti sudah diupload, menunggu konfirmasi admin
--      - kedaluwarsa    : lewat batas waktu sebelum bukti (tanpa mutasi saldo)
--      - dibatalkan     : dibatalkan reseller (tanpa mutasi saldo)
--   2. reseller_topups.pay_deadline — batas waktu bayar (60 menit sejak dibuat).
--
-- Bukti boleh kosong selama menunggu_bayar (proof_url sudah nullable).
-- Ledger/saldo TIDAK disentuh: saldo hanya berubah saat admin konfirmasi.
-- =====================================================================

do $$
begin
  -- Ganti CHECK status lama (pending/approved/rejected) dengan daftar baru.
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.reseller_topups'::regclass
      and conname = 'reseller_topups_status_check'
  ) then
    alter table public.reseller_topups drop constraint reseller_topups_status_check;
  end if;

  alter table public.reseller_topups
    add constraint reseller_topups_status_check
    check (status in ('menunggu_bayar','pending','approved','rejected','kedaluwarsa','dibatalkan'));
end $$;

alter table public.reseller_topups
  add column if not exists pay_deadline timestamptz;

create index if not exists reseller_topups_deadline_idx
  on public.reseller_topups (pay_deadline)
  where status = 'menunggu_bayar';
