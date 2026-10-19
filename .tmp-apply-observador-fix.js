require('dotenv').config();
const { Pool } = require('pg');
let cs = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (/pooler\.supabase\.(com|co)/.test(cs)) {
  try {
    const url = new URL(cs);
    const ref = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname.split('.')[0] : null;
    const user = decodeURIComponent(url.username);
    if (ref && (user === 'postgres' || !user.includes('.'))) {
      url.username = `postgres.${ref}`;
      cs = url.toString();
    }
  } catch(e){ console.error('url parse', e.message); }
}
console.log('CS host', new URL(cs).hostname, 'user', new URL(cs).username);
const pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
(async()=>{
  try{
    const c1 = await pool.query("SELECT COUNT(*)::int as total FROM usuarios WHERE perfil='observador'");
    console.log('observador count', c1.rows[0].total);
    const u = await pool.query("SELECT id, usuario, perfil, ativo FROM usuarios WHERE perfil='observador'");
    console.log('observador users', u.rows);
    const cons = await pool.query("SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid='usuarios'::regclass AND conname='usuarios_perfil_check'");
    console.log('constraint', cons.rows);
    console.log('--- applying fix ---');
    await pool.query(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='usuarios'::regclass AND conname='usuarios_perfil_check') THEN
    ALTER TABLE usuarios DROP CONSTRAINT usuarios_perfil_check;
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
`);
    await pool.query("ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check CHECK (perfil IN ('admin','garcom'))");
    console.log('constraint recreated');
    const upd = await pool.query("UPDATE usuarios SET perfil='admin' WHERE perfil='observador'");
    console.log('updated', upd.rowCount);
    const del = await pool.query("DELETE FROM usuarios WHERE perfil='observador'");
    console.log('deleted leftover', del.rowCount);
    const cons2 = await pool.query("SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid='usuarios'::regclass AND conname='usuarios_perfil_check'");
    console.log('constraint after', cons2.rows);
    const c2 = await pool.query("SELECT COUNT(*)::int as total FROM usuarios WHERE perfil='observador'");
    console.log('observador count after', c2.rows[0].total);
    await pool.end();
  } catch(e){ console.error(e); await pool.end(); }
})();
