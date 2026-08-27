const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();
const db = require('../db/database');
const QRCode = require('qrcode');
const { middlewareAdmin } = require('../auth/auth');
const { isLojaAbertaEfetiva } = require('../utils/horario');

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/', wrapAsync(async (req, res) => {
  const rows = await db.all('SELECT * FROM configuracoes');
  const config = {};
  const sensitiveKeys = ['jwt_secret', 'auth_secret', 'webpush_private_key', 'webpush_public_key', 'psp_client_secret', 'psp_webhook_secret'];
  const isAdmin = req.usuario && ['admin', 'observador'].includes(req.usuario.perfil);
  rows.forEach(r => {
    if (isAdmin || !sensitiveKeys.includes(r.chave)) {
      config[r.chave] = r.valor;
    }
  });
  res.json(config);
}));

router.get('/public', wrapAsync(async (req, res) => {
  const all = await db.all('SELECT chave, valor FROM configuracoes');
  const map = {};
  all.forEach(r => map[r.chave] = r.valor);
  const efetiva = isLojaAbertaEfetiva(map);
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    logo_url: map.logo_url || '',
    loja_endereco: map.loja_endereco || '',
    loja_aberta: map.loja_aberta || 'true',
    loja_aberta_efetiva: efetiva ? 'true' : 'false',
    loja_modo: map.loja_modo || 'manual',
    loja_horario_abertura: map.loja_horario_abertura || '',
    loja_horario_fechamento: map.loja_horario_fechamento || '',
    loja_horario_dias: map.loja_horario_dias || ''
  });
}));

router.put('/', middlewareAdmin, wrapAsync(async (req, res) => {
  const stmt = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = $2, atualizado_em = NOW()');
  for (const [chave, valor] of Object.entries(req.body)) {
    await stmt.run(chave, valor);
  }
  res.json({ success: true });
}));

// === LOGO UPLOAD === 2MB, bucket logos, admin only
const ALLOWED_MIME_TYPES_LOGO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS_LOGO = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
let storageClientLogo = null;
function getStorageLogo() {
  if (!storageClientLogo) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados para upload');
    storageClientLogo = createClient(url, key, { auth: { persistSession: false } });
  }
  return storageClientLogo;
}
function validarBufferImagemLogo(buffer) {
  if (!buffer || buffer.length < 12) return false;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
  return false;
}
async function uploadLogo(file) {
  if (!validarBufferImagemLogo(file.buffer)) throw new Error('Arquivo não é uma imagem válida (conteúdo não corresponde ao tipo)');
  const ext = path.extname(file.originalname).toLowerCase();
  const nome = `logo-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const supabase = getStorageLogo();
  try {
    const { error } = await supabase.storage.from('logos').upload(nome, file.buffer, { contentType: file.mimetype, cacheControl: '31536000' });
    if (error) throw error;
  } catch (e) {
    if (/Bucket not found/i.test(e.message)) {
      const { error: createErr } = await supabase.storage.createBucket('logos', { public: true });
      if (createErr && !/already exists/i.test(createErr.message)) throw createErr;
      const { error: retryErr } = await supabase.storage.from('logos').upload(nome, file.buffer, { contentType: file.mimetype, cacheControl: '31536000' });
      if (retryErr) throw retryErr;
    } else throw e;
  }
  const { data } = supabase.storage.from('logos').getPublicUrl(nome);
  return data.publicUrl;
}
function fileFilterLogo(req, file, cb) {
  if (!ALLOWED_MIME_TYPES_LOGO.includes(file.mimetype)) return cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG, WebP ou GIF.'), false);
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS_LOGO.includes(ext)) return cb(new Error('Extensão de arquivo não permitida.'), false);
  cb(null, true);
}
const uploadLogoMulter = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: fileFilterLogo });

router.put('/logo', middlewareAdmin, (req, res, next) => {
  if (req.usuario && req.usuario.perfil === 'observador') return res.status(403).json({ error: 'Acesso de demonstração: apenas visualização.' });
  next();
}, uploadLogoMulter.single('logo'), wrapAsync(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo de logo obrigatório' });
  const url = await uploadLogo(req.file);
  await db.run('INSERT INTO configuracoes (chave, valor) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET valor=$2, atualizado_em=NOW()', 'logo_url', url);
  res.json({ logo_url: url });
}));

router.delete('/logo', middlewareAdmin, wrapAsync(async (req, res) => {
  if (req.usuario && req.usuario.perfil === 'observador') return res.status(403).json({ error: 'Acesso de demonstração: apenas visualização.' });
  const row = await db.get("SELECT valor FROM configuracoes WHERE chave='logo_url'");
  const url = row ? row.valor : '';
  if (url) {
    try {
      const supabase = getStorageLogo();
      // extrair nome após /logos/
      const m = url.match(/\/logos\/([^?]+)/);
      const nome = m ? decodeURIComponent(m[1]) : null;
      if (nome) await supabase.storage.from('logos').remove([nome]);
    } catch (e) { console.warn('Falha ao remover logo do storage:', e.message); }
  }
  await db.run("DELETE FROM configuracoes WHERE chave='logo_url'");
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