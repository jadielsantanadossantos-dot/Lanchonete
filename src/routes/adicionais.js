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
  const rows = await db.all('SELECT * FROM adicionais ORDER BY nome');
  res.json(rows);
}));

router.post('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, preco } = req.body;
  const info = await db.run('INSERT INTO adicionais (nome, preco) VALUES ($1, $2) RETURNING id', nome, parseFloat(preco));
  res.json({ id: info.lastInsertRowid, nome, preco: parseFloat(preco) });
}));

router.put('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, preco, ativo } = req.body;
  await db.run('UPDATE adicionais SET nome=$1, preco=$2, ativo=$3 WHERE id=$4', nome, parseFloat(preco), ativo !== undefined ? ativo : true, req.params.id);
  res.json({ success: true });
}));

router.delete('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  await db.run('DELETE FROM adicionais WHERE id = $1', req.params.id);
  res.json({ success: true });
}));

module.exports = router;