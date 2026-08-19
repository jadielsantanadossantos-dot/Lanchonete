import { createServerClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { telefone: string } }
) {
  try {
    const supabase = createServerClient();
    const { user } = await getAuthContext(request);
    
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefone', params.telefone)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }
    
    return Response.json(data);
  } catch (error) {
    console.error('GET /api/clientes/telefone/[telefone] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}