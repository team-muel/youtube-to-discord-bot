import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const sanitizeEnv = (value?: string) => (value || '').replace(/\s+/g, '');

const supabaseUrl = sanitizeEnv(process.env.SUPABASE_URL);
const supabaseKey = sanitizeEnv(process.env.SUPABASE_ANON_KEY);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.warn('⚠️ Supabase credentials not found. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your environment variables.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);
