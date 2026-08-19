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
      .from('mesas')
      .select('*')
      .eq('id', parseInt(params.id))
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return Response.json({ error: 'Mesa não encontrada' }, { status: 404 });
    }
    
    return Response.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    console.error('GET /api/mesas/[id] error:', error);
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
    
    const body = await request.json();
    const { numero, nome, capacidade, status } = body as { numero?: number; nome?: string; capacidade?: number; status?: string };
    
    const updateData: Record<string, any> = {};
    if (numero !== undefined) updateData.numero = numero;
    if (nome !== undefined) updateData.nome = nome;
    if (capacidade !== undefined) updateData.capacidade = capacidade;
    if (status !== undefined) updateData.status = status;
    
    const { data, error } = await db
      .from('mesas')
      .update(updateData)
      .eq('id', parseInt(params.id))
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return Response.json({ error: 'Mesa não encontrada' }, { status: 404 });
    }
    
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/mesas/[id] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json();
    const { status } = body as { status: string };
    
    const validStatuses = ['livre', 'ocupada', 'reservada'];
    if (!validStatuses.includes(status)) {
      return Response.json({ error: 'Status inválido' }, { status: 400 });
    }
    
    const { data, error } = await db
      .from('mesas')
      .update({ status })
      .eq('id', parseInt(params.id))
      .select()
      .single();
    
    if (error) throw error;
    
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PATCH /api/mesas/[id]/status error:', error);
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
      .from('mesas')
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
    console.error('DELETE /api/mesas/[id] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}