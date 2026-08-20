import { createServerClient } from '@/lib/supabase/server';
import { getAuthContext, requireAuth } from '@/lib/auth';
import { categoriaSchema } from '@/lib/validation';

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
    const id = getIdFromPath(url.pathname, 'categorias');
    
    if (id) {
      const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .eq('id', parseInt(id))
        .single();
      
      if (error) throw error;
      if (!data) return Response.json({ error: 'Categoria não encontrada' }, { status: 404 });
      return Response.json(data);
    }
    
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .order('ordem', { ascending: true });
    
    if (error) throw error;
    return Response.json(data || []);
  } catch (error) {
    console.error('GET /api/categorias error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json();
    const parsed = categoriaSchema.safeParse(body);
    
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 });
    }
    
    const { nome, ordem } = parsed.data;
    const insertData: Record<string, any> = { nome, ordem: ordem ?? 0 };
    
    const { data, error } = await db
      .from('categorias')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return Response.json({ error: 'Categoria já existe' }, { status: 400 });
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
    console.error('POST /api/categorias error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'categorias');
    if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
    
    const body = await request.json();
    const { nome, ordem } = body as { nome?: string; ordem?: number };
    
    const updateData: Record<string, any> = {};
    if (nome !== undefined) updateData.nome = nome;
    if (ordem !== undefined) updateData.ordem = ordem;
    
    const { data, error } = await db
      .from('categorias')
      .update(updateData)
      .eq('id', parseInt(id))
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
    console.error('PUT /api/categorias error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'categorias');
    if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
    
    const { error } = await db
      .from('categorias')
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
    console.error('DELETE /api/categorias error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}