-- RPC stok dan opname adalah SECURITY DEFINER, jadi pembatasan RLS tabel tidak berlaku
-- di dalamnya. Tanpa revoke, anon bisa memanggilnya lewat /rest/v1/rpc/... dan mengubah
-- stok walau policy tulis tabel sudah dikunci.
--
-- Semua pemanggil di aplikasi berjalan di server (route /api/*) memakai service role,
-- jadi cukup cabut dari public/anon/authenticated lalu beri ke service_role.
--
-- Jalankan manual di Supabase SQL Editor.

revoke execute on function public.samaqu_decrement_stock(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.samaqu_restore_stock(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.samaqu_increment_stock(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.samaqu_stock_in_batch(date, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.samaqu_apply_return_stock(uuid) from public, anon, authenticated;
revoke execute on function public.samaqu_reverse_return_stock(uuid) from public, anon, authenticated;
revoke execute on function public.samaqu_apply_stock_opname(uuid, text, text) from public, anon, authenticated;

grant execute on function public.samaqu_decrement_stock(text, text, text, integer) to service_role;
grant execute on function public.samaqu_restore_stock(text, text, text, integer) to service_role;
grant execute on function public.samaqu_increment_stock(text, text, text, integer) to service_role;
grant execute on function public.samaqu_stock_in_batch(date, jsonb, text, text) to service_role;
grant execute on function public.samaqu_apply_return_stock(uuid) to service_role;
grant execute on function public.samaqu_reverse_return_stock(uuid) to service_role;
grant execute on function public.samaqu_apply_stock_opname(uuid, text, text) to service_role;
