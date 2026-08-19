const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareGarcom } = require('../auth/auth');

router.use(middlewareGarcom);

function getComandaAberta(mesaId) {
  return db.prepare('SELECT * FROM comandas WHERE mesa_id = ? AND status = ?').get(mesaId, 'aberta');
}

function getOuCriaClienteMesa(mesaId, clienteNome) {
  const telefoneMesa = `mesa${mesaId}`;
  let cliente = db.prepare('SELECT * FROM clientes WHERE telefone = ?').get(telefoneMesa);
  const nomeFormatado = `Mesa ${mesaId}${clienteNome ? ' - ' + clienteNome : ''}`;
  
  if (!cliente) {
    const info = db.prepare('INSERT INTO clientes (nome, telefone, bairro) VALUES (?, ?, ?)').run(nomeFormatado, telefoneMesa, 'Mesa');
    cliente = { id: info.lastInsertRowid, nome: nomeFormatado, telefone: telefoneMesa, bairro: 'Mesa' };
  } else if (clienteNome && !cliente.nome.includes(' - ') && cliente.nome.startsWith('Mesa ' + mesaId)) {
    db.prepare('UPDATE clientes SET nome = ? WHERE id = ?').run(nomeFormatado, cliente.id);
    cliente.nome = nomeFormatado;
  }
  return cliente;
}

function getOrCreateComanda(mesaId, clienteNome) {
  let comanda = getComandaAberta(mesaId);
  if (!comanda) {
    const info = db.prepare('INSERT INTO comandas (mesa_id, cliente_nome, status) VALUES (?, ?, ?)').run(mesaId, clienteNome || null, 'aberta');
    comanda = { id: info.lastInsertRowid, mesa_id: mesaId, cliente_nome: clienteNome || null, status: 'aberta' };
    db.prepare('UPDATE mesas SET status = ? WHERE id = ?').run('ocupada', mesaId);
  } else if (clienteNome && !comanda.cliente_nome) {
    db.prepare('UPDATE comandas SET cliente_nome = ? WHERE id = ?').run(clienteNome, comanda.id);
    comanda.cliente_nome = clienteNome;
  }
  return comanda;
}

function getPedidoVinculadoComanda(comandaId) {
  return db.prepare('SELECT * FROM pedidos WHERE comanda_id = ? AND status != ? ORDER BY criado_em DESC LIMIT 1').get(comandaId, 'cancelado');
}

function atualizarPedidoComItens(pedidoId, itensComAdicionais, formaPagamento, observacoes, trocoPara) {
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
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const novoAdicStmt = db.prepare(`
    INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco)
    VALUES (?, ?, ?)
  `);

  for (const item of itensComAdicionais) {
    const itemInfo = novoPedidoItensStmt.run(pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '');
    if (item.adicionais && item.adicionais.length) {
      for (const a of item.adicionais) {
        novoAdicStmt.run(itemInfo.lastInsertRowid, a.nome, a.preco);
      }
    }
  }

  db.prepare('UPDATE pedidos SET subtotal = ?, total = ?, forma_pagamento = ?, observacoes = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
    .run(subtotal, total, formaPagamento || 'mesa', obsFinal, 'entregue', pedidoId);

  return db.prepare(`
    SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p
    JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?
  `).get(pedidoId);
}

router.get('/mesa/:mesaId', (req, res) => {
  const comanda = getComandaAberta(req.params.mesaId);
  if (!comanda) return res.json({ itens: [], total: 0, aberta: false });

  const itens = db.prepare(`
    SELECT ci.*, p.foto 
    FROM comanda_itens ci
    LEFT JOIN produtos p ON ci.produto_id = p.id
    WHERE ci.comanda_id = ?
    ORDER BY ci.criado_em
  `).all(comanda.id);

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
});

router.post('/mesa/:mesaId/item', (req, res) => {
  const { produto_id, quantidade, observacao, adicionais, cliente_nome } = req.body;
  const mesaId = req.params.mesaId;

  const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado ou inativo' });

  const comanda = getOrCreateComanda(mesaId, cliente_nome);

  const adicJson = adicionais && adicionais.length ? JSON.stringify(adicionais) : null;
  const itemStmt = db.prepare(`
    INSERT INTO comanda_itens (comanda_id, produto_id, produto_nome, quantidade, preco_unitario, observacao, adicionais_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  itemStmt.run(comanda.id, produto_id, produto.nome, quantidade || 1, produto.preco, observacao || '', adicJson);

  if (req.app.get('io')) {
    req.app.get('io').emit('comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true, comandaId: comanda.id });
});

router.put('/mesa/:mesaId/item/:itemId', (req, res) => {
  const { quantidade, observacao, adicionais } = req.body;
  const { mesaId, itemId } = req.params;

  const comanda = getComandaAberta(mesaId);
  if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });

  const adicJson = adicionais && adicionais.length ? JSON.stringify(adicionais) : null;
  db.prepare(`
    UPDATE comanda_itens SET quantidade = ?, observacao = ?, adicionais_json = ? WHERE id = ? AND comanda_id = ?
  `).run(quantidade || 1, observacao || '', adicJson, itemId, comanda.id);

  if (req.app.get('io')) {
    req.app.get('io').emit('comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true });
});

router.delete('/mesa/:mesaId/item/:itemId', (req, res) => {
  const { mesaId, itemId } = req.params;
  const comanda = getComandaAberta(mesaId);
  if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });

  db.prepare('DELETE FROM comanda_itens WHERE id = ? AND comanda_id = ?').run(itemId, comanda.id);

  if (req.app.get('io')) {
    req.app.get('io').emit('comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true });
});

router.put('/mesa/:mesaId/cliente-nome', (req, res) => {
  const { cliente_nome } = req.body;
  const mesaId = req.params.mesaId;
  let comanda = getComandaAberta(mesaId);
  if (!comanda) comanda = getOrCreateComanda(mesaId, cliente_nome);
  db.prepare('UPDATE comandas SET cliente_nome = ? WHERE id = ?').run(cliente_nome || null, comanda.id);

  if (req.app.get('io')) {
    req.app.get('io').emit('comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true });
});

// Enviar itens da comanda para a cozinha (agrupa no mesmo pedido se já existir)
router.post('/mesa/:mesaId/enviar-cozinha', async (req, res) => {
  const { cliente_id, item_ids, observacoes } = req.body;
  const mesaId = req.params.mesaId;

  const comanda = getComandaAberta(mesaId);
  if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });

  let whereClause = 'WHERE ci.comanda_id = ?';
  const params = [comanda.id];

  if (item_ids && item_ids.length > 0) {
    const placeholders = item_ids.map(() => '?').join(',');
    whereClause += ` AND ci.id IN (${placeholders})`;
    params.push(...item_ids);
  } else {
    whereClause += ' AND (ci.enviado_cozinha IS NULL OR ci.enviado_cozinha = 0)';
  }

  const itens = db.prepare(`
    SELECT ci.*, p.foto 
    FROM comanda_itens ci
    LEFT JOIN produtos p ON ci.produto_id = p.id
    ${whereClause}
    ORDER BY ci.criado_em
  `).all(...params);

  if (!itens.length) return res.status(400).json({ error: 'Nenhum item para enviar à cozinha' });

  const itensComAdicionais = itens.map(item => ({
    ...item,
    adicionais: item.adicionais_json ? JSON.parse(item.adicionais_json) : []
  }));

  // Verificar se já existe pedido vinculado à comanda
  const pedidoExistente = getPedidoVinculadoComanda(comanda.id);

  let pedido;
  if (pedidoExistente) {
    // Inserir novos itens no pedido existente
    pedido = atualizarPedidoComItens(pedidoExistente.id, itensComAdicionais, 'mesa', observacoes || '', null);
  } else {
    // Criar novo pedido vinculado à comanda
    const cliente = getOuCriaClienteMesa(mesaId, comanda.cliente_nome || '');

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

    const info = db.prepare(`
      INSERT INTO pedidos (cliente_id, subtotal, taxa_entrega, total, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, mesa_id, status, comanda_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const adicStmt = db.prepare(`
      INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco)
      VALUES (?, ?, ?)
    `);

    for (const item of itensComAdicionais) {
      const itemInfo = itemStmt.run(pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '');
      db.prepare('UPDATE comanda_itens SET enviado_cozinha = 1, pedido_item_id = ? WHERE id = ?').run(itemInfo.lastInsertRowid, item.id);
      
      if (item.adicionais && item.adicionais.length) {
        for (const a of item.adicionais) {
          adicStmt.run(itemInfo.lastInsertRowid, a.nome, a.preco);
        }
      }
    }

    pedido = db.prepare(`
      SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p
      JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?
    `).get(pedidoId);
    const pedItens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(pedidoId);
    const adicionaisStmt2 = db.prepare('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ?');
    pedido.itens = pedItens.map(i => ({ ...i, adicionais: adicionaisStmt2.all(i.id) }));
  }

  // Marcar itens da comanda como enviados (apenas os que acabaram de ser enviados)
  for (const item of itens) {
    db.prepare('UPDATE comanda_itens SET enviado_cozinha = 1 WHERE id = ?').run(item.id);
  }

  if (req.app.get('io')) {
    req.app.get('io').emit('novo-pedido', pedido);
    req.app.get('io').emit('comanda-atualizada', { mesaId: parseInt(mesaId) });
  }

  res.json({ success: true, pedido, itensEnviados: itensComAdicionais.length });
});

router.post('/mesa/:mesaId/fechar', async (req, res) => {
  const { cliente_id, forma_pagamento, observacoes, registrar_apenas, cliente_nome_informado, troco_para } = req.body;
  const mesaId = req.params.mesaId;

  const comanda = getComandaAberta(mesaId);
  if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada ou já fechada' });

  const nomeClienteComanda = cliente_nome_informado || comanda.cliente_nome || '';

  const itens = db.prepare(`
    SELECT ci.*, p.foto 
    FROM comanda_itens ci
    LEFT JOIN produtos p ON ci.produto_id = p.id
    WHERE ci.comanda_id = ?
  `).all(comanda.id);

  if (!itens.length) return res.status(400).json({ error: 'Comanda vazia' });

  const itensComAdicionais = itens.map(item => ({
    ...item,
    adicionais: item.adicionais_json ? JSON.parse(item.adicionais_json) : []
  }));

  const itensNaoEnviados = itensComAdicionais.filter(i => !i.enviado_cozinha);

  const agora = new Date().toISOString().replace('T', ' ').substring(0, 19);

  if (registrar_apenas) {
    db.prepare('UPDATE comandas SET status = ?, fechada_em = ? WHERE id = ?').run('fechada', agora, comanda.id);
    db.prepare('UPDATE mesas SET status = ? WHERE id = ?').run('livre', mesaId);

    if (req.app.get('io')) {
      req.app.get('io').emit('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    }

    return res.json({ success: true, mensagem: 'Comanda registrada sem pagamento' });
  }

  // Verificar se já existe pedido vinculado à comanda
  const pedidoExistente = getPedidoVinculadoComanda(comanda.id);

  let pedido;
  if (pedidoExistente) {
    // Fechar pedido existente: adicionar itens não enviados, atualizar pagamento e status
    if (itensNaoEnviados.length > 0) {
      pedido = atualizarPedidoComItens(pedidoExistente.id, itensNaoEnviados, forma_pagamento, observacoes, troco_para);
    } else {
      // Apenas atualizar pagamento e status
      let obsFinal = observacoes || '';
      if (forma_pagamento === 'dinheiro' && troco_para) {
        obsFinal += ` | Troco para R$ ${parseFloat(troco_para).toFixed(2)}`;
      }
      db.prepare('UPDATE pedidos SET forma_pagamento = ?, observacoes = ?, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
        .run(forma_pagamento || 'mesa', obsFinal, 'entregue', pedidoExistente.id);
      pedido = db.prepare(`
        SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p
        JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?
      `).get(pedidoExistente.id);
      const pedItens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(pedidoExistente.id);
      const adicionaisStmt2 = db.prepare('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ?');
      pedido.itens = pedItens.map(i => ({ ...i, adicionais: adicionaisStmt2.all(i.id) }));
    }
  } else {
    // Não houve envio à cozinha: criar pedido final direto
    const cliente = getOuCriaClienteMesa(mesaId, nomeClienteComanda);

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

    const info = db.prepare(`
      INSERT INTO pedidos (cliente_id, subtotal, taxa_entrega, total, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, mesa_id, status, comanda_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const adicStmt = db.prepare(`
      INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco)
      VALUES (?, ?, ?)
    `);

    for (const item of itensComAdicionais) {
      const itemInfo = itemStmt.run(pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '');
      if (item.adicionais && item.adicionais.length) {
        for (const a of item.adicionais) {
          adicStmt.run(itemInfo.lastInsertRowid, a.nome, a.preco);
        }
      }
    }

    pedido = db.prepare(`
      SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p
      JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?
    `).get(pedidoId);
    const pedItens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(pedidoId);
    const adicionaisStmt2 = db.prepare('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ?');
    pedido.itens = pedItens.map(i => ({ ...i, adicionais: adicionaisStmt2.all(i.id) }));
  }

  db.prepare('UPDATE comandas SET status = ?, fechada_em = ? WHERE id = ?').run('fechada', agora, comanda.id);
  db.prepare('UPDATE mesas SET status = ? WHERE id = ?').run('livre', mesaId);

  if (req.app.get('io')) {
    req.app.get('io').emit('novo-pedido', pedido);
    req.app.get('io').emit('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
  }

  res.json({ success: true, pedido });
});

// Liberar mesa pelo garçom (sem itens enviados para cozinha)
router.post('/mesa/:mesaId/liberar', async (req, res) => {
  const { forcar } = req.body;
  const mesaId = req.params.mesaId;

  const comanda = getComandaAberta(mesaId);
  
  // Caso 1: Sem comanda - apenas libera mesa
  if (!comanda) {
    db.prepare('UPDATE mesas SET status = ? WHERE id = ?').run('livre', mesaId);
    if (req.app.get('io')) {
      req.app.get('io').emit('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
    }
    return res.json({ success: true, mensagem: 'Mesa liberada' });
  }

  const itens = db.prepare('SELECT * FROM comanda_itens WHERE comanda_id = ?').all(comanda.id);
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
    db.prepare('DELETE FROM comanda_itens WHERE comanda_id = ?').run(comanda.id);
  }

  // Fecha comanda
  const agora = new Date().toISOString().replace('T', ' ').substring(0, 19);
  db.prepare('UPDATE comandas SET status = ?, fechada_em = ? WHERE id = ?').run('fechada', agora, comanda.id);

  // Libera mesa
  db.prepare('UPDATE mesas SET status = ? WHERE id = ?').run('livre', mesaId);

  if (req.app.get('io')) {
    req.app.get('io').emit('mesa-atualizada', { mesaId: parseInt(mesaId), status: 'livre' });
  }

  res.json({ success: true, mensagem: 'Mesa liberada com sucesso' });
});

module.exports = router;