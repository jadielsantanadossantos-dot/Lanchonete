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
  const rows = await db.all('SELECT * FROM clientes ORDER BY nome');
  res.json(rows);
}));

router.get('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE id = $1', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(cliente);
}));

router.get('/telefone/:telefone', wrapAsync(async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE telefone = $1', req.params.telefone);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(cliente);
}));

// Publico: cliente acompanha os proprios pedidos pelo telefone
router.get('/telefone/:telefone/pedidos', wrapAsync(async (req, res) => {
  const cliente = await db.get('SELECT id FROM clientes WHERE telefone = $1', req.params.telefone);
  if (!cliente) return res.json([]);

  const pedidos = await db.all('SELECT * FROM pedidos WHERE cliente_id = $1 ORDER BY criado_em DESC', cliente.id);
  const itens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = ANY($1)', pedidos.map(p => p.id));
  const adicionais = await db.all('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ANY($1)', itens.map(i => i.id));

  res.json(pedidos.map(p => ({
    ...p,
    itens: itens.filter(i => i.pedido_id === p.id).map(item => ({
      ...item,
      adicionais: adicionais.filter(a => a.pedido_item_id === item.id)
    }))
  })));
}));

router.get('/:id/pedidos', middlewareAdmin, wrapAsync(async (req, res) => {
  const pedidos = await db.all('SELECT * FROM pedidos WHERE cliente_id = $1 ORDER BY criado_em DESC', req.params.id);
  res.json(pedidos);
}));

router.post('/', wrapAsync(async (req, res) => {
  const { nome, telefone, rua, numero, bairro, complemento, ponto_referencia } = req.body;
  try {
    const info = await db.run(
      'INSERT INTO clientes (nome, telefone, rua, numero, bairro, complemento, ponto_referencia) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      nome, telefone, rua || '', numero || '', bairro || '', complemento || '', ponto_referencia || ''
    );
    const cliente = await db.get('SELECT * FROM clientes WHERE id = $1', info.lastInsertRowid);
    res.json(cliente);
  } catch (e) {
    const existing = await db.get('SELECT * FROM clientes WHERE telefone = $1', telefone);
    if (existing) {
      await db.run(
        'UPDATE clientes SET nome=$1, rua=$2, numero=$3, bairro=$4, complemento=$5, ponto_referencia=$6 WHERE id=$7',
        nome, rua || '', numero || '', bairro || '', complemento || '', ponto_referencia || '', existing.id
      );
      return res.json(existing);
    }
    res.status(400).json({ error: 'Erro ao cadastrar cliente' });
  }
}));

router.put('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, telefone, rua, numero, bairro, complemento, ponto_referencia } = req.body;
  await db.run(
    'UPDATE clientes SET nome=$1, telefone=$2, rua=$3, numero=$4, bairro=$5, complemento=$6, ponto_referencia=$7 WHERE id=$8',
    nome, telefone, rua || '', numero || '', bairro || '', complemento || '', ponto_referencia || '', req.params.id
  );
  res.json({ success: true });
}));

module.exports = router;