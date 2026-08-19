import { createServerClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
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
  } catch (error) {
    console.error('POST /api/auth/refresh error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}