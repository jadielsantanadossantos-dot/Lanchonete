import { createServerClient } from './_shared.js';
import { handleLegacyLogin } from './_shared.js';
import { getAuthContext, requireAuth } from './_shared.js';
import { loginSchema, alterarSenhaSchema, criarUsuarioSchema, atualizarUsuarioSchema } from './_shared.js';

function gerarSenhaAleatoria(tamanho = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let senha = '';
  for (let i = 0; i < tamanho; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
}

function getPathSegments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function getIdFromPath(pathname: string, prefix: string): string | null {
  const parts = pathname.split('/');
  const idx = parts.indexOf(prefix);
  if (idx >= 0 && idx + 1 < parts.length) {
    return parts[idx + 1];
  }
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const segments = getPathSegments(url);
  
  try {
    const supabase = createServerClient();
    
    // /api/auth/me
    if (segments.includes('me')) {
      const context = await getAuthContext(request);
      if (!context.user) {
        return Response.json({ error: 'Não autorizado' }, { status: 401 });
      }
      return Response.json({
        id: context.user.id,
        nome: context.user.nome,
        usuario: context.user.email?.replace('@lanchonete.local', '') || '',
        perfil: context.user.perfil,
        trocar_senha: context.user.trocar_senha,
      });
    }
    
    // /api/auth/auditoria
    if (segments.includes('auditoria')) {
      const context = await requireAuth(['admin'])(request);
      const { user, supabase: db } = context;
      
      const usuarioId = url.searchParams.get('usuario_id');
      const acao = url.searchParams.get('acao');
      const dataInicio = url.searchParams.get('data_inicio');
      const dataFim = url.searchParams.get('data_fim');
      const limite = parseInt(url.searchParams.get('limite') || '100');
      
      let query = db.from('auditoria').select('*');
      if (usuarioId) query = query.eq('usuario_id', parseInt(usuarioId));
      if (acao) query = query.eq('acao', acao);
      if (dataInicio) query = query.gte('criado_em', dataInicio);
      if (dataFim) query = query.lte('criado_em', dataFim + ' 23:59:59');
      query = query.order('criado_em', { ascending: false }).limit(limite);
      
      const { data, error } = await query;
      if (error) throw error;
      return Response.json(data || []);
    }
    
    // /api/auth/usuarios
    if (segments.includes('usuarios') && !segments.includes('redefinir-senha')) {
      const context = await requireAuth(['admin'])(request);
      const { user, supabase: db } = context;
      
      const { data, error } = await db
        .from('usuarios')
        .select('id, nome, usuario, perfil, ativo, trocar_senha, criado_em')
        .order('nome', { ascending: true });
      
      if (error) throw error;
      return Response.json(data || []);
    }
    
    return Response.json({ error: 'Rota não encontrada' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('GET /api/auth error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const segments = getPathSegments(url);
  
  try {
    const supabase = createServerClient();
    
    // /api/auth/login
    if (segments.includes('login')) {
      const body = await request.json();
      const { usuario, senha, perfil_esperado } = loginSchema.parse(body);
      
      const result = await handleLegacyLogin(usuario, senha);
      if (!result.success) {
        return Response.json({ error: 'Usuário ou senha inválidos' }, { status: 401 });
      }
      
      if (perfil_esperado && result.user?.user_metadata?.perfil !== perfil_esperado) {
        await supabase.auth.signOut();
        return Response.json({ error: 'Este usuário não tem permissão para acessar este sistema' }, { status: 403 });
      }
      
      const { data: { session }, error } = await supabase.auth.signInWithPassword({
        email: `${usuario}@lanchonete.local`,
        password: senha,
      });
      
      if (error) throw error;
      
      return Response.json({
        token: session?.access_token,
        refreshToken: session?.refresh_token,
        perfil: result.user?.user_metadata?.perfil,
        nome: result.user?.user_metadata?.nome,
        usuario,
        trocar_senha: false,
      });
    }
    
    // /api/auth/refresh
    if (segments.includes('refresh')) {
      const body = await request.json();
      const { refreshToken } = body as { refreshToken: string };
      
      if (!refreshToken) {
        return Response.json({ error: 'Refresh token obrigatório' }, { status: 400 });
      }
      
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });
      
      if (error) {
        return Response.json({ error: 'Refresh token inválido ou expirado' }, { status: 401 });
      }
      
      return Response.json({
        token: data.session?.access_token,
        refreshToken: data.session?.refresh_token,
      });
    }
    
    // /api/auth/alterar-senha
    if (segments.includes('alterar-senha')) {
      const context = await getAuthContext(request);
      if (!context.user) {
        return Response.json({ error: 'Não autorizado' }, { status: 401 });
      }
      
      const body = await request.json();
      const { senha_atual, nova_senha } = alterarSenhaSchema.parse(body);
      
      const email = context.user.email;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: senha_atual,
      });
      
      if (signInError) {
        return Response.json({ error: 'Senha atual incorreta' }, { status: 401 });
      }
      
      const { error: updateError } = await supabase.auth.updateUser({
        password: nova_senha,
      });
      
      if (updateError) throw updateError;
      
      const { data: { session } } = await supabase.auth.signInWithPassword({
        email,
        password: nova_senha,
      });
      
      return Response.json({ 
        success: true, 
        token: session?.access_token, 
        refreshToken: session?.refresh_token 
      });
    }
    
    // /api/auth/usuarios
    if (segments.includes('usuarios') && !segments.includes('redefinir-senha')) {
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
    }
    
    // /api/auth/usuarios/[id]/redefinir-senha
    const usuarioId = getIdFromPath(url.pathname, 'usuarios');
    if (usuarioId && segments.includes('redefinir-senha')) {
      const context = await requireAuth(['admin'])(request);
      const { user: currentUser, supabase: db } = context;
      
      const targetId = parseInt(usuarioId);
      const userId = currentUser!.id;
      
      if (targetId === userId) {
        return Response.json({ error: 'Use a página de alterar senha para sua própria conta' }, { status: 400 });
      }
      
      const { data: targetUser } = await db
        .from('usuarios')
        .select('usuario')
        .eq('id', targetId)
        .single();
      
      if (!targetUser) {
        return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
      }
      
      const novaSenha = gerarSenhaAleatoria();
      
      await supabase.auth.admin.updateUserById(targetId.toString(), {
        password: novaSenha,
      });
      
      await db
        .from('usuarios')
        .update({ trocar_senha: true })
        .eq('id', targetId);
      
      return Response.json({ success: true, senha_inicial: novaSenha });
    }
    
    return Response.json({ error: 'Rota não encontrada' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('POST /api/auth error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const segments = getPathSegments(url);
  
  try {
    const supabase = createServerClient();
    
    // /api/auth/usuarios/[id]
    if (segments.includes('usuarios') && !segments.includes('redefinir-senha')) {
      const context = await requireAuth(['admin'])(request);
      const { user, supabase: db } = context;
      
      const id = getIdFromPath(url.pathname, 'usuarios');
      if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
      
      const body = await request.json();
      const parsed = atualizarUsuarioSchema.safeParse(body);
      
      if (!parsed.success) {
        return Response.json({ error: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 });
      }
      
      const { nome, usuario, perfil, ativo } = parsed.data;
      
      const { data, error } = await db
        .from('usuarios')
        .update({ 
          nome: nome ?? undefined,
          usuario: usuario ?? undefined,
          perfil: perfil ?? undefined,
          ativo: ativo ?? undefined,
        })
        .eq('id', parseInt(id))
        .select()
        .single();
      
      if (error) throw error;
      
      if (!data) {
        return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
      }
      
      await supabase.auth.admin.updateUserById(data.id.toString(), {
        user_metadata: { nome: data.nome, perfil: data.perfil },
      });
      
      return Response.json({ success: true, data });
    }
    
    return Response.json({ error: 'Rota não encontrada' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/auth error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const segments = getPathSegments(url);
  
  try {
    const supabase = createServerClient();
    
    // /api/auth/usuarios/[id]
    if (segments.includes('usuarios') && !segments.includes('redefinir-senha')) {
      const context = await requireAuth(['admin'])(request);
      const { user: currentUser, supabase: db } = context;
      
      const id = getIdFromPath(url.pathname, 'usuarios');
      if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
      
      const targetId = parseInt(id);
      const userId = currentUser!.id;
      
      if (targetId === userId) {
        return Response.json({ error: 'Você não pode desativar sua própria conta' }, { status: 400 });
      }
      
      const { data: targetUser } = await db
        .from('usuarios')
        .select('perfil, ativo')
        .eq('id', targetId)
        .single();
      
      if (!targetUser) {
        return Response.json({ error: 'Usuário não encontrado' }, { status: 404 });
      }
      
      if (targetUser.perfil === 'admin') {
        const { data: admins } = await db
          .from('usuarios')
          .select('id')
          .eq('perfil', 'admin')
          .eq('ativo', true);
        
        if ((admins?.length || 0) <= 1) {
          return Response.json({ error: 'Não é possível desativar o último administrador ativo' }, { status: 400 });
        }
      }
      
      const { error } = await db
        .from('usuarios')
        .update({ ativo: false })
        .eq('id', targetId);
      
      if (error) throw error;
      
      await supabase.auth.admin.updateUserById(targetId.toString(), {
        ban_duration: '87600h',
      });
      
      return Response.json({ success: true });
    }
    
    return Response.json({ error: 'Rota não encontrada' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('DELETE /api/auth error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

