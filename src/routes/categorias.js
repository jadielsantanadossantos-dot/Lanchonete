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
  const rows = await db.all('SELECT * FROM categorias ORDER BY ordem');
  res.json(rows);
}));

router.post('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, ordem } = req.body;
  try {
    const info = await db.run('INSERT INTO categorias (nome, ordem) VALUES ($1, $2) RETURNING id', nome, ordem || 0);
    res.json({ id: info.lastInsertRowid, nome, ordem: ordem || 0 });
  } catch (e) {
    res.status(400).json({ error: 'Categoria já existe' });
  }
}));

router.put('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, ordem } = req.body;
  await db.run('UPDATE categorias SET nome = $1, ordem = $2 WHERE id = $3', nome, ordem || 0, req.params.id);
  res.json({ success: true });
}));

router.delete('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  try {
    await db.run('DELETE FROM categorias WHERE id = $1', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(409).json({ error: 'Não foi possível excluir esta categoria.' });
  }
}));

module.exports = router;