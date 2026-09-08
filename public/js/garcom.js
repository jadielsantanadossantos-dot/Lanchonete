let mesas = [];
let produtos = [];
let categorias = [];
let mesaAtual = null;
let comandaAtual = null;
let comandaItens = [];
let comandaTotal = 0;
let produtoSelecionado = null;
let quantAtual = 1;
let adicionaisSelecionados = [];
let categoriaFiltro = '';
let formaPagamentoFechamento = 'pix';
let tipoFechamento = 'com_pagamento';
let usuarioLogado = null;

function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function showToast(msg, type='info', icon='') {
  const existing = document.querySelectorAll('.toast-admin');
  if (existing.length >= 3) existing[0].remove();
  const toast = document.createElement('div');
  const bgMap = { success: 'var(--color-success, #10b981)', warning: 'var(--color-warning, #f59e0b)', info: 'var(--color-primary, #3b82f6)', error: 'var(--color-danger, #ef4444)' };
  const bg = bgMap[type] || bgMap.info;
  toast.className = 'toast-admin toast-'+type;
  toast.style.cssText = `position:fixed;top:20px;right:20px;background:${bg};color:white;padding:14px 18px;border-radius:12px;z-index:9999;animation:toastSlideIn 0.35s cubic-bezier(0.16,1,0.3,1);box-shadow:0 8px 24px rgba(0,0,0,0.18);display:flex;align-items:center;gap:10px;min-width:280px;max-width:420px;font-size:0.9rem;font-weight:600;line-height:1.3;`;
  toast.innerHTML = `${icon ? `<span style="font-size:1.3rem">${icon}</span>` : ''}<span style="flex:1">${escapeHtml(msg)}</span><button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1">×</button><div style="position:absolute;bottom:0;left:0;height:3px;background:rgba(255,255,255,0.5);border-radius:0 0 12px 12px;animation:toastProgress 3.5s linear forwards;right:0"></div>`;
  const offset = document.querySelectorAll('.toast-admin').length * 76;
  toast.style.top = (20 + offset) + 'px';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.animation='toastSlideOut 0.3s forwards'; setTimeout(()=>toast.remove(),300); }, 3500);
}
function mostrarToast(msg){ return showToast(msg); }

function formatarPesoGarcom(kg){
  const v = typeof kg === 'number' ? kg : parseFloat(kg) || 0;
  return `${v.toFixed(2).replace('.', ',')} kg`;
}

// Rótulo de quantidade: peso (kg) para itens por peso, ou "Nx" para unidades
function formatarQtdItem(item){
  if (item.unidade === 'kg') return formatarPesoGarcom(item.quantidade);
  const q = Number(item.quantidade) || 0;
  return `${Number.isInteger(q) ? q : q.toFixed(2).replace('.', ',')}x`;
}

// Item vendido por peso: unidade 'kg' OU categoria Açaí (vendido a R$/kg, digita-se o valor)
function isPorPeso(p){
  if (!p) return false;
  if (p.unidade === 'kg') return true;
  const cat = (p.categoria_nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return cat.includes('acai');
}

document.addEventListener('DOMContentLoaded', () => init());

async function carregarLogoGarcom() {
  try {
    const r = await fetch('/api/config/public');
    const c = await r.json();
    const el = document.getElementById('site-logo-garcom');
    if (el && c.logo_url) el.src = c.logo_url;
  } catch(_) {}
}
async function init() {
  carregarLogoGarcom();
  if (!verificarAuth()) {
    console.log('Garcom: sem token, redirecionando para login');
    redirecionarSemAuth('/login-garcom');
    return;
  }

  try {
    mostrarLoader(false);
    const meRes = await authFetch('/api/auth/me');
    if (!meRes.ok) { console.log('Garcom: /me falhou com status', meRes.status); redirecionarSemAuth('/login-garcom'); return; }
    const meData = await meRes.json();
    console.log('Garcom /me OK:', meData);
    usuarioLogado = meData;
    mostrarUsuarioGarcom(meData);

    if (meData.trocar_senha) {
      console.log('Garcom: trocar_senha=true, mostrando modal');
      mostrarModalTrocaSenha();
      return;
    }
  } catch (e) {
    console.log('Garcom: erro init', e);
    redirecionarSemAuth('/login-garcom');
    return;
  }

  iniciarAppGarcom();
}

function mostrarLoader(esconder) {
  const loader = document.getElementById('auth-loader');
  if (loader) {
    if (esconder) loader.style.display = 'none';
    else loader.style.display = 'flex';
  }
}

function mostrarUsuarioGarcom(user) {
  mostrarLoader(true);
  const el = document.getElementById('garcom-user-info');
  if (el) el.textContent = user.nome;
}

function logout() {
  sessionStorage.removeItem('garcom_logged_in');
  limparSessao();
  window.location.href = '/login-garcom';
}

function mostrarModalTrocaSenha() {
  console.log('Mostrando modal troca senha');
  const modal = document.getElementById('g-modal-troca-senha');
  if (modal) {
    modal.style.display = 'flex';
    console.log('Modal display set to flex');
  } else {
    console.error('Modal g-modal-troca-senha não encontrado!');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('g-form-troca-senha');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const senhaAtual = document.getElementById('g-senha-atual').value;
    const novaSenha = document.getElementById('g-nova-senha').value;
    const confirmaSenha = document.getElementById('g-confirma-senha').value;
    if (novaSenha !== confirmaSenha) { showToast('As senhas não conferem'); return; }
    if (novaSenha.length < 4) { showToast('Senha deve ter no mínimo 4 caracteres'); return; }

    try {
      console.log('Alterando senha...');
      const res = await authPost('/api/auth/alterar-senha', { senha_atual: senhaAtual, nova_senha: novaSenha });
      console.log('Resposta alterar-senha:', res.status, res.ok);
      if (!res.ok) { const err = await res.json(); showToast(err.error || 'Erro ao alterar senha'); return; }
      const data = await res.json();
      console.log('Nova token recebido:', data.token ? 'sim' : 'não');
      if (data.token) localStorage.setItem('auth_token', data.token);
      document.getElementById('g-modal-troca-senha').style.display = 'none';
      showToast('Senha alterada com sucesso!');
      iniciarAppGarcom();
    } catch (e) { console.error('Erro alterar senha:', e); showToast('Erro de conexão'); }
  });
});

async function iniciarAppGarcom() {
  // Inicializar Socket.io Realtime local
  if (window.Realtime && window.Realtime.init) {
    window.Realtime.init();
    
    // Escutar atualizações da comanda da mesa atual
    let comandaUnsubscribe = null;
    let mesasUnsubscribe = null;
    let novoPedidoUnsubscribe = null;
    
    const originalMostrarTela = window.mostrarTela;
    window.mostrarTela = function(pageId, titulo) {
      // Cleanup subscriptions anteriores
      if (comandaUnsubscribe) {
        comandaUnsubscribe();
        comandaUnsubscribe = null;
      }
      
      originalMostrarTela(pageId, titulo);
      
      // Se entrou na página de comanda e tem mesaAtual, começar a escutar
      if (pageId === 'g-page-comanda' && mesaAtual) {
        comandaUnsubscribe = window.Realtime.subscribeComandaMesa(mesaAtual.id, (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            carregarComanda();
          }
        });
      }
      
      // Sempre escutar mesas quando na tela de mesas
      if (pageId === 'g-page-mesas') {
        if (mesasUnsubscribe) {
          mesasUnsubscribe();
        }
        mesasUnsubscribe = window.Realtime.subscribeMesasStatus((mesa) => {
          carregarMesas();
        });
      } else if (mesasUnsubscribe) {
        mesasUnsubscribe();
        mesasUnsubscribe = null;
      }
    };
    
    // Escutar novos pedidos globalmente
    novoPedidoUnsubscribe = window.Realtime.subscribeNovoPedidoGarcom((pedido) => {
      showToast('Novo pedido recebido! #' + pedido.id);
    });
    
    // Cleanup ao sair
    window.addEventListener('beforeunload', () => {
      if (comandaUnsubscribe) comandaUnsubscribe();
      if (mesasUnsubscribe) mesasUnsubscribe();
      if (novoPedidoUnsubscribe) novoPedidoUnsubscribe();
    });
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const ativa = document.querySelector('.g-page.active');
      if (!ativa) return;
      if (ativa.id === 'g-page-mesas') carregarMesas().catch(()=>{});
      if (ativa.id === 'g-page-comanda' && mesaAtual) carregarComanda().catch(()=>{});
    }, 15000);
  } else {
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const ativa = document.querySelector('.g-page.active');
      if (!ativa) return;
      if (ativa.id === 'g-page-mesas') carregarMesas().catch(()=>{});
      if (ativa.id === 'g-page-comanda' && mesaAtual) carregarComanda().catch(()=>{});
    }, 15000);
  }

  await Promise.all([carregarMesas(), carregarProdutosCategorias()]);
  mostrarTela('g-page-mesas', 'Mesas');
}

function mostrarTela(pageId, titulo) {
  document.querySelectorAll('.g-page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(pageId);
  if (el) el.classList.add('active');

  document.getElementById('g-page-title').textContent = titulo;
  const backBtn = document.getElementById('g-back-btn');
  backBtn.style.display = pageId === 'g-page-mesas' ? 'none' : 'flex';

  window.scrollTo(0, 0);
}

function voltarPagina() {
  const ativa = document.querySelector('.g-page.active');
  if (!ativa) { mostrarTela('g-page-mesas', 'Mesas'); return; }

  if (ativa.id === 'g-page-produtos') {
    mostrarTela(mesaAtual ? 'g-page-comanda' : 'g-page-mesas', mesaAtual ? 'Comanda' : 'Mesas');
  } else if (ativa.id === 'g-page-comanda') {
    mesaAtual = null;
    mostrarTela('g-page-mesas', 'Mesas');
    carregarMesas();
  } else {
    mostrarTela('g-page-mesas', 'Mesas');
  }
}

function formatarTel(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  input.value = v;
}

// ============= MESAS =============
async function carregarMesas() {
  try {
    const res = await authFetch('/api/mesas');
    mesas = await res.json();
    renderMesas();
  } catch (e) { showToast('Erro ao carregar mesas'); }
}

function renderMesas() {
  const grid = document.getElementById('g-mesas-grid');
  if (!mesas.length) {
    grid.innerHTML = '<p style="text-align:center;color:var(--gray);padding:40px">Nenhuma mesa cadastrada.<br>Acesse o painel admin para cadastrar.</p>';
    return;
  }

  grid.innerHTML = mesas.map(m => {
    const statusClass = `g-mesa-${m.status || 'livre'}`;
    const statusLabel = (m.status || 'livre').charAt(0).toUpperCase() + (m.status || 'livre').slice(1);
    const icon = m.status === 'ocupada' ? '&#128081;' : m.status === 'reservada' ? '&#128220;' : '&#129309;';
    return `
      <div class="g-mesa-card ${statusClass}" onclick="abrirMesa(${m.id})">
        <div class="g-mesa-icon">${icon}</div>
        <div class="g-mesa-numero">${escapeHtml(m.nome || ('Mesa ' + m.numero))}</div>
        ${m.nome && m.nome !== ('Mesa ' + m.numero) ? `<div class="g-mesa-nome">Mesa ${m.numero}</div>` : ''}
        <div class="g-mesa-status">${statusLabel}</div>
      </div>
    `;
  }).join('');
}

async function abrirMesa(mesaId) {
  mesaAtual = mesas.find(m => m.id === mesaId);
  if (!mesaAtual) return;
  mostrarTela('g-page-comanda', mesaAtual.nome || ('Mesa ' + mesaAtual.numero));
  await carregarComanda();
}

async function carregarComanda() {
  if (!mesaAtual) return;
  try {
    const res = await authFetch(`/api/comandas/mesa/${mesaAtual.id}`);
    const data = await res.json();
    comandaAtual = data.aberta ? data.comanda : null;
    comandaItens = data.itens || [];
    comandaTotal = data.total || 0;
    renderComanda();
  } catch (e) { showToast('Erro ao carregar comanda'); }
}

let enviandoCozinha = false;
async function confirmarEnviarCozinha() {
  if (enviandoCozinha || !mesaAtual) return;
  const itensNaoEnviados = comandaItens.filter(i => !i.enviado_cozinha);
  if (!itensNaoEnviados.length) {
    showToast('Todos os itens já foram enviados');
    return;
  }

  const nomes = itensNaoEnviados.map(i => `${i.quantidade}x ${escapeHtml(i.produto_nome)}`).join(', ');
  if (!confirm(`Enviar para a cozinha:\n${escapeHtml(nomes)}\n\nA comanda continuará aberta para adicionar mais itens.`)) return;

  enviandoCozinha = true;
  const btn = document.getElementById('g-btn-enviar-cozinha');
  if (btn) btn.disabled = true;
  try {
    const res = await authFetch(`/api/comandas/mesa/${mesaAtual.id}/enviar-cozinha`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Erro ao enviar para cozinha');
      return;
    }

    const data = await res.json();
    showToast(`${data.itensEnviados} item(ns) enviados para a cozinha!`);
    await carregarComanda();
  } catch (e) { showToast('Erro ao enviar para cozinha'); }
  finally { enviandoCozinha = false; if (btn) btn.disabled = false; }
}

let salvarNomeTimer = null;
async function salvarNomeClienteMesa(nome) {
  if (!mesaAtual) return;
  if (salvarNomeTimer) clearTimeout(salvarNomeTimer);
  salvarNomeTimer = setTimeout(async () => {
    try {
      await authFetch(`/api/comandas/mesa/${mesaAtual.id}/cliente-nome`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_nome: nome || '' })
      });
    } catch (e) {}
  }, 500);
}

function renderComanda() {
  const container = document.getElementById('g-comanda-itens');
  const empty = document.getElementById('g-comanda-empty');
  const totalBox = document.getElementById('g-comanda-total');
  const btnFechar = document.getElementById('g-btn-fechar');
  const btnEnviarCozinha = document.getElementById('g-btn-enviar-cozinha');
  const btnLiberar = document.getElementById('g-btn-liberar');
  const statusEl = document.getElementById('g-comanda-status');

  document.getElementById('g-comanda-titulo').textContent = mesaAtual.nome || ('Mesa ' + mesaAtual.numero);

  if (comandaAtual) {
    statusEl.textContent = 'Aberta';
    statusEl.className = 'g-status-badge g-status-aberta';
    document.getElementById('g-cliente-nome-mesa').value = comandaAtual.cliente_nome || '';
  } else {
    statusEl.textContent = 'Livre';
    statusEl.className = 'g-status-badge';
    statusEl.style.background = '#E5E7EB';
    statusEl.style.color = '#374151';
    document.getElementById('g-cliente-nome-mesa').value = '';
  }

  // Botão Liberar Mesa: mostra quando comanda vazia OU tem itens não enviados
  const temItensNaoEnviados = comandaItens.some(i => !i.enviado_cozinha);
  const mostrarLiberar = !comandaItens.length || temItensNaoEnviados;
  if (btnLiberar) btnLiberar.style.display = mostrarLiberar ? 'block' : 'none';

  if (!comandaItens.length) {
    container.innerHTML = '';
    empty.style.display = 'block';
    totalBox.style.display = 'none';
    btnFechar.style.display = 'none';
    btnEnviarCozinha.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  totalBox.style.display = 'block';
  btnFechar.style.display = 'block';

  // Mostrar botão enviar cozinha se houver itens não enviados
  btnEnviarCozinha.style.display = temItensNaoEnviados ? 'block' : 'none';

  container.innerHTML = comandaItens.map(item => {
    let itemTotal = item.preco_unitario * item.quantidade;
    const adcText = (item.adicionais || []).map(a => {
      itemTotal += a.preco * item.quantidade;
      return `+ ${escapeHtml(a.nome)} (R$ ${a.preco.toFixed(2)})`;
    }).join(', ');

    const isNovo = !item.enviado_cozinha;
    const badgeEnviado = item.enviado_cozinha 
      ? '<span class="g-badge-enviado">✓ Cozinha</span>' 
      : '<span class="g-badge-novo">🆕 NOVO</span>';
    const itemClass = isNovo ? 'g-comanda-item g-comanda-item--novo' : 'g-comanda-item';
    const isKg = item.unidade === 'kg';
    const qtdLabel = isKg ? formatarPesoGarcom(item.quantidade) : `${item.quantidade}x`;
    const qtdPasso = isKg ? 0.1 : 1;
    
    return `
      <div class="${itemClass}">
        <div class="g-comanda-item-header">
          <div style="flex:1">
            <div class="g-item-name">${escapeHtml(item.produto_nome)} ${badgeEnviado}</div>
            ${adcText ? `<div class="g-item-details">${escapeHtml(adcText)}</div>` : ''}
            ${item.observacao ? `<div class="g-item-details">Obs: ${escapeHtml(item.observacao)}</div>` : ''}
            ${!item.enviado_cozinha ? `
              <div class="qty-control" style="margin-top: 8px; justify-content: flex-start; display: flex;">
                <button class="qty-btn" onclick="alterarQtdComanda(${item.id}, ${item.quantidade}, -${qtdPasso})" aria-label="Diminuir" style="width: 24px; height: 24px; font-size: 14px; padding: 0; line-height: 24px;">-</button>
                <span class="qty-value" style="font-size: 14px; margin: 0 10px;">${qtdLabel}</span>
                <button class="qty-btn" onclick="alterarQtdComanda(${item.id}, ${item.quantidade}, ${qtdPasso})" aria-label="Aumentar" style="width: 24px; height: 24px; font-size: 14px; padding: 0; line-height: 24px;">+</button>
              </div>
            ` : `<div style="font-size: 13px; color: var(--gray); margin-top: 6px;">Quantidade: ${qtdLabel}</div>`}
          </div>
          <button class="g-item-remove" onclick="removerItemComanda(${item.id})">&times;</button>
        </div>
        <div class="g-item-price">R$ ${itemTotal.toFixed(2)}</div>
      </div>
    `;
  }).join('');

  document.getElementById('g-comanda-valor').textContent = `R$ ${comandaTotal.toFixed(2)}`;
}

async function alterarQtdComanda(itemId, quantAtual, delta) {
  if (!mesaAtual) return;
  const novaQtd = quantAtual + delta;
  if (novaQtd <= 0) {
    await removerItemComanda(itemId);
  } else {
    try {
      const res = await authFetch(`/api/comandas/mesa/${mesaAtual.id}/item/${itemId}/quantidade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantidade: novaQtd })
      });
      if (res.ok) {
        abrirMesa(mesaAtual.id, mesaAtual.numero);
      }
    } catch (e) {
      showToast('Erro ao atualizar quantidade');
    }
  }
}

async function removerItemComanda(itemId) {
  if (!mesaAtual) return;
  if (!confirm('Remover este item da comanda?')) return;
  try {
    await authFetch(`/api/comandas/mesa/${mesaAtual.id}/item/${itemId}`, { method: 'DELETE' });
    await carregarComanda();
  } catch (e) { showToast('Erro ao remover item'); }
}

// ============= PRODUTOS E ADICIONAIS =============
async function carregarProdutosCategorias() {
  try {
    const [prodRes, catRes] = await Promise.all([
      authFetch('/api/produtos/ativos?canal=garcom'),
      fetch('/api/categorias')
    ]);
    // Produtos já vêm com categoria_nome
    const prods = await prodRes.json();
    produtos = prods;
    categorias = await catRes.json();
  } catch (e) { showToast('Erro ao carregar cardápio'); }
}

async function carregarAdicionais() {
  try {
    const res = await authFetch('/api/adicionais');
    return await res.json();
  } catch (e) { return []; }
}

function abrirListaProdutos() {
  if (!mesaAtual) return;
  categoriaFiltro = '';
  configurarPizzaModal('mesa');
  document.getElementById('g-categorias').innerHTML = renderCategoriasBtns('filtrarProduto', '');
  const busca = document.getElementById('g-busca-produto');
  if (busca) busca.value = '';
  renderListaMesa();
  mostrarTela('g-page-produtos', 'Adicionar Item');
}

// Config do modal "Montar sua Pizza" - apenas mesa
function configurarPizzaModal(contexto) {
  window.__pizzaCfg = {
    produtos,
    toast: showToast,
    async onAdd(item) {
      if (adicionandoItem || !mesaAtual) return;
      adicionandoItem = true;
      const btnPizza = document.getElementById('pm-btn-add');
      if (btnPizza) btnPizza.disabled = true;
      try {
        const res = await authFetch(`/api/comandas/mesa/${mesaAtual.id}/item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            produto_id: item.produto_id,
            quantidade: item.quantidade,
            observacao: item.observacao,
            adicionais: item.adicionais
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showToast(err.error || 'Erro ao adicionar pizza');
          return;
        }
        showToast(`${item.quantidade}x ${escapeHtml(item.produto_nome)} adicionado!`);
        await carregarComanda();
        mostrarTela('g-page-comanda', mesaAtual.nome || ('Mesa ' + mesaAtual.numero));
      } catch (e) { showToast('Erro ao adicionar pizza'); }
      finally { adicionandoItem = false; if (btnPizza) btnPizza.disabled = false; }
    }
  };
}

function renderCategoriasBtns(fnName, ativa) {
  // Colapsar categorias de pizza em uma unica aba "Pizzas"
  const tabs = [];
  const vistos = new Set();
  produtos.forEach(p => {
    if (vistos.has(p.categoria_id)) return;
    vistos.add(p.categoria_id);
    if (PizzaModal.isPizza(p)) {
      if (!tabs.includes('__pizzas__')) tabs.push('__pizzas__');
    } else {
      tabs.push(p.categoria_nome);
    }
  });

  let html = `<button class="g-cat-btn ${ativa === '' ? 'active' : ''}" onclick="${fnName}('', this)">Todos</button>`;
  tabs.forEach(c => {
    const label = c === '__pizzas__' ? 'Pizzas' : c;
    html += `<button class="g-cat-btn ${ativa === c ? 'active' : ''}" onclick="${fnName}('${c}', this)">${label}</button>`;
  });
  return html;
}

function filtrarProduto(cat, btn) {
  categoriaFiltro = cat;
  document.querySelectorAll('#g-categorias .g-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderListaMesa();
}

function buscarProdutoMesa() {
  renderListaMesa();
}

// Lista da mesa: aplica categoria + busca por nome, com card de pizza quando couber
function produtoCardHtmlGarcom(p, contexto) {
  const onclick = `abrirModalQuant(${p.id})`;
  return `
    <div class="g-produto-card" onclick="${onclick}">
      ${p.foto
        ? `<img class="g-produto-img" src="${p.foto}" alt="${escapeHtml(p.nome)}" loading="lazy">`
        : `<div class="g-produto-placeholder">&#127828;</div>`}
      <div class="g-produto-info">
        <div class="g-produto-text">
          <div class="g-produto-nome">${escapeHtml(p.nome)}</div>
          ${p.descricao ? `<div class="g-produto-desc">${escapeHtml(p.descricao)}</div>` : ''}
          <div class="g-produto-preco">R$ ${p.preco.toFixed(2)}</div>
        </div>
        <button class="g-produto-add-icon">+</button>
      </div>
    </div>
  `;
}

function renderProdutosAgrupados(lista, contexto) {
  const grupos = [];
  const mapa = new Map();
  lista.forEach(p => {
    const catId = p.categoria_id;
    if (!mapa.has(catId)) {
      const itens = [];
      mapa.set(catId, itens);
      grupos.push({ id: catId, nome: p.categoria_nome || 'Outros', pizza: PizzaModal.isPizza(p), itens });
    }
    mapa.get(catId).push(p);
  });

  let pizzasInseridas = false;
  return grupos.map(g => {
    if (g.pizza) {
      if (pizzasInseridas) return '';
      pizzasInseridas = true;
      return `
        <div class="g-category-section">
          <h2 class="g-category-heading">Pizzas</h2>
          <div class="g-produtos-lista">
            ${PizzaModal.cardHtml('garcom')}
          </div>
        </div>`;
    }
    const itensHtml = g.itens.map(p => produtoCardHtmlGarcom(p, contexto)).join('');
    return `
      <div class="g-category-section">
        <h2 class="g-category-heading">${escapeHtml(g.nome)}</h2>
        <div class="g-produtos-lista">
          ${itensHtml}
        </div>
      </div>`;
  }).join('');
}

function renderListaMesa() {
  const container = document.getElementById('g-produtos-lista');
  const busca = (document.getElementById('g-busca-produto')?.value || '').trim().toLowerCase();
  const buscaPizza = !busca || 'pizza'.includes(busca) || 'montar'.includes(busca);

  let html = '';
  const agrupar = !categoriaFiltro && !busca;

  if (agrupar) {
    html += renderProdutosAgrupados(produtos, 'mesa');
  } else {
    if (buscaPizza && (!categoriaFiltro || categoriaFiltro === '__pizzas__')) {
      html += PizzaModal.cardHtml('garcom');
    }
    const lista = produtos.filter(p => {
      if (PizzaModal.isPizza(p)) return false;
      if (categoriaFiltro === '__pizzas__') return false;
      if (categoriaFiltro && p.categoria_nome !== categoriaFiltro) return false;
      if (busca && !p.nome.toLowerCase().includes(busca)) return false;
      return true;
    });
    if (lista.length) {
      html += `<div class="g-produtos-lista">${lista.map(p => produtoCardHtmlGarcom(p, 'mesa')).join('')}</div>`;
    }
  }

  container.innerHTML = html || '<p style="text-align:center;color:var(--gray);padding:30px">Nenhum produto encontrado</p>';
}

let modalQuantContexto = 'mesa';

async function abrirModalQuant(produtoId, contexto = 'mesa') {
  modalQuantContexto = contexto;
  produtoSelecionado = produtos.find(p => p.id === produtoId);
  if (!produtoSelecionado) return;

  const porKg = isPorPeso(produtoSelecionado);
  quantAtual = 1;
  adicionaisSelecionados = [];

  document.getElementById('g-quant-produto-nome').textContent = produtoSelecionado.nome;
  document.getElementById('g-quant-produto-preco').textContent = `R$ ${produtoSelecionado.preco.toFixed(2)}${porKg ? ' /kg' : ''}`;
  document.getElementById('g-quant-value').textContent = '1';
  document.getElementById('g-quant-obs').value = '';

  document.getElementById('g-quant-unit-control').style.display = porKg ? 'none' : 'flex';
  document.getElementById('g-quant-kg-control').style.display = porKg ? 'block' : 'none';
  if (porKg) {
    document.getElementById('g-quant-kg-valor').value = 15;
  }

  const adcSection = document.getElementById('g-quant-adicionais');
  const adcList = document.getElementById('g-quant-adicionais-list');

  // Detectar tipos de açaí
  const adicionaisAcai = produtoSelecionado.adicionais.filter(a => ['base', 'cobertura', 'acompanhamento'].includes(a.tipo));
  const isProdutoComTipos = adicionaisAcai.length > 0;
  const adicionaisTradicionais = produtoSelecionado.adicionais.filter(a => !a.tipo || ['adicional', 'sabor', 'borda'].includes(a.tipo));

  if (produtoSelecionado.adicionais && produtoSelecionado.adicionais.length) {
    adcSection.style.display = 'block';
    let html = '';

    if (isProdutoComTipos) {
      const bases = produtoSelecionado.adicionais.filter(a => a.tipo === 'base');
      const coberturas = produtoSelecionado.adicionais.filter(a => a.tipo === 'cobertura');
      const acompanhamentos = produtoSelecionado.adicionais.filter(a => a.tipo === 'acompanhamento');

      if (bases.length) {
        html += '<div style="margin-bottom:12px;font-size:0.85rem;color:var(--color-text-secondary)">Base</div>';
        html += bases.map(a => `
          <div class="g-adicional-item">
            <label>
              <input type="radio" name="g-base" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="base" onchange="atualizarTotalQuant()">
              ${escapeHtml(a.nome)}
            </label>
            <span class="g-adicional-price">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
          </div>
        `).join('');
      }

      if (coberturas.length) {
        html += '<div style="margin-bottom:12px;font-size:0.85rem;color:var(--color-text-secondary)">Coberturas</div>';
        html += coberturas.map(a => `
          <div class="g-adicional-item">
            <label>
              <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="cobertura" data-limite="${a.limite || 0}" onchange="atualizarTotalQuant()">
              ${escapeHtml(a.nome)}
            </label>
            <span class="g-adicional-price">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
          </div>
        `).join('');
      }

      if (acompanhamentos.length) {
        html += '<div style="margin-bottom:12px;font-size:0.85rem;color:var(--color-text-secondary)">Acompanhamentos</div>';
        html += acompanhamentos.map(a => `
          <div class="g-adicional-item">
            <label>
              <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="acompanhamento" data-limite="${a.limite || 0}" onchange="atualizarTotalQuant()">
              ${escapeHtml(a.nome)}
            </label>
            <span class="g-adicional-price">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
          </div>
        `).join('');
      }

      setTimeout(() => {
        ['cobertura', 'acompanhamento'].forEach(grupo => {
          const checks = document.querySelectorAll(`#g-quant-adicionais-list input[data-tipo="${grupo}"]`);
          checks.forEach(cb => {
            cb.addEventListener('change', function() {
              const limite = parseInt(this.dataset.limite) || 0;
              if (limite > 0) {
                const checked = document.querySelectorAll(`#g-quant-adicionais-list input[data-tipo="${grupo}"]:checked`).length;
                if (checked > limite) {
                  this.checked = false;
                  showToast(`Máximo ${limite} ${grupo}(s) permitido(s)`);
                }
              }
            });
          });
        });
      }, 10);
    } else {
      // Adicionais tradicionais - limite por grupo vem do campo "Limite" do adicional no admin
      const itensPorTipo = {};
      adicionaisTradicionais.forEach(a => {
        const t = a.tipo || 'adicional';
        (itensPorTipo[t] = itensPorTipo[t] || []).push(a);
      });
      const limitePorGrupo = {};
      Object.keys(itensPorTipo).forEach(t => {
        limitePorGrupo[t] = parseInt(itensPorTipo[t][0]?.limite) || 0;
      });

      html = adicionaisTradicionais.map(a => {
        const t = a.tipo || 'adicional';
        const lim = limitePorGrupo[t] || 0;
        return `
          <div class="g-adicional-item">
            <label>
              <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="${t}" data-base-max="${lim}" data-max="${lim}" onchange="atualizarTotalQuant()">
              ${escapeHtml(a.nome)}
            </label>
            <span class="g-adicional-price">+ R$ ${a.preco.toFixed(2)}</span>
          </div>
        `;
      }).join('');
    }

    adcList.innerHTML = html;

    // Validar limite por grupo (ex.: borda recheada com maximo 1)
    setTimeout(() => {
      document.querySelectorAll('#g-quant-adicionais-list input[data-base-max]').forEach(cb => {
        cb.addEventListener('change', function() {
          const max = parseInt(this.dataset.max) || 0;
          const t = this.dataset.tipo;
          if (max <= 0 || !t) return;
          const checked = document.querySelectorAll(`#g-quant-adicionais-list input[data-tipo="${t}"]:checked`).length;
          if (checked > max) {
            this.checked = false;
            showToast(`Máximo ${max} ${t}(s) permitido(s)`);
            atualizarTotalQuant();
          }
        });
      });
    }, 10);
  } else {
    adcSection.style.display = 'none';
    adcList.innerHTML = '';
  }

  atualizarTotalQuant();
  document.getElementById('g-modal-quant').classList.add('active');
}

function fecharModalQuant() {
  document.getElementById('g-modal-quant').classList.remove('active');
}

// Multiplica o limite configurado pela quantidade e desmarca excedentes (ex.: 2 itens = ate 2 bordas)
function aplicarLimitesGarcom() {
  const mult = Math.max(1, quantAtual || 1);
  document.querySelectorAll('#g-quant-adicionais-list input[data-base-max]').forEach(cb => {
    const base = parseInt(cb.dataset.baseMax) || 0;
    cb.dataset.max = base > 0 ? base * mult : 0;
  });
  document.querySelectorAll('#g-quant-adicionais-list input[data-max]').forEach(cb => {
    const max = parseInt(cb.dataset.max) || 0;
    if (max <= 0 || !cb.checked) return;
    const t = cb.dataset.tipo;
    if (!t) return;
    const checked = document.querySelectorAll(`#g-quant-adicionais-list input[data-tipo="${t}"]:checked`);
    if (checked.length > max) cb.checked = false;
  });
  atualizarTotalQuant();
}

function alterarQuant(delta) {
  quantAtual = Math.max(1, quantAtual + delta);
  document.getElementById('g-quant-value').textContent = quantAtual;
  atualizarTotalQuant();
  aplicarLimitesGarcom();
}

function atualizarTotalQuant() {
  const porKg = isPorPeso(produtoSelecionado);
  let total = 0;
  let kg = 1;

  if (porKg) {
    const valor = parseFloat(document.getElementById('g-quant-kg-valor').value) || 0;
    kg = produtoSelecionado.preco > 0 ? valor / produtoSelecionado.preco : 0;
    total = valor;
  } else {
    total = produtoSelecionado.preco * quantAtual;
  }

  document.querySelectorAll('#g-quant-adicionais-list input:checked').forEach(c => {
    total += parseFloat(c.dataset.preco) * (porKg ? kg : quantAtual);
  });
  document.getElementById('g-quant-total').textContent = `R$ ${total.toFixed(2)}`;
}

let adicionandoItem = false;
async function confirmarAdicionarItem() {
  if (adicionandoItem || !produtoSelecionado) return;
  if (modalQuantContexto === 'mesa' && !mesaAtual) return;

  const adicionais = [];
  document.querySelectorAll('#g-quant-adicionais-list input:checked').forEach(c => {
    adicionais.push({ id: parseInt(c.value), nome: c.dataset.nome, preco: parseFloat(c.dataset.preco), tipo: c.dataset.tipo || 'adicional' });
  });

  const observacao = document.getElementById('g-quant-obs').value.trim();

  const porKg = isPorPeso(produtoSelecionado);
  let quantidade;
  if (porKg) {
    const valor = parseFloat(document.getElementById('g-quant-kg-valor').value);
    if (!valor || valor <= 0) { showToast('Informe o valor desejado'); return; }
    // O campo "Valor desejado (R$)" representa o preço; converte para kg
    quantidade = valor / (produtoSelecionado.preco || 1);
  } else {
    quantidade = quantAtual;
  }

  adicionandoItem = true;
  const btnAdd = document.querySelector('#g-modal-quant .btn-primary');
  if (btnAdd) btnAdd.disabled = true;
  try {
    const res = await authFetch(`/api/comandas/mesa/${mesaAtual.id}/item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        produto_id: produtoSelecionado.id,
        quantidade: quantidade,
        unidade: porKg ? 'kg' : 'un',
        observacao,
        adicionais
      })
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Erro ao adicionar item');
      return;
    }

    fecharModalQuant();
    const labelQtd = porKg ? `${quantidade.toFixed(2).replace('.', ',')} kg` : `${quantAtual}x`;
    showToast(`${labelQtd} ${escapeHtml(produtoSelecionado.nome)} adicionado!`);
    await carregarComanda();
    mostrarTela('g-page-comanda', mesaAtual.nome || ('Mesa ' + mesaAtual.numero));
  } catch (e) { showToast('Erro ao adicionar item'); }
  finally { adicionandoItem = false; if (btnAdd) btnAdd.disabled = false; }
}

// ============= FECHAR COMANDA =============
async function abrirFecharComanda() {
  if (!comandaItens.length) { showToast('Comanda vazia'); return; }
  formaPagamentoFechamento = 'pix';
  tipoFechamento = 'com_pagamento';

  document.getElementById('g-fechar-total').textContent = `R$ ${comandaTotal.toFixed(2)}`;
  document.getElementById('g-troco-section').style.display = 'none';
  document.getElementById('g-troco-valor').value = '';

  // Pré-preencher com nome já salvo na comanda (se houver)
  const nomeMesa = document.getElementById('g-cliente-nome-mesa')?.value || '';
  document.getElementById('g-fechar-cliente-nome').value = nomeMesa;

  document.getElementById('g-fechar-dados-pagamento').style.display = 'block';

  document.querySelectorAll('.g-payment-opt').forEach((o, i) => {
    o.classList.toggle('selected', i === 0);
    const checkEl = o.querySelector('.selected-check');
    if (checkEl) checkEl.remove();
    if (i === 0) {
      const span = document.createElement('span');
      span.className = 'selected-check';
      span.textContent = ' ✓';
      o.appendChild(span);
    }
  });

  document.querySelectorAll('.g-opcao-fechar').forEach((o, i) => {
    o.classList.toggle('selected', i === 0);
  });

  document.getElementById('g-modal-fechar').classList.add('active');
}

function fecharModalFechar() {
  document.getElementById('g-modal-fechar').classList.remove('active');
}

function selecionarTipoFechamento(el, tipo) {
  tipoFechamento = tipo;
  document.querySelectorAll('.g-opcao-fechar').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');

  const dadosPagamento = document.getElementById('g-fechar-dados-pagamento');
  dadosPagamento.style.display = tipo === 'com_pagamento' ? 'block' : 'none';
}

function selecionarPagamento(el, tipo) {
  formaPagamentoFechamento = tipo;
  document.querySelectorAll('.g-payment-opt').forEach(o => {
    o.classList.remove('selected');
    const checkEl = o.querySelector('.selected-check');
    if (checkEl) checkEl.remove();
  });
  el.classList.add('selected');
  const span = document.createElement('span');
  span.className = 'selected-check';
  span.textContent = ' ✓';
  el.appendChild(span);

  document.getElementById('g-troco-section').style.display = tipo === 'dinheiro' ? 'block' : 'none';
}

let fechandoComanda = false;
async function confirmarFechamento() {
  if (fechandoComanda || !mesaAtual || !comandaItens.length) return;

  const body = { registrar_apenas: tipoFechamento === 'sem_pagamento' };

  if (tipoFechamento === 'com_pagamento') {
    const nomeClienteInformado = document.getElementById('g-fechar-cliente-nome').value.trim();

    body.forma_pagamento = formaPagamentoFechamento;
    body.cliente_nome_informado = nomeClienteInformado;
    if (formaPagamentoFechamento === 'dinheiro') {
      const troco = document.getElementById('g-troco-valor').value;
      if (troco) body.troco_para = parseFloat(troco);
    }
  }

  fechandoComanda = true;
  const btnFechar = document.querySelector('#g-modal-fechar .btn-success');
  if (btnFechar) btnFechar.disabled = true;
  try {
    const res = await authFetch(`/api/comandas/mesa/${mesaAtual.id}/fechar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Erro ao fechar comanda');
      return;
    }

    fecharModalFechar();
    showToast(tipoFechamento === 'com_pagamento' ? 'Comanda fechada! Pedido finalizado.' : 'Comanda registrada!');

    mesaAtual = null;
    comandaAtual = null;
    comandaItens = [];
    mostrarTela('g-page-mesas', 'Mesas');
    await carregarMesas();
  } catch (e) { showToast('Erro ao fechar comanda'); }
  finally { fechandoComanda = false; if (btnFechar) btnFechar.disabled = false; }
}

// ============= LIBERAR MESA (GARÇOM) =============
async function confirmarLiberarMesa() {
  if (!mesaAtual) return;

  const temItensNaoEnviados = comandaItens.some(i => !i.enviado_cozinha);

  let msg = 'Liberar esta mesa?';
  if (temItensNaoEnviados) {
    msg = `Ha ${comandaItens.length} item(ns) nao enviado(s) para a cozinha.\nEles serao REMOVIDOS permanentemente.\n\n${escapeHtml(msg)}`;
  }

  if (!confirm(msg)) return;

  try {
    let forcar = temItensNaoEnviados;
    const res = await authFetch(`/api/comandas/mesa/${mesaAtual.id}/liberar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forcar })
    });

    if (!res.ok) {
      const err = await res.json();
      if (err.precisaConfirmacao) {
        // Segunda tentativa com forcar=true
        const res2 = await authFetch(`/api/comandas/mesa/${mesaAtual.id}/liberar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forcar: true })
        });
        if (!res2.ok) { const err2 = await res2.json(); showToast(err2.error); return; }
      } else {
        showToast(err.error);
        return;
      }
    }

    showToast('Mesa liberada!');
    mesaAtual = null;
    comandaAtual = null;
    comandaItens = [];
    mostrarTela('g-page-mesas', 'Mesas');
    await carregarMesas();
  } catch (e) { showToast('Erro ao liberar mesa'); }
}
