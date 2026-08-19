const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM bairros ORDER BY nome').all();
  res.json(rows);
});

router.get('/atendidos', (req, res) => {
  const rows = db.prepare('SELECT * FROM bairros WHERE atendido = 1 ORDER BY nome').all();
  res.json(rows);
});

router.post('/', middlewareAdmin, (req, res) => {
  const { nome, taxa_entrega, atendido } = req.body;
  try {
    const info = db.prepare('INSERT INTO bairros (nome, taxa_entrega, atendido) VALUES (?, ?, ?)')
      .run(nome, parseFloat(taxa_entrega) || 0, atendido !== undefined ? parseInt(atendido) : 1);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Bairro já cadastrado' });
  }
});

router.put('/:id', middlewareAdmin, (req, res) => {
  const { nome, taxa_entrega, atendido } = req.body;
  db.prepare('UPDATE bairros SET nome=?, taxa_entrega=?, atendido=? WHERE id=?')
    .run(nome, parseFloat(taxa_entrega) || 0, atendido !== undefined ? parseInt(atendido) : 1, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', middlewareAdmin, (req, res) => {
  db.prepare('DELETE FROM bairros WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
