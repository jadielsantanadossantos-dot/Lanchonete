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
      .from('categorias')
      .select('*')
      .order('ordem', { ascending: true });
    
    if (error) throw error;
    
    return Response.json(data || []);
  } catch (error) {
    console.error('GET /api/categorias error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json();
    const { nome, ordem } = body as { nome: string; ordem?: number };
    
    if (!nome) {
      return Response.json({ error: 'Nome obrigatório' }, { status: 400 });
    }
    
    const insertData: Record<string, any> = { nome };
    if (ordem !== undefined) insertData.ordem = ordem;
    else insertData.ordem = 0;
    
    const { data, error } = await db
      .from('categorias')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'Categoria já existe' }, { status: 400 });
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
    console.error('POST /api/categorias error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}