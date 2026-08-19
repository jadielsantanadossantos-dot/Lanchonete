import { createServerClient } from '@/lib/supabase/server';
import { getAuthContext, requireAuth } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const { data, error } = await db
      .from('clientes')
      .select('*')
      .eq('id', parseInt(params.id))
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }
    
    return Response.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('GET /api/clientes/[id] error:', error);
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
    const { nome, telefone, rua, numero, bairro, complemento, ponto_referencia } = body as { 
      nome?: string; 
      telefone?: string; 
      rua?: string; 
      numero?: string; 
      bairro?: string; 
      complemento?: string; 
      ponto_referencia?: string; 
    };
    
    const updateData: Record<string, any> = {};
    if (nome !== undefined) updateData.nome = nome;
    if (telefone !== undefined) updateData.telefone = telefone;
    if (rua !== undefined) updateData.rua = rua;
    if (numero !== undefined) updateData.numero = numero;
    if (bairro !== undefined) updateData.bairro = bairro;
    if (complemento !== undefined) updateData.complemento = complemento;
    if (ponto_referencia !== undefined) updateData.ponto_referencia = ponto_referencia;
    
    const { data, error } = await db
      .from('clientes')
      .update(updateData)
      .eq('id', parseInt(params.id))
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }
    
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/clientes/[id] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}