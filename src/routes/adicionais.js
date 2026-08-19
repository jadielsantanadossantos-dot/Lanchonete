const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM adicionais ORDER BY nome').all();
  res.json(rows);
});

router.post('/', middlewareAdmin, (req, res) => {
  const { nome, preco } = req.body;
  const info = db.prepare('INSERT INTO adicionais (nome, preco) VALUES (?, ?)').run(nome, parseFloat(preco));
  res.json({ id: info.lastInsertRowid, nome, preco: parseFloat(preco) });
});

router.put('/:id', middlewareAdmin, (req, res) => {
  const { nome, preco, ativo } = req.body;
  db.prepare('UPDATE adicionais SET nome=?, preco=?, ativo=? WHERE id=?')
    .run(nome, parseFloat(preco), ativo !== undefined ? parseInt(ativo) : 1, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', middlewareAdmin, (req, res) => {
  db.prepare('DELETE FROM adicionais WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
