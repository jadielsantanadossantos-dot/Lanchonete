const BASE='https://andersonlanches.vercel.app';
const jwt=require('jsonwebtoken'); require('dotenv').config();
const SECRET=process.env.JWT_SECRET;
function tok(id, usuario, perfil){return jwt.sign({id, usuario, nome:usuario, perfil, trocar_senha:false}, SECRET, {expiresIn:'2h'})}
const adminTok = tok(10,'jadiel','admin');
const garcomTok = tok(21,'vitor','garcom');
const fakeTok = tok(99999,'fantasma','admin');
async function fj(p,opts={}){const r=await fetch(BASE+p,opts);const ct=r.headers.get('content-type')||'';const t=await r.text();let b=null;try{if(ct.includes('json'))b=JSON.parse(t)}catch(e){}return{status:r.status,headers:r.headers,body:b,text:t}}
const H=t=>({Authorization:'Bearer '+t});
const out=[];
function log(n,ok,d){out.push({n,ok,d});console.log(`${ok?'[OK]':'[FAIL]'} ${n} ${d||''}`.slice(0,700))}
;(async()=>{
  console.log('=== 1. HEALTH & HEADERS (producao) ===');
  const h=await fj('/health'); log('GET /health 200 BRT timezone', h.status===200 && h.body.timezone==='America/Sao_Paulo', JSON.stringify(h.body));
  const home=await fj('/?cb='+Date.now()); log('GET / CSP (vercel.json)', !!home.headers.get('content-security-policy'), (home.headers.get('content-security-policy')||'').slice(0,120) || 'SEM CSP (deploy ainda propagando)');
  log('GET / HSTS', !!home.headers.get('strict-transport-security'), home.headers.get('strict-transport-security')||'');
  const api=await fj('/api/config?cb='+Date.now()); log('GET /api/config Cache-Control no-store', (api.headers.get('cache-control')||'').includes('no-store'), api.headers.get('cache-control')||'');
  log('GET /api/config CSP', !!api.headers.get('content-security-policy'), (api.headers.get('content-security-policy')||'').slice(0,80));
  const adm=await fj('/admin?cb='+Date.now()); log('GET /admin CSP', !!adm.headers.get('content-security-policy'), 'ok');
  const vercelCSP = home.headers.get('content-security-policy');
  if(!vercelCSP) console.log('NOTA: vercel.json headers para "/" precisam de redeploy Vercel (propagação ~1-2min após push 9f5aae5)');
  console.log('\n=== 2. AUTH POS-FIX (token valida no DB) ===');
  const rFake=await fj('/api/auth/usuarios',{headers:H(fakeTok)}); log('Token fantasma id 99999 -> 401 (corrigido)', rFake.status===401, `status=${rFake.status} ${JSON.stringify(rFake.body).slice(0,120)}`);
  const rGarcomUser=await fj('/api/auth/usuarios',{headers:H(garcomTok)}); log('Garcom GET /usuarios -> 403 (admin only)', rGarcomUser.status===403, `status=${rGarcomUser.status}`);
  const rAdminUser=await fj('/api/auth/usuarios',{headers:H(adminTok)}); log('Admin GET /usuarios -> 200', rAdminUser.status===200 && Array.isArray(rAdminUser.body), `status=${rAdminUser.status} len=${rAdminUser.body.length}`);
  const rMeAdmin=await fj('/api/auth/me',{headers:H(adminTok)}); log('GET /me admin jadiel', rMeAdmin.status===200 && rMeAdmin.body.perfil==='admin', JSON.stringify(rMeAdmin.body).slice(0,120));
  const rMeGarcom=await fj('/api/auth/me',{headers:H(garcomTok)}); log('GET /me garcom vitor', rMeGarcom.status===200 && rMeGarcom.body.perfil==='garcom', JSON.stringify(rMeGarcom.body).slice(0,100));
  // observador não existe mais
  const obsTok = tok(99,'obs','observador'); const rObs=await fj('/api/auth/me',{headers:H(obsTok)}); log('Observador (removido) -> 403/401', rObs.status===401 || rObs.status===403, `status=${rObs.status} ${JSON.stringify(rObs.body).slice(0,100)} (esperado bloqueado)`);
  console.log('\n=== 3. VALIDACOES POS-FIX ===');
  const rCatVazia=await fj('/api/categorias',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:'',ordem:0})}); log('POST categoria vazia -> 400', rCatVazia.status===400, `status=${rCatVazia.status} ${JSON.stringify(rCatVazia.body).slice(0,120)}`);
  const rCat1=await fj('/api/categorias',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:'A',ordem:0})}); log('POST categoria 1 char -> 400', rCat1.status===400, `status=${rCat1.status}`);
  const xss='<script>alert(1)</script>'; const rCatXss=await fj('/api/categorias',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:xss,ordem:99})});
  let catXssOk=false;
  if(rCatXss.body && rCatXss.body.id){ const all=await fj('/api/categorias'); const f=all.body.find(c=>c.id===rCatXss.body.id); catXssOk = !String(f.nome).includes('<script>'); log('POST categoria XSS sanitizado', catXssOk, `nome salvo="${f.nome}"`); await fj(`/api/categorias/${rCatXss.body.id}`,{method:'DELETE',headers:H(adminTok)}); } else log('POST categoria XSS -> 400 sanitizado', rCatXss.status===400, `status=${rCatXss.status}`);
  if(rCat1.body && rCat1.body.id) await fj(`/api/categorias/${rCat1.body.id}`,{method:'DELETE',headers:H(adminTok)});
  if(rCatVazia.body && rCatVazia.body.id) await fj(`/api/categorias/${rCatVazia.body.id}`,{method:'DELETE',headers:H(adminTok)});
  const cats=await fj('/api/categorias'); const catId=cats.body[0].id;
  const rAdicNeg=await fj('/api/adicionais',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:'ADIC_NEG_X',preco:-5,categoria_id:catId,tipo:'adicional'})}); log('POST adicional preco -5 -> 400', rAdicNeg.status===400, `status=${rAdicNeg.status} ${JSON.stringify(rAdicNeg.body).slice(0,120)}`);
  if(rAdicNeg.body && rAdicNeg.body.id) await fj(`/api/adicionais/${rAdicNeg.body.id}`,{method:'DELETE',headers:H(adminTok)});
  const rAdicCurto=await fj('/api/adicionais',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:'A',preco:2,categoria_id:catId})}); log('POST adicional nome curto -> 400', rAdicCurto.status===400, `status=${rAdicCurto.status}`);
  if(rAdicCurto.body && rAdicCurto.body.id) await fj(`/api/adicionais/${rAdicCurto.body.id}`,{method:'DELETE',headers:H(adminTok)});
  // teste adicional válido + delete
  const rAdicOk=await fj('/api/adicionais',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:'ADIC_TMP_RELEITURA',preco:3,categoria_id:catId,tipo:'adicional'})}); log('POST adicional valido -> 200', rAdicOk.status===200 && !!rAdicOk.body.id, JSON.stringify(rAdicOk.body).slice(0,120)); if(rAdicOk.body && rAdicOk.body.id) await fj(`/api/adicionais/${rAdicOk.body.id}`,{method:'DELETE',headers:H(adminTok)});
  // categoria válida
  const rCatOk=await fj('/api/categorias',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:'CAT_RELEITURA_'+Date.now(),ordem:88})}); log('POST categoria valida -> 200', rCatOk.status===200 && !!rCatOk.body.id, JSON.stringify(rCatOk.body).slice(0,120)); if(rCatOk.body && rCatOk.body.id) await fj(`/api/categorias/${rCatOk.body.id}`,{method:'DELETE',headers:H(adminTok)});
  console.log('\n=== 4. COMANDA qtd 0 POS-FIX ===');
  const mesasR=await fj('/api/mesas',{headers:H(garcomTok)}); const mesaLivre=Array.isArray(mesasR.body)? mesasR.body.find(m=>m.status==='livre')||mesasR.body[0] : null;
  if(!mesaLivre) { log('GET mesas para comanda', false, 'sem mesa'); } else {
    const mesaId=mesaLivre.id; console.log(`  mesa usada: ${mesaId} ${mesaLivre.nome}`);
    const prodR=await fj('/api/produtos/ativos'); const pSimples=prodR.body.find(x=>!/pizza/i.test(x.categoria_nome||''))||prodR.body[0];
    const rQtd0=await fj(`/api/comandas/mesa/${mesaId}/item`,{method:'POST',headers:{'Content-Type':'application/json',...H(garcomTok)},body:JSON.stringify({produto_id:pSimples.id,quantidade:0,unidade:'un'})}); log('POST comanda qtd 0 -> 400 (não mais silencioso)', rQtd0.status===400, `status=${rQtd0.status} ${JSON.stringify(rQtd0.body).slice(0,120)}`);
    const rQtdNeg=await fj(`/api/comandas/mesa/${mesaId}/item`,{method:'POST',headers:{'Content-Type':'application/json',...H(garcomTok)},body:JSON.stringify({produto_id:pSimples.id,quantidade:-1,unidade:'un'})}); log('POST comanda qtd -1 -> 400', rQtdNeg.status===400, `status=${rQtdNeg.status}`);
    const rCom=await fj(`/api/comandas/mesa/${mesaId}`,{headers:H(garcomTok)}); log('GET comanda após qtd invalida segue coerente', rCom.status===200, `aberta=${rCom.body.aberta} itens=${rCom.body.itens?.length||0}`);
    if(rCom.body.aberta && rCom.body.itens.length>0){ await fj(`/api/comandas/mesa/${mesaId}/liberar`,{method:'POST',headers:{'Content-Type':'application/json',...H(garcomTok)},body:JSON.stringify({forcar:true})}); }
  }
  console.log('\n=== 5. ENDPOINTS CRITICOS (RBAC) ===');
  log('GET categorias publico 200', (await fj('/api/categorias')).status===200, '');
  log('GET produtos publico 200', (await fj('/api/produtos/ativos')).status===200, '');
  log('POST categoria sem auth 401', (await fj('/api/categorias',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:'X'})})).status===401, '');
  log('POST categoria como garcom 403', (await fj('/api/categorias',{method:'POST',headers:{'Content-Type':'application/json',...H(garcomTok)},body:JSON.stringify({nome:'GarcomCat'})})).status===403, '');
  log('GET /api/pedidos sem auth 401', (await fj('/api/pedidos')).status===401, '');
  log('GET /api/mesas sem auth 401', (await fj('/api/mesas')).status===401, '');
  console.log('\n=== RESUMO RELEITURA ===');
  const fails=out.filter(x=>!x.ok); console.log(`Pass ${out.length-fails.length} Fail ${fails.length} Total ${out.length}`); fails.forEach(f=>console.log('  FAIL',f.n,f.d));
})();
