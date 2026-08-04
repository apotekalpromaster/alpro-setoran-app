-- Migration: Full Bidirectional Notifications for User, Area Manager & Admin/Finance

-- 1. Ensure user_notifications table exists
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_notif_toko_read ON public.user_notifications(kode_toko, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notif_user_read ON public.user_notifications(user_id, is_read, created_at DESC);

-- Enable RLS
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role or authenticated all on notifications" ON public.user_notifications;
CREATE POLICY "Allow service role or authenticated all on notifications"
ON public.user_notifications FOR ALL
USING (true) WITH CHECK (true);


-- 2. Trigger Function for Koreksi Laporan (Both User & Area Manager Notifications)
CREATE OR REPLACE FUNCTION fn_notify_koreksi_status()
RETURNS TRIGGER AS $$
DECLARE
    v_kode_toko VARCHAR(50);
    v_tanggal_jual DATE;
    v_am_username VARCHAR(100);
    v_am_user_id UUID;
BEGIN
    -- Kasus A: Toko Mengajukan Koreksi Baru (INSERT) -> Kirim Notifikasi ke Area Manager
    IF (TG_OP = 'INSERT') THEN
        -- Resolve kode_toko & tanggal_jual from linked laporan
        SELECT l.kode_cabang, l.tanggal_jual 
        INTO v_kode_toko, v_tanggal_jual
        FROM public.laporan l 
        WHERE l.id = NEW.laporan_id;

        IF v_kode_toko IS NULL THEN
            SELECT p.username INTO v_kode_toko FROM public.profiles p WHERE p.id = NEW.requested_by;
        END IF;

        -- Find store's Area Manager
        SELECT p.area_manager INTO v_am_username FROM public.profiles p WHERE p.id = NEW.requested_by;
        IF v_am_username IS NOT NULL THEN
            SELECT p.id INTO v_am_user_id FROM public.profiles p WHERE LOWER(TRIM(p.username)) = LOWER(TRIM(v_am_username)) LIMIT 1;
        END IF;

        IF v_am_user_id IS NOT NULL THEN
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
                v_am_user_id,
                COALESCE(v_kode_toko, ''),
                'koreksi',
                'Pengajuan Koreksi Baru',
                'Cabang ' || COALESCE(v_kode_toko, 'Toko') || ' mengajukan koreksi laporan untuk tanggal ' || COALESCE(v_tanggal_jual::text, '-') || '.',
                NEW.id::text,
                '/areamanager/koreksi-approval'
            );
        END IF;

    -- Kasus B: AM/Finance Mengubah Status Koreksi (UPDATE Approved / Rejected) -> Kirim Notifikasi ke Toko
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status IN ('Approved', 'Rejected') THEN
            SELECT l.kode_cabang, l.tanggal_jual 
            INTO v_kode_toko, v_tanggal_jual
            FROM public.laporan l 
            WHERE l.id = NEW.laporan_id;

            IF v_kode_toko IS NULL THEN
                SELECT p.username INTO v_kode_toko FROM public.profiles p WHERE p.id = NEW.requested_by;
            END IF;

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
                NEW.requested_by,
                COALESCE(v_kode_toko, ''),
                'koreksi',
                CASE 
                    WHEN NEW.status = 'Approved' THEN 'Koreksi Laporan Disetujui'
                    ELSE 'Koreksi Laporan Ditolak'
                END,
                CASE 
                    WHEN NEW.status = 'Approved' THEN 'Pengajuan koreksi tanggal penjualan ' || COALESCE(v_tanggal_jual::text, '-') || ' telah disetujui.'
                    ELSE 'Pengajuan koreksi tanggal penjualan ' || COALESCE(v_tanggal_jual::text, '-') || ' ditolak. Catatan: ' || COALESCE(NEW.penjelasan_koreksi, 'Tidak ada alasan.')
                END,
                NEW.id::text,
                '/koreksi'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_koreksi_status ON public.koreksi_requests;
CREATE TRIGGER trg_notify_koreksi_status
AFTER INSERT OR UPDATE ON public.koreksi_requests
FOR EACH ROW EXECUTE FUNCTION fn_notify_koreksi_status();


-- 3. Trigger Function for Troubleshooting Bank (User & Admin/Finance Notifications)
CREATE OR REPLACE FUNCTION fn_notify_troubleshooting_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Kasus A: Finance Menambahkan Isu Baru (INSERT) -> Notifikasi ke Toko
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
            '/user/troubleshooting'
        );
    -- Kasus B: UPDATE Status / Catatan Admin / Respon Toko
    ELSIF (TG_OP = 'UPDATE') THEN
        -- B1. Finance mengupdate status atau catatan admin -> Notifikasi ke Toko
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
                '/user/troubleshooting'
            );
        END IF;

        -- B2. Toko memperbarui tindakan/bukti respon (action_outlet) -> Notifikasi ke Tim Finance/Admin
        IF (OLD.action_outlet IS DISTINCT FROM NEW.action_outlet) OR (OLD.bukti_url IS DISTINCT FROM NEW.bukti_url) THEN
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
                NULL,
                COALESCE(NEW.kode_toko, ''),
                'troubleshooting',
                'Respon Toko Troubleshooting Bank',
                'Cabang ' || COALESCE(NEW.kode_toko, 'Toko') || ' telah mengirimkan respon/bukti foto untuk isu tanggal ' || COALESCE(NEW.tanggal_penjualan::text, '-') || '.',
                NEW.id::text,
                '/admin/troubleshooting'
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
