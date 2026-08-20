import { createServerClient } from '../lib/supabase/server';
import { getAuthContext, requireAuth } from '../lib/auth';

function getIdFromPath(pathname: string, prefix: string): string | null {
  const parts = pathname.split('/');
  const idx = parts.indexOf(prefix);
  if (idx >= 0 && idx + 1 < parts.length) {
    return parts[idx + 1];
  }
  return null;
}

async function getComandaAberta(supabase: any, mesaId: number) {
  const { data } = await supabase
    .from('comandas')
    .select('*')
    .eq('mesa_id', mesaId)
    .eq('status', 'aberta')
    .single();
  return data;
}

async function getOuCriaClienteMesa(supabase: any, mesaId: number, clienteNome?: string) {
  const telefoneMesa = `mesa${mesaId}`;
  let { data: cliente } = await supabase
    .from('clientes')
    .select('*')
    .eq('telefone', telefoneMesa)
    .single();
  
  const nomeFormatado = `Mesa ${mesaId}${clienteNome ? ' - ' + clienteNome : ''}`;
  
  if (!cliente) {
    const { data, error } = await supabase
      .from('clientes')
      .insert({ nome: nomeFormatado, telefone: telefoneMesa, bairro: 'Mesa' })
      .select()
      .single();
    if (error) throw error;
    cliente = data;
  } else if (clienteNome && !cliente.nome.includes(' - ') && cliente.nome.startsWith('Mesa ' + mesaId)) {
    const { data, error } = await supabase
      .from('clientes')
      .update({ nome: nomeFormatado })
      .eq('id', cliente.id)
      .select()
      .single();
    if (error) throw error;
    cliente = data;
  }
  return cliente;
}

async function getOrCreateComanda(supabase: any, mesaId: number, clienteNome?: string) {
  let comanda = await getComandaAberta(supabase, mesaId);
  if (!comanda) {
    const { data, error } = await supabase
      .from('comandas')
      .insert({ mesa_id: mesaId, cliente_nome: clienteNome || null, status: 'aberta' })
      .select()
      .single();
    if (error) throw error;
    comanda = data;
    await supabase.from('mesas').update({ status: 'ocupada' }).eq('id', mesaId);
  } else if (clienteNome && !comanda.cliente_nome) {
    const { data, error } = await supabase
      .from('comandas')
      .update({ cliente_nome: clienteNome })
      .eq('id', comanda.id)
      .select()
      .single();
    if (error) throw error;
    comanda = data;
  }
  return comanda;
}

async function getPedidoVinculadoComanda(supabase: any, comandaId: number) {
  const { data } = await supabase
    .from('pedidos')
    .select('*')
    .eq('comanda_id', comandaId)
    .neq('status', 'cancelado')
    .order('criado_em', { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function atualizarPedidoComItens(supabase: any, pedidoId: number, itensComAdicionais: any[], formaPagamento: string, observacoes: string, trocoPara: string | null) {
  let subtotal = 0;
  itensComAdicionais.forEach(item => {
    let itemTotal = item.preco_unitario * item.quantidade;
    if (item.adicionais && item.adicionais.length) {
      item.adicionais.forEach(a => { itemTotal += a.preco * item.quantidade; });
    }
    subtotal += itemTotal;
  });

  const taxaEntrega = 0;
  const total = subtotal + taxaEntrega;

  let obsFinal = observacoes || '';
  if (formaPagamento === 'dinheiro' && trocoPara) {
    obsFinal += ` | Troco para R$ ${parseFloat(trocoPara).toFixed(2)}`;
  }

  for (const item of itensComAdicionais) {
    const { data: itemInfo, error: itemError } = await supabase
      .from('pedido_itens')
      .insert({ 
        pedido_id: pedidoId, 
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
      const { error: adicError } = await supabase
        .from('pedido_item_adicionais')
        .insert(adicVinculos);
      if (adicError) throw adicError;
    }
  }

  const { error: updError } = await supabase
    .from('pedidos')
    .update({ 
      subtotal, 
      total, 
      forma_pagamento: formaPagamento || 'mesa', 
      observacoes: obsFinal, 
      status: 'entregue', 
      atualizado_em: new Date().toISOString() 
    })
    .eq('id', pedidoId);
  if (updError) throw updError;

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('*, clientes(nome, telefone)')
    .eq('id', pedidoId)
    .single();
  
  const { data: pedItens } = await supabase
    .from('pedido_itens')
    .select('*, pedido_item_adicionais(*)')
    .eq('pedido_id', pedidoId);
  
  return { ...pedido, itens: pedItens };
}

export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const { user } = await getAuthContext(request);
    
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const mesaIdx = segments.indexOf('mesa');
    
    // /api/comandas/mesa/:mesaId
    if (mesaIdx >= 0 && mesaIdx + 1 < segments.length) {
      const mesaId = parseInt(segments[mesaIdx + 1]);
      const comanda = await getComandaAberta(supabase, mesaId);
      
      if (!comanda) return Response.json({ itens: [], total: 0, aberta: false });
      
      const { data: itens } = await supabase
        .from('comanda_itens')
        .select('*, produtos(foto)')
        .eq('comanda_id', comanda.id)
        .order('criado_em');
      
      const itensComAdicionais = (itens || []).map((item: any) => ({
        ...item,
        adicionais: item.adicionais_json ? JSON.parse(item.adicionais_json) : []
      }));
      
      const total = itensComAdicionais.reduce((s: number, i: any) => {
        let itemTotal = i.preco_unitario * i.quantidade;
        if (i.adicionais && i.adicionais.length) {
          i.adicionais.forEach((a: any) => { itemTotal += a.preco * i.quantidade; });
        }
        return s + itemTotal;
      }, 0);
      
      const itensNaoEnviados = itensComAdicionais.filter((i: any) => !i.enviado_cozinha);
      
      return Response.json({ comanda, itens: itensComAdicionais, total, aberta: true, itensNaoEnviados });
    }
    
    return Response.json({ error: 'Rota não encontrada' }, { status: 404 });
  } catch (error) {
    console.error('GET /api/comandas error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const { user } = await getAuthContext(request);
    
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });
    
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const mesaIdx = segments.indexOf('mesa');
    
    if (mesaIdx >= 0 && mesaIdx + 1 < segments.length) {
      const mesaId = parseInt(segments[mesaIdx + 1]);
      const nextSegment = segments[mesaIdx + 2];
      
      // /api/comandas/mesa/:mesaId/item
      if (nextSegment === 'item') {
        const { produto_id, quantidade, observacao, adicionais, cliente_nome } = await request.json();
        const mesaId = parseInt(segments[mesaIdx + 1]);
        
        const { data: produto } = await supabase
          .from('produtos')
          .select('*')
          .eq('id', produto_id)
          .eq('ativo', true)
          .single();
        
        if (!produto) return Response.json({ error: 'Produto não encontrado ou inativo' }, { status: 404 });
        
        const comanda = await getOrCreateComanda(supabase, mesaId, cliente_nome);
        
        const adicJson = adicionais && adicionais.length ? JSON.stringify(adicionais) : null;
        const { data: item, error } = await supabase
          .from('comanda_itens')
          .insert({
            comanda_id: comanda.id,
            produto_id,
            produto_nome: produto.nome,
            quantidade: quantidade || 1,
            preco_unitario: produto.preco,
            observacao: observacao || '',
            adicionais_json: adicJson
          })
          .select()
          .single();
        
        if (error) throw error;
        
        return Response.json({ success: true, comandaId: comanda.id, item });
      }
      
      // /api/comandas/mesa/:mesaId/enviar-cozinha
      if (nextSegment === 'enviar-cozinha') {
        const { cliente_id, item_ids, observacoes } = await request.json();
        const mesaId = parseInt(segments[mesaIdx + 1]);
        
        const comanda = await getComandaAberta(supabase, mesaId);
        if (!comanda) return Response.json({ error: 'Comanda não encontrada' }, { status: 404 });
        
        let query = supabase.from('comanda_itens').select('*, produtos(foto)').eq('comanda_id', comanda.id);
        
        if (item_ids && item_ids.length > 0) {
          query = query.in('id', item_ids);
        } else {
          query = query.or('enviado_cozinha.is.null,enviado_cozinha.eq.false');
        }
        
        const { data: itens } = await query.order('criado_em');
        
        if (!itens || !itens.length) {
          return Response.json({ error: 'Nenhum item para enviar à cozinha' }, { status: 400 });
        }
        
        const itensComAdicionais = itens.map((item: any) => ({
          ...item,
          adicionais: item.adicionais_json ? JSON.parse(item.adicionais_json) : []
        }));
        
        const pedidoExistente = await getPedidoVinculadoComanda(supabase, comanda.id);
        
        let pedido;
        if (pedidoExistente) {
          pedido = await atualizarPedidoComItens(supabase, pedidoExistente.id, itensComAdicionais, 'mesa', observacoes || '', null);
        } else {
          const cliente = await getOuCriaClienteMesa(supabase, mesaId, comanda.cliente_nome || '');
          
          let subtotal = 0;
          itensComAdicionais.forEach(item => {
            let itemTotal = item.preco_unitario * item.quantidade;
            if (item.adicionais && item.adicionais.length) {
              item.adicionais.forEach((a: any) => { itemTotal += a.preco * item.quantidade; });
            }
            subtotal += itemTotal;
          });
          
          const taxaEntrega = 0;
          const total = subtotal + taxaEntrega;
          
          let obsFinal = observacoes || '';
          obsFinal += ' [ENVIADO PARA COZINHA]';
          
          const { data: pedidoData, error: pedidoError } = await supabase
            .from('pedidos')
            .insert({
              cliente_id: cliente.id,
              subtotal,
              taxa_entrega: taxaEntrega,
              total,
              forma_pagamento: 'mesa',
              observacoes: obsFinal,
              endereco_entrega: `Mesa ${mesaId}${comanda.cliente_nome ? ' - ' + comanda.cliente_nome : ''}`,
              bairro_entrega: 'Mesa',
              mesa_id: mesaId,
              status: 'recebido',
              comanda_id: comanda.id
            })
            .select()
            .single();
          
          if (pedidoError) throw pedidoError;
          
          for (const item of itensComAdicionais) {
            const { data: itemInfo, error: itemError } = await supabase
              .from('pedido_itens')
              .insert({
                pedido_id: pedidoData.id,
                produto_id: item.produto_id,
                produto_nome: item.produto_nome,
                quantidade: item.quantidade,
                preco_unitario: item.preco_unitario,
                observacao: item.observacao || ''
              })
              .select()
              .single();
            
            if (itemError) throw itemError;
            
            await supabase
              .from('comanda_itens')
              .update({ enviado_cozinha: true, pedido_item_id: itemInfo.id })
              .eq('id', item.id);
            
            if (item.adicionais && item.adicionais.length) {
              const adicVinculos = item.adicionais.map((a: any) => ({
                pedido_item_id: itemInfo.id,
                adicional_nome: a.nome,
                preco: a.preco
              }));
              const { error: adicError } = await supabase
                .from('pedido_item_adicionais')
                .insert(adicVinculos);
              if (adicError) throw adicError;
            }
          }
          
          const { data: fullPedido } = await supabase
            .from('pedidos')
            .select('*, clientes(nome, telefone)')
            .eq('id', pedidoData.id)
            .single();
          
          const { data: pedItens } = await supabase
            .from('pedido_itens')
            .select('*, pedido_item_adicionais(*)')
            .eq('pedido_id', pedidoData.id);
          
          pedido = { ...fullPedido, itens: pedItens };
        }
        
        for (const item of itens) {
          await supabase
            .from('comanda_itens')
            .update({ enviado_cozinha: true })
            .eq('id', item.id);
        }
        
        return Response.json({ success: true, pedido, itensEnviados: itensComAdicionais.length });
      }
      
      // /api/comandas/mesa/:mesaId/fechar
      if (nextSegment === 'fechar') {
        const { 
          cliente_id, forma_pagamento, observacoes, registrar_apenas, 
          cliente_nome_informado, troco_para 
        } = await request.json();
        const mesaId = parseInt(segments[mesaIdx + 1]);
        
        const comanda = await getComandaAberta(supabase, mesaId);
        if (!comanda) return Response.json({ error: 'Comanda não encontrada ou já fechada' }, { status: 404 });
        
        const nomeClienteComanda = cliente_nome_informado || comanda.cliente_nome || '';
        
        const { data: itens } = await supabase
          .from('comanda_itens')
          .select('*, produtos(foto)')
          .eq('comanda_id', comanda.id);
        
        if (!itens || !itens.length) {
          return Response.json({ error: 'Comanda vazia' }, { status: 400 });
        }
        
        const itensComAdicionais = itens.map((item: any) => ({
          ...item,
          adicionais: item.adicionais_json ? JSON.parse(item.adicionais_json) : []
        }));
        
        const itensNaoEnviados = itensComAdicionais.filter((i: any) => !i.enviado_cozinha);
        
        const agora = new Date().toISOString();
        
        if (registrar_apenas) {
          await supabase.from('comandas').update({ status: 'fechada', fechada_em: agora }).eq('id', comanda.id);
          await supabase.from('mesas').update({ status: 'livre' }).eq('id', mesaId);
          return Response.json({ success: true, mensagem: 'Comanda registrada sem pagamento' });
        }
        
        const pedidoExistente = await getPedidoVinculadoComanda(supabase, comanda.id);
        
        let pedido;
        if (pedidoExistente) {
          if (itensNaoEnviados.length > 0) {
            pedido = await atualizarPedidoComItens(supabase, pedidoExistente.id, itensNaoEnviados, forma_pagamento, observacoes, troco_para);
          } else {
            let obsFinal = observacoes || '';
            if (forma_pagamento === 'dinheiro' && troco_para) {
              obsFinal += ` | Troco para R$ ${parseFloat(troco_para).toFixed(2)}`;
            }
            await supabase
              .from('pedidos')
              .update({ 
                forma_pagamento: forma_pagamento || 'mesa', 
                observacoes: obsFinal, 
                status: 'entregue', 
                atualizado_em: agora 
              })
              .eq('id', pedidoExistente.id);
            
            const { data } = await supabase
              .from('pedidos')
              .select('*, clientes(nome, telefone)')
              .eq('id', pedidoExistente.id)
              .single();
            
            const { data: pedItens } = await supabase
              .from('pedido_itens')
              .select('*, pedido_item_adicionais(*)')
              .eq('pedido_id', pedidoExistente.id);
            
            pedido = { ...data, itens: pedItens };
          }
        } else {
          const cliente = await getOuCriaClienteMesa(supabase, mesaId, nomeClienteComanda);
          
          let subtotal = 0;
          itensComAdicionais.forEach(item => {
            let itemTotal = item.preco_unitario * item.quantidade;
            if (item.adicionais && item.adicionais.length) {
              item.adicionais.forEach((a: any) => { itemTotal += a.preco * item.quantidade; });
            }
            subtotal += itemTotal;
          });
          
          const taxaEntrega = 0;
          const total = subtotal + taxaEntrega;
          
          let obsFinal = observacoes || '';
          if (forma_pagamento === 'dinheiro' && troco_para) {
            obsFinal += ` | Troco para R$ ${parseFloat(troco_para).toFixed(2)}`;
          }
          
          const { data: pedidoData, error: pedidoError } = await supabase
            .from('pedidos')
            .insert({
              cliente_id: cliente.id,
              subtotal,
              taxa_entrega: taxaEntrega,
              total,
              forma_pagamento: forma_pagamento || 'mesa',
              observacoes: obsFinal,
              endereco_entrega: `Mesa ${mesaId}${nomeClienteComanda ? ' - ' + nomeClienteComanda : ''}`,
              bairro_entrega: 'Mesa',
              mesa_id: mesaId,
              status: 'entregue',
              comanda_id: comanda.id
            })
            .select()
            .single();
          
          if (pedidoError) throw pedidoError;
          
          for (const item of itensComAdicionais) {
            const { data: itemInfo, error: itemError } = await supabase
              .from('pedido_itens')
              .insert({
                pedido_id: pedidoData.id,
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
              const { error: adicError } = await supabase
                .from('pedido_item_adicionais')
                .insert(adicVinculos);
              if (adicError) throw adicError;
            }
          }
          
          const { data: fullPedido } = await supabase
            .from('pedidos')
            .select('*, clientes(nome, telefone)')
            .eq('id', pedidoData.id)
            .single();
          
          const { data: pedItens } = await supabase
            .from('pedido_itens')
            .select('*, pedido_item_adicionais(*)')
            .eq('pedido_id', pedidoData.id);
          
          pedido = { ...fullPedido, itens: pedItens };
        }
        
        await supabase.from('comandas').update({ status: 'fechada', fechada_em: agora }).eq('id', comanda.id);
        await supabase.from('mesas').update({ status: 'livre' }).eq('id', mesaId);
        
        return Response.json({ success: true, pedido });
      }
      
      // /api/comandas/mesa/:mesaId/liberar
      if (nextSegment === 'liberar') {
        const { forcar } = await request.json();
        const mesaId = parseInt(segments[mesaIdx + 1]);
        
        const comanda = await getComandaAberta(supabase, mesaId);
        
        if (!comanda) {
          await supabase.from('mesas').update({ status: 'livre' }).eq('id', mesaId);
          return Response.json({ success: true, mensagem: 'Mesa liberada' });
        }
        
        const { data: itens } = await supabase
          .from('comanda_itens')
          .select('*')
          .eq('comanda_id', comanda.id);
        
        const itensEnviados = (itens || []).filter((i: any) => i.enviado_cozinha);
        
        if (itensEnviados.length > 0) {
          return Response.json({ 
            error: 'Há itens enviados para a cozinha. Use "Fechar Comanda" com pagamento ou peça ao admin para cancelar o pedido.' 
          }, { status: 400 });
        }
        
        if ((itens || []).length > 0 && !forcar) {
          return Response.json({ 
            error: 'Comanda tem itens não enviados. Confirme para remover itens e liberar mesa.',
            itens: itens.length,
            precisaConfirmacao: true 
          }, { status: 400 });
        }
        
        if ((itens || []).length > 0) {
          await supabase.from('comanda_itens').delete().eq('comanda_id', comanda.id);
        }
        
        const agora = new Date().toISOString();
        await supabase.from('comandas').update({ status: 'fechada', fechada_em: agora }).eq('id', comanda.id);
        await supabase.from('mesas').update({ status: 'livre' }).eq('id', mesaId);
        
        return Response.json({ success: true, mensagem: 'Mesa liberada com sucesso' });
      }
      
      // /api/comandas/mesa/:mesaId/cliente-nome
      if (nextSegment === 'cliente-nome') {
        const { cliente_nome } = await request.json();
        const mesaId = parseInt(segments[mesaIdx + 1]);
        
        let comanda = await getComandaAberta(supabase, mesaId);
        if (!comanda) comanda = await getOrCreateComanda(supabase, mesaId, cliente_nome);
        
        await supabase
          .from('comandas')
          .update({ cliente_nome: cliente_nome || null })
          .eq('id', comanda.id);
        
        return Response.json({ success: true });
      }
      
      // /api/comandas/mesa/:mesaId/item/:itemId
      if (nextSegment === 'item' && mesaIdx + 3 < segments.length) {
        const itemId = parseInt(segments[mesaIdx + 3]);
        const { quantidade, observacao, adicionais } = await request.json();
        const mesaId = parseInt(segments[mesaIdx + 1]);
        
        const comanda = await getComandaAberta(supabase, mesaId);
        if (!comanda) return Response.json({ error: 'Comanda não encontrada' }, { status: 404 });
        
        const adicJson = adicionais && adicionais.length ? JSON.stringify(adicionais) : null;
        const { error } = await supabase
          .from('comanda_itens')
          .update({ 
            quantidade: quantidade || 1, 
            observacao: observacao || '', 
            adicionais_json: adicJson 
          })
          .eq('id', itemId)
          .eq('comanda_id', comanda.id);
        
        if (error) throw error;
        return Response.json({ success: true });
      }
    }
    
    return Response.json({ error: 'Rota não encontrada' }, { status: 404 });
  } catch (error) {
    console.error('POST /api/comandas error:', error);
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
    const mesaIdx = segments.indexOf('mesa');
    
    if (mesaIdx >= 0 && mesaIdx + 1 < segments.length) {
      const mesaId = parseInt(segments[mesaIdx + 1]);
      const nextSegment = segments[mesaIdx + 2];
      
      if (nextSegment === 'item' && mesaIdx + 3 < segments.length) {
        const itemId = parseInt(segments[mesaIdx + 3]);
        const { quantidade, observacao, adicionais } = await request.json();
        
        const comanda = await getComandaAberta(db, mesaId);
        if (!comanda) return Response.json({ error: 'Comanda não encontrada' }, { status: 404 });
        
        const adicJson = adicionais && adicionais.length ? JSON.stringify(adicionais) : null;
        const { error } = await db
          .from('comanda_itens')
          .update({ 
            quantidade: quantidade || 1, 
            observacao: observacao || '', 
            adicionais_json: adicJson 
          })
          .eq('id', itemId)
          .eq('comanda_id', comanda.id);
        
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
    console.error('PUT /api/comandas error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const mesaIdx = segments.indexOf('mesa');
    
    if (mesaIdx >= 0 && mesaIdx + 1 < segments.length) {
      const mesaId = parseInt(segments[mesaIdx + 1]);
      const nextSegment = segments[mesaIdx + 2];
      
      if (nextSegment === 'item' && mesaIdx + 3 < segments.length) {
        const itemId = parseInt(segments[mesaIdx + 3]);
        
        const comanda = await getComandaAberta(db, mesaId);
        if (!comanda) return Response.json({ error: 'Comanda não encontrada' }, { status: 404 });
        
        const { error } = await db
          .from('comanda_itens')
          .delete()
          .eq('id', itemId)
          .eq('comanda_id', comanda.id);
        
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
    console.error('DELETE /api/comandas error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}
