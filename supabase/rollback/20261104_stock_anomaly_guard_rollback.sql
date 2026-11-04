-- Backup: definisi fungsi stok SEBELUM perubahan 20261104.
-- Jalankan file ini kalau perlu kembali ke perilaku lama.

CREATE OR REPLACE FUNCTION public.samaqu_decrement_stock(
  p_product_id TEXT,
  p_color TEXT,
  p_size TEXT,
  p_qty INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock INTEGER;
  v_base_product_id TEXT;
  v_base_size TEXT;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN
    RETURN FALSE;
  END IF;

  SELECT base_product_id, base_size INTO v_base_product_id, v_base_size
  FROM product_variants
  WHERE product_id = p_product_id AND color = p_color AND size = p_size
  LIMIT 1;

  IF v_base_product_id IS NOT NULL AND v_base_size IS NOT NULL THEN
    p_product_id := v_base_product_id;
    p_size := v_base_size;
  END IF;

  SELECT stock INTO v_stock
  FROM product_variants
  WHERE product_id = p_product_id AND color = p_color AND size = p_size
  FOR UPDATE;

  IF v_stock IS NULL THEN
    RETURN TRUE;
  END IF;

  IF v_stock < p_qty THEN
    RETURN FALSE;
  END IF;

  UPDATE product_variants
  SET stock = v_stock - p_qty
  WHERE product_id = p_product_id AND color = p_color AND size = p_size;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.samaqu_restore_stock(
  p_product_id TEXT,
  p_color TEXT,
  p_size TEXT,
  p_qty INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_product_id TEXT;
  v_base_size TEXT;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN
    RETURN;
  END IF;

  SELECT base_product_id, base_size INTO v_base_product_id, v_base_size
  FROM product_variants
  WHERE product_id = p_product_id AND color = p_color AND size = p_size
  LIMIT 1;

  IF v_base_product_id IS NOT NULL AND v_base_size IS NOT NULL THEN
    p_product_id := v_base_product_id;
    p_size := v_base_size;
  END IF;

  UPDATE product_variants
  SET stock = stock + p_qty
  WHERE product_id = p_product_id AND color = p_color AND size = p_size;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.samaqu_decrement_stock(text, text, text, integer) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.samaqu_restore_stock(text, text, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.samaqu_decrement_stock(text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.samaqu_restore_stock(text, text, text, integer) TO service_role;
