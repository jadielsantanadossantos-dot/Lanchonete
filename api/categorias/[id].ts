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
    const { nome, ordem } = body as { nome?: string; ordem?: number };
    
    const updateData: Record<string, any> = {};
    if (nome !== undefined) updateData.nome = nome;
    if (ordem !== undefined) updateData.ordem = ordem;
    
    const { data, error } = await db
      .from('categorias')
      .update(updateData)
      .eq('id', parseInt(params.id))
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return Response.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }
    
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/categorias/[id] error:', error);
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
      .from('categorias')
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
    console.error('DELETE /api/categorias/[id] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}