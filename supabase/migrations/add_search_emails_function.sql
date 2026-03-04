-- =============================================================================
-- MIGRATION: Add secure email search function for login autocomplete
-- Run this in: Supabase Dashboard → SQL Editor
-- =============================================================================
-- This function bypasses RLS safely by only exposing email addresses,
-- allowing unauthenticated users (anon) to search for their email during login.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.search_emails(search_term text)
RETURNS TABLE(email text)
LANGUAGE sql
SECURITY DEFINER   -- Runs as DB owner, bypasses RLS
STABLE             -- Declares the function doesn't modify data (performance hint)
SET search_path = public
AS $$
  SELECT email
  FROM public.profiles
  WHERE email ILIKE '%' || search_term || '%'
    AND email IS NOT NULL
  ORDER BY email
  LIMIT 6;
$$;

-- Grant execute permission to all roles, including anonymous (unauthenticated) users
GRANT EXECUTE ON FUNCTION public.search_emails(text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_emails(text) TO authenticated;
