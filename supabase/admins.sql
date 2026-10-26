-- Admins table for role-based access
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Policy: only authenticated users can read their own admin record
CREATE POLICY "Users can read own admin record" ON admins
  FOR SELECT USING (auth.uid() = user_id);

-- Tidak ada policy tulis publik. Server memakai service role (melewati RLS).
-- Dashboard admin hanya membaca baris miliknya sendiri lewat policy di atas.
