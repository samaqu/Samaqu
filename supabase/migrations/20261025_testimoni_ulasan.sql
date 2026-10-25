-- Ulasan pelanggan memakai tabel testimonials yang sudah ada.
-- Baris lama tetap tampil di publik: status published, source admin.

alter table public.testimonials
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists order_id text references public.orders (id) on delete set null,
  add column if not exists order_item_id uuid references public.order_items (id) on delete set null,
  add column if not exists status text not null default 'published',
  add column if not exists source text not null default 'admin',
  add column if not exists admin_note text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'testimonials_status_check') then
    alter table public.testimonials
      add constraint testimonials_status_check
      check (status in ('pending', 'published', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'testimonials_source_check') then
    alter table public.testimonials
      add constraint testimonials_source_check
      check (source in ('admin', 'customer'));
  end if;
end $$;

update public.testimonials set updated_at = created_at;

create index if not exists idx_testimonials_status_created
  on public.testimonials (status, created_at desc);
create index if not exists idx_testimonials_user
  on public.testimonials (user_id) where user_id is not null;
create unique index if not exists uq_testimonials_order_item
  on public.testimonials (order_item_id) where order_item_id is not null;

-- Publik hanya boleh membaca ulasan yang sudah disetujui.
drop policy if exists "Public read testimonials" on public.testimonials;
drop policy if exists "Public read published testimonials" on public.testimonials;
create policy "Public read published testimonials"
  on public.testimonials for select
  using (status = 'published');
