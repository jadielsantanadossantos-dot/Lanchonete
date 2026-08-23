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
  const rows = await db.all(`
    SELECT a.*, c.nome AS categoria_nome FROM adicionais a
    LEFT JOIN categorias c ON a.categoria_id = c.id
    ORDER BY c.ordem NULLS FIRST, a.nome
  `);
  res.json(rows);
}));

router.post('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, preco, categoria_id } = req.body;
  const catId = categoria_id ? parseInt(categoria_id) : null;
  const info = await db.run('INSERT INTO adicionais (nome, preco, categoria_id) VALUES ($1, $2, $3) RETURNING id',
    nome, parseFloat(preco), catId);
  res.json({ id: info.lastInsertRowid, nome, preco: parseFloat(preco), categoria_id: catId });
}));

router.put('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, preco, ativo, categoria_id } = req.body;
  const atual = await db.get('SELECT categoria_id FROM adicionais WHERE id = $1', req.params.id);
  const catId = categoria_id !== undefined ? (categoria_id ? parseInt(categoria_id) : null) : (atual ? atual.categoria_id : null);
  await db.run('UPDATE adicionais SET nome=$1, preco=$2, ativo=$3, categoria_id=$4 WHERE id=$5',
    nome, parseFloat(preco), ativo !== undefined ? ativo : true, catId, req.params.id);
  res.json({ success: true });
}));

router.delete('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  await db.run('DELETE FROM adicionais WHERE id = $1', req.params.id);
  res.json({ success: true });
}));

module.exports = router;
