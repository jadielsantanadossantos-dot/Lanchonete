import { createServerClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/auth';
import { alterarSenhaSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await getAuthContext(request);
    
    if (!context.user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const body = await request.json();
    const { senha_atual, nova_senha } = alterarSenhaSchema.parse(body);
    
    // Verify current password by trying to sign in
    const email = context.user.email;
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: senha_atual,
    });
    
    if (signInError) {
      return Response.json({ error: 'Senha atual incorreta' }, { status: 401 });
    }
    
    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: nova_senha,
    });
    
    if (updateError) throw updateError;
    
    // Create new session with new password
    const { data: { session } } = await supabase.auth.signInWithPassword({
      email,
      password: nova_senha,
    });
    
    return Response.json({ 
      success: true, 
      token: session?.access_token, 
      refreshToken: session?.refresh_token 
    });
  } catch (error) {
    console.error('POST /api/auth/alterar-senha error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}