import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
// @ts-ignore - better-sqlite3 types not available
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../drizzle/schema';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const databaseUrl = process.env.DATABASE_URL!;

const sqliteDb = new Database('lanchonete.db');
const pg = postgres(databaseUrl);
const db = drizzle(pg, { schema });

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Transform snake_case to camelCase for Drizzle
function toCamelCase(obj: any): any {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

// Convert timestamp strings to Date objects
function convertTimestamps(obj: any): any {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
      result[key] = new Date(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function migrateTable(sqliteTable: string, pgTable: any, transform?: (row: any) => any) {
  console.log(`Migrando ${sqliteTable}...`);
  
  // Check if table exists in SQLite
  const tableExists = sqliteDb.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name=?
  `).get(sqliteTable);
  
  if (!tableExists) {
    console.log(`  ${sqliteTable}: SKIP (não existe no SQLite)`);
    return;
  }
  
  const rows = sqliteDb.prepare(`SELECT * FROM ${sqliteTable}`).all();
  
  if (rows.length === 0) {
    console.log(`  ${sqliteTable}: 0 linhas`);
    return;
  }
  
  // Convert snake_case to camelCase for Drizzle, and timestamps to Date
  let processedRows = rows.map(r => toCamelCase(r));
  processedRows = processedRows.map(r => convertTimestamps(r));
  const transformed = transform ? processedRows.map(transform) : processedRows;
  
  const batchSize = 100;
  for (let i = 0; i < transformed.length; i += batchSize) {
    const batch = transformed.slice(i, i + batchSize);
    await db.insert(pgTable).values(batch);
  }
  
  console.log(`  ${sqliteTable}: ${rows.length} linhas migradas`);
}

async function main() {
  console.log('Iniciando migração SQLite → PostgreSQL...');
  
  try {
    // Truncate all tables first (respecting FK order - children first)
    await pg`TRUNCATE TABLE comanda_itens, comandas, pedido_item_adicionais, pedido_itens, pedidos, produto_adicionais, produtos, adicionais, categorias, bairros, clientes, mesas, usuarios, auditoria, notificacoes, configuracoes RESTART IDENTITY CASCADE`;
    
    // Order matters for FK constraints
    await migrateTable('categorias', schema.categorias);
    await migrateTable('mesas', schema.mesas);
    await migrateTable('usuarios', schema.usuarios);  // before auditoria, notificacoes
    await migrateTable('produtos', schema.produtos);
    await migrateTable('adicionais', schema.adicionais);
    await migrateTable('produto_adicionais', schema.produtoAdicionais);
    await migrateTable('clientes', schema.clientes);
    await migrateTable('bairros', schema.bairros);
    await migrateTable('comandas', schema.comandas);
    await migrateTable('pedidos', schema.pedidos);
    await migrateTable('pedido_itens', schema.pedidoItens);
    await migrateTable('pedido_item_adicionais', schema.pedidoItemAdicionais);
    await migrateTable('comanda_itens', schema.comandaItens);
    await migrateTable('configuracoes', schema.configuracoes);
    await migrateTable('auditoria', schema.auditoria);
    await migrateTable('notificacoes', schema.notificacoes);
    
    console.log('Migração concluída!');
    
    const counts = await Promise.all([
      db.select({ count: sql`count(*)` }).from(schema.categorias),
      db.select({ count: sql`count(*)` }).from(schema.produtos),
      db.select({ count: sql`count(*)` }).from(schema.adicionais),
      db.select({ count: sql`count(*)` }).from(schema.clientes),
      db.select({ count: sql`count(*)` }).from(schema.bairros),
      db.select({ count: sql`count(*)` }).from(schema.pedidos),
      db.select({ count: sql`count(*)` }).from(schema.mesas),
      db.select({ count: sql`count(*)` }).from(schema.comandas),
      db.select({ count: sql`count(*)` }).from(schema.comandaItens),
      db.select({ count: sql`count(*)` }).from(schema.usuarios),
    ]);
    
    console.log('\nContagem de linhas no PostgreSQL:');
    console.log(`  categorias: ${counts[0][0]?.count}`);
    console.log(`  produtos: ${counts[1][0]?.count}`);
    console.log(`  adicionais: ${counts[2][0]?.count}`);
    console.log(`  clientes: ${counts[3][0]?.count}`);
    console.log(`  bairros: ${counts[4][0]?.count}`);
    console.log(`  pedidos: ${counts[5][0]?.count}`);
    console.log(`  mesas: ${counts[6][0]?.count}`);
    console.log(`  comandas: ${counts[7][0]?.count}`);
    console.log(`  comanda_itens: ${counts[8][0]?.count}`);
    console.log(`  usuarios: ${counts[9][0]?.count}`);
    
  } catch (error) {
    console.error('Erro na migração:', error);
    process.exit(1);
  } finally {
    await pg.end();
    sqliteDb.close();
  }
}

main();