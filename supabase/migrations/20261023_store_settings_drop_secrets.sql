-- store_settings dibaca publik, jadi tidak boleh menyimpan rahasia.
--
-- RajaOngkir sudah tidak dipakai: kartu pengaturannya (ApiKeySection) bahkan tidak
-- dipasang di UI, dan tidak ada kode server yang membaca kuncinya.
-- Token Meta sekarang disimpan di meta_settings (tabel tanpa policy RLS).
--
-- Kedua kolom kosong saat migration ini dibuat (dicek 23 Oktober 2026), jadi tidak ada
-- nilai yang hilang. Jalankan manual di Supabase SQL Editor.

alter table public.store_settings drop column if exists rajaongkir_api_key;
alter table public.store_settings drop column if exists meta_access_token;
