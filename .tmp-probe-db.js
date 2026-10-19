require('dotenv').config();
const {Pool} = require('pg');
const cs = process.env.DATABASE_URL;
const p = new Pool({connectionString: cs, ssl: {rejectUnauthorized:false}});
(async()=>{
  try{
    const r = await p.query("SELECT id, nome, usuario, perfil, ativo, trocar_senha FROM usuarios ORDER BY id");
    console.log('USUARIOS', JSON.stringify(r.rows,null,2));
    const r2 = await p.query("SELECT chave, valor FROM configuracoes ORDER BY chave");
    console.log('CONFIG', JSON.stringify(r2.rows,null,2));
    const r3 = await p.query("SELECT count(*) as c FROM produtos"); console.log('PRODUTOS', r3.rows[0].c);
    const r4 = await p.query("SELECT count(*) as c FROM categorias"); console.log('CATEGORIAS', r4.rows[0].c);
    const r5 = await p.query("SELECT count(*) as c FROM mesas"); console.log('MESAS', r5.rows[0].c);
    const r6 = await p.query("SELECT id, nome, categoria_id, preco, ativo, unidade FROM produtos LIMIT 3"); console.log('PROD sample', JSON.stringify(r6.rows,null,2));
    const r7 = await p.query("SELECT id, nome, tipo, preco, limite, ativo FROM adicionais LIMIT 5"); console.log('ADIC sample', JSON.stringify(r7.rows,null,2));
    const r8 = await p.query("SELECT id, nome, taxa_entrega, atendido FROM bairros LIMIT 3"); console.log('BAIRROS', JSON.stringify(r8.rows,null,2));
    const r9 = await p.query("SELECT id, status FROM pedidos ORDER BY id DESC LIMIT 3"); console.log('PEDIDOS sample', JSON.stringify(r9.rows,null,2));
    await p.end();
  }catch(e){ console.error(e.message); console.error(e.stack); try{await p.end()}catch(_){}
  }
})();
