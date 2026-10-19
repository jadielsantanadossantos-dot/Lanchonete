require('dotenv').config();
const db=require('./src/db/database');
(async()=>{
 await db.initialize();
 const raw='83998044441';
 const digits=raw.replace(/\D/g,'');
 console.log('digits',digits, 'len',digits.length);
 const all=await db.all('SELECT id,nome,telefone FROM clientes ORDER BY id DESC LIMIT 20');
 all.forEach(r=>{ const d=String(r.telefone).replace(/\D/g,''); console.log(r.id, JSON.stringify(r.telefone), '=>', d, d===digits ? 'MATCH' : '') });
 const c1=await db.get("SELECT * FROM clientes WHERE regexp_replace(telefone, '[^0-9]', '', 'g') = $1 LIMIT 1", digits);
 console.log('exact match c1', c1? (c1.telefone+' id='+c1.id) : 'null');
 if(!c1){
   const suffix=digits.slice(-8);
   console.log('try suffix',suffix);
   const c2=await db.all("SELECT id,telefone FROM clientes WHERE regexp_replace(telefone, '[^0-9]', '', 'g') LIKE '%' || $1 LIMIT 5", suffix);
   console.log('like suffix', c2);
 }
 await db.close();
})();
