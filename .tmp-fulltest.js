const BASE = 'https://andersonlanches.vercel.app';
const B = (p) => BASE+p;
const results = [];
function log(name, ok, detail){ results.push({name, ok, detail}); const icon=ok?'OK':'FAIL'; console.log(`[${icon}] ${name} ${detail||''}`.slice(0,600)); }
async function fetchJson(path, opts={}){
  const r = await fetch(B(path), opts);
  const ct = r.headers.get('content-type')||'';
  let body=null, text='';
  try{ text = await r.text(); if(ct.includes('json')) body = JSON.parse(text); }catch(e){ body=null; }
  return {status:r.status, headers:r.headers, body, text, ok: r.ok};
}
let token=null, refresh=null, perfil=null;
async function loginDemo(){
  const r = await fetchJson('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({usuario:'demo', senha:'demo'})});
  if(r.status===429){ log('login demo (rate limited)', false, `429 - aguardar 15m - ${JSON.stringify(r.body)}`); return false; }
  if(r.status===200 && r.body && r.body.token){ token=r.body.token; refresh=r.body.refreshToken; perfil=r.body.perfil; log('login demo', true, `perfil=${perfil} status=${r.status}`); return true; }
  log('login demo', false, `${r.status} ${JSON.stringify(r.body).slice(0,500)}`);
  return false;
}
function authH(){ return token ? {Authorization: 'Bearer '+token} : {}; }

(async()=>{
  console.log('=== 1. HEALTH / PAGINAS / HEADERS ===');
  for(const p of ['/health','/','/admin','/garcom','/login-admin','/login-garcom']){
    const r = await fetchJson(p);
    const csp = r.headers.get('content-security-policy');
    const hsts = r.headers.get('strict-transport-security');
    log(`GET ${p}`, r.status===200, `status=${r.status} CSP=${!!csp} HSTS=${!!hsts} len=${(r.text||'').length}`);
    if(p==='/admin' || p==='/garcom'){ log(`  CSP ${p}`, !!csp, csp?csp.slice(0,120):'missing'); }
    if(p==='/' && !csp) log('BUG homepage sem CSP', false, 'src/app.js adiciona CSP mas rota / via vercel static pode bypassar? Verificar vercel.json');
  }
  // check headers on api
  {
    const r = await fetchJson('/api/config');
    log('CSP em /api/config', !!r.headers.get('content-security-policy'), (r.headers.get('content-security-policy')||'').slice(0,80));
  }

  console.log('\n=== 2. ENDPOINTS PUBLICOS (sem auth) ===');
  const publicPaths = [
    ['/api/categorias',200],
    ['/api/produtos',200],
    ['/api/produtos/ativos',200],
    ['/api/adicionais',200],
    ['/api/bairros',200],
    ['/api/config',200],
  ];
  for(const [p,exp] of publicPaths){
    const r = await fetchJson(p);
    const isArray = Array.isArray(r.body);
    log(`GET ${p}`, r.status===exp, `status=${r.status} exp=${exp} body=${isArray? 'array len='+(r.body.length): JSON.stringify(r.body).slice(0,200)}`);
    if(r.status===200 && isArray) log(`  sample ${p}`, true, JSON.stringify(r.body[0]||{}).slice(0,300));
  }
  // check que adicionais publicos expõem dados sensíveis?
  {
    const r = await fetchJson('/api/adicionais');
    if(Array.isArray(r.body) && r.body[0]) log('adicionais publico ok', true, `tipos=${[...new Set(r.body.map(x=>x.tipo))].join(',')}`);
  }
  // mutacao publica deve ser bloqueada ou validar?
  {
    const r = await fetchJson('/api/categorias', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome:'TestePublico'})});
    log('POST /api/categorias sem auth', r.status===401||r.status===403, `status=${r.status} body=${JSON.stringify(r.body).slice(0,300)}`);
    if(r.status===200) log('BUG categorias POST sem auth aceitou!', false, JSON.stringify(r.body).slice(0,300));
  }
  {
    const r = await fetchJson('/api/bairros', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nome:'BairroTeste', taxa_entrega: 5})});
    log('POST /api/bairros sem auth', r.status===401||r.status===403, `status=${r.status} ${JSON.stringify(r.body).slice(0,200)}`);
  }
  // protect: clientes, pedidos, mesas, comandas, motoboys devem exigir auth
  for(const p of ['/api/clientes','/api/pedidos','/api/mesas','/api/comandas','/api/motoboys']){
    const r = await fetchJson(p);
    log(`GET ${p} sem auth`, r.status===401, `status=${r.status} ${JSON.stringify(r.body).slice(0,150)}`);
    if(r.status===200) log(`BUG ${p} sem auth vazou dados!`, false, JSON.stringify(r.body).slice(0,300));
  }
  // auth me sem token
  {
    const r = await fetchJson('/api/auth/me');
    log('GET /api/auth/me sem token', r.status===401, `status=${r.status}`);
  }

  console.log('\n=== 3. AUTH RATE LIMIT E VALIDACAO ===');
  {
    const r = await fetchJson('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({usuario:'a'})});
    log('POST login sem senha', r.status===400, `status=${r.status} ${JSON.stringify(r.body).slice(0,200)}`);
  }
  {
    const r = await fetchJson('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({usuario:'', senha:''})});
    log('POST login vazio', r.status===400, `status=${r.status}`);
  }

  if(!(await loginDemo())){
    console.log('\n=== SEM TOKEN: testes autenticados pulados (rate limit). Fazendo testes publicos restantes ===');
  } else {
    console.log('\n=== 4. ROTAS AUTENTICADAS (demo admin) ===');
    const auth = authH();
    for(const p of ['/api/auth/me','/api/clientes','/api/mesas','/api/pedidos','/api/comandas','/api/motoboys']){
      const r = await fetchJson(p, {headers: auth});
      log(`GET ${p} com token`, r.status===200, `status=${r.status} body=${Array.isArray(r.body)?'array '+r.body.length: JSON.stringify(r.body).slice(0,200)}`);
    }
    // verify observador protection bypass? demo é admin so should not be blocked
    // test criar categoria temp
    {
      const r = await fetchJson('/api/categorias', {method:'POST', headers:{'Content-Type':'application/json', ...auth}, body: JSON.stringify({nome:'CAT_TMP_'+Date.now()})});
      log('POST categoria com admin', r.status===200||r.status===201, `status=${r.status} ${JSON.stringify(r.body).slice(0,300)}`);
      if(r.body && r.body.id){
        const id=r.body.id;
        const r2 = await fetchJson(`/api/categorias/${id}`, {method:'DELETE', headers: auth});
        log(`DELETE categoria ${id} cleanup`, r2.status===200, `status=${r2.status}`);
      }
    }
    // test audit
    {
      const r = await fetchJson('/api/auth/auditoria?limite=5', {headers: auth});
      log('GET auditoria', r.status===200, `status=${r.status} len=${Array.isArray(r.body)?r.body.length:'?'}`);
    }
  }

  console.log('\n=== 5. FLUXO PUBLICO: clientes e pedidos ===');
  {
    const tel = '8399999'+String(Date.now()).slice(-4);
    let clienteId=null;
    {
      const r = await fetchJson('/api/clientes', {method:'POST', headers:{'Content-Type':'application/json', ...authH()}, body: JSON.stringify({nome:'Cliente Teste', telefone:tel, bairro:'Centro', rua:'Rua Teste', numero:'123'})});
      // rota clientes exige auth, mas testar também criação via pedido flow? Vamos ver
      log('POST cliente (pode exigir auth)', true, `status=${r.status} ${JSON.stringify(r.body).slice(0,300)}`);
      if(r.body && r.body.id) clienteId=r.body.id;
      else if(r.status===401) log('INFO cliente precisa auth (esperado)', true, '');
    }
    // buscar produtos ativos para montar pedido
    const prodR = await fetchJson('/api/produtos/ativos');
    const ativos = Array.isArray(prodR.body)? prodR.body : [];
    log('produtos/ativos para pedido', prodR.status===200 && ativos.length>0, `count=${ativos.length}`);
    if(ativos.length>0){
      // encontrar um produto simples (nao pizza) para teste sem adicionais
      const simple = ativos.find(p=> !/pizza/i.test(p.categoria_nome||'')) || ativos[0];
      log('produto escolhido para pedido', true, `${simple.id} ${simple.nome} cat=${simple.categoria_nome} preco=${simple.preco}`);
      // testar validacoes de pedido sem auth? loja pode estar fechada
      const cfgR = await fetchJson('/api/config');
      const cfg = cfgR.body||{};
      log('config loja_aberta', true, `aberta=${cfg.loja_aberta} horario_automatico=${cfg.horario_automatico}`);
      // tentar criar pedido publico minimo
      const bairroR = await fetchJson('/api/bairros');
      const bairros = Array.isArray(bairroR.body)? bairroR.body: [];
      const bairro = bairros && bairros[0] ? bairros[0].nome : 'Centro';
      // precisa de cliente_id - tentar criar via fluxo garcom? Para público, cliente_id é opcional? Ver src/routes/pedidos.js
      // vamos tentar sem auth, delivery
      {
        const payload = {
          cliente_id: clienteId||1,
          itens: [{produto_id: simple.id, produto_nome: simple.nome, quantidade:1, unidade:'un', preco_unitario: simple.preco, adicionais:[]}],
          forma_pagamento:'dinheiro',
          bairro_entrega: bairro,
          endereco_entrega: 'Rua Teste, 123',
          observacoes:'teste automatizado'
        };
        const r = await fetchJson('/api/pedidos', {method:'POST', headers:{'Content-Type':'application/json', ...authH()}, body: JSON.stringify(payload)});
        log('POST pedido publico (ou com token)', r.status===200||r.status===201||r.status===403, `status=${r.status} ${JSON.stringify(r.body).slice(0,600)}`);
        if(r.status===400) log('BUG validacao pedido', false, JSON.stringify(r.body).slice(0,500));
        if(r.status===403 && JSON.stringify(r.body).includes('fechada')) log('INFO loja fechada bloqueou pedido publico (correto se configurado)', true, '');
        if(r.body && r.body.id){
          const pid = r.body.id;
          // status publico
          const r2 = await fetchJson(`/api/pedidos/${pid}/publico`);
          log(`GET pedido ${pid}/publico`, r2.status===200, `status=${r2.status} ${JSON.stringify(r2.body).slice(0,200)}`);
        }
      }
      // teste adicional: quantidade invalida
      {
        const r = await fetchJson('/api/pedidos', {method:'POST', headers:{'Content-Type':'application/json', ...authH()}, body: JSON.stringify({
          cliente_id: clienteId||1,
          itens:[{produto_id: simple.id, produto_nome: simple.nome, quantidade:0, unidade:'un', adicionais:[]}],
          forma_pagamento:'dinheiro',
          bairro_entrega: 'Retirada no local', endereco_entrega:'Retirada no local'
        })});
        log('POST pedido quantidade 0 deve falhar 400', r.status===400, `status=${r.status} ${JSON.stringify(r.body).slice(0,300)}`);
        if(r.status===200) log('BUG pedido quantidade 0 aceito!', false, '');
      }
    }
  }

  console.log('\n=== 6. SECURITY HEADERS & LIMITES ===');
  {
    const paths = ['/api/categorias','/api/produtos/ativos','/health'];
    for(const p of paths){
      const r = await fetchJson(p);
      const csp = r.headers.get('content-security-policy');
      const cc = r.headers.get('cache-control');
      const rr = r.headers.get('x-ratelimit-limit');
      log(`headers ${p}`, true, `CSP=${!!csp} CC=${cc||'?'} RL=${rr||'?'}`);
    }
    // rate limit global: 500/15m, check header presence
    {
      const r = await fetchJson('/api/categorias');
      log('rate limit header presente', !!r.headers.get('ratelimit-limit')||!!r.headers.get('x-ratelimit-limit'), `headers=${[...r.headers.entries()].filter(([k])=>k.includes('ratelimit')).map(([k,v])=>k+':'+v).join(',')}`);
    }
  }

  console.log('\n=== RESUMO ===');
  const fails = results.filter(r=>!r.ok);
  const passes = results.filter(r=>r.ok);
  console.log(`Pass: ${passes.length} Fail: ${fails.length} Total: ${results.length}`);
  fails.forEach(f=> console.log(`  FAIL: ${f.name} -> ${f.detail}`));
  console.log(JSON.stringify(results,null,2));
})();
