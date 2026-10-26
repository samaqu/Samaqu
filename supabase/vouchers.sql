-- Add voucher_code column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voucher_code TEXT;

-- Vouchers table
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percentage',
  discount_value NUMERIC NOT NULL DEFAULT 0,
  min_purchase NUMERIC DEFAULT 0,
  max_discount NUMERIC DEFAULT 0,
  usage_limit INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
-- Voucher TIDAK boleh dibaca publik (kode aktif bisa disalahgunakan).
-- Validasi lewat /api/vouchers/validate; admin memakai session + policy Admin.
-- Policy final ada di migrations/20261026_vouchers_private_select.sql.
CREATE POLICY "Admin read vouchers" ON vouchers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid()));
