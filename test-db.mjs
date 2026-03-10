import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '<put URL here if needed>';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '<put anon key here>';

// We can just read them from .env if present. Let's see if there's a .env file.
