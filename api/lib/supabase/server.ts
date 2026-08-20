import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from './client';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export function createServerClient(): TypedSupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as TypedSupabaseClient;
}

export function createAdminClient(): TypedSupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as TypedSupabaseClient;
}