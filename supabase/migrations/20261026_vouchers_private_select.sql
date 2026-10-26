-- Voucher tidak lagi bisa dibaca publik.
--
-- Sebelumnya anon bisa SELECT seluruh tabel `vouchers` (termasuk kode yang masih aktif).
-- Validasi kode sekarang lewat /api/vouchers/validate (service role); admin tetap bisa
-- membaca/menulis lewat sesi admin (policy "Admin read/write").
--
-- Jalankan SETELAH deploy kode yang memakai endpoint validasi.

alter table public.vouchers enable row level security;

-- Hapus SEMUA policy lama (termasuk nama lain yang mungkin dibuat manual), lalu pasang final.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'vouchers'
  loop
    execute format('drop policy %I on public.vouchers', pol.policyname);
  end loop;
end $$;

create policy "Admin read vouchers" on public.vouchers
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "Admin write" on public.vouchers
  for all to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

revoke select on public.vouchers from anon;
