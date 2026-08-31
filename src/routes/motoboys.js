const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const rows = await db.all('SELECT * FROM motoboys ORDER BY ativo DESC, nome ASC');
  res.json(rows);
}));

// Resumo de entregas e taxas por motoboy (periodo: hoje | semana | mes)
router.get('/resumo', middlewareAdmin, wrapAsync(async (req, res) => {
  const { periodo, data_inicio, data_fim } = req.query;
  let dateFilter = '';
  const params = [];
  let pIdx = 1;
  if (data_inicio && data_fim) {
    dateFilter = `AND p.criado_em::date BETWEEN $${pIdx++} AND $${pIdx++}`;
    params.push(data_inicio, data_fim);
  } else if (data_inicio) {
    dateFilter = `AND p.criado_em::date >= $${pIdx++}`;
    params.push(data_inicio);
  } else if (data_fim) {
    dateFilter = `AND p.criado_em::date <= $${pIdx++}`;
    params.push(data_fim);
  } else if (periodo === 'hoje') {
    dateFilter = 'AND p.criado_em::date = CURRENT_DATE';
  } else if (periodo === 'semana') {
    dateFilter = 'AND p.criado_em >= NOW() - INTERVAL \'7 days\'';
  } else if (periodo === 'mes') {
    dateFilter = 'AND p.criado_em >= NOW() - INTERVAL \'30 days\'';
  }

  const rows = await db.all(`
    SELECT m.id as motoboy_id, m.nome,
      COUNT(p.id) as entregas,
      COALESCE(SUM(p.taxa_entrega), 0) as total_taxas
    FROM pedidos p
    JOIN motoboys m ON m.id = p.motoboy_id
    WHERE p.status = 'entregue' AND p.motoboy_id IS NOT NULL ${dateFilter}
    GROUP BY m.id, m.nome
    ORDER BY total_taxas DESC
  `, ...params);
  res.json(rows);
}));

router.post('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, telefone } = req.body;
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Informe o nome do motoboy' });
  const info = await db.run('INSERT INTO motoboys (nome, telefone) VALUES ($1, $2) RETURNING id',
    nome.trim(), telefone?.trim() || null);
  res.json({ id: info.lastInsertRowid, nome: nome.trim() });
}));

router.put('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const { nome, telefone, ativo } = req.body;
  const atual = await db.get('SELECT nome, telefone, ativo FROM motoboys WHERE id = $1', req.params.id);
  if (!atual) return res.status(404).json({ error: 'Motoboy não encontrado' });
  await db.run('UPDATE motoboys SET nome=$1, telefone=$2, ativo=$3 WHERE id=$4',
    nome !== undefined ? nome : atual.nome,
    telefone !== undefined ? telefone : atual.telefone,
    ativo !== undefined ? ativo : atual.ativo,
    req.params.id);
  res.json({ success: true });
}));

router.delete('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  await db.run('DELETE FROM motoboys WHERE id = $1', req.params.id);
  res.json({ success: true });
}));

module.exports = router;
