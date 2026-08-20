import { createServerClient } from '@/lib/supabase/server';
import { getAuthContext, requireAuth } from '@/lib/auth';
import { adicionalSchema } from '@/lib/validation';

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
    const id = getIdFromPath(url.pathname, 'adicionais');
    
    if (id) {
      const { data, error } = await supabase
        .from('adicionais')
        .select('*')
        .eq('id', parseInt(id))
        .single();
      
      if (error) throw error;
      if (!data) return Response.json({ error: 'Adicional não encontrado' }, { status: 404 });
      return Response.json(data);
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
    const parsed = adicionalSchema.safeParse(body);
    
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 });
    }
    
    const { nome, preco, ativo } = parsed.data;
    const insertData: Record<string, any> = { nome, preco, ativo: ativo ?? true };
    
    const { data, error } = await db
      .from('adicionais')
      .insert(insertData)
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

export async function PUT(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'adicionais');
    if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
    
    const body = await request.json();
    const { nome, preco, ativo } = body as { nome?: string; preco?: number; ativo?: boolean };
    
    const updateData: Record<string, any> = {};
    if (nome !== undefined) updateData.nome = nome;
    if (preco !== undefined) updateData.preco = preco;
    if (ativo !== undefined) updateData.ativo = ativo;
    
    const { data, error } = await db
      .from('adicionais')
      .update(updateData)
      .eq('id', parseInt(id))
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
    console.error('PUT /api/adicionais error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'adicionais');
    if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
    
    const { error } = await db
      .from('adicionais')
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
    console.error('DELETE /api/adicionais error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}