-- =============================================================================
-- MIGRATION: Fix Infinite Recursion on public.profiles RLS
-- Run this in: Supabase Dashboard → SQL Editor
-- =============================================================================
-- Issue: The "Admin can view all profiles" policy queried the profiles table 
-- itself to check the role, causing an infinite recursion. This prevented 
-- fetchProfile from working properly on login.
-- Solution: Use a SECURITY DEFINER function to safely check the role while 
-- bypassing RLS entirely.
-- =============================================================================

-- 1. Create a secure function to get the current user's role without triggering RLS
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Drop the existing recursive admin policies
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;

-- 3. Recreate policies using the secure function
CREATE POLICY "Admin can view all profiles"
  ON public.profiles
  FOR SELECT
  USING ( public.get_auth_role() IN ('Admin', 'Finance') );

CREATE POLICY "Admin can update all profiles"
  ON public.profiles
  FOR UPDATE
  USING ( public.get_auth_role() IN ('Admin', 'Finance') );

-- 4. Ensure basic user read policy exists (just in case)
DROP POLICY IF EXISTS "User can view own profile" ON public.profiles;
CREATE POLICY "User can view own profile"
  ON public.profiles
  FOR SELECT
  USING ( auth.uid() = id );
