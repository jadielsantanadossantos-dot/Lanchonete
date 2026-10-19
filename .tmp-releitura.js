const BASE='https://andersonlanches.vercel.app';
const jwt=require('jsonwebtoken'); require('dotenv').config();
const SECRET=process.env.JWT_SECRET;
function tok(p='admin',id=1,u='demo'){return jwt.sign({id,usuario:u,nome:'Demo',perfil:p,trocar_senha:false},SECRET,{expiresIn:'2h'})}
const adminTok=tok('admin',1,'demo');
const garcomTok=tok('garcom',2,'garcom');
const fakeTok=tok('admin',99999,'fantasma');
async function fj(path,opts={}){const r=await fetch(BASE+path,opts);const ct=r.headers.get('content-type')||'';const text=await r.text();let body=null;try{if(ct.includes('json'))body=JSON.parse(text)}catch(e){}return{status:r.status,headers:r.headers,body,text}}
function H(t){return{Authorization:'Bearer '+t}}
const out=[];
function log(n,ok,d){out.push({n,ok,d});console.log(`${ok?'[OK]':'[FAIL]'} ${n} ${d||''}`.slice(0,700))}
;(async()=>{
  console.log('=== HEADERS POS-FIX ===');
  const rh=await fj('/health'); log('GET /health 200 BRT', rh.status===200 && rh.body.timezone==='America/Sao_Paulo', JSON.stringify(rh.body));
  const rHome=await fj('/'); log('GET / CSP via vercel.json', !!rHome.headers.get('content-security-policy'), (rHome.headers.get('content-security-policy')||'').slice(0,100));
  log('GET / HSTS', !!rHome.headers.get('strict-transport-security'), rHome.headers.get('strict-transport-security')||'');
  const rApi=await fj('/api/config'); log('GET /api/config Cache-Control no-store', (rApi.headers.get('cache-control')||'').includes('no-store'), rApi.headers.get('cache-control'));
  log('GET /api/config CSP', !!rApi.headers.get('content-security-policy'), (rApi.headers.get('content-security-policy')||'').slice(0,80));
  const rAdmin=await fj('/admin'); log('GET /admin CSP', !!rAdmin.headers.get('content-security-policy'), 'ok');
  console.log('\n=== AUTH POS-FIX ===');
  const rFake=await fj('/api/auth/usuarios',{headers:H(fakeTok)}); log('Token fantasma (id 99999) agora 401', rFake.status===401, `status=${rFake.status} ${JSON.stringify(rFake.body).slice(0,150)}`);
  const rGarcomUser=await fj('/api/auth/usuarios',{headers:H(garcomTok)}); log('Garcom GET usuarios 403', rGarcomUser.status===403, `status=${rGarcomUser.status}`);
  const rAdminUser=await fj('/api/auth/usuarios',{headers:H(adminTok)}); log('Admin GET usuarios 200', rAdminUser.status===200 && Array.isArray(rAdminUser.body), `len=${rAdminUser.body.length}`);
  console.log('\n=== VALIDACOES POS-FIX ===');
  const rCatVazia=await fj('/api/categorias',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:'',ordem:0})}); log('POST categoria nome vazio 400', rCatVazia.status===400, `status=${rCatVazia.status} ${JSON.stringify(rCatVazia.body).slice(0,150)}`);
  const rCat1=await fj('/api/categorias',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:'A',ordem:0})}); log('POST categoria nome 1 char 400', rCat1.status===400, `status=${rCat1.status}`);
  const xss='<script>alert(1)</script>'; const rCatXss=await fj('/api/categorias',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:xss,ordem:99})});
  if(rCatXss.body&&rCatXss.body.id){ const all=await fj('/api/categorias'); const found=all.body.find(c=>c.id===rCatXss.body.id); log('POST categoria XSS sanitizado', !String(found.nome).includes('<script>'), `nome=${found.nome}`); await fj(`/api/categorias/${rCatXss.body.id}`,{method:'DELETE',headers:H(adminTok)}); } else log('POST categoria XSS bloqueado/incorreto', rCatXss.status===400, `status=${rCatXss.status}`);
  if(rCat1.body&&rCat1.body.id) await fj(`/api/categorias/${rCat1.body.id}`,{method:'DELETE',headers:H(adminTok)});
  if(rCatVazia.body&&rCatVazia.body.id) await fj(`/api/categorias/${rCatVazia.body.id}`,{method:'DELETE',headers:H(adminTok)});
  const catR=await fj('/api/categorias'); const catId=catR.body[0].id;
  const rAdicNeg=await fj('/api/adicionais',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:'ADIC_NEG2',preco:-5,categoria_id:catId,tipo:'adicional'})}); log('POST adicional preco -5 400', rAdicNeg.status===400, `status=${rAdicNeg.status} ${JSON.stringify(rAdicNeg.body).slice(0,150)}`);
  if(rAdicNeg.body&&rAdicNeg.body.id) await fj(`/api/adicionais/${rAdicNeg.body.id}`,{method:'DELETE',headers:H(adminTok)});
  const rAdicNomeCurto=await fj('/api/adicionais',{method:'POST',headers:{'Content-Type':'application/json',...H(adminTok)},body:JSON.stringify({nome:'A',preco:2,categoria_id:catId})}); log('POST adicional nome curto 400', rAdicNomeCurto.status===400, `status=${rAdicNomeCurto.status} ${JSON.stringify(rAdicNomeCurto.body).slice(0,100)}`);
  if(rAdicNomeCurto.body&&rAdicNomeCurto.body.id) await fj(`/api/adicionais/${rAdicNomeCurto.body.id}`,{method:'DELETE',headers:H(adminTok)});
  console.log('\n=== COMANDAS POS-FIX ===');
  const mesasR=await fj('/api/mesas',{headers:H(garcomTok)}); const mesaLivre=mesasR.body.find(m=>m.status==='livre')||mesasR.body[0]; const mesaId=mesaLivre.id;
  const prodR=await fj('/api/produtos/ativos'); const pSimples=prodR.body.find(x=>!/pizza/i.test(x.categoria_nome||''))||prodR.body[0];
  const rQtd0=await fj(`/api/comandas/mesa/${mesaId}/item`,{method:'POST',headers:{'Content-Type':'application/json',...H(garcomTok)},body:JSON.stringify({produto_id:pSimples.id,quantidade:0,unidade:'un'})}); log('POST comanda qtd 0 agora 400', rQtd0.status===400, `status=${rQtd0.status} ${JSON.stringify(rQtd0.body).slice(0,150)}`);
  // se 400, garantir que não criou item fantasma
  const rCom=await fj(`/api/comandas/mesa/${mesaId}`,{headers:H(garcomTok)}); log('GET comanda após qtd 0 deve estar vazia/fechada', rCom.status===200, `aberta=${rCom.body.aberta} itens=${rCom.body.itens.length}`);
  // cleanup se criou
  if(rCom.body.aberta && rCom.body.itens.length>0){ await fj(`/api/comandas/mesa/${mesaId}/liberar`,{method:'POST',headers:{'Content-Type':'application/json',...H(garcomTok)},body:JSON.stringify({forcar:true})}); }
  console.log('\n=== RESUMO RELEITURA ===');
  const fails=out.filter(x=>!x.ok); console.log(`Pass ${out.length-fails.length} Fail ${fails.length} Total ${out.length}`); fails.forEach(f=>console.log('  FAIL',f.n,f.d));
})();
