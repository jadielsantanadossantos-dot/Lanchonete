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
      .from('adicionais')
      .select('*')
      .order('nome', { ascending: true });
    
    if (error) throw error;
    
    return Response.json(data || []);
  } catch (error) {
    console.error('GET /api/adicionais error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json();
    const { nome, preco } = body as { nome: string; preco: number };
    
    if (!nome || preco === undefined) {
      return Response.json({ error: 'Nome e preço obrigatórios' }, { status: 400 });
    }
    
    const { data, error } = await db
      .from('adicionais')
      .insert({ nome, preco, ativo: true })
      .select()
      .single();
    
    if (error) throw error;
    
    return Response.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('POST /api/adicionais error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}