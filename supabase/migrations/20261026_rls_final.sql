-- RLS final untuk orders, order_items, admins.
--
-- Semua tulis/baca operasional lewat route server (service role). Browser hanya boleh:
--   - customer membaca pesanan/iten miliknya sendiri,
--   - admin (baris di `admins`) membaca pesanan/iten,
--   - user membaca baris `admins` miliknya sendiri (dipakai dashboard admin).
--
-- Tidak ada policy INSERT/UPDATE/DELETE untuk anon/authenticated: checkout & admin memakai
-- service role, sehingga menghapus "Public insert orders" aman.

do $$
declare
  tbl text;
  pol record;
begin
  foreach tbl in array array['orders', 'order_items', 'admins'] loop
    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy %I on public.%I', pol.policyname, tbl);
    end loop;
  end loop;
end $$;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.admins enable row level security;

-- Customer hanya melihat pesanannya sendiri.
create policy "Customers read own orders" on public.orders
  for select to authenticated
  using (auth.uid() = customer_id);

create policy "Customers read own order items" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.customer_id = auth.uid()
    )
  );

-- Admin (dashboard admin) boleh membaca semua pesanan/iten.
create policy "Admins read orders" on public.orders
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "Admins read order items" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- Dashboard admin membaca role-nya sendiri dari tabel admins.
create policy "Users read own admin row" on public.admins
  for select to authenticated
  using (auth.uid() = user_id);

-- Defense in depth: cabut hak tulis langsung dari browser.
revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;
revoke insert, update, delete on public.admins from anon, authenticated;
