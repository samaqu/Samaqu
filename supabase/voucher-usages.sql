-- Add limit_per_wa to vouchers table
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS limit_per_wa BOOLEAN DEFAULT false;

-- Voucher usage tracking table
CREATE TABLE IF NOT EXISTS voucher_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID REFERENCES vouchers(id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL,
  order_id UUID REFERENCES orders(id),
  used_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE voucher_usages ENABLE ROW LEVEL SECURITY;
-- voucher_usages berisi nomor WhatsApp pembeli: hanya admin yang boleh membaca.
CREATE POLICY "Admin read voucher_usages" ON voucher_usages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admins a WHERE a.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_voucher_usages_voucher_whatsapp ON voucher_usages(voucher_id, whatsapp_number);
