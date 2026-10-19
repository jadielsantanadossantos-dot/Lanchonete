(function(){
'use strict';
const V2={};window.V2=V2;
let filtroCat='';let filtroBusca='';let passoCheckout=1;
function esc(s){ if(window.escapeHtml) return window.escapeHtml(s); if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function isPizza(p){ return !!(p&&p.categoria_nome&&String(p.categoria_nome).toLowerCase().includes('pizza')); }
function toast(msg){
  const el=document.getElementById('v2-toast'); if(!el){ if(window.mostrarToast) window.mostrarToast(msg); return;}
  el.textContent=msg; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove('show'),2400);
}
function getConfig(){ try{ if(typeof config!=='undefined'&&config&&Object.keys(config).length) return config; }catch(e){} return window.config||{}; }
function syncConfig(arr){ if(!arr||typeof arr!=='object') return; try{ if(typeof config!=='undefined') config=arr; }catch(e){} try{ window.config=arr; }catch(e){} }
function getBairros(){ try{ if(typeof bairros!=='undefined'&&Array.isArray(bairros)&&bairros.length) return bairros; }catch(e){} return window.bairros||[]; }
function syncBairros(arr){ if(!Array.isArray(arr)) return; try{ if(typeof bairros!=='undefined') bairros=arr; }catch(e){} try{ window.bairros=arr; }catch(e){} }
function getClienteLogado(){ try{ if(typeof clienteLogado!=='undefined'&&clienteLogado) return clienteLogado; }catch(e){} return window.clienteLogado||null; }
function syncContaLabel(){
  const el=document.querySelector('.v2-account-label'); if(!el) return;
  const cli=getClienteLogado();
  if(cli&&cli.telefone){ const primeiro=String(cli.nome||'').trim().split(/\s+/)[0]||'Minha conta'; el.textContent=primeiro; }
  else el.innerHTML='LOGIN<br>REGISTRAR';
}
function syncHeaderConfig(){
  try{
    const cfg=getConfig(); const nome=cfg.loja_nome||'Lanchonete';
    const ln=document.getElementById('v2-loja-nome'); if(ln) ln.textContent=nome; document.title=nome;
    const logo=document.getElementById('v2-logo'); if(logo&&cfg.logo_url) logo.src=cfg.logo_url;
    const t=document.getElementById('v2-tempo'), tv=document.getElementById('v2-tempo-val');
    if(t&&tv){ if(cfg.tempo_espera&&String(cfg.tempo_espera).trim()){ tv.textContent=cfg.tempo_espera; t.style.display='flex'; } else t.style.display='none'; }
    const fech=document.getElementById('v2-fechada'); if(fech){ const aberta=cfg.loja_aberta_efetiva!==undefined?cfg.loja_aberta_efetiva!=='false':cfg.loja_aberta!=='false'; fech.style.display=aberta?'none':'block'; try{ if(typeof lojaAberta!=='undefined') lojaAberta=aberta; }catch(e){} window.lojaAberta=aberta; }
    syncContaLabel();
  }catch(e){}
}
function getCatEmoji(name){
  const n=String(name||'').toLowerCase();
  if(n.includes('hamb')) return '🍔';
  if(n.includes('pizza')) return '🍕';
  if(n.includes('bebida')||n.includes('suco')||n.includes('refr')) return '🥤';
  if(n.includes('doce')||n.includes('sobrem')) return '🍰';
  if(n.includes('porç')) return '🍟';
  if(n.includes('cachorro')||n.includes('hot')) return '🌭';
  if(n.includes('açaí')||n.includes('acai')) return '🍇';
  if(n.includes('milk')||n.includes('shake')) return '🍦';
  if(n.includes('combo')) return '🎁';
  if(n.includes('especial')) return '⭐';
  return '🍽️';
}
function renderCategorias(){
  const prods=getProdutos(); const tabs=[]; const vistos=new Set();
  prods.forEach(p=>{ if(vistos.has(p.categoria_id)) return; vistos.add(p.categoria_id); if(isPizza(p)){ if(!tabs.includes('__pizzas__')) tabs.push('__pizzas__'); } else tabs.push(p.categoria_nome); });
  const c=document.getElementById('v2-cats'); if(!c) return;
  let html=`<button class="v2-cat ${filtroCat===''?'active':''}" onclick="V2.filtrarCat('',this)">🏠 Todos</button>`;
  tabs.forEach(cat=>{ const token=cat==='__pizzas__'?'__pizzas__':cat; const label=cat==='__pizzas__'?'Pizzas':cat; const active=filtroCat===cat?'active':''; html+=`<button class="v2-cat ${active}" data-cat="${token}" onclick="V2.filtrarCat('${cat.replace(/'/g,"\\'")}',this)">${getCatEmoji(label)} ${esc(label)}</button>`; });
  c.innerHTML=html;
}
function getFiltered(){
  let list=getProdutos();
  if(filtroBusca){ const q=filtroBusca.toLowerCase(); list=list.filter(p=> (p.nome&&p.nome.toLowerCase().includes(q)) || (p.descricao&&p.descricao.toLowerCase().includes(q)) || (p.categoria_nome&&p.categoria_nome.toLowerCase().includes(q))); }
  if(filtroCat==='__pizzas__') return {mode:'pizza'};
  if(filtroCat) return {mode:'list', list:list.filter(p=>p.categoria_nome===filtroCat && !isPizza(p))};
  return {mode:'grid', list};
}
function getProdutos(){
  try{ if(typeof produtos!=='undefined' && produtos && produtos.length) return produtos; }catch(e){}
  try{ if(typeof window!=='undefined' && window.produtos && window.produtos.length) return window.produtos; }catch(e){}
  return [];
}
function syncProdutos(arr){
  if(!Array.isArray(arr)) return;
  try{ if(typeof produtos!=='undefined') produtos=arr; }catch(e){}
  try{ window.produtos=arr; window.__pizzaCfg && (window.__pizzaCfg.produtos=arr); }catch(e){}
  try{ if(typeof bairros!=='undefined' && window.bairros) bairros=window.bairros; }catch(e){}
}
function getCarrinho(){
  try{ if(typeof carrinho!=='undefined' && Array.isArray(carrinho)) return carrinho; }catch(e){}
  try{ if(window.carrinho && Array.isArray(window.carrinho)) return window.carrinho; }catch(e){}
  return [];
}
function setCarrinho(arr){
  if(!Array.isArray(arr)) arr=[];
  try{ if(typeof carrinho!=='undefined') carrinho=arr; }catch(e){}
  try{ window.carrinho=arr; localStorage.setItem('carrinho',JSON.stringify(arr)); }catch(e){}
}
function getProdutoAtual(){ try{ if(typeof produtoAtual!=='undefined' && produtoAtual) return produtoAtual; }catch(e){} return window.produtoAtual||null; }
function setProdutoAtual(p){ try{ if(typeof produtoAtual!=='undefined') produtoAtual=p; }catch(e){} try{ window.produtoAtual=p; }catch(e){} }
function getModalQtd(){ try{ if(typeof modalQtd!=='undefined' && modalQtd) return modalQtd; }catch(e){} return window.modalQtd||1; }
function setModalQtd(v){ try{ if(typeof modalQtd!=='undefined') modalQtd=v; }catch(e){} try{ window.modalQtd=v; }catch(e){} }
function getTaxa(){ try{ if(typeof taxaEntregaAtual!=='undefined' && taxaEntregaAtual!=null) return taxaEntregaAtual; }catch(e){} return window.taxaEntregaAtual||0; }
function setTaxa(v){ v=Number(v)||0; try{ if(typeof taxaEntregaAtual!=='undefined') taxaEntregaAtual=v; }catch(e){} try{ window.taxaEntregaAtual=v; }catch(e){} return v; }
function cardHtml(p){
  const hasAdd=(p.adicionais&&p.adicionais.length)||p.unidade==='kg';
  const img=p.foto?`<img src="${p.foto}" alt="${esc(p.nome)}" data-categoria="${esc(p.categoria_nome||'')}" data-nome="${esc(p.nome)}" loading="lazy" onerror="handleImgError(this)">`:`<div class="v2-card-placeholder">${(window.categoriaIcon?window.categoriaIcon(p.nome,p.categoria_nome):'🍔')}</div>`;
  const preco=`R$ ${Number(p.preco).toFixed(2)}${p.unidade==='kg'?'/kg':''}`;
  if(hasAdd){
    return `<div class="v2-card" onclick="V2.abrirProduto(${p.id})"><div class="v2-card-media">${img}</div><div class="v2-card-info"><div><div class="v2-card-name">${esc(p.nome)}</div>${p.descricao?`<div class="v2-card-desc">${esc(p.descricao)}</div>`:''}</div><div class="v2-card-foot"><span class="v2-price">${preco}</span><button class="v2-add" onclick="event.stopPropagation();V2.abrirProduto(${p.id})" aria-label="Configurar">+</button></div></div></div>`;
  }
  const inCart=getCarrinho().find(i=>i.produto_id===p.id && (!i.adicionais||!i.adicionais.length));
  if(inCart){
    return `<div class="v2-card" onclick="V2.abrirProduto(${p.id})"><div class="v2-card-media">${img}</div><div class="v2-card-info"><div><div class="v2-card-name">${esc(p.nome)}</div>${p.descricao?`<div class="v2-card-desc">${esc(p.descricao)}</div>`:''}</div><div class="v2-card-foot"><span class="v2-price">${preco}</span><span class="v2-qty-inline"><button onclick="event.stopPropagation();V2.addInline(${p.id},-1)">−</button><span>${inCart.quantidade}</span><button onclick="event.stopPropagation();V2.addInline(${p.id},1)">+</button></span></div></div></div>`;
  }
  return `<div class="v2-card" onclick="V2.abrirProduto(${p.id})"><div class="v2-card-media">${img}</div><div class="v2-card-info"><div><div class="v2-card-name">${esc(p.nome)}</div>${p.descricao?`<div class="v2-card-desc">${esc(p.descricao)}</div>`:''}</div><div class="v2-card-foot"><span class="v2-price">${preco}</span><button class="v2-add" onclick="event.stopPropagation();V2.addInline(${p.id},1)" aria-label="Adicionar">+</button></div></div></div>`;
}
function pizzaCard(){
  if(window.PizzaModal && window.PizzaModal.cardHtml){ return window.PizzaModal.cardHtml('cliente').replace(/product-card/g,'v2-card').replace(/product-media/g,'v2-card-media').replace(/product-info/g,'v2-card-info').replace(/product-name/g,'v2-card-name').replace(/product-desc/g,'v2-card-desc').replace(/product-footer/g,'v2-card-foot').replace(/product-price/g,'v2-price').replace(/btn-add/g,'v2-add'); }
  return '';
}
function renderGrid(){
  const grid=document.getElementById('v2-grid'); if(!grid) return;
  const f=getFiltered();
  if(f.mode==='pizza'){ grid.innerHTML=`<div class="v2-section"><h2 class="v2-section-title">Pizzas</h2><div class="v2-items">${pizzaCard()}</div></div>`; return; }
  let lista=f.list||[];
  if(!lista.length){ grid.innerHTML='<div class="v2-empty">Nenhum produto encontrado</div>'; return; }
  const grupos=[]; const mapa=new Map();
  lista.forEach(p=>{ if(!mapa.has(p.categoria_id)){ const itens=[]; mapa.set(p.categoria_id,itens); grupos.push({id:p.categoria_id,nome:p.categoria_nome||'Outros',pizza:isPizza(p),itens}); } mapa.get(p.categoria_id).push(p); });
  let html=''; let pizzasDone=false;
  grupos.forEach(g=>{
    if(g.pizza){ if(pizzasDone) return; pizzasDone=true; html+=`<div class="v2-section"><h2 class="v2-section-title">Pizzas</h2><div class="v2-items">${pizzaCard()}</div></div>`; return; }
    html+=`<div class="v2-section"><h2 class="v2-section-title">${esc(g.nome)}</h2><div class="v2-items">${g.itens.map(cardHtml).join('')}</div></div>`;
  });
  grid.innerHTML=html;
}
V2.filtrarCat=function(cat,btn){
  filtroCat=cat; document.querySelectorAll('#v2-cats .v2-cat').forEach(b=>b.classList.remove('active')); if(btn) btn.classList.add('active'); renderGrid();
};
V2.abrirProduto=function(id){
  if(window.abrirProduto){ window.abrirProduto(id); const m=document.getElementById('modal-produto'); if(m){ m.style.display='flex'; m.classList.add('active'); } }
};
V2.addInline=function(id,delta){
  const p=getProdutos().find(x=>x.id===id); if(!p) return;
  const hasAdd=(p.adicionais&&p.adicionais.length)||p.unidade==='kg';
  if(hasAdd){ V2.abrirProduto(id); return; }
  let c=getCarrinho(); let idx=c.findIndex(i=>i.produto_id===id && (!i.adicionais||i.adicionais.length===0) && !i.observacao);
  if(idx>=0){
    c[idx].quantidade+=delta; if(c[idx].quantidade<=0) c.splice(idx,1);
  } else if(delta>0){
    c.push({produto_id:p.id,produto_nome:p.nome,preco_unitario:Number(p.preco),quantidade:1,unidade:'un',observacao:'',adicionais:[]});
  }
  setCarrinho(c); try{ if(_origFab) _origFab(); }catch(e){} syncCart();
  toast(delta>0?'Adicionado ao carrinho':'Atualizado');
};
function calcTotais(){
  let sub=0; getCarrinho().forEach(it=>{ sub+=Number(it.preco_unitario)*Number(it.quantidade); (it.adicionais||[]).forEach(a=>sub+=Number(a.preco)*Number(it.quantidade)); });
  const taxa=Number(getTaxa()||0); return {sub,taxa,total:sub+taxa};
}
function syncCart(){
  const c=getCarrinho(); const tot=c.reduce((s,i)=>s+Number(i.quantidade||0),0);
  const {sub,taxa,total}=calcTotais();
  const bar=document.getElementById('v2-bar'), side=document.getElementById('v2-side'), sideBody=document.getElementById('v2-side-body'), sideFoot=document.getElementById('v2-side-foot');
  const countEls=[document.getElementById('v2-bar-count'),document.getElementById('v2-side-count')];
  countEls.forEach(el=>{ if(el) el.textContent= tot? `${tot} ${tot===1?'item':'itens'}`:'0 itens'; });
  const barTotal=document.getElementById('v2-bar-total'); if(barTotal) barTotal.textContent=`R$ ${total.toFixed(2)}`;
  const sSub=document.getElementById('v2-side-sub'), sTaxa=document.getElementById('v2-side-taxa'), sTot=document.getElementById('v2-side-total');
  if(sSub) sSub.textContent=`R$ ${sub.toFixed(2)}`; if(sTaxa) sTaxa.textContent=`R$ ${taxa.toFixed(2)}`; if(sTot) sTot.textContent=`R$ ${total.toFixed(2)}`;
  if(bar){ if(c.length) bar.classList.remove('hidden'); else bar.classList.add('hidden'); }
  const layout=document.querySelector('.v2-layout');
  const isDesktop=window.matchMedia('(min-width: 980px)').matches;
  if(side){
    if(isDesktop){ side.style.display=c.length?'flex':'none'; if(layout) layout.style.gridTemplateColumns=c.length?'':'1fr'; }
    else { side.style.display='none'; if(layout) layout.style.gridTemplateColumns=''; }
  }
  if(sideFoot) sideFoot.style.display=c.length?'block':'none';
  if(sideBody){
    if(!c.length){ sideBody.innerHTML='<div class="v2-empty">Carrinho vazio<br><span style="font-size:.82rem">Adicione itens do cardápio</span></div>'; }
    else {
      sideBody.innerHTML=c.map((it,i)=>{
        const qTexto=it.unidade==='kg'?(window.formatarPeso?window.formatarPeso(it.quantidade):it.quantidade+' kg'):`${it.quantidade}x`;
        let adc=(it.adicionais||[]).map(a=>`+ ${esc(a.nome)}${a.preco>0?' (+R$ '+Number(a.preco).toFixed(2)+')':''}`).join(', ');
        let lineTot=Number(it.preco_unitario)*Number(it.quantidade); (it.adicionais||[]).forEach(a=>lineTot+=Number(a.preco)*Number(it.quantidade));
        return `<div class="v2-cart-item"><div class="v2-cart-item-head"><div style="flex:1;min-width:0"><div class="v2-cart-item-name">${esc(it.produto_nome)}</div>${adc?`<div class="v2-cart-item-meta">${adc}</div>`:''}${it.observacao?`<div class="v2-cart-item-meta">Obs: ${esc(it.observacao)}</div>`:''}${it.unidade==='un'?`<div style="display:flex;align-items:center;gap:6px;margin-top:6px"><button class="v2-qty-btn" onclick="V2.qtdCarrinho(${i},-1)">−</button><span style="font-weight:800;min-width:18px;text-align:center">${it.quantidade}</span><button class="v2-qty-btn" onclick="V2.qtdCarrinho(${i},1)">+</button></div>`:`<div class="v2-cart-item-meta" style="color:var(--color-primary);font-weight:700;margin-top:4px">${qTexto}</div>`}</div><div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px"><div class="v2-cart-item-price">R$ ${lineTot.toFixed(2)}</div><button class="v2-remove" onclick="V2.remover(${i})" aria-label="Remover">×</button></div></div></div>`;
      }).join('');
    }
  }
  if(document.getElementById('v2-drawer')?.classList.contains('open')){
    const t=document.getElementById('v2-drawer-title')?.textContent;
    if(t==='Carrinho') renderDrawerCart();
  }
  renderGrid();
}
V2.qtdCarrinho=function(i,delta){
  const c=getCarrinho(); if(!c[i]) return;
  if(c[i].unidade!=='un'){ toast('Peso definido no produto'); return; }
  c[i].quantidade+=delta; if(c[i].quantidade<=0) c.splice(i,1);
  setCarrinho(c); try{ if(window.salvarCarrinhoLocalOrig) window.salvarCarrinhoLocalOrig(); else if(window.salvarCarrinhoLocal) window.salvarCarrinhoLocal(); }catch(e){} syncCart();
};
V2.remover=function(i){ const c=getCarrinho(); c.splice(i,1); setCarrinho(c); try{ if(window.salvarCarrinhoLocalOrig) window.salvarCarrinhoLocalOrig(); else if(window.salvarCarrinhoLocal) window.salvarCarrinhoLocal(); }catch(e){} syncCart(); };
function openDrawer(title, bodyHtml, footerHtml, showSteps){
  const ov=document.getElementById('v2-overlay'), dr=document.getElementById('v2-drawer');
  document.getElementById('v2-drawer-title').textContent=title;
  document.getElementById('v2-drawer-body').innerHTML=bodyHtml;
  document.getElementById('v2-drawer-footer').innerHTML=footerHtml||'';
  const steps=document.getElementById('v2-steps'); if(steps) steps.style.display=showSteps?'flex':'none';
  ov.classList.add('active'); dr.classList.add('open'); document.body.style.overflow='hidden';
}
V2.fecharDrawer=function(){
  const ov=document.getElementById('v2-overlay'), dr=document.getElementById('v2-drawer');
  if(ov) ov.classList.remove('active'); if(dr) dr.classList.remove('open'); document.body.style.overflow='';
};
function renderDrawerCart(){
  const c=getCarrinho(); const {sub,taxa,total}=calcTotais();
  if(!c.length){ openDrawer('Carrinho','<div class="v2-empty">Carrinho vazio</div>','<button class="v2-btn v2-btn-outline" onclick="V2.fecharDrawer()">Continuar comprando</button>'); return; }
  const body=c.map((it,i)=>{
    let adc=(it.adicionais||[]).map(a=>`+ ${esc(a.nome)}${a.preco>0?' (+R$ '+Number(a.preco).toFixed(2)+')':''}`).join('<br>');
    let lineTot=Number(it.preco_unitario)*Number(it.quantidade); (it.adicionais||[]).forEach(a=>lineTot+=Number(a.preco)*Number(it.quantidade));
    const qTexto=it.unidade==='kg'?(window.formatarPeso?window.formatarPeso(it.quantidade):it.quantidade+' kg'):`${it.quantidade}x`;
    return `<div class="v2-cart-item"><div class="v2-cart-item-head"><div style="flex:1"><div class="v2-cart-item-name">${esc(it.produto_nome)}</div>${adc?`<div class="v2-cart-item-meta">${adc}</div>`:''}${it.observacao?`<div class="v2-cart-item-meta">Obs: ${esc(it.observacao)}</div>`:''}${it.unidade==='un'?`<div style="display:flex;align-items:center;gap:6px;margin-top:6px"><button class="v2-qty-btn" onclick="V2.qtdCarrinho(${i},-1)">−</button><span style="font-weight:800">${it.quantidade}</span><button class="v2-qty-btn" onclick="V2.qtdCarrinho(${i},1)">+</button></div>`:`<div class="v2-cart-item-meta" style="color:var(--color-primary);font-weight:700">${qTexto}</div>`}</div><div style="text-align:right"><div class="v2-cart-item-price">R$ ${lineTot.toFixed(2)}</div><button class="v2-remove" onclick="V2.remover(${i})">×</button></div></div></div>`;
  }).join('');
  const foot=`<div class="v2-summary"><div class="v2-summary-row"><span>Subtotal</span><strong>R$ ${sub.toFixed(2)}</strong></div><div class="v2-summary-row"><span>Taxa de entrega</span><strong>R$ ${taxa.toFixed(2)}</strong></div><div class="v2-summary-row total"><span>Total</span><span>R$ ${total.toFixed(2)}</span></div></div><button class="v2-btn v2-btn-primary" style="margin-top:10px" onclick="V2.abrirCheckout()">Continuar →</button>`;
  openDrawer('Carrinho', body, foot);
}
V2.abrirCarrinho=function(){ renderDrawerCart(); };
function popularBairrosSelect(id){
  const sel=document.getElementById(id); if(!sel) return;
  sel.innerHTML='<option value="">Selecione o bairro</option>'; getBairros().forEach(b=>{ if(!b.atendido && id!=='v2-edit-bairro') return; sel.innerHTML+=`<option value="${b.id}" data-taxa="${b.taxa_entrega}">${esc(b.nome)} - R$ ${Number(b.taxa_entrega).toFixed(2)}</option>`; });
}
function getTipoEntregaV2(){ const el=document.querySelector('input[name="v2-tipo-entrega"]:checked'); return el?el.value:'entrega'; }
V2.atualizarTaxa=function(){ if(getTipoEntregaV2()==='retirada'){ setTaxa(0); syncCart(); return; } const sel=document.getElementById('v2-bairro'); const opt=sel?.options[sel.selectedIndex]; const t=opt&&opt.dataset.taxa?parseFloat(opt.dataset.taxa):0; setTaxa(t||0); syncCart(); };
V2.alternarTipo=function(){
  const tipo=getTipoEntregaV2(); const entrega=document.getElementById('v2-entrega-campos'); const retirada=document.getElementById('v2-retirada-info');
  if(tipo==='retirada'){ if(entrega) entrega.style.display='none'; if(retirada) retirada.style.display='block'; setTaxa(0); syncCart(); const end=(window.config&&window.config.loja_endereco)?window.config.loja_endereco:''; const e=document.getElementById('v2-retirada-end'); if(e) e.textContent=end||'Endereço não configurado'; const m=document.getElementById('v2-retirada-maps'); if(m) m.href=end?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}`:'#'; }
  else { if(entrega) entrega.style.display='block'; if(retirada) retirada.style.display='none'; V2.atualizarTaxa(); }
};
V2.abrirCheckout=function(){
  const c=getCarrinho(); if(!c.length){ toast('Carrinho vazio'); return; }
  try{ if(typeof verificarLojaAberta==='function') verificarLojaAberta(); else if(window.verificarLojaAberta) window.verificarLojaAberta(); }catch(e){}
  const cli=getClienteLogado()||{};
  const body=`
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="v2-form-group"><label>Nome <span class="req">*</span></label><input id="v2-nome" class="v2-form-control" placeholder="Seu nome" value="${esc(cli.nome||'')}"></div>
      <div class="v2-form-group"><label>Telefone <span class="req">*</span></label><input id="v2-telefone" class="v2-form-control" placeholder="(00) 00000-0000" type="tel" value="${esc(cli.telefone||'')}"></div>
      <div class="v2-form-group"><label>Como deseja receber? <span class="req">*</span></label><div class="v2-radio-row"><label class="v2-radio active" onclick="V2.setTipo(this,'entrega')"><input type="radio" name="v2-tipo-entrega" value="entrega" checked> Entrega</label><label class="v2-radio" onclick="V2.setTipo(this,'retirada')"><input type="radio" name="v2-tipo-entrega" value="retirada"> Retirar no local</label></div></div>
      <div id="v2-retirada-info" style="display:none;background:#E8F5E9;border:1px solid #A5D6A7;border-radius:10px;padding:10px"><div style="font-weight:700;font-size:.9rem">Retirar no local</div><div id="v2-retirada-end" style="font-size:.85rem;margin-top:4px"></div><a id="v2-retirada-maps" href="#" target="_blank" style="display:inline-flex;margin-top:6px;color:#0a7a42;font-weight:600;font-size:.85rem">📍 Abrir no Google Maps</a></div>
      <div id="v2-entrega-campos">
        <div class="v2-form-group"><label>Bairro <span class="req">*</span></label><select id="v2-bairro" class="v2-form-control" onchange="V2.atualizarTaxa()"><option value="">Selecione o bairro</option></select></div>
        <div class="v2-form-row"><div class="v2-form-group"><label>Rua</label><input id="v2-rua" class="v2-form-control" placeholder="Rua" value="${esc(cli.rua||'')}"></div><div class="v2-form-group" style="max-width:110px"><label>Nº</label><input id="v2-numero" class="v2-form-control" placeholder="Nº" value="${esc(cli.numero||'')}"></div></div>
        <div class="v2-form-group"><label>Complemento</label><input id="v2-complemento" class="v2-form-control" placeholder="Apto, bloco..." value="${esc(cli.complemento||'')}"></div>
        <div class="v2-form-group"><label>Ponto de referência</label><input id="v2-referencia" class="v2-form-control" placeholder="Próximo a..." value="${esc(cli.ponto_referencia||'')}"></div>
      </div>
      <div class="v2-summary" id="v2-check-summary"></div>
      <div class="v2-form-group"><label>Forma de pagamento</label><div class="v2-pay"><label class="v2-pay-opt active" onclick="V2.setPag(this,'pix')"><input type="radio" name="v2-pag" value="pix" checked> ⚡ Pix</label><label class="v2-pay-opt" onclick="V2.setPag(this,'dinheiro')"><input type="radio" name="v2-pag" value="dinheiro"> 💵 Dinheiro</label><label class="v2-pay-opt" onclick="V2.setPag(this,'cartao')"><input type="radio" name="v2-pag" value="cartao"> 💳 Cartão (na entrega)</label></div></div>
      <div id="v2-troco-wrap" style="display:none" class="v2-form-group"><label>Troco para quanto?</label><input id="v2-troco" type="number" class="v2-form-control" placeholder="Ex: 50.00"></div>
      <div class="v2-form-group"><label>Observações do pedido</label><textarea id="v2-obs" class="v2-form-control" rows="2" placeholder="Alguma observação?"></textarea></div>
    </div>`;
  const foot=`<button class="v2-btn v2-btn-success" id="v2-btn-final" onclick="V2.finalizar()">Finalizar pedido</button><button class="v2-btn v2-btn-outline" style="margin-top:8px" onclick="V2.abrirCarrinho()">← Voltar ao carrinho</button>`;
  openDrawer('Finalizar pedido', body, foot, true);
  popularBairrosSelect('v2-bairro');
  if(cli.bairro){ const sel=document.getElementById('v2-bairro'); for(let i=0;i<sel.options.length;i++){ if(sel.options[i].text.includes(cli.bairro)){ sel.selectedIndex=i; break; } } }
  const steps=document.getElementById('v2-steps'); if(steps){ steps.querySelectorAll('.v2-step').forEach((s,i)=>{ s.className='v2-step'+(i===0?' done':i===1?' active':''); }); steps.querySelectorAll('.v2-step-line').forEach((l,i)=>{ l.className='v2-step-line'+(i===0?' done':''); });}
  V2.alternarTipo(); syncCheckSummary();
  ['v2-nome','v2-telefone','v2-rua','v2-numero','v2-complemento','v2-referencia','v2-obs','v2-troco'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input',syncCheckSummary); });
  const tel=document.getElementById('v2-telefone'); if(tel) tel.addEventListener('input',function(){ let v=this.value.replace(/\D/g,''); if(v.length>11) v=v.slice(0,11); if(v.length>6) v=`(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`; else if(v.length>2) v=`(${v.slice(0,2)}) ${v.slice(2)}`; else if(v.length>0) v=`(${v}`; this.value=v; });
};
function syncCheckSummary(){
  const el=document.getElementById('v2-check-summary'); if(!el) return;
  const {sub,taxa,total}=calcTotais(); el.innerHTML=`<div class="v2-summary-row"><span>Subtotal</span><strong>R$ ${sub.toFixed(2)}</strong></div><div class="v2-summary-row"><span>Taxa</span><strong>R$ ${taxa.toFixed(2)}</strong></div><div class="v2-summary-row total"><span>Total</span><span>R$ ${total.toFixed(2)}</span></div>`;
}
V2.setTipo=function(label,val){
  document.querySelectorAll('.v2-radio').forEach(r=>r.classList.remove('active')); label.classList.add('active'); label.querySelector('input').checked=true; V2.alternarTipo(); syncCheckSummary();
};
V2.setPag=function(label,val){
  document.querySelectorAll('.v2-pay-opt').forEach(r=>r.classList.remove('active')); label.classList.add('active'); label.querySelector('input').checked=true;
  const w=document.getElementById('v2-troco-wrap'); if(w) w.style.display=val==='dinheiro'?'block':'none';
};
V2.mostrarConta=function(){
  const cli=getClienteLogado();
  if(cli&&cli.telefone){
    const end=[cli.rua,cli.numero,cli.complemento,cli.bairro].filter(Boolean).join(' - ');
    const body=`<div style="text-align:center;padding:8px"><div class="v2-avatar">👤</div><div style="font-weight:800">${esc(cli.nome)}</div><div style="color:#525252">${esc(cli.telefone)}</div><div style="font-size:.82rem;color:#777;margin-top:4px">${esc(end||'Endereço não cadastrado')}</div></div>`;
    const foot=`<button class="v2-btn v2-btn-primary" onclick="V2.abrirAcompanhar()">Meus pedidos</button><button class="v2-btn v2-btn-outline" style="margin-top:8px" onclick="V2.mostrarEdicao()">Editar cadastro</button><button class="v2-btn v2-btn-outline" style="margin-top:8px" onclick="V2.sairConta()">Sair da conta</button>`;
    openDrawer('Minha conta',body,foot); return;
  }
  const body=`<div style="display:flex;gap:8px;margin-bottom:12px"><button class="v2-btn v2-btn-primary" style="flex:1" onclick="V2.mostrarCadastro()">Cadastrar</button><button class="v2-btn v2-btn-outline" style="flex:1" onclick="V2.mostrarEntrar()">Entrar</button></div><div id="v2-conta-form"></div><div id="v2-conta-err" style="color:#E74C3C;font-size:.82rem;margin-top:6px"></div>`;
  openDrawer('Minha conta',body,''); V2.mostrarCadastro();
};
V2.mostrarCadastro=function(){
  const f=document.getElementById('v2-conta-form'); if(!f) return;
  f.innerHTML=`
    <div class="v2-form-group"><label>Nome *</label><input id="v2-cad-nome" class="v2-form-control" placeholder="Seu nome"></div>
    <div class="v2-form-group"><label>Telefone *</label><input id="v2-cad-tel" class="v2-form-control" placeholder="(00) 00000-0000"></div>
    <div class="v2-form-group">
      <label>CEP (Opcional)</label>
      <div style="display:flex;gap:8px">
        <input id="v2-cad-cep" class="v2-form-control" placeholder="00000-000" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,8)">
        <button class="v2-btn v2-btn-outline" type="button" onclick="V2.buscarCep('cad')" style="white-space:nowrap;padding:0 12px">🔍 Buscar</button>
      </div>
    </div>
    <div class="v2-form-group"><label>Bairro</label><select id="v2-cad-bairro" class="v2-form-control"><option value="">Selecione</option></select></div>
    <div class="v2-form-row"><div class="v2-form-group"><label>Rua</label><input id="v2-cad-rua" class="v2-form-control" placeholder="Rua"></div><div class="v2-form-group" style="max-width:110px"><label>Nº</label><input id="v2-cad-num" class="v2-form-control" placeholder="Nº"></div></div>
    <div class="v2-form-group"><label>Complemento</label><input id="v2-cad-comp" class="v2-form-control" placeholder="Apto"></div>
    <div class="v2-form-group"><label>Referência</label><input id="v2-cad-ref" class="v2-form-control" placeholder="Próximo a..."></div>
    <button class="v2-btn v2-btn-primary" onclick="V2.cadastrar()">Cadastrar</button>`;
  popularBairrosSelect('v2-cad-bairro');
  const tel=document.getElementById('v2-cad-tel'); if(tel) tel.addEventListener('input',function(){ let v=this.value.replace(/\D/g,''); if(v.length>11) v=v.slice(0,11); if(v.length>6) v=`(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`; else if(v.length>2) v=`(${v.slice(0,2)}) ${v.slice(2)}`; else if(v.length>0) v=`(${v}`; this.value=v; });
};
V2.mostrarEntrar=function(){
  const f=document.getElementById('v2-conta-form'); if(!f) return;
  f.innerHTML=`<div class="v2-form-group"><label>Telefone</label><input id="v2-login-tel" class="v2-form-control" placeholder="(00) 00000-0000"></div><button class="v2-btn v2-btn-primary" onclick="V2.entrar()">Entrar</button>`;
};
V2.buscarCep=async function(prefix){
  const cep=document.getElementById(`v2-${prefix}-cep`)?.value.replace(/\D/g,'');
  if(!cep||cep.length!==8){ toast('CEP inválido'); return; }
  try{
    const r=await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d=await r.json();
    if(d.erro){ toast('CEP não encontrado'); return; }
    const rua=document.getElementById(`v2-${prefix}-rua`), num=document.getElementById(`v2-${prefix}-num`), comp=document.getElementById(`v2-${prefix}-comp`), sel=document.getElementById(`v2-${prefix}-bairro`);
    if(rua) rua.value=d.logradouro||'';
    if(comp) comp.value=d.complemento||'';
    if(d.bairro&&sel){
      let found=false;
      for(let i=0;i<sel.options.length;i++){ if(sel.options[i].text.toLowerCase().includes(d.bairro.toLowerCase())){ sel.selectedIndex=i; found=true; break; } }
      if(!found) toast(`Bairro "${d.bairro}" não atendido, selecione manualmente.`);
    }
    if(num) num.focus();
  }catch(e){ toast('Erro ao buscar CEP'); }
  const nome=document.getElementById('v2-cad-nome')?.value.trim(), tel=document.getElementById('v2-cad-tel')?.value.trim();
  if(!nome||!tel){ document.getElementById('v2-conta-err').textContent='Preencha nome e telefone'; return; }
  const sel=document.getElementById('v2-cad-bairro'); const bairro=sel.selectedIndex>0?sel.options[sel.selectedIndex].text.split(' - ')[0].trim():'';
  const rua=document.getElementById('v2-cad-rua')?.value.trim()||'', numero=document.getElementById('v2-cad-num')?.value.trim()||'', comp=document.getElementById('v2-cad-comp')?.value.trim()||'', ref=document.getElementById('v2-cad-ref')?.value.trim()||'';
  try{ const r=await fetch('/api/clientes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome,telefone:tel,rua,numero,bairro,complemento:comp,ponto_referencia:ref})}); const c=await r.json(); if(window.salvarClienteLocal) window.salvarClienteLocal(c); else { window.clienteLogado=c; localStorage.setItem('clienteLogado',JSON.stringify(c)); } syncContaLabel(); toast('Cadastro realizado!'); V2.mostrarConta(); }catch(e){ document.getElementById('v2-conta-err').textContent='Erro ao cadastrar'; }
};
V2.entrar=async function(){
  const tel=document.getElementById('v2-login-tel')?.value.trim(); if(!tel){ document.getElementById('v2-conta-err').textContent='Informe o telefone'; return; }
  try{ const r=await fetch(`/api/clientes/telefone/${encodeURIComponent(tel)}`); if(!r.ok) throw 0; const c=await r.json(); if(window.salvarClienteLocal) window.salvarClienteLocal(c); else { window.clienteLogado=c; localStorage.setItem('clienteLogado',JSON.stringify(c)); } syncContaLabel(); toast('Bem-vindo!'); V2.mostrarConta(); }catch(e){ document.getElementById('v2-conta-err').textContent='Cliente não encontrado'; }
};
V2.sairConta=function(){
  try{ localStorage.removeItem('clienteLogado'); }catch(e){}
  try{ if(typeof clienteLogado!=='undefined') clienteLogado=null; }catch(e){}
  try{ window.clienteLogado=null; }catch(e){}
  try{ const a=document.getElementById('cadastro-logged-out'); if(a) a.style.display='block'; const b=document.getElementById('cadastro-logged-in'); if(b) b.style.display='none'; }catch(e){}
  syncContaLabel();
  toast('Saiu da conta');
  setTimeout(()=>{ try{ V2.mostrarConta(); }catch(e){} }, 80);
};
V2.mostrarEdicao=function(){
  const cli=getClienteLogado()||window.clienteLogado; if(!cli||!cli.telefone){ toast('Faça login para editar'); return; }
  const body=`<div style="display:flex;flex-direction:column;gap:10px"><div class="v2-form-group"><label>Nome *</label><input id="v2-edit-nome" class="v2-form-control" value="${esc(cli.nome||'')}"></div><div class="v2-form-group"><label>Telefone *</label><input id="v2-edit-tel" class="v2-form-control" value="${esc(cli.telefone||'')}"></div><div class="v2-form-group"><label>CEP (Opcional)</label><div style="display:flex;gap:8px"><input id="v2-edit-cep" class="v2-form-control" placeholder="00000-000" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,8)"><button class="v2-btn v2-btn-outline" type="button" onclick="V2.buscarCep('edit')" style="white-space:nowrap;padding:0 12px">🔍 Buscar</button></div></div><div class="v2-form-group"><label>Bairro</label><select id="v2-edit-bairro" class="v2-form-control"><option value="">Selecione</option></select></div><div class="v2-form-row"><div class="v2-form-group"><label>Rua</label><input id="v2-edit-rua" class="v2-form-control" value="${esc(cli.rua||'')}"></div><div class="v2-form-group" style="max-width:110px"><label>Nº</label><input id="v2-edit-num" class="v2-form-control" value="${esc(cli.numero||'')}"></div></div><div class="v2-form-group"><label>Complemento</label><input id="v2-edit-comp" class="v2-form-control" value="${esc(cli.complemento||'')}"></div><div class="v2-form-group"><label>Referência</label><input id="v2-edit-ref" class="v2-form-control" value="${esc(cli.ponto_referencia||'')}"></div><div id="v2-edit-err" style="color:#E74C3C;font-size:.82rem"></div></div>`;
  const foot=`<button class="v2-btn v2-btn-primary" onclick="V2.salvarEdicao()">Salvar alterações</button><button class="v2-btn v2-btn-outline" style="margin-top:8px" onclick="V2.mostrarConta()">← Voltar</button>`;
  openDrawer('Editar cadastro',body,foot);
  popularBairrosSelect('v2-edit-bairro');
  if(cli.bairro){ const sel=document.getElementById('v2-edit-bairro'); for(let i=0;i<sel.options.length;i++){ if(sel.options[i].text.includes(cli.bairro)){ sel.selectedIndex=i; break; } } }
  const telEl=document.getElementById('v2-edit-tel'); if(telEl) telEl.addEventListener('input',function(){ let v=this.value.replace(/\D/g,''); if(v.length>11) v=v.slice(0,11); if(v.length>6) v=`(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`; else if(v.length>2) v=`(${v.slice(0,2)}) ${v.slice(2)}`; else if(v.length>0) v=`(${v}`; this.value=v; });
};
V2.salvarEdicao=async function(){
  const cli=getClienteLogado()||window.clienteLogado; if(!cli) return;
  const nome=document.getElementById('v2-edit-nome')?.value.trim(), telefone=document.getElementById('v2-edit-tel')?.value.trim();
  const rua=document.getElementById('v2-edit-rua')?.value.trim()||'', numero=document.getElementById('v2-edit-num')?.value.trim()||'', comp=document.getElementById('v2-edit-comp')?.value.trim()||'', ref=document.getElementById('v2-edit-ref')?.value.trim()||'';
  const sel=document.getElementById('v2-edit-bairro'); const bairro=sel&&sel.selectedIndex>0?sel.options[sel.selectedIndex].text.split(' - ')[0].trim():'';
  if(!nome||!telefone){ document.getElementById('v2-edit-err').textContent='Preencha nome e telefone'; return; }
  try{
    const r=await fetch(`/api/clientes/by-telefone/${encodeURIComponent(cli.telefone)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome,telefone,rua,numero,bairro,complemento:comp,ponto_referencia:ref})});
    const j=await r.json().catch(()=>({})); if(!r.ok){ document.getElementById('v2-edit-err').textContent=j.error||'Erro ao salvar'; return; }
    const atualizado=j&&j.telefone?j:{...cli,nome,telefone,rua,numero,bairro,complemento:comp,ponto_referencia:ref};
    if(window.salvarClienteLocal) window.salvarClienteLocal(atualizado); else { window.clienteLogado=atualizado; try{ localStorage.setItem('clienteLogado',JSON.stringify(atualizado)); }catch(e){} try{ if(typeof clienteLogado!=='undefined') clienteLogado=atualizado; }catch(e){} }
    syncContaLabel(); toast('Dados atualizados!'); V2.mostrarConta();
  }catch(e){ document.getElementById('v2-edit-err').textContent='Erro ao salvar'; }
};
V2.abrirAcompanhar=function(){
  const cli=getClienteLogado()||window.clienteLogado; const tel=(cli&&cli.telefone)||'';
  const hideInput = tel ? 'style="display:none"' : '';
  const body=`<div class="v2-form-group" ${hideInput}><label>Telefone</label><input id="v2-acomp-tel" class="v2-form-control" placeholder="(00) 00000-0000" value="${esc(tel)}"></div>${tel?`<div style="font-size:.82rem;color:#525252;margin-bottom:8px">Exibindo pedidos de <strong>${esc(tel)}</strong> • <a href="#" onclick="document.getElementById('v2-acomp-tel').parentElement.style.display='block';return false" style="color:var(--color-primary)">trocar</a></div>`:''}<button class="v2-btn v2-btn-primary" onclick="V2.buscarPedidos()">Buscar pedidos</button><div id="v2-pedidos" style="margin-top:12px"></div>`;
  openDrawer('Meus pedidos',body,'');
  if(tel) setTimeout(()=>V2.buscarPedidos(),0);
};
V2.buscarPedidos=async function(){
  let tel=document.getElementById('v2-acomp-tel')?.value.trim();
  if(!tel){ const cli=getClienteLogado()||window.clienteLogado; if(cli&&cli.telefone) tel=cli.telefone; const el=document.getElementById('v2-acomp-tel'); if(el&&tel) el.value=tel; }
  if(!tel){ toast('Informe seu telefone'); return; }
  const cont=document.getElementById('v2-pedidos'); if(cont) cont.innerHTML='<div class="v2-empty">Carregando...</div>';
  try{ const r=await fetch(`/api/clientes/telefone/${encodeURIComponent(tel)}/pedidos`); const ps=await r.json(); if(!ps.length){ cont.innerHTML='<div class="v2-empty">Nenhum pedido encontrado</div>'; return; } const labels={recebido:'Recebido',em_preparo:'Em preparo',saiu_entrega:'Saiu p/ entrega',entregue:'Entregue',cancelado:'Cancelado'}; cont.innerHTML=ps.map(p=>`<div class="v2-cart-item"><div style="flex:1"><div class="v2-cart-item-name">Pedido #${p.id}</div><div class="v2-cart-item-meta">${new Date(p.criado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} • ${labels[p.status]||p.status}</div></div><div class="v2-cart-item-price">R$ ${Number(p.total).toFixed(2)}</div></div>`).join(''); }catch(e){ cont.innerHTML='<div class="v2-empty">Erro ao buscar</div>'; }
};
let finalizando=false;
V2.finalizar=async function(){
  if(finalizando) return;
  const tipo=getTipoEntregaV2(); const nome=document.getElementById('v2-nome')?.value.trim(), tel=document.getElementById('v2-telefone')?.value.trim();
  const bSel=document.getElementById('v2-bairro'); const bNome=bSel.selectedIndex>0?bSel.options[bSel.selectedIndex].text.split(' - ')[0].trim():'';
  const bairroEntrega=tipo==='retirada'?'Retirada no local':bNome;
  if(!window.lojaAberta){ toast('Loja fechada'); return; }
  if(!nome||!tel){ toast('Preencha nome e telefone'); return; }
  if(tipo==='entrega'&&!bNome){ toast('Selecione o bairro'); return; }
  if(tipo==='retirada'&&window.config&&!window.config.loja_endereco){ toast('Retirada indisponível'); return; }
  const rua=document.getElementById('v2-rua')?.value.trim()||'', numero=document.getElementById('v2-numero')?.value.trim()||'', comp=document.getElementById('v2-complemento')?.value.trim()||'', ref=document.getElementById('v2-referencia')?.value.trim()||'';
  const obs=document.getElementById('v2-obs')?.value.trim()||''; const pagEl=document.querySelector('input[name="v2-pag"]:checked'); const forma=pagEl?pagEl.value:'pix';
  let observacoes=obs; if(forma==='dinheiro'){ const tr=document.getElementById('v2-troco')?.value; if(tr) observacoes+=` | Troco para R$ ${parseFloat(tr).toFixed(2)}`; }
  let endereco=''; if(tipo==='retirada') endereco=window.config?.loja_endereco?`Retirada no local - ${window.config.loja_endereco}`:'Retirada no local'; else { if(rua) endereco+=rua; if(numero) endereco+=`, ${numero}`; if(comp) endereco+=` - ${comp}`; if(ref) endereco+=` (Ref: ${ref})`; }
  finalizando=true; const btn=document.getElementById('v2-btn-final'); if(btn){ btn.disabled=true; btn.textContent='Enviando...'; }
  try{
    if(window.verificarLojaAberta){ const ab=await window.verificarLojaAberta(); if(!ab){ toast('Loja fechada'); return; } }
    let clientePayload; const telNorm=s=>String(s||'').replace(/\D/g,'');
    if(tipo==='retirada'){
      if(window.clienteLogado&&telNorm(window.clienteLogado.telefone)===telNorm(tel)) clientePayload={nome,telefone:tel,rua:window.clienteLogado.rua||'',numero:window.clienteLogado.numero||'',bairro:window.clienteLogado.bairro||'',complemento:window.clienteLogado.complemento||'',ponto_referencia:window.clienteLogado.ponto_referencia||''};
      else clientePayload={nome,telefone:tel,rua:'',numero:'',bairro:'',complemento:'',ponto_referencia:''};
    } else clientePayload={nome,telefone:tel,rua,numero,bairro:bNome,complemento:comp,ponto_referencia:ref};
    const cr=await fetch('/api/clientes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clientePayload)}); const cliente=await cr.json();
    if(tipo==='retirada'&&window.clienteLogado&&telNorm(window.clienteLogado.telefone)===telNorm(tel)){ if(window.salvarClienteLocal) window.salvarClienteLocal({...cliente,rua:window.clienteLogado.rua,numero:window.clienteLogado.numero,bairro:window.clienteLogado.bairro,complemento:window.clienteLogado.complemento,ponto_referencia:window.clienteLogado.ponto_referencia}); }
    else if(window.salvarClienteLocal) window.salvarClienteLocal(cliente);
    const idem=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));
    const pr=await fetch('/api/pedidos',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idem},body:JSON.stringify({cliente_id:cliente.id,itens:getCarrinho(),forma_pagamento:forma,observacoes,endereco_entrega:endereco,bairro_entrega:bairroEntrega,taxa_entrega:Number(getTaxa()||0)})});
    if(!pr.ok){ let m='Erro ao finalizar'; try{ const j=await pr.json(); if(j.error) m=j.error; }catch(e){} toast(m); return; }
    const ped=await pr.json(); localStorage.setItem('ultimoPedidoId',String(ped.id));
    if(forma==='pix'){ localStorage.setItem('pedidoAguardando',JSON.stringify({id:ped.id,total:ped.total})); try{ const det={id:ped.id,total:ped.total,subtotal:ped.subtotal,taxa_entrega:ped.taxa_entrega,forma_pagamento:'pix',cliente:{nome,telefone:endereco,bairro:bairroEntrega},itens:getCarrinho()}; localStorage.setItem('pedidoPixDetalhes',JSON.stringify(det)); }catch(e){} }
    if(window.inscreverAcompanhamentoPedido) window.inscreverAcompanhamentoPedido(ped.id);
    setCarrinho([]); syncCart();
    if(forma==='pix'){
      let qrcode='', payload='';
      try{ const r=await fetch(`/api/config/pix/qrcode?valor=${ped.total}&_t=${Date.now()}`,{cache:'no-store'}); const d=await r.json(); qrcode=d.qrcode||''; payload=d.payload||''; }catch(e){}
      const bodyPix=`<div class="v2-pix"><h3 style="font-weight:800;margin-bottom:8px">Pagamento via Pix</h3><div style="background:#FFF7ED;border:1px solid #FDBA74;border-radius:10px;padding:10px;text-align:left;font-size:.82rem;color:#7C2D12;margin-bottom:10px">Pagou? Envie o comprovante no WhatsApp para confirmação imediata.</div>${qrcode?`<img src="${qrcode}" alt="QR Pix">`: '<p>Chave Pix não configurada</p>'}<button class="v2-copy" onclick="navigator.clipboard.writeText('${payload.replace(/'/g,"\\'")}').then(()=>V2.toast('Copiado!')).catch(()=>{})">Copiar código Pix</button><button class="v2-wpp" onclick="window.enviarComprovantePix&&window.enviarComprovantePix()">💬 Enviar comprovante no WhatsApp</button><div style="margin-top:10px;color:#525252;font-size:.82rem">Após pagar, aguarde confirmação. Você será avisado automaticamente.</div></div>`;
      openDrawer('Pix',bodyPix,'<button class="v2-btn v2-btn-outline" onclick="V2.fecharDrawer();V2.abrirAcompanhar()">Acompanhar pedido</button>');
    } else {
      openDrawer('Pedido confirmado',`<div style="text-align:center;padding:16px"><div class="v2-success-badge">✓</div><div style="font-weight:800;font-size:1.1rem">Pedido #${ped.id} recebido!</div><div style="color:#525252;margin-top:6px">Acompanhe pelo seu telefone</div></div>`,'<button class="v2-btn v2-btn-primary" onclick="V2.fecharDrawer()">Continuar comprando</button><button class="v2-btn v2-btn-outline" style="margin-top:8px" onclick="V2.abrirAcompanhar()">Acompanhar pedido</button>');
    }
  }catch(e){ toast('Erro ao finalizar. Tente novamente.'); }
  finally{ finalizando=false; if(btn){ btn.disabled=false; btn.textContent='Finalizar pedido'; } }
};
V2.toast=toast;
function bindSearch(){
  const a=document.getElementById('v2-search'), b=document.getElementById('v2-search-m');
  function onInput(v){ filtroBusca=v; renderGrid(); }
  if(a) a.addEventListener('input',e=>{ if(b) b.value=e.target.value; onInput(e.target.value); });
  if(b) b.addEventListener('input',e=>{ if(a) a.value=e.target.value; onInput(e.target.value); });
}
let _origAbrir=null,_origFechar=null,_origFab=null,_origSave=null;
function patchModal(){
  const mo=document.getElementById('modal-produto');
  if(mo && !mo._v2patched){
    mo.addEventListener('click',e=>{ if(e.target===mo) window.fecharModal(); });
    mo._v2patched=true;
  }
  if(window._v2PatchedModal) return;
  window._v2PatchedModal=true;
  _origAbrir=window.abrirProduto; _origFechar=window.fecharModal;
  window.abrirProduto=function(id){
    try{ if(_origAbrir) _origAbrir(id); }catch(e){ console.error('abrirProduto orig fail',e); }
    try{
      const prods=getProdutos();
      let p=null; try{ p=typeof produtoAtual!=='undefined'?produtoAtual:null; }catch(_){}
      if(!p) p=window.produtoAtual||null;
      if(!p) p=prods.find(x=>x.id===id)||null;
      if(p){ window.produtoAtual=p; window.V2_lastProduto=p; window.V2_lastId=id; }
    }catch(_){}
    const m=document.getElementById('modal-produto'); if(m){ m.classList.add('active'); m.style.display='flex'; }
    setTimeout(()=>{
      const btn=document.getElementById('btn-add-cart');
      if(btn && !btn._v2b){
        btn.removeAttribute('onclick');
        btn.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); robustAdd(ev); });
        btn._v2b=true;
      }
    },0);
  };
  window.fecharModal=function(){
    try{ if(_origFechar) _origFechar(); }catch(e){}
    const m=document.getElementById('modal-produto'); if(m){ m.style.display='none'; m.classList.remove('active'); }
  };
  const btn0=document.getElementById('btn-add-cart');
  if(btn0 && !btn0._v2b){
    btn0.removeAttribute('onclick');
    btn0.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); robustAdd(ev); });
    btn0._v2b=true;
  }
}
function robustAdd(e){
  if(e){ try{ e.preventDefault(); e.stopPropagation(); }catch(_){} }
  try{
    const p=getProdutoAtual(); if(!p){ console.warn('[v2] produtoAtual null, window',window.produtoAtual); toast('Selecione o produto novamente'); return false; }
    let qtd=getModalQtd();
    const qtyEl=document.getElementById('modal-qty'); if(qtyEl) { const n=parseInt((qtyEl.textContent||'1').trim(),10); if(!isNaN(n)&&n>0) qtd=n; }
    const porKg=p.unidade==='kg';
    if(porKg){
      const inp=document.getElementById('modal-kg-valor'); const v=inp?parseFloat(String(inp.value).replace(',','.')):0;
      if(!v||v<=0){ toast('Informe o valor desejado'); return false; }
      qtd=v/Number(p.preco); if(!qtd||qtd<=0){ toast('Informe o valor desejado'); return false; }
      if(qtd>10){ toast('Valor máximo: R$ 450,00 (10 kg)'); return false; }
    } else {
      if(!qtd||qtd<=0) qtd=1;
    }
    setModalQtd(qtd);
    const adicionais=[]; document.querySelectorAll('#adicionais-list input:checked').forEach(c=>{
      adicionais.push({id:parseInt(c.value), nome:c.dataset.nome||c.dataset.name||'', preco:parseFloat(c.dataset.preco)||0, tipo:c.dataset.tipo||'adicional'});
    });
    const obsEl=document.getElementById('modal-obs'); const obs=obsEl?obsEl.value:'';
    const cur=getCarrinho(); const before=cur.length;
    cur.push({produto_id:p.id, produto_nome:p.nome, preco_unitario:Number(p.preco), quantidade:qtd, unidade:porKg?'kg':'un', observacao:obs, adicionais});
    setCarrinho(cur);
    try{ if(window.atualizarCartFabOrig) window.atualizarCartFabOrig(); }catch(e2){ console.error('atualizarCartFabOrig fail',e2); }
    const m=document.getElementById('modal-produto'); if(m){ m.style.display='none'; m.classList.remove('active'); }
    syncCart(); renderGrid();
    console.log('[v2] robustAdd ok before',before,'after',cur.length,'qtd',qtd,'adicionais',adicionais.length);
    toast('Item adicionado ao carrinho!');
    return false;
  }catch(err){ console.error('robustAdd fail',err); toast('Erro ao adicionar: '+(err.message||err)); return false; }
}
function hookCart(){
  const origFab=window.atualizarCartFab, origSave=window.salvarCarrinhoLocal, origAdd=window.adicionarAoCarrinho;
  window.salvarCarrinhoLocalOrig=origSave; window.atualizarCartFabOrig=origFab;
  window.atualizarCartFab=function(){ if(origFab) try{ origFab(); }catch(e){} syncCart(); };
  window.salvarCarrinhoLocal=function(){ let r; if(origSave) try{ r=origSave.apply(this,arguments);}catch(e){ try{ localStorage.setItem('carrinho',JSON.stringify(window.carrinho)); }catch(_){} } syncCart(); return r; };
  window.adicionarAoCarrinho=function(){ return robustAdd(); };
  if(origAdd&&!window.adicionarAoCarrinhoOrig) window.adicionarAoCarrinhoOrig=origAdd;
  const origAlterar=window.alterarQtdCarrinho, origRemover=window.removerItem;
  if(origAlterar) window.alterarQtdCarrinho=function(){ const r=origAlterar.apply(this,arguments); syncCart(); return r; };
  if(origRemover) window.removerItem=function(){ const r=origRemover.apply(this,arguments); syncCart(); return r; };
}
async function ensureData(){
  if(!getProdutos().length){
    try{ const r=await fetch('/api/produtos/ativos'); const j=await r.json(); if(Array.isArray(j)&&j.length){ syncProdutos(j); try{ window.__pizzaCfg={produtos:j, toast:window.mostrarToast||toast, onAdd(item){ const cur=getCarrinho(); cur.push(item); setCarrinho(cur); syncCart(); toast('Pizza adicionada ao carrinho!'); }}; }catch(e){} }}
    catch(e){}
  }
  if(!getBairros().length){
    try{ const r=await fetch('/api/bairros/atendidos'); const j=await r.json(); if(Array.isArray(j)) syncBairros(j); }catch(e){}
  }
  if(!getConfig().loja_nome){
    try{ const r=await fetch('/api/config/public'); const j=await r.json(); if(j) syncConfig(j); }catch(e){}
  }
}
async function waitInit(){
  bindSearch(); patchModal(); hookCart();
  let tries=0; while(tries<40){ if(getProdutos().length) break; await new Promise(r=>setTimeout(r,150)); tries++; }
  await ensureData();
  syncHeaderConfig(); renderCategorias(); renderGrid(); syncCart();
  tries=0; const iv=setInterval(async()=>{ syncHeaderConfig(); if(!getProdutos().length){ await ensureData(); renderCategorias(); renderGrid(); syncCart(); } if(++tries>20) clearInterval(iv); },2000);
  setTimeout(async()=>{ await ensureData(); renderCategorias(); renderGrid(); syncCart(); },900);
}
document.addEventListener('keydown',e=>{ if(e.key!=='Escape') return; const mo=document.getElementById('modal-produto'); if(mo&&mo.classList.contains('active')){ window.fecharModal(); return; } const dr=document.getElementById('v2-drawer'); if(dr&&dr.classList.contains('open')) V2.fecharDrawer(); });
window.addEventListener('resize', ()=>{ try{ syncCart(); }catch(e){} });
document.addEventListener('DOMContentLoaded', waitInit);
window.addEventListener('load', async()=>{ await ensureData(); syncHeaderConfig(); renderCategorias(); renderGrid(); syncCart(); });
})();
