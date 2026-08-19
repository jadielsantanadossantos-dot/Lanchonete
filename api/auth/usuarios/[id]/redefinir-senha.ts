import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';

function gerarSenhaAleatoria(tamanho = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let senha = '';
  for (let i = 0; i < tamanho; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
}

export async function POST(
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
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('POST /api/auth/usuarios/[id]/redefinir-senha error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}