const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const { status, data_inicio, data_fim, limite } = req.query;
  let sql = 'SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone, m.nome as motoboy_nome FROM pedidos p JOIN clientes c ON p.cliente_id = c.id LEFT JOIN motoboys m ON m.id = p.motoboy_id';
  const params = [];
  const conditions = [];
  let paramIndex = 1;

  if (status) { conditions.push(`p.status = $${paramIndex++}`); params.push(status); }
  if (data_inicio) { conditions.push(`p.criado_em >= $${paramIndex++}`); params.push(data_inicio); }
  if (data_fim) { conditions.push(`p.criado_em <= $${paramIndex++}`); params.push(data_fim + ' 23:59:59'); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY p.mesa_id IS NULL DESC, p.mesa_id ASC, p.comanda_id ASC, p.criado_em DESC';
  if (limite) { sql += ` LIMIT $${paramIndex}`; params.push(parseInt(limite)); }

  const pedidos = await db.all(sql, ...params);

  const itens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = ANY($1)', pedidos.map(p => p.id));
  const adicionais = await db.all('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ANY($1)', itens.map(i => i.id));

  const result = pedidos.map(p => {
    const pedidoItens = itens.filter(i => i.pedido_id === p.id).map(item => ({
      ...item,
      adicionais: adicionais.filter(a => a.pedido_item_id === item.id)
    }));
    return { ...p, itens: pedidoItens };
  });

  res.json(result);
}));

router.get('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const pedido = await db.get(
    'SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = $1',
    req.params.id
  );
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });

  const itens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = $1', pedido.id);
  const adicionais = await db.all('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ANY($1)', itens.map(i => i.id));

  pedido.itens = itens.map(item => ({ ...item, adicionais: adicionais.filter(a => a.pedido_item_id === item.id) }));

  res.json(pedido);
}));

router.post('/', wrapAsync(async (req, res) => {
  // Cliente publico so pede com a loja aberta; garcom/admin (com token) podem sempre
  const cfgLoja = await db.get("SELECT valor FROM configuracoes WHERE chave = 'loja_aberta'");
  const lojaAberta = !cfgLoja || cfgLoja.valor !== 'false';
  if (!lojaAberta && !req.usuario) {
    return res.status(403).json({ error: 'A loja está fechada e não está aceitando pedidos no momento' });
  }

  const { cliente_id, itens, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, taxa_entrega, mesa_id } = req.body;

  if (cliente_id) {
    const cliente = await db.get('SELECT bloqueado FROM clientes WHERE id = $1', cliente_id);
    if (cliente && cliente.bloqueado) {
      return res.status(403).json({ error: 'Você não tem permissão para realizar pedidos.' });
    }
  }

  let subtotal = 0;
  itens.forEach(item => {
    let itemTotal = item.preco_unitario * item.quantidade;
    if (item.adicionais) {
      item.adicionais.forEach(a => { itemTotal += a.preco * item.quantidade; });
    }
    subtotal += itemTotal;
  });

  const taxaEntrega = parseFloat(taxa_entrega) || 0;
  const total = subtotal + taxaEntrega;

  const info = await db.run(
    'INSERT INTO pedidos (cliente_id, subtotal, taxa_entrega, total, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, mesa_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    cliente_id, subtotal, taxaEntrega, total, forma_pagamento, observacoes || '', endereco_entrega || '', bairro_entrega || '', mesa_id || null
  );

  const pedidoId = info.lastInsertRowid;
  const itemStmt = db.prepare('INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, observacao, unidade) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id');
  const adicStmt = db.prepare('INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco) VALUES ($1,$2,$3)');

  for (const item of itens) {
    const itemInfo = await itemStmt.run(pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '', item.unidade === 'kg' ? 'kg' : 'un');
    if (item.adicionais) {
      for (const a of item.adicionais) {
        await adicStmt.run(itemInfo.lastInsertRowid, a.nome, a.preco);
      }
    }
  }

  const pedido = await db.get(
    'SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = $1',
    pedidoId
  );
  const pedidoItens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = $1', pedidoId);
  const adicionaisStmt2 = db.prepare('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = $1');
  pedido.itens = pedidoItens.map(i => ({ ...i, adicionais: [] }));
  for (const item of pedido.itens) {
    item.adicionais = await adicionaisStmt2.all(item.id);
  }

  if (req.emitToAdmin) {
    await req.emitToAdmin('novo-pedido', pedido);
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('novo-pedido', pedido);
  }

  res.json(pedido);
}));

router.put('/:id/status', middlewareAdmin, wrapAsync(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['recebido', 'em_preparo', 'saiu_entrega', 'entregue', 'cancelado'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const pedido = await db.get('SELECT mesa_id FROM pedidos WHERE id = $1', req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  
  if (pedido.mesa_id) {
    return res.status(403).json({ error: 'Pedidos de mesa só podem ser finalizados pelo garçom ao fechar a comanda' });
  }

  await db.run('UPDATE pedidos SET status = $1, atualizado_em = NOW() WHERE id = $2', status, req.params.id);

  if (req.emitToAdmin) {
    await req.emitToAdmin('pedido-atualizado', { id: parseInt(req.params.id), status });
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('pedido-atualizado', { id: parseInt(req.params.id), status });
  }

  res.json({ success: true });
}));

router.put('/:id/motoboy', middlewareAdmin, wrapAsync(async (req, res) => {
  const { motoboy_id } = req.body;
  const motoboyId = motoboy_id ? parseInt(motoboy_id) : null;
  if (motoboyId) {
    const motoboy = await db.get('SELECT id FROM motoboys WHERE id = $1', motoboyId);
    if (!motoboy) return res.status(404).json({ error: 'Motoboy não encontrado' });
  }
  await db.run('UPDATE pedidos SET motoboy_id = $1, atualizado_em = NOW() WHERE id = $2', motoboyId, req.params.id);
  res.json({ success: true });
}));

router.put('/:id/pix', middlewareAdmin, wrapAsync(async (req, res) => {
  const { confirmado } = req.body;
  await db.run('UPDATE pedidos SET pix_confirmado = $1 WHERE id = $2', confirmado ? true : false, req.params.id);

  if (req.emitToAdmin && confirmado) {
    await req.emitToAdmin('pix-confirmado', { id: parseInt(req.params.id) });
  }
  if (req.emitToGarcom && confirmado) {
    await req.emitToGarcom('pix-confirmado', { id: parseInt(req.params.id) });
  }

  res.json({ success: true });
}));

module.exports = router;