const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');
const { criarValidador } = require('../utils/validation');

const isDev = process.env.NODE_ENV !== 'production';
const publicLimiter = isDev
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      max: 20,
      message: { error: 'Muitas consultas, tente novamente em um minuto' },
      standardHeaders: true,
      legacyHeaders: false
    });

const validarCliente = criarValidador({
  nome: { obrigatorio: true, tipo: 'string', tamanho: { min: 2, max: 100 }, sanitizar: true },
  telefone: { obrigatorio: true, tipo: 'string', tamanho: { min: 8, max: 20 } },
  rua: { tipo: 'string', tamanho: { min: 0, max: 200 }, sanitizar: true },
  numero: { tipo: 'string', tamanho: { min: 0, max: 20 }, sanitizar: true },
  bairro: { tipo: 'string', tamanho: { min: 0, max: 100 }, sanitizar: true },
  complemento: { tipo: 'string', tamanho: { min: 0, max: 200 }, sanitizar: true },
  ponto_referencia: { tipo: 'string', tamanho: { min: 0, max: 200 }, sanitizar: true }
});

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const rows = await db.all("SELECT * FROM clientes WHERE COALESCE(bairro, '') != 'Mesa' AND telefone NOT LIKE 'mesa%' ORDER BY nome");
  res.json(rows);
}));

router.get('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE id = $1', req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(cliente);
}));

router.get('/telefone/:telefone', publicLimiter, wrapAsync(async (req, res) => {
  const cliente = await db.get('SELECT * FROM clientes WHERE telefone = $1', req.params.telefone);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
  if (cliente.bloqueado) return res.status(403).json({ error: 'Cliente bloqueado. Entre em contato com o estabelecimento.' });
  res.json(cliente);
}));

// Publico: cliente acompanha os proprios pedidos pelo telefone
router.get('/telefone/:telefone/pedidos', publicLimiter, wrapAsync(async (req, res) => {
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

router.post('/', validarCliente, wrapAsync(async (req, res) => {
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

router.put('/:id', middlewareAdmin, validarCliente, wrapAsync(async (req, res) => {
  const { nome, telefone, rua, numero, bairro, complemento, ponto_referencia } = req.body;
  await db.run(
    'UPDATE clientes SET nome=$1, telefone=$2, rua=$3, numero=$4, bairro=$5, complemento=$6, ponto_referencia=$7 WHERE id=$8',
    nome, telefone, rua || '', numero || '', bairro || '', complemento || '', ponto_referencia || '', req.params.id
  );
  res.json({ success: true });
}));

router.patch('/:id/bloquear', middlewareAdmin, wrapAsync(async (req, res) => {
  const { bloqueado } = req.body;
  await db.run('UPDATE clientes SET bloqueado = $1 WHERE id = $2', bloqueado, req.params.id);
  res.json({ success: true });
}));

router.delete('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  try {
    await db.run('UPDATE pedidos SET cliente_id = NULL WHERE cliente_id = $1', req.params.id);
    await db.run('DELETE FROM clientes WHERE id = $1', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
}));

module.exports = router;