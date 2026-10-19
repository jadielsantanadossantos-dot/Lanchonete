const express = require('express');
const router = express.Router();
const db = require('../db/database');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { middlewareAdmin } = require('../auth/auth');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

let storageClient = null;
function getStorage() {
  if (!storageClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados para upload');
    storageClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return storageClient;
}

function validarBufferImagem(buffer) {
  if (!buffer || buffer.length < 12) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
  // WebP: RIFF....WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
  return false;
}

function isStorageQuotaError(e) {
  const msg = (e && (e.message || e.error || '')) + '';
  return e && (e.status === 402 || e.statusCode === '402' || e.statusCode === 402 || /quota|restricted|402|egress/i.test(msg));
}
async function uploadFoto(file) {
  if (!validarBufferImagem(file.buffer)) {
    throw new Error('Arquivo não é uma imagem válida (conteúdo não corresponde ao tipo)');
  }
  const fallbackDataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const ext = path.extname(file.originalname).toLowerCase();
  const nome = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  let supabase;
  try { supabase = getStorage(); } catch (e) { return fallbackDataUrl; }
  try {
    const { error } = await supabase.storage.from('produtos').upload(nome, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '31536000'
    });
    if (error) throw error;
  } catch (e) {
    if (isStorageQuotaError(e)) {
      console.warn('Supabase Storage bloqueado (quota 402) — salvando imagem como data URL');
      return fallbackDataUrl;
    }
    if (/Bucket not found/i.test(e.message)) {
      try {
        const { error: createErr } = await supabase.storage.createBucket('produtos', { public: true });
        if (createErr && !/already exists/i.test(createErr.message)) throw createErr;
        const { error: retryErr } = await supabase.storage.from('produtos').upload(nome, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '31536000'
        });
        if (retryErr) throw retryErr;
      } catch (e2) {
        if (isStorageQuotaError(e2)) {
          console.warn('Supabase Storage bloqueado (quota 402) — salvando imagem como data URL');
          return fallbackDataUrl;
        }
        throw e2;
      }
    } else {
      throw e;
    }
  }
  const { data } = supabase.storage.from('produtos').getPublicUrl(nome);
  return data.publicUrl;
}

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG, WebP ou GIF.'), false);
  }
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error('Extensão de arquivo não permitida.'), false);
  }
  cb(null, true);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 700 * 1024 }, fileFilter });

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/', wrapAsync(async (req, res) => {
  const rows = await db.all(`
    SELECT p.*, c.nome as categoria_nome FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    ORDER BY p.preco ASC, p.nome
  `);

  const adicionais = await db.all(`
    SELECT a.*, c.nome as categoria_nome, c.ordem as categoria_ordem FROM adicionais a
    LEFT JOIN categorias c ON a.categoria_id = c.id
    WHERE a.ativo = true
    ORDER BY c.ordem ASC NULLS LAST, a.nome ASC, a.id ASC
  `);

  const produtos = rows.map(p => ({
    ...p,
    adicionais: adicionais.filter(a => a.categoria_id === p.categoria_id)
  }));

  res.json(produtos);
}));

router.get('/ativos', wrapAsync(async (req, res) => {
  // Produtos somente_garcom so aparecem para garcom/admin autenticado (canal=garcom)
  const incluirGarcom = req.query.canal === 'garcom' && req.usuario && ['garcom', 'admin'].includes(req.usuario.perfil);
  const rows = await db.all(`
    SELECT p.*, c.nome as categoria_nome FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    WHERE p.ativo = true AND ($1 = true OR p.somente_garcom = false)
    ORDER BY c.ordem ASC NULLS LAST, p.preco ASC, p.nome
  `, incluirGarcom);

  const adicionais = await db.all(`
    SELECT a.*, c.nome as categoria_nome, c.ordem as categoria_ordem FROM adicionais a
    LEFT JOIN categorias c ON a.categoria_id = c.id
    WHERE a.ativo = true
    ORDER BY c.ordem ASC NULLS LAST, a.nome ASC, a.id ASC
  `);
  let pizzaCatIds = new Set();
  try {
    const pizzaCats = await db.all("SELECT id FROM categorias WHERE nome ILIKE '%pizza%'");
    pizzaCatIds = new Set(pizzaCats.map(r => r.id));
  } catch (e) { pizzaCatIds = new Set([7,26,27,28]); }

  // Vinculos N:N adicional x produto; fallback para coluna legado produto_id
  const vinculos = await db.all('SELECT adicional_id, produto_id FROM adicional_produtos');
  const produtosPorAdicional = new Map();
  vinculos.forEach(v => {
    if (!produtosPorAdicional.has(v.adicional_id)) produtosPorAdicional.set(v.adicional_id, []);
    produtosPorAdicional.get(v.adicional_id).push(v.produto_id);
  });

  const produtos = rows.map(p => {
    // Verificar se é pizza ou suco (produtos que recebem sabores)
     const isPizza = p.categoria_nome && ['pizza', 'suco', 'bebida', 'milk', 'shake'].some(
       cat => p.categoria_nome.toLowerCase().includes(cat.toLowerCase())
     );
    const isProdutoPizzaCat = pizzaCatIds.has(p.categoria_id);

    // Para pizzas/sucos: retornar sabores + adicionais. Para outros: apenas adicionais
    const adicionaisFiltrados = adicionais.filter(a => {
      const mesmaCategoria = !a.categoria_id || a.categoria_id === p.categoria_id;
      const idsVinculados = produtosPorAdicional.has(a.id)
        ? produtosPorAdicional.get(a.id)
        : (a.produto_id ? [a.produto_id] : null);
      // Adicionais específicos do produto têm prioridade
      const produtoEspecifico = !!idsVinculados && idsVinculados.includes(p.id);
      // Adicionais globais da categoria (sem nenhum produto vinculado)
      const adicionalGlobal = (!idsVinculados || idsVinculados.length === 0) && mesmaCategoria;
      
      if (isPizza) {
        if (a.tipo === 'sabor' && (produtoEspecifico || adicionalGlobal)) {
          return true;
        }
        if (a.tipo === 'sabor' && isProdutoPizzaCat && pizzaCatIds.has(a.categoria_id) && (!idsVinculados || idsVinculados.length===0)) {
          return true;
        }
        if (isProdutoPizzaCat && a.tipo === 'borda') {
          return produtoEspecifico;
        }
        if (isProdutoPizzaCat && a.tipo === 'adicional' && a.categoria_id && pizzaCatIds.has(a.categoria_id) && a.preco > 0) {
          return true;
        }
        return (produtoEspecifico || adicionalGlobal) && ['adicional', 'borda'].includes(a.tipo) && a.preco > 0;
      } else {
        // Para não-pizzas: se houver vínculo explícito ou se for da mesma categoria e não houver restrição restrita de vinculo exclusivo
        return produtoEspecifico || adicionalGlobal;
      }
    });
    
    return {
      ...p,
      adicionais: adicionaisFiltrados
    };
  });

  res.json(produtos);
}));

router.get('/:id', wrapAsync(async (req, res) => {
  const row = await db.get(`
    SELECT p.*, c.nome as categoria_nome FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id WHERE p.id = $1
  `, req.params.id);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado' });

  const adicionais = await db.all(`
    SELECT a.*, c.nome as categoria_nome, c.ordem as categoria_ordem FROM adicionais a
    LEFT JOIN categorias c ON a.categoria_id = c.id
    WHERE a.ativo = true AND (a.categoria_id IS NULL OR a.categoria_id = $1)
    ORDER BY c.ordem ASC NULLS LAST, a.nome ASC, a.id ASC
  `, row.categoria_id);

  res.json({ ...row, adicionais });
}));

router.post('/', middlewareAdmin, upload.single('foto'), wrapAsync(async (req, res) => {
  const { nome, categoria_id, descricao, preco, ativo, adicionais_ids, unidade, somente_garcom, limite_sabores } = req.body;
  if (!nome || String(nome).trim().length < 2) return res.status(400).json({ error: 'Nome obrigatório (min 2)' });
  const precoNum = parseFloat(preco);
  if (isNaN(precoNum) || precoNum < 0) return res.status(400).json({ error: 'Preço inválido (deve ser >= 0)' });
  if (!categoria_id) return res.status(400).json({ error: 'Categoria obrigatória' });
  const foto = req.file ? await uploadFoto(req.file) : null;
  const soGarcom = somente_garcom === true || somente_garcom === '1';
  const limiteSab = parseInt(limite_sabores) || 0;

  const info = await db.run(
    'INSERT INTO produtos (nome, categoria_id, descricao, preco, foto, ativo, unidade, somente_garcom, limite_sabores) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
    String(nome).trim().replace(/[<>]/g, ''), categoria_id, String(descricao || '').replace(/[<>]/g, ''), precoNum, foto, ativo !== undefined ? ativo : true, unidade === 'kg' ? 'kg' : 'un', soGarcom, limiteSab
  );

  if (adicionais_ids) {
    let ids;
    try { ids = JSON.parse(adicionais_ids); } catch (e) { return res.status(400).json({ error: 'adicionais_ids JSON inválido' }); }
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'adicionais_ids deve ser array' });
    for (const aid of ids) {
      await db.run('INSERT INTO produto_adicionais (produto_id, adicional_id) VALUES ($1, $2)', info.lastInsertRowid, aid);
    }
  }

  res.json({ id: info.lastInsertRowid });
}));

router.put('/:id', middlewareAdmin, upload.single('foto'), wrapAsync(async (req, res) => {
  const { nome, categoria_id, descricao, preco, ativo, adicionais_ids, unidade, somente_garcom, limite_sabores } = req.body;
  // Campos nao enviados sao preservados (permite atualizacoes parciais, ex.: toggle ativo)
  const existing = await db.get('SELECT foto, nome, categoria_id, descricao, preco, ativo, unidade, somente_garcom, limite_sabores FROM produtos WHERE id = $1', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado' });
  if (nome !== undefined && String(nome).trim().length < 2) return res.status(400).json({ error: 'Nome inválido (min 2)' });
  if (preco !== undefined) {
    const pn = parseFloat(preco);
    if (isNaN(pn) || pn < 0) return res.status(400).json({ error: 'Preço inválido (deve ser >= 0)' });
  }
  const foto = req.file ? await uploadFoto(req.file) : existing.foto;
  const soGarcom = somente_garcom !== undefined ? (somente_garcom === true || somente_garcom === '1') : existing.somente_garcom;
  const limiteSab = limite_sabores !== undefined ? (parseInt(limite_sabores) || 0) : existing.limite_sabores;

  await db.run(
    'UPDATE produtos SET nome=$1, categoria_id=$2, descricao=$3, preco=$4, foto=$5, ativo=$6, unidade=$7, somente_garcom=$8, limite_sabores=$9 WHERE id=$10',
    nome !== undefined ? String(nome).trim().replace(/[<>]/g, '') : existing.nome,
    categoria_id !== undefined ? categoria_id : existing.categoria_id,
    descricao !== undefined ? String(descricao).replace(/[<>]/g, '') : existing.descricao,
    preco !== undefined ? parseFloat(preco) : existing.preco,
    foto,
    ativo !== undefined ? ativo : existing.ativo,
    unidade !== undefined ? (unidade === 'kg' ? 'kg' : 'un') : existing.unidade,
    soGarcom,
    limiteSab,
    req.params.id
  );

  await db.run('DELETE FROM produto_adicionais WHERE produto_id = $1', req.params.id);
  if (adicionais_ids) {
    let ids;
    try { ids = JSON.parse(adicionais_ids); } catch (e) { return res.status(400).json({ error: 'adicionais_ids JSON inválido' }); }
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'adicionais_ids deve ser array' });
    for (const aid of ids) {
      await db.run('INSERT INTO produto_adicionais (produto_id, adicional_id) VALUES ($1, $2)', req.params.id, aid);
    }
  }

  res.json({ success: true });
}));

router.delete('/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  try {
    await db.run('DELETE FROM produtos WHERE id = $1', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(409).json({ error: 'Não foi possível excluir este produto.' });
  }
}));

module.exports = router;