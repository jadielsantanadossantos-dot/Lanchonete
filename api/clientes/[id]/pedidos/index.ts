import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const { data, error } = await db
      .from('pedidos')
      .select('*')
      .eq('cliente_id', parseInt(params.id))
      .order('criado_em', { ascending: false });
    
    if (error) throw error;
    
    return Response.json(data || []);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('GET /api/clientes/[id]/pedidos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}