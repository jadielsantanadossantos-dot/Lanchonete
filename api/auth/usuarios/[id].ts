import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { atualizarUsuarioSchema } from '@/lib/validation';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
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
      .eq('id', parseInt(params.id))
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
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/auth/usuarios/[id] error:', error);
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
    const { user: currentUser, supabase: db } = context;
    
    const targetId = parseInt(params.id);
    
    // requireAuth garante que currentUser não é null
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
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('DELETE /api/auth/usuarios/[id] error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}