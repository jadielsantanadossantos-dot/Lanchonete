const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM categorias ORDER BY ordem').all();
  res.json(rows);
});

router.post('/', middlewareAdmin, (req, res) => {
  const { nome, ordem } = req.body;
  try {
    const info = db.prepare('INSERT INTO categorias (nome, ordem) VALUES (?, ?)').run(nome, ordem || 0);
    res.json({ id: info.lastInsertRowid, nome, ordem: ordem || 0 });
  } catch (e) {
    res.status(400).json({ error: 'Categoria já existe' });
  }
});

router.put('/:id', middlewareAdmin, (req, res) => {
  const { nome, ordem } = req.body;
  db.prepare('UPDATE categorias SET nome = ?, ordem = ? WHERE id = ?').run(nome, ordem || 0, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', middlewareAdmin, (req, res) => {
  db.prepare('DELETE FROM categorias WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
