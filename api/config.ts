import { createServerClient } from './_shared.js';
import { getAuthContext, requireAuth } from './_shared.js';
import { configSchema } from './_shared.js';

const SENSITIVE_KEYS = ['jwt_secret', 'auth_secret', 'webpush_private_key', 'webpush_public_key'];

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const { user } = await getAuthContext(request);
    
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const { data, error } = await supabase
      .from('configuracoes')
      .select('*');
    
    if (error) throw error;
    
    const config: Record<string, string> = {};
    (data || []).forEach((row: any) => {
      if (!SENSITIVE_KEYS.includes(row.chave)) {
        config[row.chave] = row.valor;
      }
    });
    
    return Response.json(config);
  } catch (error) {
    console.error('GET /api/config error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json() as Record<string, any>;
    
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 });
    }
    
    const updates = Object.entries(parsed.data).map(([chave, valor]) => ({
      chave,
      valor: String(valor),
    }));
    
    const { error } = await db
      .from('configuracoes')
      .upsert(updates, { onConflict: 'chave' });
    
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/config error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

