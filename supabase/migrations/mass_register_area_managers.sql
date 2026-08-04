-- =============================================================================
-- DATA SEEDING: mass_register_area_managers.sql
-- Run this in: Supabase Dashboard > SQL Editor
-- Password default for all Area Managers: AMKEBANGGAANPAKBERNARD
-- =============================================================================

-- Mendaftarkan Area Manager: SANNAULI SIAHAAN
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'sannauli@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'sannauli@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"SANNAULI SIAHAAN"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'sannauli@apotekalpro.id';

-- Mendaftarkan Area Manager: BAID SION BR. SINAGA
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'baidsion@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'baidsion@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"BAID SION BR. SINAGA"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'baidsion@apotekalpro.id';

-- Mendaftarkan Area Manager: HANNA DOLI BR KABAN
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'hannadoli@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'hannadoli@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"HANNA DOLI BR KABAN"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'hannadoli@apotekalpro.id';

-- Mendaftarkan Area Manager: SITI NURLAILA
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'sitinurlaila@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'sitinurlaila@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"SITI NURLAILA"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'sitinurlaila@apotekalpro.id';

-- Mendaftarkan Area Manager: ISMA LESTARI
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'ismalestari@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'ismalestari@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"ISMA LESTARI"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'ismalestari@apotekalpro.id';

-- Mendaftarkan Area Manager: FUNNA ANINDYA
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'funnaanindya@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'funnaanindya@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"FUNNA ANINDYA"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'funnaanindya@apotekalpro.id';

-- Mendaftarkan Area Manager: JEPPARIA M SIREGAR
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'jeppariasiregar@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'jeppariasiregar@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"JEPPARIA M SIREGAR"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'jeppariasiregar@apotekalpro.id';

-- Mendaftarkan Area Manager: APRIANA LUMBAN GAOL
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'aprianalumbangaol@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'aprianalumbangaol@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"APRIANA LUMBAN GAOL"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'aprianalumbangaol@apotekalpro.id';

-- Mendaftarkan Area Manager: CAMELIA FITRIANI
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'cameliafitriani@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'cameliafitriani@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"CAMELIA FITRIANI"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'cameliafitriani@apotekalpro.id';

-- Mendaftarkan Area Manager: NARTA LENA GINTING
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'nartalenaginting@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'nartalenaginting@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"NARTA LENA GINTING"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'nartalenaginting@apotekalpro.id';

-- Mendaftarkan Area Manager: ADE IRMA SEPTIANI AIDHA
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'adeirma@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'adeirma@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"ADE IRMA SEPTIANI AIDHA"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'adeirma@apotekalpro.id';

-- Mendaftarkan Area Manager: LELIANA OKTAVIA SARAGIH
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'lelianasaragih@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'lelianasaragih@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"LELIANA OKTAVIA SARAGIH"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'lelianasaragih@apotekalpro.id';

-- Mendaftarkan Area Manager: JESIKA SILITONGA
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'jesikasilitonga@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'jesikasilitonga@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"JESIKA SILITONGA"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'jesikasilitonga@apotekalpro.id';

-- Mendaftarkan Area Manager: AULIALOLA GALUS
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'aulialolagalus@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'aulialolagalus@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"AULIALOLA GALUS"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'aulialolagalus@apotekalpro.id';

-- Mendaftarkan Area Manager: SUSI SUKAESIH
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'susisukaesih@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'susisukaesih@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"SUSI SUKAESIH"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'susisukaesih@apotekalpro.id';

-- Mendaftarkan Area Manager: MUHAMMAD LUTFI
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'muhammadlutfi@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'muhammadlutfi@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"MUHAMMAD LUTFI"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'muhammadlutfi@apotekalpro.id';

-- Mendaftarkan Area Manager: RYAN ADILA
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'ryanadila@apotekalpro.id') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, 
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'ryanadila@apotekalpro.id',
      crypt('AMKEBANGGAANPAKBERNARD', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"RYAN ADILA"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

UPDATE public.profiles 
SET role = 'AreaManager' 
WHERE email = 'ryanadila@apotekalpro.id';

