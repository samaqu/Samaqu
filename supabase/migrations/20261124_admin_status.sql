-- Status kerja admin (Aktif / Istirahat / Pulang) untuk panel admin.
-- Hanya MENAMBAH kolom di tabel `admins`; tidak ada data yang diubah atau dihapus.
-- Admin yang sudah ada otomatis berstatus 'pulang' sampai mereka memilih 'aktif' sendiri di header panel.
-- Bot (wa-agent) tidak membaca kolom ini.

alter table public.admins
  add column if not exists status text not null default 'pulang',
  add column if not exists status_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admins_status_check'
  ) then
    alter table public.admins
      add constraint admins_status_check check (status in ('aktif', 'istirahat', 'pulang'));
  end if;
end $$;

comment on column public.admins.status is 'Status kerja yang dipilih admin sendiri: aktif | istirahat | pulang.';
comment on column public.admins.status_at is 'Kapan status terakhir diubah.';
