-- Migration: Create user_notifications table and automated triggers for Koreksi & Troubleshooting

-- 1. Create user_notifications table
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    kode_toko VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'koreksi', 'troubleshooting', 'system'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_id VARCHAR(100),
    link VARCHAR(255) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast query filtering
CREATE INDEX IF NOT EXISTS idx_user_notif_toko_read ON public.user_notifications(kode_toko, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notif_user_read ON public.user_notifications(user_id, is_read, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.user_notifications;
DROP POLICY IF EXISTS "Users can update their own notification read status" ON public.user_notifications;
DROP POLICY IF EXISTS "Allow service role or authenticated all on notifications" ON public.user_notifications;

-- Create RLS Policies
CREATE POLICY "Allow service role or authenticated all on notifications"
ON public.user_notifications
FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Trigger Function for Koreksi Laporan Status Changes
CREATE OR REPLACE FUNCTION fn_notify_koreksi_status()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status IN ('Approved', 'Rejected') THEN
        INSERT INTO public.user_notifications (
            user_id,
            kode_toko,
            category,
            title,
            message,
            reference_id,
            link
        )
        VALUES (
            NEW.user_id,
            COALESCE(NEW.kode_toko, ''),
            'koreksi',
            CASE 
                WHEN NEW.status = 'Approved' THEN 'Koreksi Laporan Disetujui'
                ELSE 'Koreksi Laporan Ditolak'
            END,
            CASE 
                WHEN NEW.status = 'Approved' THEN 'Pengajuan koreksi tanggal penjualan ' || COALESCE(NEW.tanggal_jual::text, '-') || ' telah disetujui.'
                ELSE 'Pengajuan koreksi tanggal penjualan ' || COALESCE(NEW.tanggal_jual::text, '-') || ' ditolak. Catatan: ' || COALESCE(NEW.penjelasan_koreksi, 'Tidak ada alasan.')
            END,
            NEW.id::text,
            '/koreksi'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_koreksi_status ON public.laporan_koreksi;
CREATE TRIGGER trg_notify_koreksi_status
AFTER UPDATE ON public.laporan_koreksi
FOR EACH ROW EXECUTE FUNCTION fn_notify_koreksi_status();


-- 3. Trigger Function for Troubleshooting Bank Issues
CREATE OR REPLACE FUNCTION fn_notify_troubleshooting_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Kasus 1: Isu Baru Dibuat oleh Admin/Finance
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.user_notifications (
            user_id,
            kode_toko,
            category,
            title,
            message,
            reference_id,
            link
        )
        VALUES (
            NEW.user_id,
            COALESCE(NEW.kode_toko, ''),
            'troubleshooting',
            'Isu Audit Bank Baru',
            'Tim Finance menambahkan isu audit bank untuk tanggal penjualan ' || COALESCE(NEW.tanggal_penjualan::text, '-') || ' (' || COALESCE(NEW.nama_bank, 'Bank') || ').',
            NEW.id::text,
            '/troubleshooting'
        );
    -- Kasus 2: Status atau Catatan Admin Diperbarui
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.catatan_admin IS DISTINCT FROM NEW.catatan_admin) THEN
            INSERT INTO public.user_notifications (
                user_id,
                kode_toko,
                category,
                title,
                message,
                reference_id,
                link
            )
            VALUES (
                NEW.user_id,
                COALESCE(NEW.kode_toko, ''),
                'troubleshooting',
                'Pembaruan Troubleshooting Bank',
                'Status isu tanggal ' || COALESCE(NEW.tanggal_penjualan::text, '-') || ' diubah menjadi ' || COALESCE(NEW.status, 'Diperbarui') || '.',
                NEW.id::text,
                '/troubleshooting'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_troubleshooting_update ON public.finance_troubleshooting_issues;
CREATE TRIGGER trg_notify_troubleshooting_update
AFTER INSERT OR UPDATE ON public.finance_troubleshooting_issues
FOR EACH ROW EXECUTE FUNCTION fn_notify_troubleshooting_update();
