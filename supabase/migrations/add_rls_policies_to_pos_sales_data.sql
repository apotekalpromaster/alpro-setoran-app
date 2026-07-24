-- =============================================================================
-- MIGRATION: add_rls_policies_to_pos_sales_data.sql
-- Run this in: Supabase Dashboard > SQL Editor
-- =============================================================================

-- 1. Policy untuk role 'User' (Outlet) agar bisa membaca data POS miliknya sendiri
DROP POLICY IF EXISTS "User can view own branch POS sales" ON public.pos_sales_data;
CREATE POLICY "User can view own branch POS sales"
  ON public.pos_sales_data
  FOR SELECT
  USING (
    public.get_auth_role() = 'User' AND
    kode_cabang = public.get_auth_username()
  );

-- 2. Policy untuk role 'AreaManager' agar bisa membaca data POS cabang di bawah naungannya
DROP POLICY IF EXISTS "Area Manager can view POS sales in area" ON public.pos_sales_data;
CREATE POLICY "Area Manager can view POS sales in area"
  ON public.pos_sales_data
  FOR SELECT
  USING (
    public.get_auth_role() = 'AreaManager' AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.username = pos_sales_data.kode_cabang
        AND p.area_manager = public.get_auth_username()
    )
  );

GRANT SELECT ON public.pos_sales_data TO authenticated;
GRANT SELECT ON public.pos_sales_data TO anon;
