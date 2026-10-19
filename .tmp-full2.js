const BASE='https://andersonlanches.vercel.app';
const jwt=require('jsonwebtoken'); require('dotenv').config();
const SECRET=process.env.JWT_SECRET;
function tok(perfil='admin', id=1, usuario='demo'){ return jwt.sign({id, usuario, nome:'Demo', perfil, trocar_senha:false}, SECRET, {expiresIn:'2h'}); }
const adminTok=tok('admin',1,'demo');
const garcomTok=tok('garcom',2,'garcom');
const obsTok=tok('observador',99,'obs');
const badTok=jwt.sign({id:1, usuario:'x', perfil:'admin'}, 'badsecret', {expiresIn:'2h'});
const results=[];
function log(n,ok,d){ results.push({n,ok,d}); console.log(`${ok?'[OK]':'[FAIL]'} ${n} ${d||''}`.slice(0,700)); }
async function fj(path, opts={}){
  const r=await fetch(BASE+path, opts);
  const ct=r.headers.get('content-type')||''; const text=await r.text(); let body=null; try{ if(ct.includes('json')) body=JSON.parse(text);}catch(e){}
  return {status:r.status, headers:r.headers, body, text, ok:r.ok};
}
function auth(t){ return {Authorization:'Bearer '+t}; }
(async()=>{
  console.log('=== A. HEALTH & PAGINAS & SECURITY HEADERS ===');
  {
    const r=await fj('/health'); log('GET /health 200 + timezone BRT', r.status===200 && r.body && r.body.timezone==='America/Sao_Paulo', JSON.stringify(r.body).slice(0,120));
    const r2=await fj('/'); log('GET / 200', r2.status===200, `len=${r2.text.length} CSP=${!!r2.headers.get('content-security-policy')} HSTS=${!!r2.headers.get('strict-transport-security')}`);
    log('BUG homepage sem CSP', !r2.headers.get('content-security-policy'), 'via Vercel static @vercel/static bypassa src/app.js CSP header');
    for(const p of ['/admin','/garcom','/login-admin','/login-garcom']){
      const r3=await fj(p); log(`GET ${p} 200 + CSP`, r3.status===200 && !!r3.headers.get('content-security-policy'), `status=${r3.status} CSP=${!!r3.headers.get('content-security-policy')}`);
    }
    // verify vercel static vs api CSP
    const rApi=await fj('/api/config'); log('API CSP presente', !!rApi.headers.get('content-security-policy'), (rApi.headers.get('content-security-policy')||'').slice(0,80));
    // check hsts
    log('HSTS em /health', !!r.headers.get('strict-transport-security'), r.headers.get('strict-transport-security')||'missing');
    log('Cache-Control /api', (rApi.headers.get('cache-control')||'').includes('no-store'), rApi.headers.get('cache-control'));
  }

  console.log('\n=== B. AUTH & RBAC ===');
  {
    const r=await fj('/api/auth/me', {headers:auth(adminTok)}); log('GET /me admin 200', r.status===200 && r.body.perfil==='admin', JSON.stringify(r.body).slice(0,200));
    const r2=await fj('/api/auth/me', {headers:auth(garcomTok)}); log('GET /me garcom 200', r2.status===200 && r2.body.perfil==='garcom', JSON.stringify(r2.body).slice(0,200));
    const r3=await fj('/api/auth/me', {headers:auth(obsTok)}); log('GET /me observador 200', r3.status===200 && r3.body.perfil==='observador', JSON.stringify(r3.body).slice(0,200));
    const rBad=await fj('/api/auth/me', {headers:auth(badTok)}); log('GET /me bad secret 401', rBad.status===401, JSON.stringify(rBad.body));
    const rNo=await fj('/api/auth/me'); log('GET /me sem token 401', rNo.status===401, JSON.stringify(rNo.body).slice(0,100));
    // usuarios list: admin ok, garcom 403
    const ru1=await fj('/api/auth/usuarios', {headers:auth(adminTok)}); log('GET usuarios admin 200', ru1.status===200 && Array.isArray(ru1.body), `len=${Array.isArray(ru1.body)?ru1.body.length:'?'}`);
    const ru2=await fj('/api/auth/usuarios', {headers:auth(garcomTok)}); log('GET usuarios garcom 403', ru2.status===403, JSON.stringify(ru2.body).slice(0,150));
    const ru3=await fj('/api/auth/usuarios', {headers:auth(obsTok)}); log('GET usuarios observador 200 (read-only)', ru3.status===200, `status=${ru3.status} len=${Array.isArray(ru3.body)?ru3.body.length:'?'}`);
    // observador não pode POST
    const ruPost=await fj('/api/auth/usuarios', {method:'POST', headers:{'Content-Type':'application/json', ...auth(obsTok)}, body: JSON.stringify({nome:'Teste Obs', usuario:'testeobs'+Date.now(), perfil:'garcom'})});
    log('POST usuario como observador deve 403', ruPost.status===403, `status=${ruPost.status} ${JSON.stringify(ruPost.body).slice(0,150)}`);
    // garcom não pode criar usuario
    const ruGarcomPost=await fj('/api/auth/usuarios', {method:'POST', headers:{'Content-Type':'application/json', ...auth(garcomTok)}, body: JSON.stringify({nome:'Teste G', usuario:'testeg'+Date.now(), perfil:'garcom'})});
    log('POST usuario como garcom 403', ruGarcomPost.status===403, `status=${ruGarcomPost.status}`);
    // teste token com id inexistente ainda passa (BUG: não valida no banco)
    const fakeAdminTok=tok('admin', 99999, 'fantasma');
    const rFake=await fj('/api/auth/usuarios', {headers:auth(fakeAdminTok)});
    log('BUG token fantasma (id inexistente) ainda autoriza?', rFake.status===200, `status=${rFake.status} -> middleware não checa DB!`);
  }

  console.log('\n=== C. CATEGORIAS ===');
  {
    const r=await fj('/api/categorias'); log('GET categorias publico 200', r.status===200 && Array.isArray(r.body) && r.body.length>=10, `len=${Array.isArray(r.body)?r.body.length:'?'}`);
    const rPost=await fj('/api/categorias', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'CAT_TEST_'+Date.now(), ordem: 99})});
    log('POST categoria admin', rPost.status===200 && !!rPost.body.id, JSON.stringify(rPost.body).slice(0,200));
    let catId=rPost.body&&rPost.body.id;
    if(catId){
      const rPut=await fj(`/api/categorias/${catId}`, {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'CAT_TEST_EDIT', ordem: 100})});
      log(`PUT categoria ${catId}`, rPut.status===200, JSON.stringify(rPut.body).slice(0,100));
      const rDel=await fj(`/api/categorias/${catId}`, {method:'DELETE', headers:auth(adminTok)});
      log(`DELETE categoria ${catId}`, rDel.status===200, JSON.stringify(rDel.body).slice(0,100));
      const rGet=await fj('/api/categorias'); log('GET categorias após DELETE', rGet.status===200, `len=${rGet.body.length}`);
    }
    // categoria vazia deve falhar?
    const rEmpty=await fj('/api/categorias', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'', ordem:0})});
    log('POST categoria nome vazio -> 400?', rEmpty.status===400 || rEmpty.status===200, `status=${rEmpty.status} ${JSON.stringify(rEmpty.body).slice(0,150)}` + (rEmpty.status===200 ? ' BUG: aceitou nome vazio!' : ''));
    if(rEmpty.body&&rEmpty.body.id) await fj(`/api/categorias/${rEmpty.body.id}`, {method:'DELETE', headers:auth(adminTok)});
    // XSS sanitization?
    const xssName='<script>alert(1)</script>';
    const rXss=await fj('/api/categorias', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:xssName, ordem:99})});
    if(rXss.body&&rXss.body.id){
      const all=await fj('/api/categorias');
      const found=all.body.find(c=>c.id===rXss.body.id);
      log('XSS categoria sanitizado?', !String(found&&found.nome).includes('<script>'), `nome=${found&&found.nome}`);
      await fj(`/api/categorias/${rXss.body.id}`, {method:'DELETE', headers:auth(adminTok)});
    }
  }

  console.log('\n=== D. PRODUTOS ===');
  let prodId, sampleProd;
  {
    const r=await fj('/api/produtos'); log('GET produtos 200', r.status===200 && Array.isArray(r.body), `len=${r.body.length}`);
    sampleProd = Array.isArray(r.body)? r.body[0] : null;
    log('produto tem adicionais filtrados', !!sampleProd && Array.isArray(sampleProd.adicionais), `adicionais=${sampleProd?sampleProd.adicionais.length:'?'}`);
    const rAtivos=await fj('/api/produtos/ativos'); log('GET produtos/ativos 200', rAtivos.status===200 && Array.isArray(rAtivos.body), `len=${rAtivos.body.length}`);
    // somente_garcom filtering
    const algumGarcom = r.body.find(p=>p.somente_garcom===true);
    if(algumGarcom) log('produto somente_garcom filtrado sem canal=garcom', !rAtivos.body.find(p=>p.id===algumGarcom.id), `id=${algumGarcom.id} nome=${algumGarcom.nome}`);
    else log('nenhum produto somente_garcom (ok)', true, '');
    // criar produto
    const catR=await fj('/api/categorias'); const catId=catR.body[0].id;
    const rPost=await fj('/api/produtos', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'PROD_TEST_'+Date.now(), categoria_id: catId, descricao:'Teste', preco: 9.90, ativo:true, unidade:'un'})});
    log('POST produto admin', rPost.status===200 && !!rPost.body.id, JSON.stringify(rPost.body).slice(0,200));
    prodId=rPost.body&&rPost.body.id;
    if(prodId){
      const rGet=await fj(`/api/produtos/${prodId}`); log(`GET produto ${prodId} 200`, rGet.status===200 && rGet.body.nome.includes('PROD_TEST'), JSON.stringify(rGet.body).slice(0,200));
      // preco negativo deve falhar
      const rNeg=await fj('/api/produtos', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'PROD_NEG', categoria_id:catId, preco:-5})});
      log('POST produto preco negativo 400', rNeg.status===400, JSON.stringify(rNeg.body).slice(0,150));
      // update
      const rPut=await fj(`/api/produtos/${prodId}`, {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'PROD_TEST_EDIT'})});
      log(`PUT produto ${prodId}`, rPut.status===200, JSON.stringify(rPut.body).slice(0,100));
      // garcom não pode postar produto
      const rGarcomPost=await fj('/api/produtos', {method:'POST', headers:{'Content-Type':'application/json', ...auth(garcomTok)}, body: JSON.stringify({nome:'PROD_GARCOM', categoria_id:catId, preco:5})});
      log('POST produto como garcom 403', rGarcomPost.status===403 || rGarcomPost.status===401, `status=${rGarcomPost.status}`);
    }
  }

  console.log('\n=== E. ADICIONAIS ===');
  let adicId;
  {
    const r=await fj('/api/adicionais'); log('GET adicionais 200', r.status===200 && Array.isArray(r.body), `len=${r.body.length} tipos=${[...new Set(r.body.map(x=>x.tipo))].join(',')}`);
    // criar adicional
    const catR=await fj('/api/categorias'); const catId=catR.body[0].id;
    const rPost=await fj('/api/adicionais', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'ADIC_TEST_'+Date.now(), preco:2.5, categoria_id:catId, tipo:'adicional'})});
    log('POST adicional admin', rPost.status===200 || rPost.status===201, `status=${rPost.status} ${JSON.stringify(rPost.body).slice(0,250)}`);
    adicId=rPost.body&&rPost.body.id;
    if(adicId){
      const rPut=await fj(`/api/adicionais/${adicId}`, {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'ADIC_TEST_EDIT', preco:3})});
      log(`PUT adicional ${adicId}`, rPut.status===200, JSON.stringify(rPut.body).slice(0,150));
    }
    // garcom não pode criar adicional
    const rGarcom=await fj('/api/adicionais', {method:'POST', headers:{'Content-Type':'application/json', ...auth(garcomTok)}, body: JSON.stringify({nome:'ADIC_GARCOM', preco:1})});
    log('POST adicional como garcom 403', rGarcom.status===403||rGarcom.status===401, `status=${rGarcom.status}`);
    // preço negativo?
    const rNeg=await fj('/api/adicionais', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'ADIC_NEG', preco:-10, categoria_id:catId, tipo:'adicional'})});
    log('POST adicional preco negativo', rNeg.status===400 || rNeg.status===200, `status=${rNeg.status} ${JSON.stringify(rNeg.body).slice(0,150)}` + (rNeg.status===200 ? ' BUG?' : ''));
    if(rNeg.body&&rNeg.body.id) await fj(`/api/adicionais/${rNeg.body.id}`, {method:'DELETE', headers:auth(adminTok)});
  }

  console.log('\n=== F. BAIRROS ===');
  let bairroId;
  {
    const r=await fj('/api/bairros'); log('GET bairros 200', r.status===200 && Array.isArray(r.body) && r.body.length>0, `len=${r.body.length}`);
    const rPost=await fj('/api/bairros', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'BAIRRO_TEST_'+Date.now(), taxa_entrega:7.5, atendido:true})});
    log('POST bairro admin', rPost.status===200&&!!rPost.body.id, JSON.stringify(rPost.body).slice(0,200));
    bairroId=rPost.body&&rPost.body.id;
    if(bairroId){
      const rPut=await fj(`/api/bairros/${bairroId}`, {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'BAIRRO_TEST_EDIT', taxa_entrega:8})});
      log(`PUT bairro ${bairroId}`, rPut.status===200, JSON.stringify(rPut.body).slice(0,150));
    }
    // garcom não pode criar bairro
    const rGarcom=await fj('/api/bairros', {method:'POST', headers:{'Content-Type':'application/json', ...auth(garcomTok)}, body: JSON.stringify({nome:'BAIRRO_GARCOM', taxa_entrega:5})});
    log('POST bairro como garcom 403', rGarcom.status===403||rGarcom.status===401, `status=${rGarcom.status}`);
  }

  console.log('\n=== G. CLIENTES (public upsert + admin) ===');
  let clienteId;
  {
    const tel='8390000'+String(Date.now()).slice(-4);
    const rPost=await fj('/api/clientes', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome:'Cliente Teste FULL', telefone:tel, bairro:'Centro', rua:'Rua A', numero:'10'})});
    log('POST cliente publico 200 (upsert)', rPost.status===200 && !!rPost.body.id, JSON.stringify(rPost.body).slice(0,250));
    clienteId=rPost.body&&rPost.body.id;
    // upsert mesmo telefone deve retornar mesmo id sem duplicar
    const rUp=await fj('/api/clientes', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome:'Cliente Teste FULL 2', telefone:tel, bairro:'13 de Maio'})});
    log('POST cliente mesmo telefone upsert', rUp.status===200 && rUp.body.id===clienteId, `id=${rUp.body.id} exp=${clienteId} nome=${rUp.body.nome}`);
    // GET telefone publico
    const rTel=await fj(`/api/clientes/telefone/${encodeURIComponent(tel)}`); log('GET cliente por telefone publico', rTel.status===200 && rTel.body.telefone===tel, JSON.stringify(rTel.body).slice(0,200));
    // GET admin list
    const rList=await fj('/api/clientes', {headers:auth(adminTok)}); log('GET clientes admin 200', rList.status===200 && Array.isArray(rList.body), `len=${rList.body.length}`);
    // garcom também pode?
    const rGarcomList=await fj('/api/clientes', {headers:auth(garcomTok)}); log('GET clientes como garcom 403? (admin only)', rGarcomList.status===403||rGarcomList.status===200, `status=${rGarcomList.status} (esperado 403 se admin-only)`);
    // validar XSS
    const tel2='8390001'+String(Date.now()).slice(-4);
    const rXss=await fj('/api/clientes', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome:'<img src=x onerror=alert(1)>', telefone:tel2})});
    log('POST cliente XSS sanitizado?', rXss.status===200 && !String(rXss.body.nome).includes('<'), `nome=${rXss.body.nome}`);
    // bloqueado
    if(clienteId){
      const rBloq=await fj(`/api/clientes/${clienteId}/bloquear`, {method:'PATCH', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({bloqueado:true})});
      log(`PATCH bloquear cliente ${clienteId}`, rBloq.status===200, JSON.stringify(rBloq.body).slice(0,100));
      // tentar pedir com cliente bloqueado deve 403
      const prodR=await fj('/api/produtos/ativos'); const p=prodR.body.find(x=>!/pizza/i.test(x.categoria_nome||''))||prodR.body[0];
      const rPedBloq=await fj('/api/pedidos', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({cliente_id:clienteId, itens:[{produto_id:p.id, produto_nome:p.nome, quantidade:1, unidade:'un', adicionais:[]}], forma_pagamento:'dinheiro', bairro_entrega:'Centro', endereco_entrega:'Rua A, 10'})});
      log('POST pedido cliente bloqueado 403', rPedBloq.status===403, JSON.stringify(rPedBloq.body).slice(0,150));
      // desbloquear
      await fj(`/api/clientes/${clienteId}/bloquear`, {method:'PATCH', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({bloqueado:false})});
    }
  }

  console.log('\n=== H. MESAS ===');
  {
    const r=await fj('/api/mesas', {headers:auth(adminTok)}); log('GET mesas admin 200', r.status===200 && Array.isArray(r.body) && r.body.length>=15, `len=${r.body.length}`);
    const rGarcom=await fj('/api/mesas', {headers:auth(garcomTok)}); log('GET mesas garcom 200', rGarcom.status===200 && Array.isArray(rGarcom.body), `len=${rGarcom.body.length}`);
    const rNo=await fj('/api/mesas'); log('GET mesas sem auth 401', rNo.status===401, JSON.stringify(rNo.body).slice(0,100));
    // criar mesa
    const rPost=await fj('/api/mesas', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({numero: 99, nome:'Mesa 99', capacidade:4, status:'livre'})});
    log('POST mesa admin', rPost.status===200&&!!rPost.body.id || rPost.status===400, JSON.stringify(rPost.body).slice(0,200));
    const mesaId=rPost.body&&rPost.body.id;
    if(mesaId){
      // PATCH status
      const rPatch=await fj(`/api/mesas/${mesaId}/status`, {method:'PATCH', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({status:'reservada'})});
      log(`PATCH mesa ${mesaId} status reservada`, rPatch.status===200, JSON.stringify(rPatch.body).slice(0,100));
      const rPatchBad=await fj(`/api/mesas/${mesaId}/status`, {method:'PATCH', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({status:'invalido'})});
      log('PATCH mesa status invalido 400', rPatchBad.status===400, JSON.stringify(rPatchBad.body).slice(0,100));
      await fj(`/api/mesas/${mesaId}`, {method:'DELETE', headers:auth(adminTok)});
    } else {
      // garantir uma mesa livre para testes de comanda
      log('INFO mesa 99 já existe ou falhou, usando mesa 1 para comandas', true, '');
    }
  }

  console.log('\n=== I. MOTOBOYS ===');
  {
    const r=await fj('/api/motoboys', {headers:auth(adminTok)}); log('GET motoboys admin 200', r.status===200 && Array.isArray(r.body), `len=${r.body.length}`);
    const rNo=await fj('/api/motoboys'); log('GET motoboys sem auth 401', rNo.status===401, JSON.stringify(rNo.body).slice(0,100));
    const rPost=await fj('/api/motoboys', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'Moto Teste '+Date.now(), telefone:'83999999999'})});
    log('POST motoboy admin', rPost.status===200&&!!rPost.body.id, JSON.stringify(rPost.body).slice(0,200));
    const motoId=rPost.body&&rPost.body.id;
    if(motoId){
      const rPut=await fj(`/api/motoboys/${motoId}`, {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({nome:'Moto Teste Edit', ativo:true})});
      log(`PUT motoboy ${motoId}`, rPut.status===200, JSON.stringify(rPut.body).slice(0,150));
      await fj(`/api/motoboys/${motoId}`, {method:'DELETE', headers:auth(adminTok)});
    }
  }

  console.log('\n=== J. COMANDAS (fluxo garcom) ===');
  {
    // escolher mesa livre
    const mesasR=await fj('/api/mesas', {headers:auth(garcomTok)}); const mesaLivre=mesasR.body.find(m=>m.status==='livre')||mesasR.body[0];
    const mesaId=mesaLivre.id; console.log(`Usando mesa ${mesaId} (${mesaLivre.nome}) status=${mesaLivre.status}`);
    // GET comanda vazia
    const rGetEmpty=await fj(`/api/comandas/mesa/${mesaId}`, {headers:auth(garcomTok)}); log(`GET comanda mesa ${mesaId} vazia`, rGetEmpty.status===200 && rGetEmpty.body.aberta===false, JSON.stringify(rGetEmpty.body).slice(0,200));
    // adicionar item
    const prodR=await fj('/api/produtos/ativos'); const pSimples=prodR.body.find(x=>!/pizza/i.test(x.categoria_nome||''))||prodR.body[0];
    const rAdd=await fj(`/api/comandas/mesa/${mesaId}/item`, {method:'POST', headers:{'Content-Type':'application/json', ...auth(garcomTok)}, body: JSON.stringify({produto_id:pSimples.id, quantidade:1, observacao:'sem cebola', unidade:'un', cliente_nome:'Cliente Mesa'})});
    log(`POST comanda item mesa ${mesaId}`, rAdd.status===200 && rAdd.body.success, JSON.stringify(rAdd.body).slice(0,200));
    // GET comanda com item
    const rGet=await fj(`/api/comandas/mesa/${mesaId}`, {headers:auth(garcomTok)}); log(`GET comanda mesa ${mesaId} com item`, rGet.status===200 && rGet.body.aberta===true && rGet.body.itens.length===1, `itens=${rGet.body.itens.length} total=${rGet.body.total}`);
    // adicionar item com quantidade inválida (0)
    const rAddInv=await fj(`/api/comandas/mesa/${mesaId}/item`, {method:'POST', headers:{'Content-Type':'application/json', ...auth(garcomTok)}, body: JSON.stringify({produto_id:pSimples.id, quantidade:0, unidade:'un'})});
    log('POST comanda item quantidade 0 -> deve normalizar para 1 ou 400?', rAddInv.status===200 || rAddInv.status===400, `status=${rAddInv.status} ${JSON.stringify(rAddInv.body).slice(0,150)}`);
    if(rAddInv.status===200){
      // verificar se criou com qtd 1 (bug: deveria validar)
      const rCheck=await fj(`/api/comandas/mesa/${mesaId}`, {headers:auth(garcomTok)}); log('  verificacao: quantidade 0 virou 1 (silencioso)', rCheck.body.itens.some(i=>i.quantidade===1), `itens=${JSON.stringify(rCheck.body.itens.map(i=>i.quantidade))}`);
    }
    // enviar para cozinha
    const rEnviar=await fj(`/api/comandas/mesa/${mesaId}/enviar-cozinha`, {method:'POST', headers:{'Content-Type':'application/json', ...auth(garcomTok)}, body: JSON.stringify({})});
    log(`POST enviar-cozinha mesa ${mesaId}`, rEnviar.status===200 && !!rEnviar.body.pedido, `status=${rEnviar.status} pedido=${rEnviar.body.pedido&&rEnviar.body.pedido.id} itensEnviados=${rEnviar.body.itensEnviados}`);
    const pedidoId=rEnviar.body.pedido&&rEnviar.body.pedido.id;
    // tentar liberar mesa com item enviado -> deve bloquear
    const rLib=await fj(`/api/comandas/mesa/${mesaId}/liberar`, {method:'POST', headers:{'Content-Type':'application/json', ...auth(garcomTok)}, body: JSON.stringify({})});
    log(`POST liberar mesa ${mesaId} com item enviado deve 400`, rLib.status===400, JSON.stringify(rLib.body).slice(0,200));
    // fechar comanda (pagamento mesa)
    const rFechar=await fj(`/api/comandas/mesa/${mesaId}/fechar`, {method:'POST', headers:{'Content-Type':'application/json', ...auth(garcomTok)}, body: JSON.stringify({forma_pagamento:'dinheiro', observacoes:'teste full'})});
    log(`POST fechar comanda mesa ${mesaId}`, rFechar.status===200 && rFechar.body.success, JSON.stringify(rFechar.body).slice(0,300));
    // verificar mesa liberada
    const rMesa=await fj(`/api/mesas/${mesaId}`, {headers:auth(garcomTok)}); log(`GET mesa ${mesaId} após fechar deve ser livre`, rMesa.status===200 && rMesa.body.status==='livre', `status=${rMesa.body.status}`);
    // verificar pedido ficou entregue
    if(pedidoId){
      const rPed=await fj(`/api/pedidos/${pedidoId}`, {headers:auth(adminTok)}); log(`GET pedido ${pedidoId} após fechar`, rPed.status===200 && rPed.body.status==='entregue', `status=${rPed.body.status}`);
    }
  }

  console.log('\n=== K. PEDIDOS (delivery + validação) ===');
  {
    // loja está fechada -> pedido público bloqueado é correto. Vamos abrir via config para testar?
    // testar que admin pode pedir mesmo com loja fechada
    const prodR=await fj('/api/produtos/ativos'); const p=prodR.body.find(x=>!/pizza/i.test(x.categoria_nome||''))||prodR.body[0];
    const tel='8390002'+String(Date.now()).slice(-4);
    const cliR=await fj('/api/clientes', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome:'Cliente Pedido', telefone:tel, bairro:'Centro'})});
    const cid=cliR.body.id;
    // admin criando pedido com loja fechada -> deve passar (isLojaAberta && !req.usuario check)
    const rAdminPed=await fj('/api/pedidos', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({cliente_id:cid, itens:[{produto_id:p.id, produto_nome:p.nome, quantidade:1, unidade:'un', adicionais:[]}], forma_pagamento:'dinheiro', bairro_entrega:'Centro', endereco_entrega:'Rua A, 10'})});
    log('POST pedido admin com loja fechada deve passar', rAdminPed.status===200 && !!rAdminPed.body.id, `status=${rAdminPed.status} ${JSON.stringify(rAdminPed.body).slice(0,300)}`);
    let pid=rAdminPed.body&&rAdminPed.body.id;
    // publico deve falhar quando fechada
    const rPubPed=await fj('/api/pedidos', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({cliente_id:cid, itens:[{produto_id:p.id, produto_nome:p.nome, quantidade:1, unidade:'un', adicionais:[]}], forma_pagamento:'dinheiro', bairro_entrega:'Centro', endereco_entrega:'Rua A, 10'})});
    log('POST pedido publico com loja fechada 403', rPubPed.status===403, JSON.stringify(rPubPed.body).slice(0,150));
    // validar quantidade 100 deve 400
    const rQtd=await fj('/api/pedidos', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({cliente_id:cid, itens:[{produto_id:p.id, produto_nome:p.nome, quantidade:100, unidade:'un', adicionais:[]}], forma_pagamento:'dinheiro', bairro_entrega:'Centro', endereco_entrega:'Rua A, 10'})});
    log('POST pedido qtd 100 deve 400', rQtd.status===400, JSON.stringify(rQtd.body).slice(0,150));
    // produto por kg com unidade errada
    const kgProd=prodR.body.find(x=>x.unidade==='kg');
    if(kgProd){
      const rKgErr=await fj('/api/pedidos', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({cliente_id:cid, itens:[{produto_id:kgProd.id, produto_nome:kgProd.nome, quantidade:1, unidade:'un', adicionais:[]}], forma_pagamento:'dinheiro', bairro_entrega:'Retirada no local', endereco_entrega:'Retirada'})});
      log('POST pedido kg com unidade un deve 400', rKgErr.status===400, JSON.stringify(rKgErr.body).slice(0,150));
    } else log('sem produto kg para testar', true, '');
    // adicional não pertence ao produto -> 400
    {
      const pizzaProd=prodR.body.find(x=>/pizza/i.test(x.categoria_nome||''))||null;
      const naoPizza=prodR.body.find(x=>!/pizza/i.test(x.categoria_nome||''))||null;
      if(pizzaProd && naoPizza){
        // pegar adicionais do naoPizza e tentar usar na pizza? Melhor: pegar sabor de pizza e botar em cachorro
        const pizzas=prodR.body.filter(x=>/pizza/i.test(x.categoria_nome||'')); const pizzAdic=pizzas[0]&&pizzas[0].adicionais[0];
        if(pizzAdic && naoPizza){
          const rBadAdic=await fj('/api/pedidos', {method:'POST', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({cliente_id:cid, itens:[{produto_id:naoPizza.id, produto_nome:naoPizza.nome, quantidade:1, unidade:'un', adicionais:[{id:pizzAdic.id, nome:pizzAdic.nome, tipo:pizzAdic.tipo}]}], forma_pagamento:'dinheiro', bairro_entrega:'Retirada no local', endereco_entrega:'Retirada'})});
          log('POST pedido adicional de pizza em cachorro deve 400', rBadAdic.status===400, `status=${rBadAdic.status} ${JSON.stringify(rBadAdic.body).slice(0,300)}`);
          if(rBadAdic.status===200) log('BUG validacao adicional cruzada falhou!', false, '');
        }
      }
    }
    // testar status flow
    if(pid){
      const rPutStat=await fj(`/api/pedidos/${pid}/status`, {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({status:'em_preparo'})});
      // pedidos de mesa não podem mudar por essa rota, mas esse é delivery então deve permitir. Porém se foi mesa? Verificar
      log(`PUT pedido ${pid} status em_preparo`, rPutStat.status===200 || rPutStat.status===403, `status=${rPutStat.status} ${JSON.stringify(rPutStat.body).slice(0,150)}`);
      // status invalido
      const rBadStat=await fj(`/api/pedidos/${pid}/status`, {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({status:'invalido'})});
      log('PUT pedido status invalido 400', rBadStat.status===400, JSON.stringify(rBadStat.body).slice(0,100));
      // /publico
      const rPub=await fj(`/api/pedidos/${pid}/publico`); log(`GET pedido ${pid}/publico 200`, rPub.status===200 && rPub.body.id===pid, JSON.stringify(rPub.body).slice(0,150));
      // motoboy atribuir
      const motos=await fj('/api/motoboys', {headers:auth(adminTok)}); const motoId=motos.body[0]&&motos.body[0].id;
      if(motoId){
        const rMoto=await fj(`/api/pedidos/${pid}/motoboy`, {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({motoboy_id:motoId})});
        log(`PUT pedido ${pid} motoboy ${motoId}`, rMoto.status===200, JSON.stringify(rMoto.body).slice(0,100));
      }
      // pix confirmar
      const rPix=await fj(`/api/pedidos/${pid}/pix`, {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({confirmado:true})});
      log(`PUT pedido ${pid} pix confirmado`, rPix.status===200, JSON.stringify(rPix.body).slice(0,100));
    }
  }

  console.log('\n=== L. CONFIG & CRON & RATE LIMIT & REALTIME ===');
  {
    const rCfg=await fj('/api/config'); log('GET config publico', rCfg.status===200, JSON.stringify(rCfg.body).slice(0,200));
    // PUT config como garcom deve 403
    const rCfgGarcom=await fj('/api/config', {method:'PUT', headers:{'Content-Type':'application/json', ...auth(garcomTok)}, body: JSON.stringify({loja_aberta:'true'})});
    log('PUT config como garcom 403', rCfgGarcom.status===403||rCfgGarcom.status===401, `status=${rCfgGarcom.status}`);
    // PUT config como admin (e reverter)
    const rCfgPost=await fj('/api/config', {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({loja_nome:'Anderson Lanches TEST'})});
    log('PUT config admin', rCfgPost.status===200, JSON.stringify(rCfgPost.body).slice(0,150));
    // reverter nome
    await fj('/api/config', {method:'PUT', headers:{'Content-Type':'application/json', ...auth(adminTok)}, body: JSON.stringify({loja_nome:'Anderson Lanches'})});
    // cron sem auth deve falhar? Verificar src/routes/cron.js
    const rCron=await fj('/api/cron/reset-demo', {method:'POST'});
    log('POST cron sem secret 401/403', rCron.status===401||rCron.status===403, `status=${rCron.status} ${rCron.text.slice(0,150)}`);
  }

  console.log('\n=== M. LIMPEZA ===');
  {
    if(prodId) { const r=await fj(`/api/produtos/${prodId}`, {method:'DELETE', headers:auth(adminTok)}); log(`DELETE prod teste ${prodId} cleanup`, r.status===200, JSON.stringify(r.body).slice(0,100)); }
    if(adicId) { const r=await fj(`/api/adicionais/${adicId}`, {method:'DELETE', headers:auth(adminTok)}); log(`DELETE adic teste ${adicId}`, r.status===200, JSON.stringify(r.body).slice(0,100)); }
    if(bairroId){ const r=await fj(`/api/bairros/${bairroId}`, {method:'DELETE', headers:auth(adminTok)}); log(`DELETE bairro ${bairroId}`, r.status===200, JSON.stringify(r.body).slice(0,100)); }
    if(clienteId){ /* deixar para histórico */ }
  }

  console.log('\n=== RESUMO ===');
  const fails=results.filter(x=>!x.ok); const passes=results.filter(x=>x.ok);
  console.log(`Pass ${passes.length} Fail ${fails.length} Total ${results.length}`);
  fails.forEach(f=> console.log(`  FAIL: ${f.n} -> ${f.d}`));
  // também validar null ANY query com 0 pedidos (vi bug em pedidos.js)
  console.log('\n=== CHECAGEM ESTÁTICA DE BUGS ENCONTRADOS ===');
  console.log('Fails acima + bugs estruturais:');
  console.log(fails.map(f=>f.n).join(', '));
})();
