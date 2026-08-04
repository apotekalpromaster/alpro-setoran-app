-- =============================================================================
-- MIGRATION: add_area_manager_support.sql
-- Run this in: Supabase Dashboard > SQL Editor
-- =============================================================================

-- 1. Secure helper function to get current user's username bypassing RLS
CREATE OR REPLACE FUNCTION public.get_auth_username()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT username FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Secure helper function to check if a profile belongs to the current Area Manager's area
CREATE OR REPLACE FUNCTION public.is_profile_in_am_area(profile_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = profile_id
      AND p.area_manager = (SELECT username FROM public.profiles WHERE id = auth.uid())
  );
$$;

-- 3. RLS policies for public.profiles
DROP POLICY IF EXISTS "Area Manager can view profiles in area" ON public.profiles;
CREATE POLICY "Area Manager can view profiles in area"
  ON public.profiles
  FOR SELECT
  USING (
    public.get_auth_role() = 'AreaManager' AND (
      area_manager = public.get_auth_username()
      OR
      id = auth.uid()
    )
  );

-- 4. RLS policies for public.laporan
DROP POLICY IF EXISTS "Area Manager can view reports in area" ON public.laporan;
CREATE POLICY "Area Manager can view reports in area"
  ON public.laporan
  FOR SELECT
  USING (
    public.get_auth_role() = 'AreaManager' AND public.is_profile_in_am_area(user_id)
  );

-- 5. RLS policies for public.koreksi_requests
DROP POLICY IF EXISTS "Area Manager can view koreksi_requests in area" ON public.koreksi_requests;
CREATE POLICY "Area Manager can view koreksi_requests in area"
  ON public.koreksi_requests
  FOR SELECT
  USING (
    public.get_auth_role() = 'AreaManager' AND public.is_profile_in_am_area(requested_by)
  );
