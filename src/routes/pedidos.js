const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const db = require('../db/database');
const { middlewareAdmin } = require('../auth/auth');
const { criarValidador, sanitizarString } = require('../utils/validation');

const validarPedido = criarValidador({
  forma_pagamento: { obrigatorio: true, tipo: 'string', enum: ['pix','dinheiro','cartao','mesa'] },
  observacoes: { tipo: 'string', tamanho: { min: 0, max: 500 }, sanitizar: true },
  endereco_entrega: { tipo: 'string', tamanho: { min: 0, max: 300 }, sanitizar: true },
  bairro_entrega: { tipo: 'string', tamanho: { min: 0, max: 100 }, sanitizar: true }
});

const isDev = process.env.NODE_ENV !== 'production';
const publicLimiter = isDev
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000,
      max: 30,
      message: { error: 'Muitas consultas, tente novamente em um minuto' },
      standardHeaders: true,
      legacyHeaders: false
    });

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const { status, data_inicio, data_fim, limite } = req.query;
  let sql = 'SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone, m.nome as motoboy_nome FROM pedidos p JOIN clientes c ON p.cliente_id = c.id LEFT JOIN motoboys m ON m.id = p.motoboy_id';
  const params = [];
  const conditions = [];
  let paramIndex = 1;

  if (status) { conditions.push(`p.status = $${paramIndex++}`); params.push(status); }
  if (data_inicio) { conditions.push(`p.criado_em >= $${paramIndex++}`); params.push(data_inicio); }
  if (data_fim) { conditions.push(`p.criado_em <= $${paramIndex++}`); params.push(data_fim + ' 23:59:59'); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY p.mesa_id IS NULL DESC, p.mesa_id ASC, p.comanda_id ASC, p.criado_em DESC';
  if (limite) { sql += ` LIMIT $${paramIndex}`; params.push(parseInt(limite)); }

  const pedidos = await db.all(sql, ...params);

  const itens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = ANY($1)', pedidos.map(p => p.id));
  const adicionais = await db.all('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ANY($1)', itens.map(i => i.id));

  const result = pedidos.map(p => {
    const pedidoItens = itens.filter(i => i.pedido_id === p.id).map(item => ({
      ...item,
      adicionais: adicionais.filter(a => a.pedido_item_id === item.id)
    }));
    return { ...p, itens: pedidoItens };
  });

  res.json(result);
}));

router.get('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const pedido = await db.get(
    'SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = $1',
    req.params.id
  );
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });

  const itens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = $1', pedido.id);
  const adicionais = await db.all('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ANY($1)', itens.map(i => i.id));

  pedido.itens = itens.map(item => ({ ...item, adicionais: adicionais.filter(a => a.pedido_item_id === item.id) }));

  res.json(pedido);
}));

router.post('/', validarPedido, wrapAsync(async (req, res) => {
  // Cliente publico so pede com a loja aberta (considera horário automático); garcom/admin podem sempre
  const { isLojaAbertaEfetiva } = require('../utils/horario');
  const cfgRows = await db.all('SELECT chave, valor FROM configuracoes');
  const cfgMap = {};
  cfgRows.forEach(r => cfgMap[r.chave] = r.valor);
  const lojaAberta = isLojaAbertaEfetiva(cfgMap);
  if (!lojaAberta && !req.usuario) {
    return res.status(403).json({ error: 'A loja está fechada e não está aceitando pedidos no momento' });
  }

  const { cliente_id, itens, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, taxa_entrega, mesa_id } = req.body;

  if (!Array.isArray(itens) || itens.length === 0 || itens.length > 30) {
    return res.status(400).json({ error: 'Itens inválidos (1 a 30 itens por pedido)' });
  }

  if (cliente_id) {
    const cliente = await db.get('SELECT bloqueado FROM clientes WHERE id = $1', cliente_id);
    if (cliente && cliente.bloqueado) {
      return res.status(403).json({ error: 'Você não tem permissão para realizar pedidos.' });
    }
  }

  let subtotal = 0;

  // Valida limites de adicionais configurados no admin (campo "Limite", ex.: borda recheada maximo 1)
  for (const item of itens || []) {
    const adicionais = item.adicionais || [];
    const ids = [...new Set(adicionais.map(a => parseInt(a.id)).filter(Boolean))];
    if (!ids.length) continue;
    const rows = await db.all('SELECT id, tipo, limite FROM adicionais WHERE id = ANY($1)', ids);
    const porId = new Map(rows.map(r => [r.id, r]));
    const limitePorTipo = {};
    const contagemPorTipo = {};
    for (const a of adicionais) {
      const reg = porId.get(parseInt(a.id));
      if (!reg) continue;
      const tipo = reg.tipo || 'adicional';
      if (!(tipo in limitePorTipo)) limitePorTipo[tipo] = parseInt(reg.limite) || 0;
      contagemPorTipo[tipo] = (contagemPorTipo[tipo] || 0) + 1;
    }
    for (const [tipo, qtd] of Object.entries(contagemPorTipo)) {
      const limite = limitePorTipo[tipo] || 0;
      if (limite > 0 && qtd > limite) {
        return res.status(400).json({ error: `Máximo ${limite} ${tipo}(s) permitido(s) por item${item.produto_nome ? ` (${item.produto_nome})` : ''}` });
      }
    }
  }

  itens.forEach(item => {
    let itemTotal = item.preco_unitario * item.quantidade;
    if (item.adicionais) {
      item.adicionais.forEach(a => { itemTotal += a.preco * item.quantidade; });
    }
    subtotal += itemTotal;
  });

  const taxaEntrega = parseFloat(taxa_entrega) || 0;
  const total = subtotal + taxaEntrega;

  // Transação atômica: pedido + itens + adicionais
  const pedidoId = await db.transaction(async (client) => {
    const r1 = await client.query(
      'INSERT INTO pedidos (cliente_id, subtotal, taxa_entrega, total, forma_pagamento, observacoes, endereco_entrega, bairro_entrega, mesa_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [cliente_id, subtotal, taxaEntrega, total, forma_pagamento, observacoes || '', endereco_entrega || '', bairro_entrega || '', mesa_id || null]
    );
    const pid = r1.rows[0].id;
    for (const item of itens) {
      const obsSanitizada = sanitizarString(item.observacao || '');
      const r2 = await client.query(
        'INSERT INTO pedido_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario, observacao, unidade) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [pid, item.produto_id, item.produto_nome, item.quantidade, item.preco_unitario, obsSanitizada, item.unidade === 'kg' ? 'kg' : 'un']
      );
      const itemId = r2.rows[0].id;
      if (item.adicionais && item.adicionais.length) {
        for (const a of item.adicionais) {
          await client.query('INSERT INTO pedido_item_adicionais (pedido_item_id, adicional_nome, preco) VALUES ($1,$2,$3)', [itemId, a.nome, a.preco]);
        }
      }
    }
    return pid;
  });

  const pedido = await db.get(
    'SELECT p.*, c.nome as cliente_nome, c.telefone as cliente_telefone FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = $1',
    pedidoId
  );
  const pedidoItens = await db.all('SELECT * FROM pedido_itens WHERE pedido_id = $1', pedidoId);
  const adicionaisAll = pedidoItens.length ? await db.all('SELECT * FROM pedido_item_adicionais WHERE pedido_item_id = ANY($1)', pedidoItens.map(i => i.id)) : [];
  pedido.itens = pedidoItens.map(i => ({ ...i, adicionais: adicionaisAll.filter(a => a.pedido_item_id === i.id) }));

  if (req.emitToAdmin) {
    await req.emitToAdmin('novo-pedido', pedido);
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('novo-pedido', pedido);
  }
  if (req.emitToPedido) {
    await req.emitToPedido(pedidoId, 'novo-pedido', pedido);
  }

  res.json(pedido);
}));

// Status publico para acompanhamento pelo cliente (sem dados pessoais)
router.get('/:id/publico', publicLimiter, wrapAsync(async (req, res) => {
  const pedido = await db.get('SELECT id, status, pix_confirmado FROM pedidos WHERE id = $1', req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json(pedido);
}));

router.put('/:id/status', middlewareAdmin, wrapAsync(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['recebido', 'em_preparo', 'saiu_entrega', 'entregue', 'cancelado'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const pedido = await db.get('SELECT mesa_id FROM pedidos WHERE id = $1', req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  
  if (pedido.mesa_id) {
    return res.status(403).json({ error: 'Pedidos de mesa só podem ser finalizados pelo garçom ao fechar a comanda' });
  }

  await db.run('UPDATE pedidos SET status = $1, atualizado_em = NOW() WHERE id = $2', status, req.params.id);

  const pedidoId = parseInt(req.params.id);
  const payload = { id: pedidoId, status };
  if (req.emitToAdmin) {
    await req.emitToAdmin('pedido-atualizado', payload);
  }
  if (req.emitToGarcom) {
    await req.emitToGarcom('pedido-atualizado', payload);
  }
  if (req.emitToPedido) {
    await req.emitToPedido(pedidoId, 'pedido-atualizado', payload);
  }

  res.json({ success: true });
}));

router.put('/:id/motoboy', middlewareAdmin, wrapAsync(async (req, res) => {
  const { motoboy_id } = req.body;
  const motoboyId = motoboy_id ? parseInt(motoboy_id) : null;
  if (motoboyId) {
    const motoboy = await db.get('SELECT id FROM motoboys WHERE id = $1', motoboyId);
    if (!motoboy) return res.status(404).json({ error: 'Motoboy não encontrado' });
  }
  await db.run('UPDATE pedidos SET motoboy_id = $1, atualizado_em = NOW() WHERE id = $2', motoboyId, req.params.id);
  if (motoboyId && req.emitToPedido) {
    await req.emitToPedido(parseInt(req.params.id), 'motoboy-atribuido', { id: parseInt(req.params.id), motoboy_id: motoboyId });
  }
  res.json({ success: true });
}));

router.put('/:id/pix', middlewareAdmin, wrapAsync(async (req, res) => {
  const { confirmado } = req.body;
  const pedidoId = parseInt(req.params.id);
  await db.run('UPDATE pedidos SET pix_confirmado = $1 WHERE id = $2', confirmado ? true : false, pedidoId);

  if (confirmado) {
    const payload = { id: pedidoId };
    if (req.emitToAdmin) await req.emitToAdmin('pix-confirmado', payload);
    if (req.emitToGarcom) await req.emitToGarcom('pix-confirmado', payload);
    if (req.emitToPedido) await req.emitToPedido(pedidoId, 'pix-confirmado', payload);
  }

  res.json({ success: true });
}));

router.put('/:id/converter-entrega', middlewareAdmin, wrapAsync(async (req, res) => {
  const pedidoId = parseInt(req.params.id);
  const pedido = await db.get('SELECT * FROM pedidos WHERE id = $1', pedidoId);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  const isRetirada = pedido.bairro_entrega === 'Retirada no local' || (pedido.endereco_entrega && pedido.endereco_entrega.startsWith('Retirada'));
  if (!isRetirada) return res.status(400).json({ error: 'Pedido não é retirada no local' });
  if (['entregue','cancelado'].includes(pedido.status)) return res.status(400).json({ error: 'Pedido já finalizado' });
  let { bairro_entrega, endereco_entrega, taxa_entrega } = req.body;
  // se não enviado, tenta usar endereço cadastrado do cliente
  if (!bairro_entrega || String(bairro_entrega).trim().length === 0 || String(bairro_entrega).trim() === 'Retirada no local') {
    if (pedido.cliente_id) {
      const cliente = await db.get('SELECT * FROM clientes WHERE id = $1', pedido.cliente_id);
      if (cliente && cliente.bairro && cliente.bairro !== 'Retirada no local') {
        bairro_entrega = cliente.bairro;
        if (!endereco_entrega) {
          let end = '';
          if (cliente.rua) end += cliente.rua;
          if (cliente.numero) end += `, ${cliente.numero}`;
          if (cliente.complemento) end += ` - ${cliente.complemento}`;
          if (cliente.ponto_referencia) end += ` (Ref: ${cliente.ponto_referencia})`;
          if (end) endereco_entrega = end;
        }
      } else {
        // tenta recuperar último bairro válido de pedidos anteriores do cliente (caso cadastro corrompido)
        const ult = await db.get("SELECT bairro_entrega, endereco_entrega FROM pedidos WHERE cliente_id = $1 AND bairro_entrega != 'Retirada no local' AND bairro_entrega IS NOT NULL AND bairro_entrega != '' ORDER BY criado_em DESC LIMIT 1", pedido.cliente_id);
        if (ult && ult.bairro_entrega) {
          bairro_entrega = ult.bairro_entrega;
          if (!endereco_entrega && ult.endereco_entrega) endereco_entrega = ult.endereco_entrega;
        }
      }
    }
  }
  if (!bairro_entrega || String(bairro_entrega).trim().length === 0 || String(bairro_entrega).trim() === 'Retirada no local') return res.status(400).json({ error: 'Bairro obrigatório - cliente sem endereço cadastrado, informe manualmente' });
  bairro_entrega = sanitizarString(String(bairro_entrega).trim());
  endereco_entrega = sanitizarString(String(endereco_entrega || bairro_entrega).trim());
  if (taxa_entrega === undefined || taxa_entrega === null || taxa_entrega === '') {
    const brow = await db.get('SELECT taxa_entrega FROM bairros WHERE nome = $1', bairro_entrega);
    taxa_entrega = brow ? parseFloat(brow.taxa_entrega) || 0 : 0;
  } else {
    taxa_entrega = parseFloat(taxa_entrega) || 0;
  }
  if (taxa_entrega < 0) taxa_entrega = 0;
  const subtotal = parseFloat(pedido.subtotal) || 0;
  const total = subtotal + taxa_entrega;
  // remover marcador de solicitação se houver
  let obs = pedido.observacoes || '';
  obs = obs.replace(/\s*\|\s*SOLICITOU ENTREGA/g, '').trim();
  await db.run('UPDATE pedidos SET bairro_entrega = $1, endereco_entrega = $2, taxa_entrega = $3, total = $4, observacoes = $5, atualizado_em = NOW() WHERE id = $6', bairro_entrega, endereco_entrega, taxa_entrega, total, obs, pedidoId);
  const payload = { id: pedidoId, bairro_entrega, endereco_entrega, taxa_entrega, total };
  if (req.emitToAdmin) await req.emitToAdmin('pedido-atualizado', payload);
  if (req.emitToGarcom) await req.emitToGarcom('pedido-atualizado', payload);
  if (req.emitToPedido) await req.emitToPedido(pedidoId, 'pedido-atualizado', payload);
  res.json({ success: true, ...payload });
}));

router.put('/:id/solicitar-entrega', publicLimiter, wrapAsync(async (req, res) => {
  const pedidoId = parseInt(req.params.id);
  const pedido = await db.get('SELECT * FROM pedidos WHERE id = $1', pedidoId);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  const isRetirada = pedido.bairro_entrega === 'Retirada no local' || (pedido.endereco_entrega && pedido.endereco_entrega.startsWith('Retirada'));
  if (!isRetirada) return res.status(400).json({ error: 'Pedido não é retirada' });
  if (['entregue','cancelado'].includes(pedido.status)) return res.status(400).json({ error: 'Pedido já finalizado' });
  if (pedido.observacoes && pedido.observacoes.includes('SOLICITOU ENTREGA')) {
    return res.json({ success: true, jaSolicitado: true });
  }
  const novaObs = pedido.observacoes ? pedido.observacoes + ' | SOLICITOU ENTREGA' : 'SOLICITOU ENTREGA';
  await db.run('UPDATE pedidos SET observacoes = $1, atualizado_em = NOW() WHERE id = $2', novaObs, pedidoId);
  const payload = { id: pedidoId, observacoes: novaObs };
  if (req.emitToAdmin) await req.emitToAdmin('pedido-atualizado', payload);
  if (req.emitToGarcom) await req.emitToGarcom('pedido-atualizado', payload);
  if (req.emitToPedido) await req.emitToPedido(pedidoId, 'pedido-atualizado', payload);
  res.json({ success: true });
}));

module.exports = router;