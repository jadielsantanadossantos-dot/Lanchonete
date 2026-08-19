import { createServerClient } from '@/lib/supabase/server';
import { handleLegacyLogin } from '@/lib/auth/supabase-auth';
import { loginSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
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
  } catch (error) {
    console.error('POST /api/auth/login error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}