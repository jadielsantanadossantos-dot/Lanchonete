import { createServerClient } from '../lib/supabase/server';
import { getAuthContext, requireAuth } from '../lib/auth';
import { pedidoSchema } from '../lib/validation';

function getIdFromPath(pathname: string, prefix: string): string | null {
  const parts = pathname.split('/');
  const idx = parts.indexOf(prefix);
  if (idx >= 0 && idx + 1 < parts.length) {
    return parts[idx + 1];
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'pedidos');
    const status = url.searchParams.get('status');
    const data_inicio = url.searchParams.get('data_inicio');
    const data_fim = url.searchParams.get('data_fim');
    const limite = url.searchParams.get('limite');
    
    if (id) {
      const { data, error } = await db
        .from('pedidos')
        .select(`
          *,
          clientes(nome, telefone),
          pedido_itens(*, pedido_item_adicionais(*))
        `)
        .eq('id', parseInt(id))
        .single();
      
      if (error) throw error;
      if (!data) return Response.json({ error: 'Pedido não encontrado' }, { status: 404 });
      return Response.json(data);
    }
    
    let query = db
      .from('pedidos')
      .select(`
        *,
        clientes(nome, telefone),
        pedido_itens(*, pedido_item_adicionais(*))
      `);
    
    if (status) query = query.eq('status', status);
    if (data_inicio) query = query.gte('criado_em', data_inicio);
    if (data_fim) query = query.lte('criado_em', data_fim + ' 23:59:59');
    
    query = query.order('mesa_id', { ascending: true, nullsFirst: false })
      .order('comanda_id', { ascending: true })
      .order('criado_em', { ascending: false });
    
    if (limite) query = query.limit(parseInt(limite));
    
    const { data, error } = await query;
    if (error) throw error;
    
    return Response.json(data || []);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('GET /api/pedidos error:', error);
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
    const parsed = pedidoSchema.safeParse(body);
    
    if (!parsed.success) {
      return Response.json({ error: 'Dados inválidos', detalhes: parsed.error.issues }, { status: 400 });
    }
    
    const { 
      cliente_id, itens, forma_pagamento, observacoes, 
      endereco_entrega, bairro_entrega, taxa_entrega, mesa_id, comanda_id 
    } = parsed.data;
    
    let subtotal = 0;
    itens.forEach(item => {
      let itemTotal = item.preco_unitario * item.quantidade;
      if (item.adicionais) {
        item.adicionais.forEach(a => { itemTotal += a.preco * item.quantidade; });
      }
      subtotal += itemTotal;
    });
    
    const taxaEntrega = parseFloat(String(taxa_entrega)) || 0;
    const total = subtotal + taxaEntrega;
    
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .insert({
        cliente_id,
        subtotal,
        taxa_entrega: taxaEntrega,
        total,
        forma_pagamento,
        observacoes: observacoes || '',
        endereco_entrega: endereco_entrega || '',
        bairro_entrega: bairro_entrega || '',
        mesa_id: mesa_id || null,
        comanda_id: comanda_id || null
      })
      .select()
      .single();
    
    if (error) throw error;
    
    const itemStmt = supabase.from('pedido_itens');
    const adicStmt = supabase.from('pedido_item_adicionais');
    
    for (const item of itens) {
      const { data: itemInfo, error: itemError } = await itemStmt
        .insert({
          pedido_id: pedido.id,
          produto_id: item.produto_id,
          produto_nome: item.produto_nome,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          observacao: item.observacao || ''
        })
        .select()
        .single();
      
      if (itemError) throw itemError;
      
      if (item.adicionais && item.adicionais.length) {
        const adicVinculos = item.adicionais.map((a: any) => ({
          pedido_item_id: itemInfo.id,
          adicional_nome: a.nome,
          preco: a.preco
        }));
        const { error: adicError } = await adicStmt.insert(adicVinculos);
        if (adicError) throw adicError;
      }
    }
    
    const { data: fullPedido } = await supabase
      .from('pedidos')
      .select(`
        *,
        clientes(nome, telefone),
        pedido_itens(*, pedido_item_adicionais(*))
      `)
      .eq('id', pedido.id)
      .single();
    
    return Response.json(fullPedido, { status: 201 });
  } catch (error) {
    console.error('POST /api/pedidos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const pedidosIdx = segments.indexOf('pedidos');
    
    if (pedidosIdx >= 0 && pedidosIdx + 1 < segments.length) {
      const id = segments[pedidosIdx + 1];
      const nextSegment = segments[pedidosIdx + 2];
      
      // /api/pedidos/[id]/status
      if (nextSegment === 'status') {
        const { status } = await request.json();
        const validStatuses = ['recebido', 'em_preparo', 'saiu_entrega', 'entregue', 'cancelado'];
        
        if (!validStatuses.includes(status)) {
          return Response.json({ error: 'Status inválido' }, { status: 400 });
        }
        
        const { error } = await db
          .from('pedidos')
          .update({ status, atualizado_em: new Date().toISOString() })
          .eq('id', parseInt(id));
        
        if (error) throw error;
        return Response.json({ success: true });
      }
      
      // /api/pedidos/[id]/pix
      if (nextSegment === 'pix') {
        const { confirmado } = await request.json();
        
        const { error } = await db
          .from('pedidos')
          .update({ pix_confirmado: confirmado ? true : false })
          .eq('id', parseInt(id));
        
        if (error) throw error;
        return Response.json({ success: true });
      }
    }
    
    return Response.json({ error: 'Rota não encontrada' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/pedidos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'pedidos');
    if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
    
    const body = await request.json();
    const { status, pix_confirmado } = body as { status?: string; pix_confirmado?: boolean };
    
    const updateData: Record<string, any> = { atualizado_em: new Date().toISOString() };
    if (status !== undefined) updateData.status = status;
    if (pix_confirmado !== undefined) updateData.pix_confirmado = pix_confirmado;
    
    const { data, error } = await db
      .from('pedidos')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();
    
    if (error) throw error;
    if (!data) return Response.json({ error: 'Pedido não encontrado' }, { status: 404 });
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PATCH /api/pedidos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const id = getIdFromPath(url.pathname, 'pedidos');
    if (!id) return Response.json({ error: 'ID obrigatório' }, { status: 400 });
    
    const { error } = await db
      .from('pedidos')
      .delete()
      .eq('id', parseInt(id));
    
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('DELETE /api/pedidos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
