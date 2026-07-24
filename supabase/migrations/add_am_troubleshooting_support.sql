-- Migration: Add Area Manager support & notifications for Troubleshooting Bank

-- 1. Add RLS policy for Area Manager to view troubleshooting issues in their area
DROP POLICY IF EXISTS "Area Manager can view troubleshooting in area" ON public.finance_troubleshooting_issues;
CREATE POLICY "Area Manager can view troubleshooting in area"
ON public.finance_troubleshooting_issues FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'AreaManager'
          AND LOWER(TRIM(p.username)) = LOWER(TRIM(finance_troubleshooting_issues.area_manager))
    )
);

-- 2. Update Trigger Function for Troubleshooting Bank (User, AM & Finance Notifications)
CREATE OR REPLACE FUNCTION fn_notify_troubleshooting_update()
RETURNS TRIGGER AS $$
DECLARE
    v_am_user_id UUID;
BEGIN
    -- Resolve Area Manager user_id from profiles table
    IF NEW.area_manager IS NOT NULL AND NEW.area_manager <> '' THEN
        SELECT id INTO v_am_user_id 
        FROM public.profiles 
        WHERE LOWER(TRIM(username)) = LOWER(TRIM(NEW.area_manager)) 
        LIMIT 1;
    END IF;

    -- A. Finance Menambahkan Isu Baru (INSERT) -> Notifikasi ke Toko & Area Manager
    IF (TG_OP = 'INSERT') THEN
        -- Notifikasi ke Toko
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

        -- Notifikasi ke Area Manager
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
                COALESCE(NEW.kode_toko, ''),
                'troubleshooting',
                'Isu Bank Baru di Wilayah',
                'Cabang ' || COALESCE(NEW.kode_toko, 'Toko') || ' mendapatkan isu audit bank untuk tanggal penjualan ' || COALESCE(NEW.tanggal_penjualan::text, '-') || '.',
                NEW.id::text,
                '/areamanager/troubleshooting'
            );
        END IF;

    -- B. UPDATE Status / Catatan Admin / Respon Toko
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

        -- B2. Toko memperbarui tindakan/bukti respon (action_outlet) -> Notifikasi ke Finance & Area Manager
        IF (OLD.action_outlet IS DISTINCT FROM NEW.action_outlet) OR (OLD.bukti_url IS DISTINCT FROM NEW.bukti_url) THEN
            -- Notifikasi ke Admin/Finance
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

            -- Notifikasi ke Area Manager
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
                    COALESCE(NEW.kode_toko, ''),
                    'troubleshooting',
                    'Respon Toko Troubleshooting Bank',
                    'Cabang ' || COALESCE(NEW.kode_toko, 'Toko') || ' telah menanggapi isu bank tanggal ' || COALESCE(NEW.tanggal_penjualan::text, '-') || '.',
                    NEW.id::text,
                    '/areamanager/troubleshooting'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_troubleshooting_update ON public.finance_troubleshooting_issues;
CREATE TRIGGER trg_notify_troubleshooting_update
AFTER INSERT OR UPDATE ON public.finance_troubleshooting_issues
FOR EACH ROW EXECUTE FUNCTION fn_notify_troubleshooting_update();
