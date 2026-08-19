import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const usuarioId = url.searchParams.get('usuario_id');
    const acao = url.searchParams.get('acao');
    const dataInicio = url.searchParams.get('data_inicio');
    const dataFim = url.searchParams.get('data_fim');
    const limite = parseInt(url.searchParams.get('limite') || '100');
    
    let query = db.from('auditoria').select('*');
    
    if (usuarioId) query = query.eq('usuario_id', parseInt(usuarioId));
    if (acao) query = query.eq('acao', acao);
    if (dataInicio) query = query.gte('criado_em', dataInicio);
    if (dataFim) query = query.lte('criado_em', dataFim + ' 23:59:59');
    
    query = query.order('criado_em', { ascending: false }).limit(limite);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return Response.json(data || []);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('GET /api/auth/auditoria error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}