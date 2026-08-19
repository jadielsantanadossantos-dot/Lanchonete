import { createServerClient } from '@/lib/supabase/server';
import { getAuthContext, requireAuth } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const { user } = await getAuthContext(request);
    
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const { data, error } = await supabase
      .from('produtos')
      .select(`
        *,
        categoria:categorias(nome),
        produto_adicionais(adicional:adicionais(*))
      `)
      .eq('id', parseInt(params.id))
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return Response.json({ error: 'Produto não encontrado' }, { status: 404 });
    }
    
    const produto = {
      ...data,
      categoria_nome: data.categoria?.nome,
      adicionais: data.produto_adicionais?.map((pa: any) => pa.adicional).filter(Boolean) || [],
    };
    
    return Response.json(produto);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    console.error('GET /api/produtos/[id] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json() as { 
      nome?: string; 
      categoria_id?: number; 
      descricao?: string; 
      preco?: number; 
      ativo?: boolean; 
      adicionais_ids?: number[]; 
      foto?: string;
    };
    const { nome, categoria_id, descricao, preco, ativo, adicionais_ids, foto } = body;
    
    const updateData: Record<string, any> = {};
    if (nome !== undefined) updateData.nome = nome;
    if (categoria_id !== undefined) updateData.categoria_id = categoria_id;
    if (descricao !== undefined) updateData.descricao = descricao || '';
    if (preco !== undefined) updateData.preco = preco;
    if (foto !== undefined) updateData.foto = foto;
    if (ativo !== undefined) updateData.ativo = ativo;
    
    const { data, error } = await db
      .from('produtos')
      .update(updateData)
      .eq('id', parseInt(params.id))
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return Response.json({ error: 'Produto não encontrado' }, { status: 404 });
    }
    
    if (adicionais_ids !== undefined) {
      await db
        .from('produto_adicionais')
        .delete()
        .eq('produto_id', parseInt(params.id));
      
      if (adicionais_ids.length > 0) {
        const vinculos = adicionais_ids.map((adicional_id: number) => ({
          produto_id: parseInt(params.id),
          adicional_id,
        }));
        
        const { error: vinculoError } = await db
          .from('produto_adicionais')
          .insert(vinculos);
        
        if (vinculoError) throw vinculoError;
      }
    }
    
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/produtos/[id] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const { error } = await db
      .from('produtos')
      .delete()
      .eq('id', parseInt(params.id));
    
    if (error) throw error;
    
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('DELETE /api/produtos/[id] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}