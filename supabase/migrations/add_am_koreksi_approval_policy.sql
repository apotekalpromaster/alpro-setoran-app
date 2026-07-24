-- Migration: Add RLS update policy for Area Manager to approve/reject koreksi_requests
DROP POLICY IF EXISTS "Area Manager can update koreksi_requests in area" ON public.koreksi_requests;
CREATE POLICY "Area Manager can update koreksi_requests in area"
  ON public.koreksi_requests
  FOR UPDATE
  USING (
    public.get_auth_role() = 'AreaManager' AND public.is_profile_in_am_area(requested_by)
  )
  WITH CHECK (
    public.get_auth_role() = 'AreaManager' AND public.is_profile_in_am_area(requested_by)
  );
