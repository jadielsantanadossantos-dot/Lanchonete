const express = require('express');
const router = express.Router();
const db = require('../db/database');
const QRCode = require('qrcode');
const { middlewareAdmin } = require('../auth/auth');

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/', wrapAsync(async (req, res) => {
  const rows = await db.all('SELECT * FROM configuracoes');
  const config = {};
  const sensitiveKeys = ['jwt_secret', 'auth_secret', 'webpush_private_key', 'webpush_public_key'];
  rows.forEach(r => {
    if (!sensitiveKeys.includes(r.chave)) {
      config[r.chave] = r.valor;
    }
  });
  res.json(config);
}));

router.get('/public', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  });
});

router.put('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const stmt = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = $2, atualizado_em = NOW()');
  for (const [chave, valor] of Object.entries(req.body)) {
    await stmt.run(chave, valor);
  }
  res.json({ success: true });
}));

router.get('/pix/qrcode', wrapAsync(async (req, res) => {
  const { valor } = req.query;
  const config = {};
  const rows = await db.all('SELECT * FROM configuracoes');
  rows.forEach(r => { config[r.chave] = r.valor; });

  if (!config.pix_chave) return res.status(400).json({ error: 'Chave Pix não configurada' });

  const payload = gerarPayloadPix(config.pix_chave, config.pix_nome || 'Lanchonete', parseFloat(valor) || 0);

  try {
    const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 });
    res.json({ qrcode: qrDataUrl, payload, chave: config.pix_chave });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao gerar QR Code' });
  }
}));

router.get('/relatorios/vendas', middlewareAdmin, wrapAsync(async (req, res) => {
  const { periodo } = req.query;
  let dateFilter = '';
  const params = [];
  let paramIndex = 1;

  if (periodo === 'hoje') {
    dateFilter = 'AND p.criado_em::date = CURRENT_DATE';
  } else if (periodo === 'semana') {
    dateFilter = 'AND p.criado_em >= NOW() - INTERVAL \'7 days\'';
  } else if (periodo === 'mes') {
    dateFilter = 'AND p.criado_em >= NOW() - INTERVAL \'30 days\'';
  }



  const resumo = await db.get(`
    SELECT
      COUNT(*) as total_pedidos,
      COALESCE(SUM(total), 0) as faturamento,
      COALESCE(AVG(total), 0) as ticket_medio
    FROM pedidos p WHERE p.status != 'cancelado' ${dateFilter}
  `, ...params);

  const porFormaPagamento = await db.all(`
    SELECT forma_pagamento, COUNT(*) as qtd, SUM(total) as valor
    FROM pedidos p WHERE p.status != 'cancelado' ${dateFilter}
    GROUP BY forma_pagamento
  `, ...params);

  const porDia = await db.all(`
    SELECT p.criado_em::date as dia, COUNT(*) as qtd, SUM(total) as valor
    FROM pedidos p WHERE p.status != 'cancelado' ${dateFilter}
    GROUP BY p.criado_em::date ORDER BY dia DESC LIMIT 30
  `, ...params);

  const produtosMaisVendidos = await db.all(`
    SELECT pi.produto_nome, SUM(pi.quantidade) as qtd, SUM(pi.preco_unitario * pi.quantidade) as valor
    FROM pedido_itens pi
    JOIN pedidos p ON pi.pedido_id = p.id
    WHERE p.status != 'cancelado' ${dateFilter}
    GROUP BY pi.produto_nome ORDER BY qtd DESC LIMIT 10
  `, ...params);

  const porStatus = await db.all(`
    SELECT status, COUNT(*) as qtd FROM pedidos p WHERE 1=1 ${dateFilter} GROUP BY status
  `, ...params);

  res.json({ resumo, porFormaPagamento, porDia, produtosMaisVendidos, porStatus });
}));

function gerarPayloadPix(chave, nome, valor) {
  function tlv(id, value) {
    if (!value) return '';
    const len = value.length.toString().padStart(2, '0');
    return id + len + value;
  }

  const gui = tlv('00', 'br.gov.bcb.pix');
  const chavePix = tlv('01', chave);
  const merchantAccount = tlv('26', gui + chavePix);
  const merchantCategory = tlv('52', '0000');
  const currency = tlv('53', '986');
  const valorStr = valor > 0 ? tlv('54', valor.toFixed(2)) : '';
  const country = tlv('58', 'BR');
  const merchantName = tlv('59', nome.substring(0, 25));
  const city = tlv('60', '');
  const txid = tlv('05', Date.now().toString(36) + Math.random().toString(36).substring(2, 7));
  const addData = tlv('62', txid);

  const payloadSemCRC = '000201' + merchantAccount + merchantCategory + currency + valorStr + country + merchantName + city + addData + '6304';

  const crc = crc16ccitt(payloadSemCRC);
  return payloadSemCRC + crc;
}

function crc16ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
    }
    crc &= 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

module.exports = router;