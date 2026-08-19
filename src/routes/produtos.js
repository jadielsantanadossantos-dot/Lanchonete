const express = require('express');
const router = express.Router();
const db = require('../db/database');
const multer = require('multer');
const path = require('path');
const { middlewareAdmin } = require('../auth/auth');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^\.+/, '')
    .substring(0, 100);
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', '..', 'public', 'uploads')),
  filename: (req, file, cb) => {
    const sanitized = sanitizeFilename(file.originalname);
    const ext = path.extname(sanitized).toLowerCase();
    const base = path.basename(sanitized, ext).substring(0, 50);
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.nome as categoria_nome FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    ORDER BY c.ordem, p.nome
  `).all();

  const adicionais = db.prepare(`
    SELECT pa.produto_id, a.* FROM produto_adicionais pa
    JOIN adicionais a ON pa.adicional_id = a.id WHERE a.ativo = 1
  `).all();

  const produtos = rows.map(p => ({
    ...p,
    adicionais: adicionais.filter(a => a.produto_id === p.id)
  }));

  res.json(produtos);
});

router.get('/ativos', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.nome as categoria_nome FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    WHERE p.ativo = 1 ORDER BY c.ordem, p.nome
  `).all();

  const adicionais = db.prepare(`
    SELECT pa.produto_id, a.* FROM produto_adicionais pa
    JOIN adicionais a ON pa.adicional_id = a.id WHERE a.ativo = 1
  `).all();

  const produtos = rows.map(p => ({
    ...p,
    adicionais: adicionais.filter(a => a.produto_id === p.id)
  }));

  res.json(produtos);
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT p.*, c.nome as categoria_nome FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id WHERE p.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado' });

  const adicionais = db.prepare(`
    SELECT a.* FROM produto_adicionais pa
    JOIN adicionais a ON pa.adicional_id = a.id WHERE pa.produto_id = ?
  `).all(req.params.id);

  res.json({ ...row, adicionais });
});

router.post('/', middlewareAdmin, upload.single('foto'), (req, res) => {
  const { nome, categoria_id, descricao, preco, ativo, adicionais_ids } = req.body;
  const foto = req.file ? '/uploads/' + req.file.filename : null;

  const info = db.prepare(
    'INSERT INTO produtos (nome, categoria_id, descricao, preco, foto, ativo) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(nome, categoria_id, descricao || '', parseFloat(preco), foto, ativo !== undefined ? parseInt(ativo) : 1);

  if (adicionais_ids) {
    const ids = JSON.parse(adicionais_ids);
    const stmt = db.prepare('INSERT INTO produto_adicionais (produto_id, adicional_id) VALUES (?, ?)');
    ids.forEach(aid => stmt.run(info.lastInsertRowid, aid));
  }

  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', middlewareAdmin, upload.single('foto'), (req, res) => {
  const { nome, categoria_id, descricao, preco, ativo, adicionais_ids } = req.body;
  const existing = db.prepare('SELECT foto FROM produtos WHERE id = ?').get(req.params.id);
  const foto = req.file ? '/uploads/' + req.file.filename : (existing ? existing.foto : null);

  db.prepare(
    'UPDATE produtos SET nome=?, categoria_id=?, descricao=?, preco=?, foto=?, ativo=? WHERE id=?'
  ).run(nome, categoria_id, descricao || '', parseFloat(preco), foto, ativo !== undefined ? parseInt(ativo) : 1, req.params.id);

  db.prepare('DELETE FROM produto_adicionais WHERE produto_id = ?').run(req.params.id);
  if (adicionais_ids) {
    const ids = JSON.parse(adicionais_ids);
    const stmt = db.prepare('INSERT INTO produto_adicionais (produto_id, adicional_id) VALUES (?, ?)');
    ids.forEach(aid => stmt.run(req.params.id, aid));
  }

  res.json({ success: true });
});

router.delete('/:id', middlewareAdmin, (req, res) => {
  db.prepare('DELETE FROM produtos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
