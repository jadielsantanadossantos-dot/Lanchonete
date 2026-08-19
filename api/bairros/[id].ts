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
    const { nome, taxa_entrega, atendido } = body as { nome?: string; taxa_entrega?: number; atendido?: boolean };
    
    const updateData: Record<string, any> = {};
    if (nome !== undefined) updateData.nome = nome;
    if (taxa_entrega !== undefined) updateData.taxa_entrega = taxa_entrega;
    if (atendido !== undefined) updateData.atendido = atendido;
    
    const { data, error } = await db
      .from('bairros')
      .update(updateData)
      .eq('id', parseInt(params.id))
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return Response.json({ error: 'Bairro não encontrado' }, { status: 404 });
    }
    
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/bairros/[id] error:', error);
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
      .from('bairros')
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
    console.error('DELETE /api/bairros/[id] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}