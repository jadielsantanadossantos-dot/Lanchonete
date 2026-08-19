import { createServerClient } from '@/lib/supabase/server';
import { getAuthContext, requireAuth } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const { user } = await getAuthContext(request);
    
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const { data, error } = await supabase
      .from('mesas')
      .select('*')
      .order('numero', { ascending: true });
    
    if (error) throw error;
    
    return Response.json(data || []);
  } catch (error) {
    console.error('GET /api/mesas error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json() as { numero: number; nome?: string; capacidade?: number; status?: string };
    const { numero, nome, capacidade, status } = body;
    
    if (!numero) {
      return Response.json({ error: 'Número obrigatório' }, { status: 400 });
    }
    
    const insertData: Record<string, any> = { numero };
    if (nome !== undefined) insertData.nome = nome;
    else insertData.nome = `Mesa ${numero}`;
    if (capacidade !== undefined) insertData.capacidade = capacidade;
    else insertData.capacidade = 4;
    if (status !== undefined) insertData.status = status;
    else insertData.status = 'livre';
    
    const { data, error } = await db
      .from('mesas')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'Mesa já existe' }, { status: 400 });
      }
      throw error;
    }
    
    return Response.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('POST /api/mesas error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}