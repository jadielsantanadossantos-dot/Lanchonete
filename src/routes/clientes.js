const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');

router.get('/', middlewareAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM clientes ORDER BY nome').all();
  res.json(rows);
});

router.get('/:id', middlewareAdmin, (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(cliente);
});

router.get('/telefone/:telefone', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE telefone = ?').get(req.params.telefone);
  if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
  res.json(cliente);
});

router.get('/:id/pedidos', middlewareAdmin, (req, res) => {
  const pedidos = db.prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY criado_em DESC').all(req.params.id);
  res.json(pedidos);
});

router.post('/', (req, res) => {
  const { nome, telefone, rua, numero, bairro, complemento, ponto_referencia } = req.body;
  try {
    const info = db.prepare(
      'INSERT INTO clientes (nome, telefone, rua, numero, bairro, complemento, ponto_referencia) VALUES (?,?,?,?,?,?,?)'
    ).run(nome, telefone, rua || '', numero || '', bairro || '', complemento || '', ponto_referencia || '');
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    const existing = db.prepare('SELECT * FROM clientes WHERE telefone = ?').get(telefone);
    if (existing) {
      db.prepare(
        'UPDATE clientes SET nome=?, rua=?, numero=?, bairro=?, complemento=?, ponto_referencia=? WHERE id=?'
      ).run(nome, rua || '', numero || '', bairro || '', complemento || '', ponto_referencia || '', existing.id);
      return res.json({ id: existing.id, updated: true });
    }
    res.status(400).json({ error: 'Erro ao cadastrar cliente' });
  }
});

router.put('/:id', middlewareAdmin, (req, res) => {
  const { nome, telefone, rua, numero, bairro, complemento, ponto_referencia } = req.body;
  db.prepare(
    'UPDATE clientes SET nome=?, telefone=?, rua=?, numero=?, bairro=?, complemento=?, ponto_referencia=? WHERE id=?'
  ).run(nome, telefone, rua || '', numero || '', bairro || '', complemento || '', ponto_referencia || '', req.params.id);
  res.json({ success: true });
});

module.exports = router;
