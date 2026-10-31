-- Kuota bonus promo Free Cover Hanger — pemakaian & pengembalian otomatis.
--
-- MASALAH: `store_settings.promo_fch_quota_left` sebelumnya tidak pernah berkurang walau
-- pesanan dapat bonus, sehingga angka "Sisa bonus" di halaman pesan selalu tetap.
--
-- PERBAIKAN (dua bagian):
--   1. SATU kolom penanda `orders.promo_bonus_given` — supaya pembatalan pesanan tahu apakah
--      bonus pernah diberikan (untuk mengembalikan kuota + stok tepat sekali).
--   2. Dua RPC atomik supaya checkout barengan tidak bisa membuat kuota minus / bonus dobel:
--        samaqu_consume_promo_quota  → sisa kuota -1 hanya bila sisa > 0
--        samaqu_restore_promo_quota  → sisa kuota +1, dibatasi total kuota
--
-- Stok Cover & Hanger TIDAK ditangani di sini — memakai `samaqu_decrement_stock` /
-- `samaqu_restore_stock` yang sudah ada, sehingga riwayat stok tetap satu sumber.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS promo_bonus_given BOOLEAN DEFAULT false;

COMMENT ON COLUMN orders.promo_bonus_given IS
  'true = pesanan ini mendapat bonus Cover Hanger (kuota promo & stok sudah dipotong sekali).';

-- ── Ambil 1 kuota bonus (atomik) ──
-- Mengembalikan true hanya bila kuota berhasil diambil (sisa sebelumnya > 0).
CREATE OR REPLACE FUNCTION samaqu_consume_promo_quota()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH target AS (
    SELECT id, promo_fch_quota_total, promo_fch_quota_left
    FROM store_settings
    WHERE id = 1
    FOR UPDATE
  ),
  updated AS (
    UPDATE store_settings s
    SET promo_fch_quota_left = s.promo_fch_quota_left - 1
    FROM target t
    WHERE s.id = t.id
      AND COALESCE(t.promo_fch_quota_left, 0) > 0
    RETURNING s.promo_fch_quota_left
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

COMMENT ON FUNCTION samaqu_consume_promo_quota() IS
  'Ambil 1 kuota bonus Free Cover Hanger. true = berhasil, false = kuota habis/belum diatur.';

-- ── Kembalikan 1 kuota bonus (pembatalan pesanan, atomik) ──
-- Dibatasi total kuota supaya angka tidak bisa melebihi total.
CREATE OR REPLACE FUNCTION samaqu_restore_promo_quota()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH target AS (
    SELECT id, promo_fch_quota_total, promo_fch_quota_left
    FROM store_settings
    WHERE id = 1
    FOR UPDATE
  ),
  updated AS (
    UPDATE store_settings s
    SET promo_fch_quota_left = LEAST(
      COALESCE(t.promo_fch_quota_total, 0),
      COALESCE(t.promo_fch_quota_left, 0) + 1
    )
    FROM target t
    WHERE s.id = t.id
    RETURNING s.promo_fch_quota_left
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

COMMENT ON FUNCTION samaqu_restore_promo_quota() IS
  'Kembalikan 1 kuota bonus Free Cover Hanger (dibatasi total kuota).';
