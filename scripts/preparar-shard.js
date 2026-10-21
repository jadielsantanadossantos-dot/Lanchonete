#!/usr/bin/env node
/**
 * Prepara o banco PostgreSQL da Shard Cloud para o sistema Lanchonete.
 *
 * Uso:
 *   node scripts/preparar-shard.js --migrate          # aplica somente o schema
 *   node scripts/preparar-shard.js --clone --yes      # schema + copia TUDO do Supabase
 *   node scripts/preparar-shard.js --clone --yes --only=catalog
 *
 * Variaveis lidas do .env:
 *   DATABASE_URL        (destino; tem prioridade)
 *   SHARDCLOUD_DB_URL   (destino alternativo)
 *   SUPABASE_DB_URL     (origem, obrigatoria apenas no --clone)
 *   SHARD_SSL=true      (opcional; ativa SSL no destino)
 *
 * O script usa o banco exatamente como está na URL (não força /database).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIG_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

// Migrations especificas do Supabase (RLS/roles) ou da demo nao fazem sentido no Shard.
const SKIP = new Set([
  '20260826000000_enable_rls.sql',
  '20260826000006_grant_service_role.sql',
  '20260826000004_usuario_demo.sql',
  '20260826000005_seed_demo.sql',
  '20260826000008_allow_observador.sql',
  '20260826000009_revert_demo_prod.sql',
  '20260826000010_fix_demo_login_demo.sql',
]);

// Mantem apenas a parte util (indice unico / tabela) e remove RLS e grants do Supabase.
const OVERRIDES = {
  '20260826000007_fix_concorrencia_rls.sql': `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comandas_mesa_aberta
      ON comandas(mesa_id) WHERE status = 'aberta';
  `,
  '20260909000001_idempotency_keys.sql': `
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      pedido_id BIGINT REFERENCES pedidos(id) ON DELETE CASCADE,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_criado ON idempotency_keys(criado_em);
  `,
};

const TABLES_ALL = [
  'categorias',
  'produtos',
  'adicionais',
  'produto_adicionais',
  'adicional_produtos',
  'clientes',
  'bairros',
  'motoboys',
  'mesas',
  'usuarios',
  'configuracoes',
  'comandas',
  'pedidos',
  'comanda_itens',
  'pedido_itens',
  'pedido_item_adicionais',
  'auditoria',
  'refresh_tokens_revogados',
  'idempotency_keys',
];

const TABLES_CATALOG = [
  'categorias',
  'produtos',
  'adicionais',
  'produto_adicionais',
  'adicional_produtos',
  'bairros',
  'motoboys',
  'mesas',
  'usuarios',
  'configuracoes',
];

function log(...args) { console.log(...args); }
function ok(msg) { console.log('  OK   ' + msg); }
function warn(msg) { console.log('  AVISO ' + msg); }
function fail(msg) { console.error('  ERRO  ' + msg); }

function sslFor(url) {
  if (process.env.SHARD_SSL === 'true' || process.env.PGSSL === 'require') return { rejectUnauthorized: false };
  const host = new URL(url).hostname;
  if (/supabase\.(co|com)|pooler\.supabase/.test(host)) return { rejectUnauthorized: false };
  return false;
}

async function connect(rawUrl, label) {
  const client = new Client({
    connectionString: rawUrl,
    ssl: sslFor(rawUrl),
    connectionTimeoutMillis: 20000,
    statement_timeout: 120000,
  });
  await client.connect();
  log(`Conectado ao ${label}: ${new URL(rawUrl).hostname}${new URL(rawUrl).pathname}`);
  return client;
}

async function connectTarget() {
  // Usa exatamente o banco configurado (DATABASE_URL tem prioridade).
  const raw = process.env.DATABASE_URL || process.env.SHARDCLOUD_DB_URL;
  if (!raw) throw new Error('DATABASE_URL/SHARDCLOUD_DB_URL nao configurada no .env');
  const client = new Client({
    connectionString: raw,
    ssl: sslFor(raw),
    connectionTimeoutMillis: 20000,
    statement_timeout: 120000,
  });
  await client.connect();
  log(`Conectado ao destino (Shard): ${new URL(raw).hostname}${new URL(raw).pathname}`);
  return client;
}

async function q(client, sql, params) {
  return params ? client.query(sql, params) : client.query(sql);
}

async function ensureMigrationsTable(client) {
  await q(client, `
    CREATE TABLE IF NOT EXISTS _migrations (
      nome TEXT PRIMARY KEY,
      aplicado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function isApplied(client, nome) {
  const r = await q(client, 'SELECT 1 FROM _migrations WHERE nome = $1', [nome]);
  return r.rowCount > 0;
}

async function markApplied(client, nome) {
  await q(client, 'INSERT INTO _migrations (nome) VALUES ($1) ON CONFLICT DO NOTHING', [nome]);
}

async function runMigrations(client) {
  log('\n=== 1. Migrations ===');
  await ensureMigrationsTable(client);

  const exists = await q(client, "SELECT to_regclass('public.categorias') AS t");
  if (exists.rows[0].t) {
    const already = await isApplied(client, '20260822000000_initial_schema.sql');
    if (!already) {
      await markApplied(client, '20260822000000_initial_schema.sql');
      ok('20260822000000_initial_schema.sql (schema inicial ja existente, marcado como aplicado)');
    }
  }

  const files = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (SKIP.has(file)) {
      warn(`${file} (ignorada: especifica do Supabase/demo)`);
      continue;
    }
    if (await isApplied(client, file)) {
      ok(`${file} (ja aplicada)`);
      continue;
    }
    const sql = OVERRIDES[file] || fs.readFileSync(path.join(MIG_DIR, file), 'utf8');
    try {
      await q(client, 'BEGIN');
      await q(client, sql);
      await markApplied(client, file);
      await q(client, 'COMMIT');
      ok(file);
    } catch (e) {
      await q(client, 'ROLLBACK').catch(() => {});
      fail(`${file}: ${e.message}`);
      throw e;
    }
  }
}

async function listColumns(client) {
  const r = await q(client, `
    SELECT t.relname AS table_name,
           a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS tipo,
           a.attnotnull AS notnull,
           pg_get_expr(d.adbin, d.adrelid) AS default_expr
    FROM pg_attribute a
    JOIN pg_class t ON t.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'public'
      AND t.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY t.relname, a.attnum
  `);
  const map = new Map();
  for (const row of r.rows) {
    if (!map.has(row.table_name)) map.set(row.table_name, new Map());
    map.get(row.table_name).set(row.column_name, row);
  }
  return map;
}

async function addMissingColumns(source, target, tables, allowNotNull) {
  log('\n=== 2. Ajuste de colunas ausentes ===');
  const sourceCols = await listColumns(source);
  const targetCols = await listColumns(target);
  let added = 0;
  for (const table of tables) {
    const s = sourceCols.get(table);
    const t = targetCols.get(table);
    if (!s || !t) {
      warn(`tabela ${table} nao existe em origem ou destino`);
      continue;
    }
    for (const [nome, col] of s) {
      if (t.has(nome)) continue;
      const partes = [`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${nome}" ${col.tipo}`];
      if (col.default_expr) partes.push(`DEFAULT ${col.default_expr}`);
      if (col.notnull && allowNotNull) partes.push('NOT NULL');
      const sql = partes.join(' ');
      try {
        await q(target, sql);
        ok(`${table}.${nome} (${col.tipo}) adicionada`);
        added++;
      } catch (e) {
        fail(`${table}.${nome}: ${e.message}`);
        if (col.notnull) warn(`adicione manualmente: ${sql}`);
        else throw e;
      }
    }
  }
  if (!added) ok('nenhuma coluna ausente');
}

async function truncateTarget(target, tables) {
  const lista = tables.map(t => `"${t}"`).join(', ');
  await q(target, `TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
  ok('tabelas de destino limpas');
}

async function copyTable(source, target, table) {
  const sourceExists = await q(source, 'SELECT to_regclass($1) AS t', [`public.${table}`]);
  const targetExists = await q(target, 'SELECT to_regclass($1) AS t', [`public.${table}`]);
  if (!sourceExists.rows[0].t) {
    warn(`${table}: nao existe na origem, ignorada`);
    return { origem: 0, destino: 0 };
  }
  if (!targetExists.rows[0].t) {
    warn(`${table}: nao existe no destino, ignorada`);
    return { origem: 0, destino: 0 };
  }
  const rows = (await q(source, `SELECT * FROM "${table}"`)).rows;
  if (!rows.length) {
    warn(`${table}: 0 registros na origem`);
    return { origem: 0, destino: 0 };
  }
  const targetCols = await q(target, `
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
  `, [table]);
  const valid = new Set(targetCols.rows.map(r => r.column_name));
  const jsonCols = new Set(
    targetCols.rows
      .filter(r => r.data_type === 'json' || r.data_type === 'jsonb')
      .map(r => r.column_name)
  );
  const cols = Object.keys(rows[0]).filter(c => valid.has(c));
  const ignoradas = Object.keys(rows[0]).filter(c => !valid.has(c));
  if (ignoradas.length) warn(`${table}: colunas ignoradas no destino -> ${ignoradas.join(', ')}`);
  if (!cols.length) {
    fail(`${table}: nenhuma coluna em comum`);
    return { origem: rows.length, destino: 0 };
  }

  const quoted = cols.map(c => `"${c}"`).join(', ');
  const batchSize = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const lote = rows.slice(i, i + batchSize);
    const params = [];
    const values = lote.map(row => {
      const marks = cols.map(c => {
        let value = row[c] === undefined ? null : row[c];
        // O driver pg envia arrays JS como array literal do Postgres; para json/jsonb
        // precisamos enviar uma string JSON valida.
        if (value !== null && jsonCols.has(c) && typeof value === 'object') {
          value = JSON.stringify(value);
        }
        params.push(value);
        return `$${params.length}`;
      });
      return `(${marks.join(',')})`;
    }).join(',');
    const r = await q(target, `INSERT INTO "${table}" (${quoted}) VALUES ${values} ON CONFLICT DO NOTHING`, params);
    inserted += r.rowCount;
  }
  const destino = (await q(target, `SELECT count(*)::int n FROM "${table}"`)).rows[0].n;
  log(`  ${table}: ${rows.length} na origem, ${destino} no destino`);
  return { origem: rows.length, destino };
}

async function resetSequence(target, table) {
  if (table === 'configuracoes' || table === 'produto_adicionais' || table === 'adicional_produtos') return;
  const seq = await q(target, "SELECT pg_get_serial_sequence($1, 'id') AS s", [`public.${table}`]);
  const name = seq.rows[0] && seq.rows[0].s;
  if (!name) return;
  const max = (await q(target, `SELECT MAX(id)::bigint AS m FROM "${table}"`)).rows[0].m;
  if (max === null) return;
  await q(target, 'SELECT setval($1, $2, true)', [name, max]);
}

async function cloneData(source, target, tables) {
  log('\n=== 3. Copia de dados ===');
  for (const table of tables) {
    await copyTable(source, target, table);
  }
  log('\n=== 4. Sequencias ===');
  for (const table of tables) {
    try { await resetSequence(target, table); } catch (e) { warn(`${table}: ${e.message}`); }
  }
  ok('sequencias ajustadas');
}

async function verify(source, target, tables) {
  log('\n=== 5. Verificacao ===');
  let divergencias = 0;
  for (const table of tables) {
    const s = (await q(source, `SELECT count(*)::int n FROM "${table}"`)).rows[0].n;
    const t = (await q(target, `SELECT count(*)::int n FROM "${table}"`)).rows[0].n;
    const status = s === t ? 'OK  ' : 'DIFF';
    if (s !== t) divergencias++;
    console.log(`  ${status} ${table.padEnd(28)} origem=${String(s).padStart(6)} destino=${String(t).padStart(6)}`);
  }
  if (divergencias) warn(`${divergencias} tabela(s) com contagem diferente (verifique ON CONFLICT/colunas ignoradas)`);
  else ok('todas as contagens conferem');
}

async function main() {
  const args = process.argv.slice(2);
  const doClone = args.includes('--clone');
  const onlyCatalog = args.includes('--only=catalog');
  const yes = args.includes('--yes');
  if (!doClone) {
    log('Modo: somente migrations (schema). Use --clone para copiar os dados.');
  } else {
    log(`Modo: migrations + clone completo${onlyCatalog ? ' (somente catalogo/config/usuarios)' : ''}`);
    if (!yes) {
      fail('Para copiar dados e limpar o destino, rode novamente com --yes');
      process.exit(1);
    }
  }

  const target = await connectTarget();
  try {
    await runMigrations(target);

    const sourceUrl = process.env.SUPABASE_DB_URL;
    if (doClone && !sourceUrl) {
      fail('SUPABASE_DB_URL nao configurada no .env; necessaria apenas para --clone');
      return;
    }

    if (!doClone) {
      if (sourceUrl) {
        const source = await connect(sourceUrl, 'origem (Supabase)');
        try {
          await addMissingColumns(source, target, TABLES_ALL, false);
        } finally {
          await source.end();
        }
      } else {
        warn('SUPABASE_DB_URL ausente; comparacao de colunas ignorada no modo somente migrations');
      }
      log('\nSchema pronto. Proximo passo: --clone --yes');
      return;
    }

    const source = await connect(sourceUrl, 'origem (Supabase)');
    try {
      const tables = onlyCatalog ? TABLES_CATALOG : TABLES_ALL;
      log('\nTabelas que serao copiadas: ' + tables.join(', '));
      await truncateTarget(target, tables);
      await addMissingColumns(source, target, tables, true);
      await cloneData(source, target, tables);
      await verify(source, target, tables);
      log('\nClone concluido.');
    } finally {
      await source.end();
    }
  } finally {
    await target.end();
  }
}

main().catch(e => {
  console.error('\nFalhou:', e.message);
  process.exit(1);
});
