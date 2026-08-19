import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    });
  }
  return supabaseClient;
}

export const supabase = getSupabaseClient();

export type TypedSupabaseClient = SupabaseClient<any, 'public', any>;