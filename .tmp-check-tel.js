require('dotenv').config();
const db=require('./src/db/database');
(async()=>{
 await db.initialize();
 const raw='83998044441';
 const digits=raw.replace(/\D/g,'');
 console.log('digits',digits);
 const all=await db.all("SELECT id,nome,telefone FROM clientes ORDER BY id DESC LIMIT 15");
 all.forEach(r=> console.log(r.id, r.telefone, '=>', String(r.telefone).replace(/\D/g,'')));
 const c1=await db.get("SELECT * FROM clientes WHERE regexp_replace(telefone, '[^0-9]', '', 'g') = $1 LIMIT 1", digits);
 console.log('exact match c1', c1? c1.telefone+' id='+c1.id : 'null');
 const c2=await db.get("SELECT * FROM clientes WHERE regexp_replace(telefone, '[^0-9]', '', 'g') LIKE '%'+$1 LIMIT 1", digits.slice(-8));
 console.log('like last8', c2? c2.telefone : 'null');
 const encoded='(83) 99804-4441';
 console.log('encoded test', encoded.replace(/\D/g,''));
 const c3=await db.get("SELECT * FROM clientes WHERE regexp_replace(telefone, '[^0-9]', '', 'g') = $1 LIMIT 1", '83998044441');
 console.log('c3',c3);
 await db.close();
})();
