import 'dotenv/config';
import postgres from 'postgres';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const databaseUrl = process.env.DATABASE_URL!;

const pg = postgres(databaseUrl);

async function main() {
  console.log('Aplicando schema no PostgreSQL...');
  
  const migrationPath = join(__dirname, '..', 'drizzle', 'migrations', '0000_amusing_kang.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  
  // Split by statement-breakpoint
  const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s.length > 0);
  
  console.log(`Executando ${statements.length} statements...`);
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    
    try {
      await pg.unsafe(stmt);
      console.log(`  [${i + 1}/${statements.length}] OK`);
    } catch (error: any) {
      // Ignore "already exists" errors
      if (error.code === '42710' || error.code === '42P07' || error.message?.includes('already exists')) {
        console.log(`  [${i + 1}/${statements.length}] SKIP (already exists)`);
      } else {
        console.error(`  [${i + 1}/${statements.length}] ERROR:`, error.message);
        // Don't exit, continue with other statements
      }
    }
  }
  
  console.log('\nSchema aplicado!');
  
  // Verify tables
  const tables = await pg`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `;
  
  console.log('\nTabelas criadas:');
  for (const t of tables) {
    console.log(`  ${t.table_name}`);
  }
  
  await pg.end();
}

main().catch(console.error);