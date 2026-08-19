const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');

router.get('/', middlewareAdmin, (req, res) => {
  const { status, data_inicio, data_fim, limite } = req.query;
  let sql = 'SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p JOIN clientes c ON p.cliente_id = c.id';
  const params = [];
  const conditions = [];

  if (status) { conditions.push('p.status = ?'); params.push(status); }
  if (data_inicio) { conditions.push('p.criado_em >= ?'); params.push(data_inicio); }
  if (data_fim) { conditions.push('p.criado_em <= ?'); params.push(data_fim + ' 23:59:59'); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY p.mesa_id IS NULL DESC, p.mesa_id ASC, p.comanda_id ASC, p.criado_em DESC';
  if (limite) { sql += ' LIMIT ?'; params.push(parseInt(limite)); }

  const pedidos = db.prepare(sql).all(...params);

  const itensStmt = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?');
  const adicionaisStmt = db.prepare('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ?');

  const result = pedidos.map(p => {
    const itens = itensStmt.all(p.id).map(item => ({
      ...item,
      adicionais: adicionaisStmt.all(item.id)
    }));
    return { ...p, itens };
  });

  res.json(result);
});

router.get('/:id', middlewareAdmin, (req, res) => {
  const pedido = db.prepare(
    'SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?'
  ).get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });

  const itens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(pedido.id);
  const adicionaisStmt = db.prepare('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ?');
  pedido.itens = itens.map(item => ({ ...item, adicionais: adicionaisStmt.all(item.id) }));

  res.json(pedido);
});

router.post('/', (req, res) => {
  const { cliente_id, itens, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, taxa_entrega, mesa_id } = req.body;

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

  const info = db.prepare(
    'INSERT INTO pedidos (cliente_id, subtotal, taxa_entrega, total, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, mesa_id) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(cliente_id, subtotal, taxaEntrega, total, forma_pagamento, observacoes || '', endereco_entrega || '', bairro_entrega || '', mesa_id || null);

  const pedidoId = info.lastInsertRowid;
  const itemStmt = db.prepare(
    'INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, observacao) VALUES (?,?,?,?,?,?)'
  );
  const adicStmt = db.prepare(
    'INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco) VALUES (?,?,?)'
  );

  itens.forEach(item => {
    const itemInfo = itemStmt.run(pedidoId, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, item.observacao || '');
    if (item.adicionais) {
      item.adicionais.forEach(a => adicStmt.run(itemInfo.lastInsertRowid, a.nome, a.preco));
    }
  });

  const pedido = db.prepare(
    'SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?'
  ).get(pedidoId);
  const pedidoItens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(pedidoId);
  const adicionaisStmt2 = db.prepare('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ?');
  pedido.itens = pedidoItens.map(i => ({ ...i, adicionais: adicionaisStmt2.all(i.id) }));

  if (req.app.get('io')) {
    req.app.get('io').emit('novo-pedido', pedido);
  }

  res.json(pedido);
});

router.put('/:id/status', middlewareAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['recebido', 'em_preparo', 'saiu_entrega', 'entregue', 'cancelado'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  db.prepare('UPDATE pedidos SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);

  if (req.app.get('io')) {
    req.app.get('io').emit('pedido-atualizado', { id: parseInt(req.params.id), status });
  }

  res.json({ success: true });
});

router.put('/:id/pix', middlewareAdmin, (req, res) => {
  const { confirmado } = req.body;
  db.prepare('UPDATE pedidos SET pix_confirmado = ? WHERE id = ?').run(confirmado ? 1 : 0, req.params.id);

  if (req.app.get('io') && confirmado) {
    req.app.get('io').emit('pix-confirmado', { id: parseInt(req.params.id) });
  }

  res.json({ success: true });
});

module.exports = router;
