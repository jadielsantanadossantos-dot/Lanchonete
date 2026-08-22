const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/', wrapAsync(async (req, res) => {
  const rows = await db.all('SELECT * FROM bairros ORDER BY nome');
  res.json(rows);
}));

router.get('/atendidos', wrapAsync(async (req, res) => {
  const rows = await db.all('SELECT * FROM bairros WHERE atendido = true ORDER BY nome');
  res.json(rows);
}));

router.post('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, taxa_entrega, atendido } = req.body;
  try {
    const info = await db.run('INSERT INTO bairros (nome, taxa_entrega, atendido) VALUES ($1, $2, $3) RETURNING id',
      nome, parseFloat(taxa_entrega) || 0, atendido !== undefined ? atendido : true);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Bairro já cadastrado' });
  }
}));

router.put('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, taxa_entrega, atendido } = req.body;
  await db.run('UPDATE bairros SET nome=$1, taxa_entrega=$2, atendido=$3 WHERE id=$4',
    nome, parseFloat(taxa_entrega) || 0, atendido !== undefined ? atendido : true, req.params.id);
  res.json({ success: true });
}));

router.delete('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  await db.run('DELETE FROM bairros WHERE id = $1', req.params.id);
  res.json({ success: true });
}));

module.exports = router;