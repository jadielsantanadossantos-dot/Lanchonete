import { createServerClient } from '../../lib/supabase/server';
import { getAuthContext, requireAuth } from '../../lib/auth';
import { clienteSchema } from '../../lib/validation';

function getIdFromPath(pathname: string, prefix: string): string | null {
  const parts = pathname.split('/');
  const idx = parts.indexOf(prefix);
  if (idx >= 0 && idx + 1 < parts.length) {
    return parts[idx + 1];
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const id = getIdFromPath(url.pathname, 'clientes');
    
    // /api/clientes/telefone/[telefone]
    if (segments.includes('telefone')) {
      const telefone = segments[segments.indexOf('telefone') + 1];
      const { user } = await getAuthContext(request);
      if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
      
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('telefone', telefone)
        .single();
      
      if (error) throw error;
      if (!data) return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
      return Response.json(data);
    }
    
    // /api/clientes/[id]/pedidos
    if (id && segments.includes('pedidos')) {
      const context = await requireAuth(['admin'])(request);
      const { user, supabase: db } = context;
      
      const { data, error } = await db
        .from('pedidos')
        .select('*')
        .eq('cliente_id', parseInt(id))
        .order('criado_em', { ascending: false });
      
      if (error) throw error;
      return Response.json(data || []);
    }
    
    // /api/clientes/[id]
    if (id) {
      const context = await requireAuth(['admin'])(request);
      const { user, supabase: db } = context;
      
      const { data, error } = await db
        .from('clientes')
        .select('*')
        .eq('id', parseInt(id))
        .single();
      
      if (error) throw error;
      if (!data) return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
      return Response.json(data);
    }
    
    // /api/clientes (list)
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const { data, error } = await db
      .from('clientes')
      .select('*')
      .order('nome', { ascending: true });
    
    if (error) throw error;
    return Response.json(data || []);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('GET /api/clientes error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const { user } = await getAuthContext(request);
    
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const body = await request.json();
    const parsed = clienteSchema.safeParse(body);
    
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 });
    }
    
    const { nome, telefone, rua, numero, bairro, complemento, ponto_referencia } = parsed.data;
    
    const upsertData: Record<string, any> = { nome, telefone };
    if (rua !== undefined) upsertData.rua = rua;
    if (numero !== undefined) upsertData.numero = numero;
    if (bairro !== undefined) upsertData.bairro = bairro;
    if (complemento !== undefined) upsertData.complemento = complemento;
    if (ponto_referencia !== undefined) upsertData.ponto_referencia = ponto_referencia;
    
    const { data, error } = await supabase
      .from('clientes')
      .upsert(upsertData, { onConflict: 'telefone' })
      .select()
      .single();
    
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    console.error('POST /api/clientes error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'clientes');
    if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
    
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
      .eq('id', parseInt(id))
      .select()
      .single();
    
    if (error) throw error;
    if (!data) return Response.json({ error: 'Cliente não encontrado' }, { status: 404 });
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/clientes error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'clientes');
    if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
    
    const { error } = await db
      .from('clientes')
      .delete()
      .eq('id', parseInt(id));
    
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('DELETE /api/clientes error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
