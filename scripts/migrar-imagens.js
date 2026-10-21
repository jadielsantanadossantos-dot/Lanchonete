#!/usr/bin/env node
/**
 * Migra as imagens de produtos/logo que ainda apontam para o Supabase Storage
 * para o disco local (public/uploads/migrados), convertendo para WebP.
 *
 * Uso: node scripts/migrar-imagens.js
 */
require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', 'public', 'uploads', 'migrados');
const LOGO_DIR = path.resolve(__dirname, '..', 'public', 'uploads', 'logos');

function targetUrl() {
  // Usa exatamente o banco configurado no .env (nao força /database).
  const raw = process.env.DATABASE_URL || process.env.SHARDCLOUD_DB_URL;
  if (!raw) throw new Error('DATABASE_URL/SHARDCLOUD_DB_URL nao configurada');
  return raw;
}

function sslFor(rawUrl) {
  if (process.env.SHARD_SSL === 'true' || process.env.PGSSL === 'require') {
    return { rejectUnauthorized: false };
  }
  const host = new URL(rawUrl).hostname;
  return /supabase\.(co|com)|pooler\.supabase/.test(host) ? { rejectUnauthorized: false } : false;
}

async function fetchImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const type = res.headers.get('content-type') || '';
    if (!/^image\//i.test(type)) throw new Error('content-type inesperado: ' + type);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 32) throw new Error('arquivo vazio');
    return buf;
  } finally {
    clearTimeout(timeout);
  }
}

async function converter(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
}

async function migrarProdutos(client) {
  await fs.mkdir(ROOT, { recursive: true });
  const rows = (await client.query(
    "SELECT id, nome, foto FROM produtos WHERE foto LIKE 'http%' ORDER BY id"
  )).rows;

  console.log(`Produtos com imagem remota: ${rows.length}`);
  let migradas = 0, falhas = 0, bytesAntes = 0, bytesDepois = 0;

  for (const row of rows) {
    try {
      const hash = crypto.createHash('sha1').update(row.foto).digest('hex').slice(0, 12);
      const nome = `produto-${row.id}-${hash}.webp`;
      const destino = path.join(ROOT, nome);
      let reaproveitada = false;
      try {
        const st = await fs.stat(destino);
        reaproveitada = st.size > 32;
      } catch (_) {}

      let original = 0, convertida = 0;
      if (reaproveitada) {
        console.log(`  ${row.id} ${row.nome}: arquivo local ja existe, atualizando banco`);
      } else {
        const buf = await fetchImage(row.foto);
        const webp = await converter(buf);
        await fs.writeFile(destino, webp, { mode: 0o644 });
        original = buf.length;
        convertida = webp.length;
        bytesAntes += original;
        bytesDepois += convertida;
        console.log(`  ${row.id} ${row.nome}: ${(original / 1024).toFixed(0)} KB -> ${(convertida / 1024).toFixed(0)} KB`);
      }
      await client.query('UPDATE produtos SET foto = $1 WHERE id = $2', [`/uploads/migrados/${nome}`, row.id]);
      migradas++;
    } catch (e) {
      falhas++;
      console.warn(`  ${row.id} ${row.nome}: mantida URL original (${e.message})`);
    }
  }

  console.log(`Produtos migrados: ${migradas}, falhas: ${falhas}`);
  if (migradas) {
    console.log(`Total: ${(bytesAntes / 1024 / 1024).toFixed(2)} MB -> ${(bytesDepois / 1024 / 1024).toFixed(2)} MB`);
  }
}

async function migrarLogo(client) {
  const row = (await client.query("SELECT valor FROM configuracoes WHERE chave='logo_url'")).rows[0];
  if (!row || !/^https?:\/\//i.test(row.valor || '')) {
    console.log('Logo: nada para migrar');
    return;
  }
  try {
    const original = await fetchImage(row.valor);
    const convertida = await converter(original);
    await fs.mkdir(LOGO_DIR, { recursive: true });
    const hash = crypto.createHash('sha1').update(row.valor).digest('hex').slice(0, 12);
    const nome = `logo-${hash}.webp`;
    await fs.writeFile(path.join(LOGO_DIR, nome), convertida, { mode: 0o644 });
    await client.query("UPDATE configuracoes SET valor=$1, atualizado_em=NOW() WHERE chave='logo_url'", [`/uploads/logos/${nome}`]);
    console.log(`Logo migrada: ${(original.length / 1024).toFixed(0)} KB -> ${(convertida.length / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.warn('Logo: mantida URL original (' + e.message + ')');
  }
}

(async () => {
  const raw = targetUrl();
  const client = new Client({ connectionString: raw, ssl: sslFor(raw) });
  await client.connect();
  console.log(`Banco alvo: ${new URL(raw).hostname}${new URL(raw).pathname}`);
  try {
    await migrarProdutos(client);
    await migrarLogo(client);
    const restantes = (await client.query("SELECT count(*)::int n FROM produtos WHERE foto LIKE 'http%'")).rows[0].n;
    console.log(`Produtos ainda com URL remota: ${restantes}`);
  } finally {
    await client.end();
  }
})().catch(e => {
  console.error('Falhou:', e.message);
  process.exit(1);
});
