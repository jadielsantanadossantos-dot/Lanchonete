import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json();
    const { nome, preco, ativo } = body as { nome?: string; preco?: number; ativo?: boolean };
    
    const updateData: Record<string, any> = {};
    if (nome !== undefined) updateData.nome = nome;
    if (preco !== undefined) updateData.preco = preco;
    if (ativo !== undefined) updateData.ativo = ativo;
    
    const { data, error } = await db
      .from('adicionais')
      .update(updateData)
      .eq('id', parseInt(params.id))
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return Response.json({ error: 'Adicional não encontrado' }, { status: 404 });
    }
    
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/adicionais/[id] error:', error);
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
      .from('adicionais')
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
    console.error('DELETE /api/adicionais/[id] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}