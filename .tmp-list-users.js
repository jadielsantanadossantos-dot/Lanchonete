require('dotenv').config();
const { Pool } = require('pg');
let cs = process.env.DATABASE_URL;
if (/pooler\.supabase/.test(cs)) {
  const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
  const u = new URL(cs);
  const user = decodeURIComponent(u.username);
  if (ref && (user === 'postgres' || !user.includes('.'))) {
    u.username = 'postgres.' + ref;
    cs = u.toString();
  }
}
const pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query('SELECT id, nome, usuario, perfil, ativo, trocar_senha FROM usuarios ORDER BY id');
  console.log(JSON.stringify(r.rows, null, 2));
  const c = await pool.query("SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid='usuarios'::regclass AND conname='usuarios_perfil_check'");
  console.log('CHECK', c.rows[0]?.def);
  const cfg = await pool.query("SELECT chave, valor FROM configuracoes WHERE chave IN ('loja_aberta','loja_nome') ORDER BY chave");
  console.log('cfg', cfg.rows);
  const prod = await pool.query("SELECT count(*)::int as c FROM produtos");
  console.log('produtos', prod.rows[0].c);
  const cat = await pool.query("SELECT count(*)::int as c FROM categorias");
  console.log('categorias', cat.rows[0].c);
  await pool.end();
})();
