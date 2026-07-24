-- =============================================================================
-- MIGRATION: create_finance_troubleshooting_tables.sql
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABEL UTAMA ISSUE TROUBLESHOOTING AUDIT BANK
CREATE TABLE IF NOT EXISTS public.finance_troubleshooting_issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id TEXT,
    uploaded_by UUID REFERENCES public.profiles(id),
    pic_finance TEXT, -- Misal: 'Viona', 'Lusi'
    kategori_issue TEXT NOT NULL, -- 'TIDAK SETOR', 'KURANG GESEK', 'LEBIH GESEK', 'TRANSFER BANK', dll.
    periode_minggu TEXT,
    user_id UUID REFERENCES public.profiles(id), -- Match by kode_toko / username
    kode_toko TEXT NOT NULL, -- Kode 7 digit e.g. BTTSDL1
    company TEXT,
    tanggal_sales DATE,
    keterangan_finance TEXT,
    nominal_selisih NUMERIC DEFAULT 0,
    sla_deadline TIMESTAMPTZ NOT NULL, -- created_at + 2 Days
    status TEXT NOT NULL DEFAULT 'PENDING_STORE_RESPONSE', -- 'PENDING_STORE_RESPONSE', 'PENDING_FINANCE_APPROVAL', 'APPROVED', 'REJECTED'
    reject_notes TEXT,
    action_outlet TEXT,
    pic_outlet TEXT,
    bukti_url TEXT,
    responded_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing untuk performa filter & lookup
CREATE INDEX IF NOT EXISTS idx_ft_issues_lookup ON public.finance_troubleshooting_issues(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ft_issues_kode_toko ON public.finance_troubleshooting_issues(kode_toko);
CREATE INDEX IF NOT EXISTS idx_ft_issues_pic_finance ON public.finance_troubleshooting_issues(pic_finance);
CREATE INDEX IF NOT EXISTS idx_ft_issues_status ON public.finance_troubleshooting_issues(status);

-- Enable RLS
ALTER TABLE public.finance_troubleshooting_issues ENABLE ROW LEVEL SECURITY;

-- 2. TABEL RIWAYAT REVISI (DING-DONG LOOP)
CREATE TABLE IF NOT EXISTS public.finance_troubleshooting_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID REFERENCES public.finance_troubleshooting_issues(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id),
    action_type TEXT NOT NULL, -- 'MANUAL_CREATED', 'EXCEL_UPLOADED', 'SUBMITTED_BY_STORE', 'APPROVED_BY_FINANCE', 'REJECTED_BY_FINANCE', 'MASS_UPDATED'
    action_outlet TEXT,
    pic_outlet TEXT,
    bukti_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ft_history_issue_id ON public.finance_troubleshooting_history(issue_id);

-- Enable RLS
ALTER TABLE public.finance_troubleshooting_history ENABLE ROW LEVEL SECURITY;

-- 3. RLS POLICIES FOR FINANCE & ADMIN
DROP POLICY IF EXISTS "Finance and Admin full access on issues" ON public.finance_troubleshooting_issues;
CREATE POLICY "Finance and Admin full access on issues"
  ON public.finance_troubleshooting_issues
  FOR ALL
  USING ( public.get_auth_role() IN ('Admin', 'Finance') );

DROP POLICY IF EXISTS "Finance and Admin full access on history" ON public.finance_troubleshooting_history;
CREATE POLICY "Finance and Admin full access on history"
  ON public.finance_troubleshooting_history
  FOR ALL
  USING ( public.get_auth_role() IN ('Admin', 'Finance') );

-- 4. RLS POLICIES FOR USER (STORE)
DROP POLICY IF EXISTS "User view own store issues" ON public.finance_troubleshooting_issues;
CREATE POLICY "User view own store issues"
  ON public.finance_troubleshooting_issues
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.username = finance_troubleshooting_issues.kode_toko OR p.kode_toko = finance_troubleshooting_issues.kode_toko)
    )
  );

DROP POLICY IF EXISTS "User update own store issues" ON public.finance_troubleshooting_issues;
CREATE POLICY "User update own store issues"
  ON public.finance_troubleshooting_issues
  FOR UPDATE
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.username = finance_troubleshooting_issues.kode_toko OR p.kode_toko = finance_troubleshooting_issues.kode_toko)
    )
  );

DROP POLICY IF EXISTS "User view history" ON public.finance_troubleshooting_history;
CREATE POLICY "User view history"
  ON public.finance_troubleshooting_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.finance_troubleshooting_issues i
      WHERE i.id = finance_troubleshooting_history.issue_id
        AND (i.user_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.username = i.kode_toko OR p.kode_toko = i.kode_toko)
        ))
    )
  );

DROP POLICY IF EXISTS "User insert history" ON public.finance_troubleshooting_history;
CREATE POLICY "User insert history"
  ON public.finance_troubleshooting_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.finance_troubleshooting_issues i
      WHERE i.id = finance_troubleshooting_history.issue_id
        AND (i.user_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND (p.username = i.kode_toko OR p.kode_toko = i.kode_toko)
        ))
    )
  );

-- Grants
GRANT ALL ON public.finance_troubleshooting_issues TO authenticated;
GRANT ALL ON public.finance_troubleshooting_history TO authenticated;
GRANT SELECT ON public.finance_troubleshooting_issues TO anon;
GRANT SELECT ON public.finance_troubleshooting_history TO anon;
