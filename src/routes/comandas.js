const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareGarcom } = require('../auth/auth');
const { sanitizarString } = require('../utils/validation');

router.use(middlewareGarcom);

function parseAdicionaisJson(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return []; }
}

function getBrasilTimestamp() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

async function getComandaAberta(mesaId) {
  return db.get('SELECT * FROM comandas WHERE mesa_id = $1 AND status = $2', mesaId, 'aberta');
}

async function getOuCriaClienteMesa(mesaId, clienteNome) {
  const telefoneMesa = `mesa${mesaId}`;
  const nomeBase = `Mesa ${mesaId}`;
  const nomeFormatado = clienteNome ? `${nomeBase} - ${clienteNome}` : nomeBase;
  let cliente = await db.get('SELECT * FROM clientes WHERE telefone = $1', telefoneMesa);
  if (!cliente) {
    const info = await db.run('INSERT INTO clientes (nome, telefone, bairro) VALUES ($1, $2, $3) RETURNING id', nomeFormatado, telefoneMesa, 'Mesa');
    cliente = { id: info.lastInsertRowid, nome: nomeFormatado, telefone: telefoneMesa, bairro: 'Mesa' };
  } else if (cliente.nome !== nomeFormatado) {
    await db.run('UPDATE clientes SET nome = $1 WHERE id = $2', nomeFormatado, cliente.id);
    cliente.nome = nomeFormatado;
  }
  return cliente;
}

async function getOrCreateComanda(mesaId, clienteNome) {
  return db.transaction(async (client) => {
    const r = await client.query('SELECT * FROM comandas WHERE mesa_id = $1 AND status = $2 FOR UPDATE', [mesaId, 'aberta']);
    let comanda = r.rows[0];
    if (!comanda) {
      const ins = await client.query('INSERT INTO comandas (mesa_id, cliente_nome, status) VALUES ($1, $2, $3) RETURNING id', [mesaId, clienteNome || null, 'aberta']);
      comanda = { id: ins.rows[0].id, mesa_id: mesaId, cliente_nome: clienteNome || null, status: 'aberta' };
      await client.query('UPDATE mesas SET status = $1 WHERE id = $2', ['ocupada', mesaId]);
    } else if (clienteNome && !comanda.cliente_nome) {
      await client.query('UPDATE comandas SET cliente_nome = $1 WHERE id = $2', [clienteNome, comanda.id]);
      comanda.cliente_nome = clienteNome;
    }
    return comanda;
  });
}

async function getPedidoVinculadoComanda(comandaId) {
  return db.get('SELECT * FROM pedidos WHERE comanda_id = $1 AND status != $2 ORDER BY criado_em DESC LIMIT 1', comandaId, 'cancelado');
}

async function atualizarPedidoComItens(pedidoId, itensComAdicionais, formaPagamento, observacoes, trocoPara) {
  let subtotalNovos = 0;
  itensComAdicionais.forEach(item => {
    let itemTotal = item.preco_unitario * item.quantidade;
    if (item.adicionais && item.adicionais.length) {
      item.adicionais.forEach(a => { itemTotal += a.preco * item.quantidade; });
    }
    subtotalNovos += itemTotal;
  });

  await db.transaction(async (client) => {
    const rc = await client.query('SELECT subtotal, status, observacoes, forma_pagamento, pix_confirmado FROM pedidos WHERE id=$1 FOR UPDATE', [pedidoId]);
    const pedidoAtual = rc.rows[0];
    const subtotalAtual = pedidoAtual ? parseFloat(pedidoAtual.subtotal) || 0 : 0;
    const subtotal = subtotalAtual + subtotalNovos;
    const total = subtotal;
    let obsFinal = pedidoAtual ? (pedidoAtual.observacoes || '') : '';
    if (observacoes) obsFinal = obsFinal ? obsFinal + ' | ' + observacoes : observacoes;
    if (formaPagamento === 'dinheiro' && trocoPara) obsFinal += ` | Troco para R$ ${parseFloat(trocoPara).toFixed(2)}`;
    for (const item of itensComAdicionais) {
      const r = await client.query('INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, observacao) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '']);
      const newId = r.rows[0].id;
      if (item.adicionais && item.adicionais.length) {
        for (const a of item.adicionais) {
          await client.query('INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco, tipo) VALUES ($1,$2,$3,$4)', [newId, a.nome, a.preco, a.tipo || 'adicional']);
        }
      }
    }
    const novoStatus = (formaPagamento && formaPagamento !== 'mesa') ? 'entregue' : (pedidoAtual ? pedidoAtual.status : 'recebido');
    const formaFinal = formaPagamento || (pedidoAtual ? pedidoAtual.forma_pagamento : 'mesa');
    const pixConfirmado = formaFinal === 'pix' ? true : (pedidoAtual ? pedidoAtual.pix_confirmado : false);
    await client.query('UPDATE pedidos SET subtotal=$1, total=$2, forma_pagamento=$3, observacoes=$4, status=$5, pix_confirmado=$6, atualizado_em=NOW() WHERE id=$7', [subtotal, total, formaFinal, obsFinal, novoStatus, pixConfirmado, pedidoId]);
  });

  return db.get(`SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id=$1`, pedidoId);
}

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/mesa/:mesaId', wrapAsync(async (req, res) => {
  const comanda = await getComandaAberta(req.params.mesaId);
  if (!comanda) return res.json({ itens: [], total: 0, aberta: false });

  const itens = await db.all(`
    SELECT ci.*, p.foto 
    FROM comanda_itens ci
    LEFT JOIN produtos p ON ci.produto_id = p.id
    WHERE ci.comanda_id = $1
    ORDER BY ci.criado_em
  `, comanda.id);

  const itensComAdicionais = itens.map(item => ({
    ...item,
    adicionais: parseAdicionaisJson(item.adicionais_json)
  }));

  const total = itensComAdicionais.reduce((s, i) => {
    let itemTotal = i.preco_unitario * i.quantidade;
    if (i.adicionais && i.adicionais.length) {
      i.adicionais.forEach(a => { itemTotal += a.preco * i.quantidade; });
    }
    return s + itemTotal;
  }, 0);

  const itensNaoEnviados = itensComAdicionais.filter(i => !i.enviado_cozinha);

  res.json({ comanda, itens: itensComAdicionais, total, aberta: true, itensNaoEnviados });
}));

router.post('/mesa/:mesaId/item', wrapAsync(async (req, res) => {
  const { produto_id, quantidade, observacao, adicionais, cliente_nome, unidade } = req.body;
  const mesaId = req.params.mesaId;

  const produto = await db.get('SELECT * FROM produtos WHERE id = $1 AND ativo = true', produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado ou inativo' });

  const comanda = await getOrCreateComanda(mesaId, cliente_nome);

  const unidadeItem = (unidade === 'kg' || produto.unidade === 'kg') ? 'kg' : 'un';
  let qtd = parseFloat(quantidade);
  if (isNaN(qtd) || qtd <= 0) return res.status(400).json({ error: 'Quantidade inválida' });
  if (unidadeItem === 'un') {
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 99) return res.status(400).json({ error: 'Quantidade inválida para produto por unidade (1 a 99)' });
  } else {
    if (qtd < 0.05 || qtd > 10) return res.status(400).json({ error: 'Quantidade inválida para produto por peso (0.05kg a 10kg)' });
    qtd = Math.round(qtd * 1000) / 1000;
  }
  let adicionaisNorm = [];
  if (adicionais && adicionais.length) {
    if (adicionais.length > 20) return res.status(400).json({ error: 'Muitos adicionais' });
    const ids = [...new Set(adicionais.map(a => parseInt(a.id)).filter(Boolean))];
    if (ids.length !== adicionais.length) return res.status(400).json({ error: 'Adicionais inválidos' });
    const regs = await db.all('SELECT id, nome, categoria_id, produto_id, tipo, limite, preco FROM adicionais WHERE id = ANY($1)', [ids]);
    const porId = new Map(regs.map(r => [r.id, r]));
    if (regs.length !== ids.length) return res.status(400).json({ error: 'Adicional não encontrado' });
    for (const a of adicionais) {
      const r = porId.get(parseInt(a.id));
      if (!r || r.preco == null) return res.status(400).json({ error: `Adicional inválido #${a.id}` });
    }
    const contagemPorTipo = {};
    const limitePorTipo = {};
    for (const a of adicionais) {
      const r = porId.get(parseInt(a.id));
      const tipo = r.tipo || 'adicional';
      if (!(tipo in limitePorTipo)) limitePorTipo[tipo] = parseInt(r.limite) || 0;
      contagemPorTipo[tipo] = (contagemPorTipo[tipo] || 0) + 1;
    }
    for (const [tipo, qtdC] of Object.entries(contagemPorTipo)) {
      const lim = limitePorTipo[tipo] || 0;
      if (lim > 0 && qtdC > lim) return res.status(400).json({ error: `Máximo ${lim} ${tipo}(s) permitido(s)` });
    }
    let pizzaCatIds = new Set();
    try { const pcs = await db.all("SELECT id FROM categorias WHERE nome ILIKE '%pizza%'"); pizzaCatIds = new Set(pcs.map(r => r.id)); } catch(e) { pizzaCatIds = new Set([7,26,27,28]); }
    const vinc = await db.all('SELECT adicional_id, produto_id FROM adicional_produtos');
    const vinculosMap = new Map();
    vinc.forEach(v => { if (!vinculosMap.has(v.adicional_id)) vinculosMap.set(v.adicional_id, new Set()); vinculosMap.get(v.adicional_id).add(v.produto_id); });
    const isPizzaProd = produto.categoria_nome || (await db.get('SELECT c.nome as n FROM categorias c WHERE c.id=$1', produto.categoria_id).then(r=>r&&r.n||'').catch(()=>''));
    const catNome = produto.categoria_nome || (await db.get('SELECT nome FROM categorias WHERE id=$1', produto.categoria_id).then(r=>r&&r.nome||'').catch(()=>''));
    const isPizza = catNome && ['pizza','suco','bebida','milk','shake'].some(k=>catNome.toLowerCase().includes(k));
    const prodIsPizzaCat = pizzaCatIds.has(produto.categoria_id);
    for (const a of adicionais) {
      const reg = porId.get(parseInt(a.id));
      const idsVinc = vinculosMap.has(reg.id) ? Array.from(vinculosMap.get(reg.id)) : (reg.produto_id ? [reg.produto_id] : null);
      const mesmaCategoria = !reg.categoria_id || reg.categoria_id === produto.categoria_id;
      const prodEsp = idsVinc ? idsVinc.includes(produto.id) : false;
      const global = (!idsVinc || idsVinc.length===0) && mesmaCategoria;
      const isSaborPizzaCat = reg.tipo === 'sabor' && reg.categoria_id && pizzaCatIds.has(reg.categoria_id);
      let permitido = false;
      if (isPizza) {
        if (reg.tipo==='sabor' && (prodEsp||global)) permitido=true;
        if (reg.tipo==='sabor' && prodIsPizzaCat && isSaborPizzaCat && (!idsVinc || idsVinc.length===0)) permitido=true;
        else if ((prodEsp||global) && ['adicional','borda'].includes(reg.tipo) && reg.preco!==null) permitido=true;
        if (reg.tipo==='sabor' && catNome.toLowerCase().includes('bebida') && (prodEsp||global)) permitido=true;
      } else {
        permitido = (prodEsp||global) && (!reg.tipo || ['adicional','sabor','base','cobertura','acompanhamento','borda'].includes(reg.tipo));
      }
      if (reg.tipo==='sabor' && reg.categoria_id===2 && !isPizza) permitido=false;
      if (!permitido) return res.status(400).json({ error: `Adicional "${reg.nome}" não pertence ao produto "${produto.nome}"` });
    }
    adicionaisNorm = adicionais.map(a => { const r = porId.get(parseInt(a.id)); return { id: r.id, nome: /borda/i.test(r.tipo||'')?`Borda ${r.nome}`:r.nome, preco: parseFloat(r.preco)||0, tipo: r.tipo || 'adicional' }; });
  }
  const adicJson = adicionaisNorm.length ? JSON.stringify(adicionaisNorm) : null;
  const obsSanitizada = sanitizarString(observacao || '');
  const itemStmt = db.prepare(`
    INSERT INTO comanda_itens (comanda_id, produto_id, produto_nome, quantidade, preco_unitario, observacao, adicionais_json, unidade)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
  `);
  await itemStmt.run(comanda.id, produto_id, produto.nome, qtd, produto.preco, obsSanitizada, adicJson, unidadeItem);

  if (req.emitToMesa) {
    await req.emitToMesa(mesaId, 'comanda-atualizada', { mesaId: parseInt(mesaId) });
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true, comandaId: comanda.id });
}));

router.put('/mesa/:mesaId/item/:itemId', wrapAsync(async (req, res) => {
  const { quantidade, observacao, adicionais } = req.body;
  const { mesaId, itemId } = req.params;

  const comanda = await getComandaAberta(mesaId);
  if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });

  const adicJson = adicionais && adicionais.length ? JSON.stringify(adicionais) : null;
  await db.run(`
    UPDATE comanda_itens SET quantidade = $1, observacao = $2, adicionais_json = $3 WHERE id = $4 AND comanda_id = $5
  `, quantidade || 1, observacao || '', adicJson, itemId, comanda.id);

  if (req.emitToMesa) {
    await req.emitToMesa(mesaId, 'comanda-atualizada', { mesaId: parseInt(mesaId) });
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true });
}));

router.patch('/mesa/:mesaId/item/:itemId/quantidade', wrapAsync(async (req, res) => {
  const { quantidade } = req.body;
  const { mesaId, itemId } = req.params;

  const comanda = await getComandaAberta(mesaId);
  if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });

  await db.run('UPDATE comanda_itens SET quantidade = $1 WHERE id = $2 AND comanda_id = $3', quantidade, itemId, comanda.id);

  if (req.emitToMesa) {
    await req.emitToMesa(mesaId, 'comanda-atualizada', { mesaId: parseInt(mesaId) });
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true });
}));

router.delete('/mesa/:mesaId/item/:itemId', wrapAsync(async (req, res) => {
  const { mesaId, itemId } = req.params;
  const comanda = await getComandaAberta(mesaId);
  if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });

  await db.run('DELETE FROM comanda_itens WHERE id = $1 AND comanda_id = $2', itemId, comanda.id);

  if (req.emitToMesa) {
    await req.emitToMesa(mesaId, 'comanda-atualizada', { mesaId: parseInt(mesaId) });
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true });
}));

router.put('/mesa/:mesaId/cliente-nome', wrapAsync(async (req, res) => {
  const { cliente_nome } = req.body;
  const mesaId = req.params.mesaId;
  let comanda = await getComandaAberta(mesaId);
  if (!comanda) comanda = await getOrCreateComanda(mesaId, cliente_nome);
  await db.run('UPDATE comandas SET cliente_nome = $1 WHERE id = $2', cliente_nome || null, comanda.id);

  if (req.emitToMesa) {
    await req.emitToMesa(mesaId, 'comanda-atualizada', { mesaId: parseInt(mesaId) });
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true });
}));

// Enviar itens da comanda para a cozinha (agrupa no mesmo pedido se já existir)
router.post('/mesa/:mesaId/enviar-cozinha', wrapAsync(async (req, res) => {
  const { cliente_id, item_ids, observacoes } = req.body;
  const mesaId = req.params.mesaId;

  const comanda = await getComandaAberta(mesaId);
  if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });

  let whereClause = 'WHERE ci.comanda_id = $1';
  const params = [comanda.id];
  let paramIndex = 2;

  if (item_ids && item_ids.length > 0) {
    const placeholders = item_ids.map(() => `$${paramIndex++}`).join(',');
    whereClause += ` AND ci.id IN (${placeholders})`;
    params.push(...item_ids);
  } else {
    whereClause += ' AND (ci.enviado_cozinha IS NULL OR ci.enviado_cozinha = false)';
  }

  const itens = await db.all(`
    SELECT ci.*, p.foto 
    FROM comanda_itens ci
    LEFT JOIN produtos p ON ci.produto_id = p.id
    ${whereClause}
    ORDER BY ci.criado_em
  `, ...params);

  if (!itens.length) return res.status(400).json({ error: 'Nenhum item para enviar à cozinha' });

  const itensComAdicionais = itens.map(item => ({
    ...item,
    adicionais: parseAdicionaisJson(item.adicionais_json)
  }));

  // Verificar se já existe pedido vinculado à comanda
  const pedidoExistente = await getPedidoVinculadoComanda(comanda.id);

  let pedido;
  if (pedidoExistente) {
    // Inserir novos itens no pedido existente
    pedido = await atualizarPedidoComItens(pedidoExistente.id, itensComAdicionais, 'mesa', observacoes || '', null);
  } else {
    // Criar novo pedido vinculado à comanda
    const cliente = await getOuCriaClienteMesa(mesaId, comanda.cliente_nome || '');

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
    obsFinal += ' [ENVIADO PARA COZINHA]';

    const info = await db.run(`
      INSERT INTO pedidos (cliente_id, subtotal, taxa_entrega, total, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, mesa_id, status, comanda_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
    `,
      cliente.id,
      subtotal,
      taxaEntrega,
      total,
      'mesa',
      obsFinal,
      `Mesa ${mesaId}${comanda.cliente_nome ? ' - ' + comanda.cliente_nome : ''}`,
      'Mesa',
      mesaId,
      'recebido',
      comanda.id
    );

    const pedidoId = info.lastInsertRowid;


    // Transação: itens + marcação enviado_cozinha em lote
    await db.transaction(async (client) => {
      for (const item of itensComAdicionais) {
        const r = await client.query('INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, observacao) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '']);
        const newItemId = r.rows[0].id;
        await client.query('UPDATE comanda_itens SET enviado_cozinha = true, pedido_item_id = $1 WHERE id = $2', [newItemId, item.id]);
        if (item.adicionais && item.adicionais.length) {
          for (const a of item.adicionais) {
            await client.query('INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco, tipo) VALUES ($1,$2,$3,$4)', [newItemId, a.nome, a.preco, a.tipo || 'adicional']);
          }
        }
      }
      // Garante marcação em lote (idempotente) para itens não cobertos acima
      const ids = itens.map(i => i.id);
      await client.query('UPDATE comanda_itens SET enviado_cozinha = true WHERE id = ANY($1)', [ids]);
    });

    pedido = await db.get(`
      SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p
      JOIN clientes c ON p.cliente_id = c.id WHERE p.id = $1
    `, pedidoId);
    const pedItens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = $1', pedidoId);
    const adicionaisBatch = pedItens.length ? await db.all('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ANY($1)', pedItens.map(i=>i.id)) : [];
    pedido.itens = pedItens.map(i => ({ ...i, adicionais: adicionaisBatch.filter(a => a.pedido_item_id === i.id) }));
  }

  // Itens já marcados em lote dentro da transação — sem loop extra

  const isAtualizacao = !!pedidoExistente;
  if (req.emitToAdmin) {
    if (isAtualizacao) {
      await req.emitToAdmin('pedido-atualizado', { id: pedido.id, status: pedido.status, _novoItem: true, _mesaId: parseInt(mesaId), _qtdItens: itensComAdicionais.length });
      // também emitir novo-pedido para compatibilidade com toast existente
      await req.emitToAdmin('novo-pedido', { ...pedido, _isAtualizacao: true, _mesaId: parseInt(mesaId) });
    } else {
      await req.emitToAdmin('novo-pedido', pedido);
    }
  }
  if (req.emitToGarcom) {
    if (isAtualizacao) {
      await req.emitToGarcom('pedido-atualizado', { id: pedido.id, status: pedido.status });
    } else {
      await req.emitToGarcom('novo-pedido', pedido);
    }
  }
  if (req.emitToMesa) {
    await req.emitToMesa(mesaId, 'comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true, pedido, itensEnviados: itensComAdicionais.length });
}));

router.post('/mesa/:mesaId/fechar', wrapAsync(async (req, res) => {
  const { cliente_id, forma_pagamento, observacoes, registrar_apenas, cliente_nome_informado, troco_para } = req.body;
  const mesaId = req.params.mesaId;

  const comanda = await getComandaAberta(mesaId);
  if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada ou já fechada' });

  const nomeClienteComanda = cliente_nome_informado || comanda.cliente_nome || '';

  const itens = await db.all(`
    SELECT ci.*, p.foto 
    FROM comanda_itens ci
    LEFT JOIN produtos p ON ci.produto_id = p.id
    WHERE ci.comanda_id = $1
  `, comanda.id);

  if (!itens.length) return res.status(400).json({ error: 'Comanda vazia' });

  const itensComAdicionais = itens.map(item => ({
    ...item,
    adicionais: parseAdicionaisJson(item.adicionais_json)
  }));

  const itensNaoEnviados = itensComAdicionais.filter(i => !i.enviado_cozinha);

  const agora = getBrasilTimestamp();

  if (registrar_apenas) {
    const pedidosAtualizados = await db.all('SELECT id FROM pedidos WHERE comanda_id = $1 AND status != $2', comanda.id, 'entregue');
    await db.transaction(async (client) => {
      await client.query('UPDATE comandas SET status=$1, fechada_em=$2 WHERE id=$3', ['fechada', agora, comanda.id]);
      await client.query('UPDATE mesas SET status=$1 WHERE id=$2', ['livre', mesaId]);
      await client.query('UPDATE pedidos SET status=$1, atualizado_em=NOW() WHERE comanda_id=$2 AND status != $3', ['entregue', comanda.id, 'entregue']);
    });
    if (req.emitToGarcom) await req.emitToGarcom('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    if (req.emitToAdmin) {
      await req.emitToAdmin('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
      for (const p of pedidosAtualizados) await req.emitToAdmin('pedido-atualizado', { id: p.id, status: 'entregue' });
    }
    if (req.emitToMesa) await req.emitToMesa(mesaId, 'mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    return res.json({ success: true, mensagem: 'Comanda registrada sem pagamento' });
  }

  // Verificar se já existe pedido vinculado à comanda
  const pedidoExistente = await getPedidoVinculadoComanda(comanda.id);

  let pedido;
  if (pedidoExistente) {
    // Fechar pedido existente: adicionar itens não enviados, atualizar pagamento e status
    if (itensNaoEnviados.length > 0) {
      pedido = await atualizarPedidoComItens(pedidoExistente.id, itensNaoEnviados, forma_pagamento, observacoes, troco_para);
    } else {
      // Apenas atualizar pagamento e status
      let obsFinal = observacoes || '';
      if (forma_pagamento === 'dinheiro' && troco_para) {
        obsFinal += ` | Troco para R$ ${parseFloat(troco_para).toFixed(2)}`;
      }
      const pixConfirmadoF = (forma_pagamento || 'mesa') === 'pix' ? true : false;
      await db.run('UPDATE pedidos SET forma_pagamento = $1, observacoes = $2, status = $3, pix_confirmado = $4, atualizado_em = NOW() WHERE id = $5',
        forma_pagamento || 'mesa', obsFinal, 'entregue', pixConfirmadoF, pedidoExistente.id);
      pedido = await db.get(`
        SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p
        JOIN clientes c ON p.cliente_id = c.id WHERE p.id = $1
      `, pedidoExistente.id);
      const pedItens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = $1', pedidoExistente.id);
      const adicionaisStmt2 = db.prepare('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = $1');
      pedido.itens = [];
      for (const i of pedItens) {
        const ads = await adicionaisStmt2.all(i.id);
        pedido.itens.push({ ...i, adicionais: ads });
      }
    }
  } else {
    // Não houve envio à cozinha: criar pedido final direto
    const cliente = await getOuCriaClienteMesa(mesaId, nomeClienteComanda);

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
    if (forma_pagamento === 'dinheiro' && troco_para) {
      obsFinal += ` | Troco para R$ ${parseFloat(troco_para).toFixed(2)}`;
    }

    const pixConfirmadoF2 = (forma_pagamento || 'mesa') === 'pix';
    const pedidoId = await db.transaction(async (client) => {
      const r = await client.query(`INSERT INTO pedidos (cliente_id, subtotal, taxa_entrega, total, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, mesa_id, status, comanda_id, pix_confirmado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [cliente.id, subtotal, taxaEntrega, total, forma_pagamento || 'mesa', obsFinal, `Mesa ${mesaId}${nomeClienteComanda ? ' - ' + nomeClienteComanda : ''}`, 'Mesa', mesaId, 'entregue', comanda.id, pixConfirmadoF2]);
      const pid = r.rows[0].id;
      for (const item of itensComAdicionais) {
        const ri = await client.query('INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, observacao) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [pid, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '']);
        const nid = ri.rows[0].id;
        if (item.adicionais && item.adicionais.length) {
          for (const a of item.adicionais) await client.query('INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco, tipo) VALUES ($1,$2,$3,$4)', [nid, a.nome, a.preco, a.tipo || 'adicional']);
        }
      }
      await client.query('UPDATE comandas SET status=$1, fechada_em=$2 WHERE id=$3', ['fechada', agora, comanda.id]);
      await client.query('UPDATE mesas SET status=$1 WHERE id=$2', ['livre', mesaId]);
      return pid;
    });

    pedido = await db.get(`SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id=$1`, pedidoId);
    const pedItens2 = await db.all('SELECT * FROM pedido_itens WHERE pedido_id=$1', pedidoId);
    const adsBatch = pedItens2.length ? await db.all('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ANY($1)', pedItens2.map(i=>i.id)) : [];
    pedido.itens = pedItens2.map(i => ({ ...i, adicionais: adsBatch.filter(a=>a.pedido_item_id===i.id)}));
  }

  // Fechar comanda/mesa quando veio de pedidoExistente (já faz close no caso novo pedido)
  if (pedidoExistente) {
    await db.transaction(async (client) => {
      await client.query('UPDATE comandas SET status=$1, fechada_em=$2 WHERE id=$3', ['fechada', agora, comanda.id]);
      await client.query('UPDATE mesas SET status=$1 WHERE id=$2', ['livre', mesaId]);
    });
  }

  if (pedido) {
    if (req.emitToAdmin) await req.emitToAdmin('novo-pedido', pedido);
    if (req.emitToGarcom) await req.emitToGarcom('novo-pedido', pedido);
    if (req.emitToMesa) await req.emitToMesa(mesaId, 'mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    if (req.emitToAdmin) await req.emitToAdmin('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    if (req.emitToGarcom) await req.emitToGarcom('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
  }

  res.json({ success: true, pedido });
}));

// Liberar mesa pelo garçom (sem itens enviados para cozinha)
router.post('/mesa/:mesaId/liberar', wrapAsync(async (req, res) => {
  const { forcar } = req.body;
  const mesaId = req.params.mesaId;

  const comanda = await getComandaAberta(mesaId);
  
  // Caso 1: Sem comanda - apenas libera mesa
  if (!comanda) {
    await db.run('UPDATE mesas SET status = $1 WHERE id = $2', 'livre', mesaId);
    if (req.emitToGarcom) await req.emitToGarcom('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    if (req.emitToAdmin) await req.emitToAdmin('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    if (req.emitToMesa) await req.emitToMesa(mesaId, 'mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    return res.json({ success: true, mensagem: 'Mesa liberada' });
  }

  const itens = await db.all('SELECT * FROM comanda_itens WHERE comanda_id = $1', comanda.id);
  const itensEnviados = itens.filter(i => i.enviado_cozinha);

  // Caso 4: Tem itens enviados para cozinha -> BLOQUEAR
  if (itensEnviados.length > 0) {
    return res.status(400).json({ 
      error: 'Ha itens enviados para a cozinha. Use "Fechar Comanda" com pagamento ou peca ao admin para cancelar o pedido.' 
    });
  }

  // Caso 3: Tem itens nao enviados -> precisa confirmacao
  if (itens.length > 0 && !forcar) {
    return res.status(400).json({ 
      error: 'Comanda tem itens nao enviados. Confirme para remover itens e liberar mesa.',
      itens: itens.length,
      precisaConfirmacao: true 
    });
  }

  // Remove itens se houver (caso 2 e 3)
  if (itens.length > 0) {
    await db.run('DELETE FROM comanda_itens WHERE comanda_id = $1', comanda.id);
  }

  // Fecha comanda
  const agora = getBrasilTimestamp();
  await db.run('UPDATE comandas SET status = $1, fechada_em = $2 WHERE id = $3', 'fechada', agora, comanda.id);

  // Atualiza pedidos vinculados para 'entregue'
  const pedidosAtualizados = await db.all('SELECT id FROM pedidos WHERE comanda_id = $1 AND status != $2', comanda.id, 'entregue');
  await db.run('UPDATE pedidos SET status = $1, atualizado_em = NOW() WHERE comanda_id = $2 AND status != $3', 'entregue', comanda.id, 'entregue');

  // Libera mesa
  await db.run('UPDATE mesas SET status = $1 WHERE id = $2', 'livre', mesaId);

  if (req.emitToAdmin) {
    await req.emitToAdmin('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    pedidosAtualizados.forEach(p => {
      req.emitToAdmin('pedido-atualizado', { id: p.id, status: 'entregue' });
    });
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
  }

  res.json({ success: true, mensagem: 'Mesa liberada com sucesso' });
}));

module.exports = router;