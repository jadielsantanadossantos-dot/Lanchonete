const BASE = 'https://andersonlanches.vercel.app';
async function tryLogin(usuario, senha, perfil_esperado) {
  const body = {usuario, senha};
  if(perfil_esperado) body.perfil_esperado = perfil_esperado;
  const r = await fetch(BASE+'/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const j = await r.json().catch(()=>({raw:''}));
  console.log(`LOGIN ${usuario}/${senha}${perfil_esperado?'/'+perfil_esperado:''} -> ${r.status} ${JSON.stringify(j).slice(0,300)}`);
  return {status:r.status, json:j, headers:r.headers};
}
(async()=>{
  const candidates = [
    ['admin','admin123'], ['admin','password'], ['admin','1234'],
    ['garcom','garcom123'], ['garcom','1234'],
    ['demo','demo'], ['demo','demo123'], ['observador','observador'],
    ['erilane','1234'], ['Anderson','1234'],
  ];
  for(const [u,s] of candidates){
    await tryLogin(u,s);
    await tryLogin(u,s,'admin');
    await tryLogin(u,s,'garcom');
  }
  // try without creds
  const r = await fetch(BASE+'/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({usuario:'a', senha:'b'})});
  console.log('invalid ->', r.status, await r.text().then(t=>t.slice(0,200)));
  // check produtos ativos
  const r2 = await fetch(BASE+'/api/produtos/ativos');
  console.log('produtos/ativos', r2.status, (await r2.text()).slice(0,400));
  // check auth me without token
  const r3 = await fetch(BASE+'/api/auth/me');
  console.log('me no token', r3.status, (await r3.text()).slice(0,200));
})();
