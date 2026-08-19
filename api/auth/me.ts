import { createServerClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
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
  } catch (error) {
    console.error('GET /api/auth/me error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}