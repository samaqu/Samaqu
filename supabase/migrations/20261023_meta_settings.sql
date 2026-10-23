-- Meta Conversions API: pindahkan access token dari `store_settings` (public read) ke tabel
-- khusus tanpa policy RLS. Dijalankan manual di Supabase SQL editor (sandbox tidak punya DDL).
--
-- Kenapa: `store_settings` punya policy "Public read" dan dibaca anon client. Kolom
-- `meta_access_token` di sana bisa dibaca siapa pun yang memegang anon key. Token CAPI hanya
-- boleh dibaca server (service role).
--
-- Urutan aman: deploy kode dulu (sudah fallback ke kolom lama), baru jalankan SQL ini.
-- Setelah itu ROTASI token di Meta Business Suite, karena token lama pernah terekspos publik.

CREATE TABLE IF NOT EXISTS meta_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  access_token TEXT,             -- System User access token untuk Conversions API
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE meta_settings ENABLE ROW LEVEL SECURITY;

-- Sengaja tanpa policy: RLS aktif + tanpa policy = anon/authenticated tidak bisa baca/tulis.
-- Hanya service role (server) yang bisa.

INSERT INTO meta_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Salin token lama (kalau ada) ke tabel rahasia.
UPDATE meta_settings m
SET access_token = s.meta_access_token,
    updated_at = NOW()
FROM store_settings s
WHERE m.id = 1
  AND s.id = 1
  AND s.meta_access_token IS NOT NULL
  AND (m.access_token IS NULL OR m.access_token = '');

-- Hapus dari tabel yang bisa dibaca publik. Pixel ID / status aktif / test event code tetap
-- di store_settings (bukan rahasia, memang dibaca browser untuk base code).
UPDATE store_settings
SET meta_access_token = NULL
WHERE meta_access_token IS NOT NULL;
