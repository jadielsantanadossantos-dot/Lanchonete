const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin, middlewareGarcom } = require('../auth/auth');

router.get('/', middlewareGarcom, (req, res) => {
  const rows = db.prepare('SELECT * FROM mesas ORDER BY numero').all();
  res.json(rows);
});

router.get('/:id', middlewareGarcom, (req, res) => {
  const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(req.params.id);
  if (!mesa) return res.status(404).json({ error: 'Mesa não encontrada' });
  res.json(mesa);
});

router.post('/', middlewareAdmin, (req, res) => {
  const { numero, nome, capacidade, status } = req.body;
  try {
    const info = db.prepare(
      'INSERT INTO mesas (numero, nome, capacidade, status) VALUES (?, ?, ?, ?)'
    ).run(numero, nome || ('Mesa ' + numero), capacidade || 4, status || 'livre');
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Mesa já existe ou dados inválidos' });
  }
});

router.put('/:id', middlewareAdmin, (req, res) => {
  const { numero, nome, capacidade, status } = req.body;
  db.prepare('UPDATE mesas SET numero=?, nome=?, capacidade=?, status=? WHERE id=?')
    .run(numero, nome, capacidade || 0, status || 'livre', req.params.id);
  res.json({ success: true });
});

router.patch('/:id/status', middlewareAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['livre', 'ocupada', 'reservada'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  db.prepare('UPDATE mesas SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', middlewareAdmin, (req, res) => {
  db.prepare('DELETE FROM mesas WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
