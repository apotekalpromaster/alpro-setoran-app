-- Migration: Add Area Manager support & notifications for Troubleshooting Bank (Dynamic Store Lookup)

-- 1. Add RLS policy for Area Manager to view troubleshooting issues in their area
DROP POLICY IF EXISTS "Area Manager can view troubleshooting in area" ON public.finance_troubleshooting_issues;
CREATE POLICY "Area Manager can view troubleshooting in area"
ON public.finance_troubleshooting_issues FOR SELECT
USING (
    EXISTS (
        SELECT 1 
        FROM public.profiles store_p
        JOIN public.profiles am_p ON LOWER(TRIM(store_p.area_manager)) = LOWER(TRIM(am_p.username))
        WHERE am_p.id = auth.uid()
          AND (
              store_p.id = finance_troubleshooting_issues.user_id 
              OR LOWER(TRIM(store_p.username)) = LOWER(TRIM(finance_troubleshooting_issues.kode_toko))
              OR LOWER(TRIM(store_p.kode_toko)) = LOWER(TRIM(finance_troubleshooting_issues.kode_toko))
          )
    )
);

-- 2. Update Trigger Function for Troubleshooting Bank (User, AM & Finance Notifications)
CREATE OR REPLACE FUNCTION fn_notify_troubleshooting_update()
RETURNS TRIGGER AS $$
DECLARE
    v_am_username VARCHAR(100);
    v_am_user_id UUID;
    v_kode_toko VARCHAR(50);
BEGIN
    -- Resolve Area Manager username & kode_toko from profiles table
    SELECT p.area_manager, COALESCE(p.username, p.kode_toko)
    INTO v_am_username, v_kode_toko
    FROM public.profiles p
    WHERE p.id = NEW.user_id 
       OR LOWER(TRIM(p.username)) = LOWER(TRIM(NEW.kode_toko))
       OR LOWER(TRIM(p.kode_toko)) = LOWER(TRIM(NEW.kode_toko))
    LIMIT 1;

    -- Resolve Area Manager user_id from profiles
    IF v_am_username IS NOT NULL AND v_am_username <> '' THEN
        SELECT id INTO v_am_user_id 
        FROM public.profiles 
        WHERE LOWER(TRIM(username)) = LOWER(TRIM(v_am_username)) 
        LIMIT 1;
    END IF;

    IF v_kode_toko IS NULL OR v_kode_toko = '' THEN
        v_kode_toko := COALESCE(NEW.kode_toko, '');
    END IF;

    -- A. Finance Menambahkan Isu Baru (INSERT) -> Notifikasi ke Toko & Area Manager
    IF (TG_OP = 'INSERT') THEN
        -- Notifikasi ke Toko
        IF NEW.user_id IS NOT NULL THEN
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
                v_kode_toko,
                'troubleshooting',
                'Isu Audit Bank Baru',
                'Tim Finance menambahkan isu audit bank untuk tanggal penjualan ' || COALESCE(NEW.tanggal_penjualan::text, '-') || ' (' || COALESCE(NEW.nama_bank, 'Bank') || ').',
                NEW.id::text,
                '/user/troubleshooting'
            );
        END IF;

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
                v_kode_toko,
                'troubleshooting',
                'Isu Bank Baru di Wilayah',
                'Cabang ' || COALESCE(v_kode_toko, 'Toko') || ' mendapatkan isu audit bank untuk tanggal penjualan ' || COALESCE(NEW.tanggal_penjualan::text, '-') || '.',
                NEW.id::text,
                '/areamanager/troubleshooting'
            );
        END IF;

    -- B. UPDATE Status / Catatan Admin / Respon Toko
    ELSIF (TG_OP = 'UPDATE') THEN
        -- B1. Finance mengupdate status atau catatan admin -> Notifikasi ke Toko
        IF (OLD.status IS DISTINCT FROM NEW.status) OR (OLD.catatan_admin IS DISTINCT FROM NEW.catatan_admin) THEN
            IF NEW.user_id IS NOT NULL THEN
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
                    v_kode_toko,
                    'troubleshooting',
                    'Pembaruan Troubleshooting Bank',
                    'Status isu tanggal ' || COALESCE(NEW.tanggal_penjualan::text, '-') || ' diubah menjadi ' || COALESCE(NEW.status, 'Diperbarui') || '.',
                    NEW.id::text,
                    '/user/troubleshooting'
                );
            END IF;
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
                v_kode_toko,
                'troubleshooting',
                'Respon Toko Troubleshooting Bank',
                'Cabang ' || COALESCE(v_kode_toko, 'Toko') || ' telah mengirimkan respon/bukti foto untuk isu tanggal ' || COALESCE(NEW.tanggal_penjualan::text, '-') || '.',
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
                    v_kode_toko,
                    'troubleshooting',
                    'Respon Toko Troubleshooting Bank',
                    'Cabang ' || COALESCE(v_kode_toko, 'Toko') || ' telah menanggapi isu bank tanggal ' || COALESCE(NEW.tanggal_penjualan::text, '-') || '.',
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
