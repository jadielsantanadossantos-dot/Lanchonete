import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { criarUsuarioSchema } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const { data, error } = await db
      .from('usuarios')
      .select('id, nome, usuario, perfil, ativo, trocar_senha, criado_em')
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
    console.error('GET /api/auth/usuarios error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json();
    const parsed = criarUsuarioSchema.safeParse(body);
    
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 });
    }
    
    const { nome, usuario, senha, perfil } = parsed.data;
    
    const { data: existing } = await db
      .from('usuarios')
      .select('id')
      .eq('usuario', usuario)
      .single();
    
    if (existing) {
      return Response.json({ error: 'Nome de usuário já existe' }, { status: 400 });
    }
    
    const finalSenha = senha || 'senha123';
    
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: `${usuario}@lanchonete.local`,
      password: finalSenha,
      email_confirm: true,
      user_metadata: { nome, perfil },
    });
    
    if (authError) throw authError;
    
    const { data, error } = await db
      .from('usuarios')
      .insert({
        nome,
        usuario,
        senha_hash: 'MANAGED_BY_SUPABASE_AUTH',
        perfil,
        ativo: true,
        trocar_senha: true,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return Response.json({ id: data.id, senha_inicial: finalSenha }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('POST /api/auth/usuarios error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}