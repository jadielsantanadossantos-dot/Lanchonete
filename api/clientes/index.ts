import { createServerClient } from '@/lib/supabase/server';
import { getAuthContext, requireAuth } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const { data, error } = await db
      .from('clientes')
      .select('*')
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
    console.error('GET /api/clientes error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const { user } = await getAuthContext(request);
    
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const body = await request.json();
    const { nome, telefone, rua, numero, bairro, complemento, ponto_referencia } = body as { 
      nome: string; 
      telefone: string; 
      rua?: string; 
      numero?: string; 
      bairro?: string; 
      complemento?: string; 
      ponto_referencia?: string; 
    };
    
    if (!nome || !telefone) {
      return Response.json({ error: 'Nome e telefone obrigatórios' }, { status: 400 });
    }
    
    const upsertData: Record<string, any> = { nome, telefone };
    if (rua !== undefined) upsertData.rua = rua;
    if (numero !== undefined) upsertData.numero = numero;
    if (bairro !== undefined) upsertData.bairro = bairro;
    if (complemento !== undefined) upsertData.complemento = complemento;
    if (ponto_referencia !== undefined) upsertData.ponto_referencia = ponto_referencia;
    else {
      upsertData.rua = upsertData.rua || '';
      upsertData.numero = upsertData.numero || '';
      upsertData.bairro = upsertData.bairro || '';
      upsertData.complemento = upsertData.complemento || '';
      upsertData.ponto_referencia = upsertData.ponto_referencia || '';
    }
    
    const { data, error } = await supabase
      .from('clientes')
      .upsert(upsertData, { onConflict: 'telefone' })
      .select()
      .single();
    
    if (error) throw error;
    
    return Response.json(data, { status: 201 });
  } catch (error) {
    console.error('POST /api/clientes error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}