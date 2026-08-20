import { createServerClient } from '../../lib/supabase/server';
import { getAuthContext, requireAuth } from '../../lib/auth';
import { bairroSchema } from '../../lib/validation';

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
    const { user } = await getAuthContext(request);
    
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'bairros');
    const atendidos = url.searchParams.get('atendidos') === 'true';
    
    if (id) {
      const { data, error } = await supabase
        .from('bairros')
        .select('*')
        .eq('id', parseInt(id))
        .single();
      
      if (error) throw error;
      if (!data) return Response.json({ error: 'Bairro não encontrado' }, { status: 404 });
      return Response.json(data);
    }
    
    let query = supabase.from('bairros').select('*').order('nome', { ascending: true });
    if (atendidos) query = query.eq('atendido', true);
    
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
    const parsed = bairroSchema.safeParse(body);
    
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 });
    }
    
    const { nome, taxa_entrega, atendido } = parsed.data;
    const insertData: Record<string, any> = { nome, taxa_entrega: taxa_entrega ?? 0, atendido: atendido ?? true };
    
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

export async function PUT(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'bairros');
    if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
    
    const body = await request.json();
    const { nome, taxa_entrega, atendido } = body as { nome?: string; taxa_entrega?: number; atendido?: boolean };
    
    const updateData: Record<string, any> = {};
    if (nome !== undefined) updateData.nome = nome;
    if (taxa_entrega !== undefined) updateData.taxa_entrega = taxa_entrega;
    if (atendido !== undefined) updateData.atendido = atendido;
    
    const { data, error } = await db
      .from('bairros')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();
    
    if (error) throw error;
    if (!data) return Response.json({ error: 'Bairro não encontrado' }, { status: 404 });
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/bairros error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'bairros');
    if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
    
    const { error } = await db
      .from('bairros')
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
    console.error('DELETE /api/bairros error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
