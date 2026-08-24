const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const TIPOS_VALIDOS = ['adicional', 'sabor', 'base', 'cobertura', 'acompanhamento'];

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
    sql += ` AND (
      a.produto_id = $${params.length + 1}
      OR a.produto_id IS NULL
      OR EXISTS (SELECT 1 FROM adicional_produtos ap WHERE ap.adicional_id = a.id AND ap.produto_id = $${params.length + 1})
    )`;
    params.push(produtoId);
  }

  sql += ` ORDER BY a.tipo DESC, c.ordem NULLS FIRST, a.nome`;

  const rows = await db.all(sql, ...params);

  // Anexar lista de produtos vinculados (tabela N:N)
  const vinculos = await db.all('SELECT adicional_id, produto_id FROM adicional_produtos');
  const porAdicional = new Map();
  vinculos.forEach(v => {
    if (!porAdicional.has(v.adicional_id)) porAdicional.set(v.adicional_id, []);
    porAdicional.get(v.adicional_id).push(v.produto_id);
  });
  res.json(rows.map(r => ({ ...r, produto_ids: porAdicional.get(r.id) || [] })));
}));

async function salvarVinculosProdutos(adicionalId, produtoIds) {
  await db.run('DELETE FROM adicional_produtos WHERE adicional_id = $1', adicionalId);
  for (const pid of produtoIds || []) {
    await db.run('INSERT INTO adicional_produtos (adicional_id, produto_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', adicionalId, parseInt(pid));
  }
}

router.post('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, preco, categoria_id, tipo, descricao, produto_ids, limite } = req.body;
  const catId = categoria_id ? parseInt(categoria_id) : null;
  const prodIds = Array.isArray(produto_ids) ? produto_ids.map(x => parseInt(x)).filter(Boolean) : [];
  const tipoAd = tipo && TIPOS_VALIDOS.includes(tipo) ? tipo : 'adicional';
  const limiteVal = limite !== undefined ? parseInt(limite) : 0;
  // Coluna legado produto_id mantida com o primeiro vinculo para compatibilidade
  const info = await db.run('INSERT INTO adicionais (nome, preco, categoria_id, tipo, descricao, produto_id, limite) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    nome, parseFloat(preco), catId, tipoAd, descricao || null, prodIds[0] || null, limiteVal);
  const novoId = info.lastInsertRowid;
  await salvarVinculosProdutos(novoId, prodIds);
  res.json({ id: novoId, nome, preco: parseFloat(preco), categoria_id: catId, tipo: tipoAd, descricao: descricao || null, produto_ids: prodIds, limite: limiteVal });
}));

router.put('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, preco, ativo, categoria_id, tipo, descricao, produto_ids, limite } = req.body;
  const atual = await db.get('SELECT categoria_id, produto_id, limite FROM adicionais WHERE id = $1', req.params.id);
  const catId = categoria_id !== undefined ? (categoria_id ? parseInt(categoria_id) : null) : (atual ? atual.categoria_id : null);
  const tipoAd = tipo && TIPOS_VALIDOS.includes(tipo) ? tipo : 'adicional';
  const limiteVal = limite !== undefined ? parseInt(limite) : (atual ? atual.limite : 0);

  let prodIds;
  let prodIdLegado;
  if (Array.isArray(produto_ids)) {
    prodIds = produto_ids.map(x => parseInt(x)).filter(Boolean);
    prodIdLegado = prodIds[0] || null;
  } else {
    const vinculados = await db.all('SELECT produto_id FROM adicional_produtos WHERE adicional_id = $1', req.params.id);
    prodIds = vinculados.map(v => v.produto_id);
    prodIdLegado = atual ? atual.produto_id : null;
  }

  await db.run('UPDATE adicionais SET nome=$1, preco=$2, ativo=$3, categoria_id=$4, tipo=$5, descricao=$6, produto_id=$7, limite=$8 WHERE id=$9',
    nome, parseFloat(preco), ativo !== undefined ? ativo : true, catId, tipoAd, descricao || null, prodIdLegado, limiteVal, req.params.id);
  if (Array.isArray(produto_ids)) {
    await salvarVinculosProdutos(req.params.id, prodIds);
  }
  res.json({ success: true });
}));

router.delete('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  await db.run('DELETE FROM adicionais WHERE id = $1', req.params.id);
  res.json({ success: true });
}));

module.exports = router;
