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
    const ativos = url.searchParams.get('ativos') === 'true';
    
    let query = supabase
      .from('produtos')
      .select(`
        *,
        categoria:categorias(nome),
        produto_adicionais(adicional:adicionais(*))
      `)
      .order('nome', { ascending: true });
    
    if (ativos) {
      query = query.eq('ativo', true);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    const produtos = (data || []).map((p: any) => ({
      ...p,
      categoria_nome: p.categoria?.nome,
      adicionais: p.produto_adicionais?.map((pa: any) => pa.adicional).filter(Boolean) || [],
    }));
    
    return Response.json(produtos);
  } catch (error) {
    console.error('GET /api/produtos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json() as { 
      nome: string; 
      categoria_id: number; 
      descricao?: string; 
      preco: number; 
      ativo?: boolean; 
      adicionais_ids?: number[]; 
      foto?: string;
    };
    const { nome, categoria_id, descricao, preco, ativo, adicionais_ids, foto } = body;
    
    if (!nome || !categoria_id || preco === undefined) {
      return Response.json({ error: 'Nome, categoria e preço obrigatórios' }, { status: 400 });
    }
    
    const insertData: Record<string, any> = { nome, categoria_id, preco };
    if (descricao !== undefined) insertData.descricao = descricao || '';
    if (foto !== undefined) insertData.foto = foto || null;
    if (ativo !== undefined) insertData.ativo = ativo;
    else insertData.ativo = true;
    
    const { data: produto, error } = await db
      .from('produtos')
      .insert(insertData)
      .select()
      .single();
    
    if (error) throw error;
    
    if (adicionais_ids && adicionais_ids.length > 0) {
      const vinculos = adicionais_ids.map((adicional_id: number) => ({
        produto_id: produto.id,
        adicional_id,
      }));
      
      const { error: vinculoError } = await db
        .from('produto_adicionais')
        .insert(vinculos);
      
      if (vinculoError) throw vinculoError;
    }
    
    return Response.json({ id: produto.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('POST /api/produtos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}