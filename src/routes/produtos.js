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

async function uploadFoto(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const nome = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const supabase = getStorage();
  try {
    const { error } = await supabase.storage.from('produtos').upload(nome, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '31536000'
    });
    if (error) throw error;
  } catch (e) {
    if (/Bucket not found/i.test(e.message)) {
      const { error: createErr } = await supabase.storage.createBucket('produtos', { public: true });
      if (createErr && !/already exists/i.test(createErr.message)) throw createErr;
      const { error: retryErr } = await supabase.storage.from('produtos').upload(nome, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '31536000'
      });
      if (retryErr) throw retryErr;
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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

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

  const adicionais = await db.all('SELECT * FROM adicionais WHERE ativo = true');

  const produtos = rows.map(p => ({
    ...p,
    adicionais: adicionais.filter(a => !a.categoria_id || a.categoria_id === p.categoria_id)
  }));

  res.json(produtos);
}));

router.get('/ativos', wrapAsync(async (req, res) => {
  const rows = await db.all(`
    SELECT p.*, c.nome as categoria_nome FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    WHERE p.ativo = true ORDER BY p.preco ASC, p.nome
  `);

  const adicionais = await db.all('SELECT * FROM adicionais WHERE ativo = true');

  const produtos = rows.map(p => {
    // Verificar se é pizza ou suco (produtos que recebem sabores)
    const isPizza = p.categoria_nome && ['pizza', 'suco', 'bebida'].some(
      cat => p.categoria_nome.toLowerCase().includes(cat.toLowerCase())
    );
    
    // Para pizzas/sucos: retornar sabores + adicionais. Para outros: apenas adicionais
    const adicionaisFiltrados = adicionais.filter(a => {
      const mesmaCategoria = !a.categoria_id || a.categoria_id === p.categoria_id;
      // Adicionais específicos do produto têm prioridade
      const produtoEspecifico = a.produto_id === p.id;
      // Adicionais globais da categoria
      const adicionalGlobal = (!a.produto_id || a.produto_id === null) && mesmaCategoria;
      
      if (isPizza) {
        // Pizzas/sucos recebem sabores (tipo='sabor') E adicionais com preço
        if (a.tipo === 'sabor' && (produtoEspecifico || mesmaCategoria)) {
          return true;
        }
        return (produtoEspecifico || adicionalGlobal) && a.tipo === 'adicional' && a.preco > 0;
      } else {
        // Não-pizzas recebem adicionais sem tipo, tipo='adicional', sabores e tipos de açaí (base/cobertura/acompanhamento)
        return (produtoEspecifico || adicionalGlobal) && (!a.tipo || ['adicional', 'sabor', 'base', 'cobertura', 'acompanhamento'].includes(a.tipo));
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

  const adicionais = await db.all('SELECT * FROM adicionais WHERE ativo = true AND (categoria_id IS NULL OR categoria_id = $1)', row.categoria_id);

  res.json({ ...row, adicionais });
}));

router.post('/', middlewareAdmin, upload.single('foto'), wrapAsync(async (req, res) => {
  const { nome, categoria_id, descricao, preco, ativo, adicionais_ids, unidade } = req.body;
  const foto = req.file ? await uploadFoto(req.file) : null;

  const info = await db.run(
    'INSERT INTO produtos (nome, categoria_id, descricao, preco, foto, ativo, unidade) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    nome, categoria_id, descricao || '', parseFloat(preco), foto, ativo !== undefined ? ativo : true, unidade === 'kg' ? 'kg' : 'un'
  );

  if (adicionais_ids) {
    const ids = JSON.parse(adicionais_ids);
    for (const aid of ids) {
      await db.run('INSERT INTO produto_adicionais (produto_id, adicional_id) VALUES ($1, $2)', info.lastInsertRowid, aid);
    }
  }

  res.json({ id: info.lastInsertRowid });
}));

router.put('/:id', middlewareAdmin, upload.single('foto'), wrapAsync(async (req, res) => {
  const { nome, categoria_id, descricao, preco, ativo, adicionais_ids, unidade } = req.body;
  const existing = await db.get('SELECT foto FROM produtos WHERE id = $1', req.params.id);
  const foto = req.file ? await uploadFoto(req.file) : (existing ? existing.foto : null);

  await db.run(
    'UPDATE produtos SET nome=$1, categoria_id=$2, descricao=$3, preco=$4, foto=$5, ativo=$6, unidade=$7 WHERE id=$8',
    nome, categoria_id, descricao || '', parseFloat(preco), foto, ativo !== undefined ? ativo : true, unidade === 'kg' ? 'kg' : 'un', req.params.id
  );

  await db.run('DELETE FROM produto_adicionais WHERE produto_id = $1', req.params.id);
  if (adicionais_ids) {
    const ids = JSON.parse(adicionais_ids);
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