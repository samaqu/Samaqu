-- Reset password customer lewat OTP WhatsApp (Fonnte).
--
-- Alur:
--   1. customer minta kode  → baris baru (code_hash, expires_at)
--   2. customer verifikasi  → consumed_at + reset_token_hash
--   3. customer set password→ used_at
--
-- Tabel ini TANPA policy RLS: hanya service role (server) yang boleh baca/tulis.
-- Jalankan sekali di Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.password_reset_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_otp_user_created_idx
  ON public.password_reset_otp (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS password_reset_otp_token_idx
  ON public.password_reset_otp (reset_token_hash);

CREATE INDEX IF NOT EXISTS password_reset_otp_ip_created_idx
  ON public.password_reset_otp (requested_ip, created_at DESC);

ALTER TABLE public.password_reset_otp ENABLE ROW LEVEL SECURITY;

-- Lookup user id dari email. Email ada di schema `auth.users` yang tidak diekspos
-- PostgREST, jadi server butuh fungsi SECURITY DEFINER. Hanya service role yang boleh
-- memanggil; anon/authenticated tidak mendapat grant.
CREATE OR REPLACE FUNCTION public.customer_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE lower(u.email) = lower(btrim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.customer_id_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_id_by_email(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_id_by_email(TEXT) TO service_role;

-- Baris lama tidak dipakai lagi setelah 7 hari; bersihkan manual/berkala kalau perlu:
-- DELETE FROM public.password_reset_otp WHERE created_at < NOW() - INTERVAL '7 days';
