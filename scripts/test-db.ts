import 'dotenv/config';
import { createServerClient } from '@/lib/supabase/server';

const supabase = createServerClient();

const { data, error } = await supabase.from('categorias').select('*').limit(5);
console.log('DATA:', data);
console.log('ERROR:', error);