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
  const categoriaId = req.query.categoria_id ? parseInt(req.query.categoria_id) : null;
  const produtoId = req.query.produto_id ? parseInt(req.query.produto_id) : null;
  
  let sql = `
    SELECT a.*, c.nome AS categoria_nome FROM adicionais a
    LEFT JOIN categorias c ON a.categoria_id = c.id
    WHERE a.ativo = true
  `;
  const params = [];
  
  if (categoriaId) {
    sql += ` AND (a.categoria_id = $${params.length + 1} OR a.categoria_id IS NULL)`;
    params.push(categoriaId);
  }
  
  if (produtoId) {
    sql += ` AND (a.produto_id = $${params.length + 1} OR a.produto_id IS NULL)`;
    params.push(produtoId);
  }
  
  sql += ` ORDER BY a.tipo DESC, c.ordem NULLS FIRST, a.nome`;
  
  const rows = await db.all(sql, ...params);
  res.json(rows);
}));

router.post('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, preco, categoria_id, tipo, descricao, produto_id } = req.body;
  const catId = categoria_id ? parseInt(categoria_id) : null;
  const prodId = produto_id ? parseInt(produto_id) : null;
  const tipoAd = tipo && ['adicional', 'sabor'].includes(tipo) ? tipo : 'adicional';
  const info = await db.run('INSERT INTO adicionais (nome, preco, categoria_id, tipo, descricao, produto_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    nome, parseFloat(preco), catId, tipoAd, descricao || null, prodId);
  res.json({ id: info.lastInsertRowid, nome, preco: parseFloat(preco), categoria_id: catId, tipo: tipoAd, descricao: descricao || null, produto_id: prodId });
}));

router.put('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, preco, ativo, categoria_id, tipo, descricao, produto_id } = req.body;
  const atual = await db.get('SELECT categoria_id, produto_id FROM adicionais WHERE id = $1', req.params.id);
  const catId = categoria_id !== undefined ? (categoria_id ? parseInt(categoria_id) : null) : (atual ? atual.categoria_id : null);
  const prodId = produto_id !== undefined ? (produto_id ? parseInt(produto_id) : null) : (atual ? atual.produto_id : null);
  const tipoAd = tipo && ['adicional', 'sabor'].includes(tipo) ? tipo : 'adicional';
  await db.run('UPDATE adicionais SET nome=$1, preco=$2, ativo=$3, categoria_id=$4, tipo=$5, descricao=$6, produto_id=$7 WHERE id=$8',
    nome, parseFloat(preco), ativo !== undefined ? ativo : true, catId, tipoAd, descricao || null, prodId, req.params.id);
  res.json({ success: true });
}));

router.delete('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  await db.run('DELETE FROM adicionais WHERE id = $1', req.params.id);
  res.json({ success: true });
}));

module.exports = router;
