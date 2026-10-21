// Armazenamento local de imagens (VPS/Shard/Docker).
// As imagens ficam em UPLOADS_DIR (padrao: public/uploads) e sao servidas em /uploads.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(
  process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'public', 'uploads')
);
const URL_PREFIX = '/uploads/';
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

async function saveImage(buffer, originalName, folder) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Extensão de imagem não permitida');
  }
  const dir = path.join(ROOT, folder);
  await fs.mkdir(dir, { recursive: true });
  const nome = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  await fs.writeFile(path.join(dir, nome), buffer, { mode: 0o644 });
  return `${URL_PREFIX}${folder}/${nome}`;
}

async function removeByUrl(url) {
  if (!url || typeof url !== 'string' || !url.startsWith(URL_PREFIX)) return false;
  const rel = url.slice(URL_PREFIX.length).split('?')[0].split('#')[0];
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return false;
  try {
    await fs.unlink(abs);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { ROOT, URL_PREFIX, saveImage, removeByUrl };
