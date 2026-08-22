const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin, middlewareGarcom } = require('../auth/auth');

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/', middlewareGarcom, wrapAsync(async (req, res) => {
  const rows = await db.all('SELECT * FROM mesas ORDER BY numero');
  res.json(rows);
}));

router.get('/:id', middlewareGarcom, wrapAsync(async (req, res) => {
  const mesa = await db.get('SELECT * FROM mesas WHERE id = $1', req.params.id);
  if (!mesa) return res.status(404).json({ error: 'Mesa não encontrada' });
  res.json(mesa);
}));

router.post('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const { numero, nome, capacidade, status } = req.body;
  try {
    const info = await db.run(
      'INSERT INTO mesas (numero, nome, capacidade, status) VALUES ($1, $2, $3, $4) RETURNING id',
      numero, nome || ('Mesa ' + numero), capacidade || 4, status || 'livre'
    );
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Mesa já existe ou dados inválidos' });
  }
}));

router.put('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const { numero, nome, capacidade, status } = req.body;
  await db.run('UPDATE mesas SET numero=$1, nome=$2, capacidade=$3, status=$4 WHERE id=$5',
    numero, nome, capacidade || 0, status || 'livre', req.params.id);
  res.json({ success: true });
}));

router.patch('/:id/status', middlewareAdmin, wrapAsync(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['livre', 'ocupada', 'reservada'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  await db.run('UPDATE mesas SET status = $1 WHERE id = $2', status, req.params.id);
  res.json({ success: true });
}));

router.delete('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  await db.run('DELETE FROM mesas WHERE id = $1', req.params.id);
  res.json({ success: true });
}));

module.exports = router;