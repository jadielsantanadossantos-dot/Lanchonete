const BASE='https://andersonlanches.vercel.app';
const jwt=require('jsonwebtoken');
require('dotenv').config();
const s=process.env.JWT_SECRET;
function make(p){ return jwt.sign(p,s,{expiresIn:'2h'}); }
const payloads=[
  {id:1, usuario:'demo', nome:'Demo', perfil:'admin', trocar_senha:false},
  {id:1, usuario:'admin', nome:'Admin', perfil:'admin', trocar_senha:false},
  {id:2, usuario:'garcom', nome:'Garcom', perfil:'garcom', trocar_senha:false},
  {id:999, usuario:'hacker', nome:'Hacker', perfil:'admin', trocar_senha:false},
];
(async()=>{
  for(const p of payloads){
    const t=make(p);
    const r=await fetch(BASE+'/api/auth/me', {headers:{Authorization:'Bearer '+t}});
    console.log(`me ${p.perfil}/${p.usuario} -> ${r.status} ${await r.text().then(x=>x.slice(0,300))}`);
  }
  // try without token on protected routes after forging
  const t=make(payloads[0]);
  const auth={Authorization:'Bearer '+t};
  const tests=[
    ['/api/clientes',{}, 'GET clientes'],
    ['/api/mesas',{}, 'GET mesas'],
    ['/api/pedidos?limite=2',{}, 'GET pedidos'],
    ['/api/comandas/mesa/1',{}, 'GET comanda mesa 1'],
    ['/api/motoboys',{}, 'GET motoboys'],
    ['/api/config',{}, 'GET config (public)'],
    ['/api/auth/usuarios',{}, 'GET usuarios'],
  ];
  for(const [path,opts,label] of tests){
    const r=await fetch(BASE+path,{headers:auth});
    console.log(`${label} -> ${r.status} ${ (await r.text()).slice(0,400)}`);
  }
  // try invalid secret
  const bad=jwt.sign(payloads[0],'wrongsecret',{expiresIn:'2h'});
  const r2=await fetch(BASE+'/api/auth/me',{headers:{Authorization:'Bearer '+bad}});
  console.log('bad secret ->',r2.status, await r2.text().then(x=>x.slice(0,200)));
})();
