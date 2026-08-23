const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareGarcom } = require('../auth/auth');

router.use(middlewareGarcom);

async function getComandaAberta(mesaId) {
  return db.get('SELECT * FROM comandas WHERE mesa_id = $1 AND status = $2', mesaId, 'aberta');
}

async function getOuCriaClienteMesa(mesaId, clienteNome) {
  const telefoneMesa = `mesa${mesaId}`;
  let cliente = await db.get('SELECT * FROM clientes WHERE telefone = $1', telefoneMesa);
  const nomeFormatado = `Mesa ${mesaId}${clienteNome ? ' - ' + clienteNome : ''}`;

  if (!cliente) {
    const info = await db.run('INSERT INTO clientes (nome, telefone, bairro) VALUES ($1, $2, $3) RETURNING id', nomeFormatado, telefoneMesa, 'Mesa');
    cliente = { id: info.lastInsertRowid, nome: nomeFormatado, telefone: telefoneMesa, bairro: 'Mesa' };
  } else if (clienteNome && !cliente.nome.includes(' - ') && cliente.nome.startsWith('Mesa ' + mesaId)) {
    await db.run('UPDATE clientes SET nome = $1 WHERE id = $2', nomeFormatado, cliente.id);
    cliente.nome = nomeFormatado;
  }
  return cliente;
}

async function getOrCreateComanda(mesaId, clienteNome) {
  let comanda = await getComandaAberta(mesaId);
  if (!comanda) {
    const info = await db.run('INSERT INTO comandas (mesa_id, cliente_nome, status) VALUES ($1, $2, $3) RETURNING id', mesaId, clienteNome || null, 'aberta');
    comanda = { id: info.lastInsertRowid, mesa_id: mesaId, cliente_nome: clienteNome || null, status: 'aberta' };
    await db.run('UPDATE mesas SET status = $1 WHERE id = $2', 'ocupada', mesaId);
  } else if (clienteNome && !comanda.cliente_nome) {
    await db.run('UPDATE comandas SET cliente_nome = $1 WHERE id = $2', clienteNome, comanda.id);
    comanda.cliente_nome = clienteNome;
  }
  return comanda;
}

async function getPedidoVinculadoComanda(comandaId) {
  return db.get('SELECT * FROM pedidos WHERE comanda_id = $1 AND status != $2 ORDER BY criado_em DESC LIMIT 1', comandaId, 'cancelado');
}

async function atualizarPedidoComItens(pedidoId, itensComAdicionais, formaPagamento, observacoes, trocoPara) {
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

  const novoPedidoItensStmt = db.prepare(`
    INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, observacao)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
  `);
  const novoAdicStmt = db.prepare(`
    INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco)
    VALUES ($1, $2, $3)
  `);

  for (const item of itensComAdicionais) {
    const itemInfo = await novoPedidoItensStmt.run(pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '');
    if (item.adicionais && item.adicionais.length) {
      for (const a of item.adicionais) {
        await novoAdicStmt.run(itemInfo.lastInsertRowid, a.nome, a.preco);
      }
    }
  }

  await db.run('UPDATE pedidos SET subtotal = $1, total = $2, forma_pagamento = $3, observacoes = $4, status = $5, atualizado_em = NOW() WHERE id = $6',
    subtotal, total, formaPagamento || 'mesa', obsFinal, 'entregue', pedidoId);

  return db.get(`
    SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p
    JOIN clientes c ON p.cliente_id = c.id WHERE p.id = $1
  `, pedidoId);
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
    adicionais: item.adicionais_json ? JSON.parse(item.adicionais_json) : []
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
  const { produto_id, quantidade, observacao, adicionais, cliente_nome } = req.body;
  const mesaId = req.params.mesaId;

  const produto = await db.get('SELECT * FROM produtos WHERE id = $1 AND ativo = true', produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado ou inativo' });

  const comanda = await getOrCreateComanda(mesaId, cliente_nome);

  const adicJson = adicionais && adicionais.length ? JSON.stringify(adicionais) : null;
  const itemStmt = db.prepare(`
    INSERT INTO comanda_itens (comanda_id, produto_id, produto_nome, quantidade, preco_unitario, observacao, adicionais_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `);
  await itemStmt.run(comanda.id, produto_id, produto.nome, quantidade || 1, produto.preco, observacao || '', adicJson);

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
    adicionais: item.adicionais_json ? JSON.parse(item.adicionais_json) : []
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

    const itemStmt = db.prepare(`
      INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, observacao)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `);
    const adicStmt = db.prepare(`
      INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco)
      VALUES ($1, $2, $3)
    `);

    for (const item of itensComAdicionais) {
      const itemInfo = await itemStmt.run(pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '');
      await db.run('UPDATE comanda_itens SET enviado_cozinha = true, pedido_item_id = $1 WHERE id = $2', itemInfo.lastInsertRowid, item.id);
      
      if (item.adicionais && item.adicionais.length) {
        for (const a of item.adicionais) {
          await adicStmt.run(itemInfo.lastInsertRowid, a.nome, a.preco);
        }
      }
    }

    pedido = await db.get(`
      SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p
      JOIN clientes c ON p.cliente_id = c.id WHERE p.id = $1
    `, pedidoId);
    const pedItens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = $1', pedidoId);
    const adicionaisStmt2 = db.prepare('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = $1');
    pedido.itens = [];
    for (const i of pedItens) {
      const ads = await adicionaisStmt2.all(i.id);
      pedido.itens.push({ ...i, adicionais: ads });
    }
  }

  // Marcar itens da comanda como enviados (apenas os que acabaram de ser enviados)
  for (const item of itens) {
    await db.run('UPDATE comanda_itens SET enviado_cozinha = true WHERE id = $1', item.id);
  }

  if (req.emitToAdmin) {
    await req.emitToAdmin('novo-pedido', pedido);
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('novo-pedido', pedido);
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
    adicionais: item.adicionais_json ? JSON.parse(item.adicionais_json) : []
  }));

  const itensNaoEnviados = itensComAdicionais.filter(i => !i.enviado_cozinha);

  const agora = new Date().toISOString().replace('T', ' ').substring(0, 19);

  if (registrar_apenas) {
    await db.run('UPDATE comandas SET status = $1, fechada_em = $2 WHERE id = $3', 'fechada', agora, comanda.id);
    await db.run('UPDATE mesas SET status = $1 WHERE id = $2', 'livre', mesaId);

    if (req.app.get('io')) {
      req.app.get('io').emit('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    }

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
      await db.run('UPDATE pedidos SET forma_pagamento = $1, observacoes = $2, status = $3, atualizado_em = NOW() WHERE id = $4',
        forma_pagamento || 'mesa', obsFinal, 'entregue', pedidoExistente.id);
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

    const info = await db.run(`
      INSERT INTO pedidos (cliente_id, subtotal, taxa_entrega, total, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, mesa_id, status, comanda_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
    `,
      cliente.id,
      subtotal,
      taxaEntrega,
      total,
      forma_pagamento || 'mesa',
      obsFinal,
      `Mesa ${mesaId}${nomeClienteComanda ? ' - ' + nomeClienteComanda : ''}`,
      'Mesa',
      mesaId,
      'entregue',
      comanda.id
    );

    const pedidoId = info.lastInsertRowid;

    const itemStmt = db.prepare(`
      INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, observacao)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
    `);
    const adicStmt = db.prepare(`
      INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco)
      VALUES ($1, $2, $3)
    `);

    for (const item of itensComAdicionais) {
      const itemInfo = await itemStmt.run(pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '');
      if (item.adicionais && item.adicionais.length) {
        for (const a of item.adicionais) {
          await adicStmt.run(itemInfo.lastInsertRowid, a.nome, a.preco);
        }
      }
    }

    pedido = await db.get(`
      SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p
      JOIN clientes c ON p.cliente_id = c.id WHERE p.id = $1
    `, pedidoId);
    const pedItens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = $1', pedidoId);
    const adicionaisStmt2 = db.prepare('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = $1');
    pedido.itens = [];
    for (const i of pedItens) {
      const ads = await adicionaisStmt2.all(i.id);
      pedido.itens.push({ ...i, adicionais: ads });
    }
  }

  await db.run('UPDATE comandas SET status = $1, fechada_em = $2 WHERE id = $3', 'fechada', agora, comanda.id);
  await db.run('UPDATE mesas SET status = $1 WHERE id = $2', 'livre', mesaId);

  if (req.app.get('io')) {
    req.app.get('io').emit('novo-pedido', pedido);
    req.app.get('io').emit('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
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
    if (req.app.get('io')) {
      req.app.get('io').emit('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    }
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
  const agora = new Date().toISOString().replace('T', ' ').substring(0, 19);
  await db.run('UPDATE comandas SET status = $1, fechada_em = $2 WHERE id = $3', 'fechada', agora, comanda.id);

  // Libera mesa
  await db.run('UPDATE mesas SET status = $1 WHERE id = $2', 'livre', mesaId);

  if (req.emitToAdmin) {
    await req.emitToAdmin('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
  }

  res.json({ success: true, mensagem: 'Mesa liberada com sucesso' });
}));

module.exports = router;