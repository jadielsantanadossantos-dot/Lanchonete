import { createServerClient } from '@/lib/supabase/server';
import { getAuthContext, requireAuth } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const { user } = await getAuthContext(request);
    
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const url = new URL(request.url);
    const atendidos = url.searchParams.get('atendidos') === 'true';
    
    let query = supabase.from('bairros').select('*').order('nome', { ascending: true });
    
    if (atendidos) {
      query = query.eq('atendido', true);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return Response.json(data || []);
  } catch (error) {
    console.error('GET /api/bairros error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json();
    const { nome, taxa_entrega, atendido } = body as { nome: string; taxa_entrega?: number; atendido?: boolean };
    
    if (!nome) {
      return Response.json({ error: 'Nome obrigatório' }, { status: 400 });
    }
    
    const insertData: Record<string, any> = { nome };
    if (taxa_entrega !== undefined) insertData.taxa_entrega = taxa_entrega;
    if (atendido !== undefined) insertData.atendido = atendido;
    else insertData.atendido = true;
    
    const { data, error } = await db
      .from('bairros')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'Bairro já cadastrado' }, { status: 400 });
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
    console.error('POST /api/bairros error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}