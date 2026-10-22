let allClientes = [];
let usuarioLogado = null;
let config = {};
let realtimeUnsubscribes = [];
let pedidosNovos = new Set(); // ids de pedidos marcados como NOVO (60s)
let notificacaoCount = 0;
let adicionalEmEdicao = null;
let adicionaisAdmin = [];
let categoriasAdmin = [];
let produtosAdmin = [];
let categoriasAdicionaisSelecionadas = [];
let produtosAdicionaisSelecionadas = [];

function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// Função para atualizar o preview do tipo de adicional (nome da caixa no modal do cliente)
function atualizarPreviewTipoAdicional() {
  const tipo = document.getElementById('adic-tipo')?.value;
  const preview = document.getElementById('adic-tipo-preview');
  if (!preview) return;
  const mapas = {
    'adicional': 'Adicionais',
    'sabor': 'Sabores',
    'borda': 'Borda Recheada',
    'base': 'Base',
    'cobertura': 'Coberturas',
    'acompanhamento': 'Acompanhamentos'
  };
  preview.textContent = mapas[tipo] || 'Adicionais';
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!verificarAuth(['admin'])) {
    redirecionarSemAuth('/login-admin');
    return;
  }

  try {
    mostrarLoader(false);
    const meRes = await authFetch('/api/auth/me');
    if (!meRes.ok) { redirecionarSemAuth('/login-admin'); return; }
    usuarioLogado = await meRes.json();
    mostrarUsuario(usuarioLogado);
  } catch (e) {
    redirecionarSemAuth('/login-admin');
    return;
  }

  carregarPedidos();
  carregarMotoboys();
  carregarSomPrefs();
  carregarLojaStatus();
  carregarConfigAdmin();
  
  // Inicializa o preview do tipo de adicional
  atualizarPreviewTipoAdicional();
  
  // Inicializar Socket.io Realtime local
  if (window.Realtime && window.Realtime.init) {
    window.Realtime.init();
    
    // Escutar novos pedidos
    const novoPedidoUnsub = window.Realtime.subscribeNovoPedidoAdmin((pedido) => {
      const ehAtualizacao = pedido._isAtualizacao || pedido._novoItem;
      if (ehAtualizacao) {
        pedidosNovos.add(pedido.id);
        showToast(`Novo item na Mesa ${pedido._mesaId || pedido.mesa_id || '?'}: Pedido #${pedido.id} atualizado!`, 'warning', '🆕');
        setTimeout(() => pedidosNovos.delete(pedido.id), 60000);
      } else {
        pedidosNovos.add(pedido.id);
        showToast(`Novo pedido recebido! #${pedido.id} - ${escapeHtml(pedido.cliente_nome || '')}`, 'success', '🔔');
        setTimeout(() => pedidosNovos.delete(pedido.id), 60000);
      }
      carregarPedidos();
      tocarSomNovoPedido();
      atualizarBadgeNotificacao();
    });
    realtimeUnsubscribes.push(novoPedidoUnsub);
    
    // Escutar atualizações de pedidos
    const pedidosUnsub = window.Realtime.subscribePedidosAdmin((payload) => {
      if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
        const p = payload.new;
        if (p && p._novoItem) {
          pedidosNovos.add(p.id);
          showToast(`Mesa ${p._mesaId || p.mesa_id} recebeu +${p._qtdItens || 1} item(ns)! Pedido #${p.id}`, 'warning', '🍽️');
          setTimeout(() => pedidosNovos.delete(p.id), 60000);
          atualizarBadgeNotificacao();
        }
        carregarPedidos();
      }
    });
    realtimeUnsubscribes.push(pedidosUnsub);

    // Escutar itens adicionados na comanda (antes de enviar à cozinha)
    const comandaUnsub = window.Realtime.subscribeComandaAdmin((data) => {
      if (data.tipo === 'novo-item') {
        showToast(`Garçom adicionou ${data.quantidade}x ${escapeHtml(data.produto_nome)} na Mesa ${data.mesaId}`, 'info', '📝');
        tocarSomNovoPedido();
        // destacar comanda pendente visualmente se houver pedido vinculado, marcar como novo
        if (data.comandaId) {
          // tenta encontrar pedido vinculado para marcar
          const pedidoVinculado = (typeof todosPedidos !== 'undefined' ? todosPedidos.find(p => p.comanda_id === data.comandaId) : null);
          if (pedidoVinculado) {
            pedidosNovos.add(pedidoVinculado.id);
            setTimeout(() => pedidosNovos.delete(pedidoVinculado.id), 60000);
          }
        }
        carregarPedidos();
        atualizarBadgeNotificacao();
      }
    });
    realtimeUnsubscribes.push(comandaUnsub);
    
    // Cleanup ao sair
    window.addEventListener('beforeunload', () => {
      realtimeUnsubscribes.forEach(unsub => unsub());
      realtimeUnsubscribes = [];
    });
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const secPedidos = document.getElementById('sec-pedidos');
      if (secPedidos && secPedidos.classList.contains('active')) carregarPedidos().catch(()=>{});
    }, 15000);
  } else {
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const secPedidos = document.getElementById('sec-pedidos');
      if (secPedidos && secPedidos.classList.contains('active')) carregarPedidos().catch(()=>{});
    }, 15000);
  }

  const volSlider = document.getElementById('cfg-som-volume');
  if (volSlider) {
    volSlider.addEventListener('input', function() {
      document.getElementById('cfg-volume-label').textContent = this.value + '%';
    });
  }
});

function mostrarLoader(esconder) {
  const loader = document.getElementById('auth-loader');
  if (loader) {
    if (esconder) loader.style.display = 'none';
    else loader.style.display = 'flex';
  }
}

function mostrarUsuario(user) {
  mostrarLoader(true);
  const el = document.getElementById('admin-user-info');
  if (el) el.textContent = `\u2139\ufe0f ${usuarioLogado.nome} (${usuarioLogado.perfil})`;
}

function logout() {
  sessionStorage.removeItem('admin_logged_in');
  limparSessao();
  window.location.href = '/login-admin';
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('active');
}

function toggleSidebarMobile() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('active');
}

window.toggleSidebarCollapse = function() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  
  // No mobile (< 768px), usa a classe .open para abrir/fechar gaveta
  // No desktop, usa .collapsed para recolher/expandir
  if (window.innerWidth < 768) {
    sidebar.classList.toggle('open');
    document.getElementById('overlay').classList.toggle('active');
  } else {
    sidebar.classList.toggle('collapsed');
  }
};

function fecharSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
}

function showSection(section, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + section).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('page-title').textContent = el ? el.textContent.trim() : section;
  fecharSidebar();

  if (section === 'pedidos') { carregarPedidos(); carregarMotoboys(); }
  if (section === 'produtos') carregarProdutosAdmin();
  if (section === 'categorias') carregarCategoriasAdmin();
  if (section === 'adicionais') carregarAdicionais();
  if (section === 'clientes') carregarClientes();
  if (section === 'bairros') carregarBairrosAdmin();
  if (section === 'mesas') carregarMesasAdmin();
  if (section === 'motoboys') { carregarMotoboys(); carregarRelatorioMotoboys(); }
  if (section === 'usuarios') carregarUsuariosAdmin();
  if (section === 'relatorios') carregarRelatorios();
  if (section === 'config') carregarConfigAdmin();
}

// PEDIDOS
let todosPedidos = [];
let tabPedidosAtiva = 'ativos';

async function carregarPedidos() {
  const status = document.getElementById('filtro-status').value;
  const url = status ? `/api/pedidos?status=${status}` : '/api/pedidos';
  try {
    if (!motoboysLista.length) {
      try { await carregarMotoboys(); } catch (e) {}
    }
    const prevIds = new Set(todosPedidos.map(p => p.id));
    const primeiraCarga = todosPedidos.length === 0;
    const res = await authFetch(url);
    const novosDados = await res.json();
    const novosDetectados = !primeiraCarga ? novosDados.filter(p => !prevIds.has(p.id) && !['entregue','cancelado'].includes(p.status)) : [];
    todosPedidos = novosDados;
    const ativos = todosPedidos.filter(p => !['entregue', 'cancelado'].includes(p.status));
    document.getElementById('pedidos-count').textContent = ativos.length;
    filtrarPedidosPorTab();
    atualizarBadgeNotificacao();
    if (novosDetectados.length) {
      novosDetectados.forEach(p => {
        if (!pedidosNovos.has(p.id)) {
          pedidosNovos.add(p.id);
          showToast(`Novo pedido recebido! #${p.id} - ${escapeHtml(p.cliente_nome || '')}`, 'success', '🔔');
          tocarSomNovoPedido();
          setTimeout(() => pedidosNovos.delete(p.id), 60000);
        }
      });
      atualizarBadgeNotificacao();
      filtrarPedidosPorTab();
    }
  } catch (e) {}
}

function trocarTabPedidos(tab, btn) {
  tabPedidosAtiva = tab;
  document.querySelectorAll('.pedido-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filtrarPedidosPorTab();
}

function filtrarPedidosPorTab() {
  let filtrados;
  if (tabPedidosAtiva === 'ativos') {
    filtrados = todosPedidos.filter(p => !['entregue', 'cancelado'].includes(p.status));
  } else {
    filtrados = todosPedidos.filter(p => ['entregue', 'cancelado'].includes(p.status));
  }
  filtrados.sort((a,b)=>b.id-a.id);
  renderPedidos(filtrados);
}

const statusLabels = { recebido: 'Recebido', em_preparo: 'Em preparo', saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado' };
const payLabels = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', mesa: 'Mesa (pagar na conta)' };
const nextStatus = { recebido: 'em_preparo', em_preparo: 'saiu_entrega', saiu_entrega: 'entregue' };
const nextLabels = { recebido: 'Preparar', em_preparo: 'Enviar', saiu_entrega: 'Entregar' };

function normalizarTelefoneWhatsApp(telefone) {
  if (!telefone) return '';
  let digits = String(telefone).replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  if (digits.length === 11 && /^\d{2}9/.test(digits)) digits = digits.slice(0, 2) + digits.slice(3);
  if (digits.length === 11) digits = digits.slice(0, 2) + digits.slice(3);
  if (digits.length >= 11) digits = '55' + digits;
  return digits;
}

async function abrirWhatsAppCliente(id) {
  const p = todosPedidos.find(x => x.id === id);
  if (!p) return;
  try {
    let msg = config.whatsapp_mensagem_saiu_entrega || `Olá {nome}! Seu pedido #{id} saiu para entrega 🛵 - {loja}. Total R$ {total}`;
    msg = msg.replace(/\{nome\}/g, p.cliente_nome || 'cliente').replace(/\{id\}/g, p.id).replace(/\{total\}/g, (p.total || 0).toFixed(2)).replace(/\{loja\}/g, config.loja_nome || 'Lanchonete');
    const tel = normalizarTelefoneWhatsApp(p.cliente_telefone);
    if (!tel) return showToast('Telefone do cliente não informado');
    const link = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
    console.log('[WhatsApp] link gerado:', link, '| tel original:', p.cliente_telefone);
    window.open(link, '_blank');
  } catch (e) {
    console.error('WhatsApp:', e);
    showToast('Erro ao gerar link WhatsApp');
  }
}

function renderPedidos(pedidos) {
  const container = document.getElementById('pedidos-list');
  if (!pedidos.length) { container.innerHTML = '<p style="text-align:center;color:var(--gray);padding:40px">Nenhum pedido encontrado</p>'; return; }
  const ordenados = [...pedidos].sort((a,b)=>b.id-a.id);
  const gruposMap = {};
  ordenados.forEach(p=>{ if(p.mesa_id){ const k=p.comanda_id||`mesa-${p.mesa_id}`; (gruposMap[k]=gruposMap[k]||[]).push(p); }});
  const visitado = new Set();
  let html='';
  ordenados.forEach(p=>{
    if(!p.mesa_id){ html+=renderPedidoCard(p); return; }
    const k=p.comanda_id||`mesa-${p.mesa_id}`;
    if(visitado.has(k)) return;
    visitado.add(k);
    const grupo=gruposMap[k];
    if(grupo.length===1){ html+=renderPedidoCard(grupo[0]); }
    else {
      const mesaId=grupo[0].mesa_id;
      const comandaId=grupo[0].comanda_id;
      let totalGrupo=0; grupo.forEach(x=>totalGrupo+=x.total);
      html+=`<div class="pedido-grupo"><div class="pedido-grupo-header">Mesa ${mesaId} — Comanda #${comandaId}</div><div class="pedido-grupo-body">${grupo.map(x=>renderPedidoCard(x)).join('')}</div><div class="pedido-grupo-footer"><span>Total a cobrar (Mesa ${mesaId}):</span><span>R$ ${totalGrupo.toFixed(2)}</span></div></div>`;
    }
  });
  container.innerHTML=html;
}

function isRetiradaPedido(p) {
  return p.bairro_entrega === 'Retirada no local' || (p.endereco_entrega && String(p.endereco_entrega).startsWith('Retirada'));
}
const _BORDA_NOMES_SET=new Set(['CHOCOLATE','CHOCOLATE BRANCO','NUTELLA','GOIABADA','CATUPIRY','CHEDDAR','CREAM CHEESE']);
function isBordaAdicional(a){
  if(a && a.tipo) return String(a.tipo).toLowerCase()==='borda';
  const raw=String(a.adicional_nome||a.nome||'').trim();
  if(/borda/i.test(raw)) return true;
  const up=raw.toUpperCase();
  if(_BORDA_NOMES_SET.has(up) && (parseFloat(a.preco)||0) > 0) return true;
  if(_BORDA_NOMES_SET.has(up.replace(/^BORDA\s+/i,'')) && (parseFloat(a.preco)||0)>0) return true;
  return false;
}
function _displayBordaNome(a){ return String(a.adicional_nome||a.nome||'').replace(/^borda\s+/i,'').trim(); }
function isPizzaItemNome(n){ return /pizza/i.test(String(n||'')); }
function itemTemBorda(it){ return (it.adicionais||[]).some(isBordaAdicional); }
function isPizzaComBordaItem(it){ return isPizzaItemNome(it.produto_nome) && itemTemBorda(it); }
function pedidoTemPizzaComBorda(p){ return (p.itens||[]).some(isPizzaComBordaItem); }
function testarDestaquePizzaBordaLocal(){
  const mock={
    id:9999, status:'recebido', cliente_nome:'TESTE LOCAL', cliente_telefone:'(11) 99999-9999',
    criado_em:new Date().toISOString(), total:89.90, taxa_entrega:5, forma_pagamento:'pix', pix_confirmado:false,
    bairro_entrega:'Centro', endereco_entrega:'Rua Teste, 123', observacoes:'TESTE LOCAL - PIZZA C/ BORDA',
    itens:[
      {id:9001, produto_nome:'Pizza Grande - Calabresa', quantidade:1, preco_unitario:59.90, criado_em:new Date().toISOString(), adicionais:[{adicional_nome:'Borda Catupiry', preco:15},{adicional_nome:'Extra Bacon', preco:10}], observacao:''},
      {id:9002, produto_nome:'Coca-Cola 2L', quantidade:1, preco_unitario:10, criado_em:new Date().toISOString(), adicionais:[], observacao:''}
    ]
  };
  const mock2={
    id:9998, status:'recebido', cliente_nome:'TESTE SEM BORDA', cliente_telefone:'(11) 98888-8888',
    criado_em:new Date().toISOString(), total:45, taxa_entrega:0, forma_pagamento:'dinheiro',
    bairro_entrega:'Retirada no local', endereco_entrega:'Retirada no local', observacoes:'',
    itens:[{id:9003, produto_nome:'Pizza Média - Mussarela', quantidade:1, preco_unitario:45, criado_em:new Date().toISOString(), adicionais:[{adicional_nome:'Bacon', preco:0}], observacao:''}]
  };
  todosPedidos=[mock,mock2,...todosPedidos]; pedidosNovos.add(9999); setTimeout(()=>pedidosNovos.delete(9999),60000); filtrarPedidosPorTab(); showToast('Mocks de teste injetados: #9999 com BORDA destacado, #9998 sem','success','🧪'); setTimeout(()=>{ if(confirm('Testar impressão da comanda #9999 com destaque?')) imprimirComanda(9999); },400);
  return 'OK - cards #9999 e #9998 injetados';
}
window.testarDestaquePizzaBordaLocal=testarDestaquePizzaBordaLocal;
function renderPedidoCard(p) {
  const isNovo = pedidosNovos.has(p.id);
  const isRetirada = isRetiradaPedido(p);
  let maxItemTime = 0;
  let isNewPedido = false;
  if (isNovo) {
    p.itens.forEach(it => {
      const t = new Date(it.criado_em).getTime();
      if (t > maxItemTime) maxItemTime = t;
    });
    try {
      const pedidoCriado = new Date(p.criado_em).getTime();
      isNewPedido = Math.abs(maxItemTime - pedidoCriado) < 8000;
    } catch(e) {}
  }
  const hasPizzaBorda = pedidoTemPizzaComBorda(p);
  const itensHtml = p.itens.map(i => {
    const isItemNovo = isNovo && (() => {
      try {
        const it = new Date(i.criado_em).getTime();
        if (isNewPedido) return true;
        return (maxItemTime - it) < 5000;
      } catch(e){ return false; }
    })();
    const isPizzaBorda = isPizzaComBordaItem(i);
    let lineClass = isItemNovo ? 'pedido-item-line pedido-item-line--novo' : 'pedido-item-line';
    if (isPizzaBorda) lineClass += ' pedido-item--pizza-borda';
    const badgeItemNovo = isItemNovo ? `<span class="badge-item-novo">NOVO</span>` : '';
    const badgePizzaBorda = isPizzaBorda ? `<span class="badge-borda">🧀 BORDA</span>` : '';
    let line = `<div class="${lineClass}" ${isItemNovo ? `data-item-id="${i.id}" onclick="marcarItemLido(event, ${p.id}, ${i.id})" style="cursor:pointer" title="Clique para marcar item como lido"` : ''}><span>${i.quantidade}x ${escapeHtml(i.produto_nome)} ${badgeItemNovo}${badgePizzaBorda}</span><span>R$ ${(i.preco_unitario * i.quantidade).toFixed(2)}</span></div>`;
    if (i.adicionais && i.adicionais.length) {
      line += i.adicionais.map(a => {
        const borda = isBordaAdicional(a);
        const cls = borda ? 'pedido-item-adicional--borda' : 'pedido-item-adicional';
        let prefix = borda ? '🧀 BORDA: ' : '+ ';
        if (!borda && a.tipo && a.tipo !== 'adicional') {
           prefix = `[${a.tipo.toUpperCase()}]: `;
        }
        const nomeExib = borda ? _displayBordaNome(a) : a.adicional_nome;
        return `<div class="${cls}"><span>${prefix}${escapeHtml(nomeExib)}</span><span>${a.preco>0?'R$ '+(a.preco * i.quantidade).toFixed(2):'Incluído'}</span></div>`;
      }).join('');
    }
    if (i.observacao) line += `<div class="pedido-item-adicional">Obs: ${escapeHtml(i.observacao)}</div>`;
    return line;
  }).join('');

  const pixHtml = p.forma_pagamento === 'pix' && !p.mesa_id
    ? `<span class="pix-badge ${p.pix_confirmado ? 'pix-confirmado' : 'pix-pendente'}">${p.pix_confirmado ? 'Pix confirmado' : 'Pix pendente'}</span>`
    : '';

  let trocoHtml = '';
  if (p.forma_pagamento === 'dinheiro') {
    const match = p.observacoes?.match(/Troco para R\$ ([\d.,]+)/);
    if (match) {
      const valorRecebido = parseFloat(match[1].replace(',', '.'));
      const troco = valorRecebido - p.total;
      trocoHtml = `
        <div class="pedido-recebido">Recebido: R$ ${valorRecebido.toFixed(2)}</div>
        <div class="pedido-troco ${troco >= 0 ? '' : 'pedido-troco-negativo'}">Troco: R$ ${troco.toFixed(2)}</div>
      `;
    } else {
      trocoHtml = `<div class="pedido-troco-nao">Troco: Não informado</div>`;
    }
  }

  const actionsHtml = [];
  if (nextStatus[p.status]) {
    actionsHtml.push(`<button class="btn btn-success btn-xs" onclick="atualizarStatus(${p.id}, '${nextStatus[p.status]}')">${nextLabels[p.status]}</button>`);

    if (p.status === 'saiu_entrega' && !p.mesa_id && p.cliente_telefone) {
      actionsHtml.push(`<button class="btn btn-success btn-xs" onclick="abrirWhatsAppCliente(${p.id})">📱 WhatsApp</button>`);
    }
  }
  if (p.status !== 'cancelado' && p.status !== 'entregue') {
    actionsHtml.push(`<button class="btn btn-danger btn-xs" onclick="atualizarStatus(${p.id}, 'cancelado')">Cancelar</button>`);
  }
  const solicitouEntrega = isRetirada && p.observacoes && p.observacoes.includes('SOLICITOU ENTREGA');
  if (solicitouEntrega && !['entregue','cancelado'].includes(p.status)) {
    actionsHtml.push(`<button class="btn btn-warning btn-xs" onclick="converterParaEntrega(${p.id})" style="white-space:normal;line-height:1.2;text-align:center;min-width:140px">🚚 Mudar para entrega</button>`);
  }
  if (p.forma_pagamento === 'pix' && !p.pix_confirmado && !p.mesa_id) {
    actionsHtml.push(`<button class="btn btn-warning btn-xs" onclick="confirmarPix(${p.id})">Confirmar Pix</button>`);
  }
  actionsHtml.push(`<button class="btn btn-primary btn-xs" onclick="imprimirComanda(${p.id})">Imprimir</button>`);

  // Selecao de motoboy para pedidos de entrega (oculta para mesa, viagem e retirada)
  const ehAvulsoGarcom = p.bairro_entrega === 'Avulso' || p.bairro_entrega === 'Viagem' || (p.observacoes && (p.observacoes.includes('AVULSO') || p.observacoes.includes('VIAGEM')));
  const motoboysAtivos = motoboysLista.filter(m => m.ativo);
  const motoboySelect = !isRetirada && !p.mesa_id && !ehAvulsoGarcom && p.status !== 'cancelado' ? `
    <div style="margin-top: 8px;" onclick="event.stopPropagation()">
      <select class="filter-select" style="width:100%; font-size: 0.78rem; padding: 6px 8px;" onclick="event.stopPropagation()" onchange="atribuirMotoboy(event, ${p.id}, this.value)">
        <option value="">🏍️ Motoboy não definido</option>
        ${motoboysAtivos.map(m => `<option value="${m.id}" ${p.motoboy_id == m.id ? 'selected' : ''}>${escapeHtml(m.nome)}</option>`).join('')}
      </select>
      ${!motoboysAtivos.length ? `<small style="color:#E65100">Nenhum motoboy ativo — cadastre em Motoboys</small>` : ''}
      ${p.motoboy_nome && !motoboysLista.some(m => m.id == p.motoboy_id && m.ativo) ? `<small style="color:var(--gray)">Entregou: ${escapeHtml(p.motoboy_nome)}</small>` : ''}
    </div>
  ` : '';

  const novoBadge = isNovo ? `<span class="badge-novo">🆕 NOVO • clique para marcar lido</span>` : '';
  const bordaBadge = hasPizzaBorda ? `<span class="badge-borda">🧀 BORDA</span>` : '';
  const cardExtraClass = (isNovo ? ' pedido-card--novo' : '') + (hasPizzaBorda ? ' pedido-card--pizza-borda' : '');
  const mesaBadge = p.mesa_id ? `<span class="badge-mesa">Mesa ${p.mesa_id}</span>` : (p.bairro_entrega === 'Avulso' || p.bairro_entrega === 'Viagem' ? `<span class="badge-avulso">Viagem</span>` : '');

  const solicitouTag = p.observacoes && p.observacoes.includes('SOLICITOU ENTREGA') ? `<div style="background:#FFF3E0;border:1px solid #FFB74D;border-radius:6px;padding:6px 8px;margin-top:6px;font-size:0.82rem;color:#E65100">⚠️ Cliente solicitou entrega via WhatsApp</div>` : '';
  const enderecoHtml = isRetirada
    ? `<div class="pedido-endereco" style="background:#E8F5E9;border:1px solid #A5D6A7;border-radius:6px;padding:6px 8px;margin-top:6px">🏠 Retirada no local</div>${solicitouTag}`
    : (p.endereco_entrega ? `<div class="pedido-endereco">&#128205; ${escapeHtml(p.endereco_entrega)} - ${escapeHtml(p.bairro_entrega)}</div>` : '');
  return `
    <div class="pedido-card status-${p.status}${cardExtraClass}" data-pedido-id="${p.id}" onclick="marcarPedidoLido(${p.id})" style="${isNovo ? 'cursor:pointer' : ''}" title="${isNovo ? 'Clique para marcar como lido' : ''}">
      <div class="pedido-header">
        <span class="pedido-id">#${p.id} ${mesaBadge} ${novoBadge}${bordaBadge}</span>
        <span class="status-badge status-${p.status}">${statusLabels[p.status]}</span>
      </div>
      <div class="pedido-time">${new Date(p.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
      <div class="pedido-cliente">${escapeHtml(p.cliente_nome)}</div>
      <div class="pedido-tel">${escapeHtml(p.cliente_telefone)}</div>
      <div class="pedido-items">${itensHtml}</div>
      ${p.observacoes ? `<div class="pedido-obs">${escapeHtml(p.observacoes)}</div>` : ''}
      ${enderecoHtml}
      <div class="pedido-footer">
        <div>
          <div class="pedido-total">Total: R$ ${p.total.toFixed(2)}</div>
          <div class="pedido-payment">${payLabels[p.forma_pagamento] || p.forma_pagamento} ${pixHtml}</div>
          ${p.taxa_entrega > 0 ? `<div style="font-size:0.75rem;color:var(--gray)">Taxa: R$ ${p.taxa_entrega.toFixed(2)}</div>` : ''}
          ${trocoHtml}
        </div>
      </div>
      <div class="pedido-actions" style="flex-wrap:wrap">${actionsHtml.join('')}</div>
      ${motoboySelect}
    </div>
  `;
}

async function atualizarStatus(id, status) {
  await authFetch(`/api/pedidos/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  carregarPedidos();
}

// MOTOBOYS
let motoboysLista = [];

async function carregarMotoboys() {
  const res = await authFetch('/api/motoboys');
  motoboysLista = await res.json();

  const el = document.getElementById('motoboys-list');
  if (el) {
    el.innerHTML = motoboysLista.length ? `<table>
    <thead><tr><th>Nome</th><th>Telefone</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${motoboysLista.map(m => `
      <tr style="${m.ativo ? '' : 'opacity:.55'}">
        <td><strong>${escapeHtml(m.nome)}</strong></td>
        <td>${escapeHtml(m.telefone || '-')}</td>
        <td><span class="status-badge ${m.ativo ? 'pix-confirmado' : 'status-cancelado'}">${m.ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-xs ${m.ativo ? 'btn-warning' : 'btn-success'}" onclick="alternarMotoboy(${m.id}, ${m.ativo ? 0 : 1})">${m.ativo ? 'Desativar' : 'Ativar'}</button>
          <button class="btn btn-xs btn-primary" onclick="editarMotoboy(${m.id})">Editar</button>
          <button class="btn btn-xs btn-danger" onclick="excluirMotoboy(${m.id})">Excluir</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table>` : '<p style="text-align:center;color:var(--gray);padding:30px">Nenhum motoboy cadastrado</p>';
  }

  // Se pedidos já estão carregados, re-renderiza os cards para preencher o select de motoboy
  if (todosPedidos.length && document.getElementById('sec-pedidos')?.classList.contains('active')) {
    filtrarPedidosPorTab();
  }
}

async function salvarMotoboy() {
  const nome = document.getElementById('motoboy-nome').value.trim();
  const telefone = document.getElementById('motoboy-telefone').value.trim();
  if (!nome) { showToast('Informe o nome do motoboy'); return; }
  try {
    const res = await authFetch('/api/motoboys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, telefone }) });
    await verificarResposta(res);
    document.getElementById('motoboy-nome').value = '';
    document.getElementById('motoboy-telefone').value = '';
    carregarMotoboys();
    showToast('Motoboy cadastrado!');
  } catch (e) {
    showToast(e.message === 'Failed to fetch' ? 'Erro de conexão com o servidor' : e.message);
  }
}

function editarMotoboy(id) {
  const m = motoboysLista.find(x => x.id === id);
  if (!m) return;
  const novoNome = prompt('Novo nome:', m.nome);
  if (!novoNome) return;
  const novoTel = prompt('Novo telefone:', m.telefone || '');
  authFetch(`/api/motoboys/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: novoNome, telefone: novoTel }) })
    .then(() => { carregarMotoboys(); showToast('Motoboy atualizado!'); });
}

async function alternarMotoboy(id, novoAtivo) {
  await authFetch(`/api/motoboys/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: novoAtivo }) });
  carregarMotoboys();
}

async function excluirMotoboy(id) {
  if (!confirm('Excluir este motoboy? Os pedidos associados ficarão sem motoboy.')) return;
  await authFetch(`/api/motoboys/${id}`, { method: 'DELETE' });
  carregarMotoboys();
}

async function atribuirMotoboy(a, b, c) {
  let pedidoId, motoboyId;
  if (a && typeof a === 'object' && a.stopPropagation) { try { a.stopPropagation(); } catch(e){} pedidoId = b; motoboyId = c; } else { pedidoId = a; motoboyId = b; }
  try {
    const res = await authFetch(`/api/pedidos/${pedidoId}/motoboy`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motoboy_id: motoboyId || null }) });
    await verificarResposta(res);
    const p = todosPedidos.find(x => String(x.id) === String(pedidoId));
    if (p) {
      p.motoboy_id = motoboyId ? parseInt(motoboyId) : null;
      const m = motoboysLista.find(x => String(x.id) === String(motoboyId));
      p.motoboy_nome = m ? m.nome : (motoboyId ? p.motoboy_nome : null);
    }
    showToast(motoboyId ? 'Motoboy atribuído!' : 'Motoboy removido!');
    filtrarPedidosPorTab();
  } catch (e) {
    showToast(e.message);
  }
}

async function converterParaEntrega(pedidoId) {
  const p = todosPedidos.find(x => String(x.id) === String(pedidoId));
  if (!p) { showToast('Pedido não encontrado'); return; }
  // busca dados completos do cliente para preencher automaticamente
  let cliente = null;
  try {
    if (p.cliente_id) {
      const cr = await authFetch(`/api/clientes/${p.cliente_id}`);
      if (cr.ok) cliente = await cr.json();
    }
  } catch(e) {}
  let bairroNome = cliente?.bairro || '';
  // trata cadastro corrompido antigo onde bairro ficou "Retirada no local"
  if (bairroNome === 'Retirada no local') bairroNome = '';
  let enderecoFmt = '';
  if (cliente) {
    if (cliente.rua) enderecoFmt += cliente.rua;
    if (cliente.numero) enderecoFmt += `, ${cliente.numero}`;
    if (cliente.complemento) enderecoFmt += ` - ${cliente.complemento}`;
    if (cliente.ponto_referencia) enderecoFmt += ` (Ref: ${cliente.ponto_referencia})`;
  }
  // se ainda sem bairro (cadastro corrompido), tenta último pedido válido do cliente
  if (!bairroNome && p.cliente_id) {
    try {
      const hr = await authFetch(`/api/clientes/${p.cliente_id}/pedidos`);
      if (hr.ok) {
        const hist = await hr.json();
        const ult = hist.find(x => x.bairro_entrega && x.bairro_entrega !== 'Retirada no local');
        if (ult) {
          bairroNome = ult.bairro_entrega;
          if (!enderecoFmt && ult.endereco_entrega) enderecoFmt = ult.endereco_entrega;
        }
      }
    } catch(e) {}
  }
  // se cliente sem endereço, cai no fluxo manual de bairros
  let bairros = [];
  try { const r = await authFetch('/api/bairros'); bairros = await r.json(); } catch(e) { bairros = []; }
  let bairro = bairros.find(b => b.nome.toLowerCase() === String(bairroNome).toLowerCase());
  let taxa = bairro ? bairro.taxa_entrega : 0;
  if (!bairroNome || !bairro) {
    if (!bairros.length) { showToast('Cliente sem bairro cadastrado e nenhum bairro disponível'); return; }
    const lista = bairros.map(b => `${b.nome} - R$ ${Number(b.taxa_entrega).toFixed(2)}`).join('\n');
    // pré-preenche com bairro do cliente se houver
    const nomeBairro = prompt(`Cliente: ${p.cliente_nome} - ${cliente ? (cliente.bairro || 'sem bairro') : ''}\nBairros disponíveis:\n${lista}\n\nDigite o bairro para entrega:`, bairroNome || '');
    if (!nomeBairro) return;
    bairro = bairros.find(b => b.nome.toLowerCase() === nomeBairro.trim().toLowerCase());
    if (!bairro) { showToast('Bairro não encontrado'); return; }
    bairroNome = bairro.nome;
    taxa = bairro.taxa_entrega;
    const endereco = prompt('Endereço completo para entrega (rua, número, complemento):', enderecoFmt || '');
    if (endereco === null) return;
    enderecoFmt = (endereco && endereco.trim()) ? endereco.trim() : bairroNome;
  } else {
    // cliente já tem endereço completo - confirmar com admin
    const confirma = confirm(`Converter pedido #${pedidoId} de ${p.cliente_nome} para entrega?\n\nBairro: ${bairroNome} - Taxa R$ ${Number(taxa).toFixed(2)}\nEndereço: ${enderecoFmt || bairroNome}\n\nOs dados do cliente serão usados. Confirmar?`);
    if (!confirma) {
      const endereco = prompt('Editar endereço se necessário:', enderecoFmt || bairroNome);
      if (endereco === null) return;
      if (endereco.trim()) enderecoFmt = endereco.trim();
    }
  }
  try {
    const res = await authFetch(`/api/pedidos/${pedidoId}/converter-entrega`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bairro_entrega: bairroNome, endereco_entrega: enderecoFmt || bairroNome, taxa_entrega: taxa }) });
    await verificarResposta(res);
    const data = await res.json();
    showToast(`Pedido #${pedidoId} convertido para entrega - ${bairroNome} - taxa R$ ${Number(data.taxa_entrega).toFixed(2)} - total R$ ${Number(data.total).toFixed(2)}`);
    carregarPedidos();
  } catch(e) { showToast(e.message); }
}

async function carregarRelatorioMotoboys() {
  const periodo = document.getElementById('periodo-motoboys').value;
  const di = document.getElementById('motoboy-data-inicio')?.value || '';
  const df = document.getElementById('motoboy-data-fim')?.value || '';
  let qs = '';
  if (di && df) qs = `data_inicio=${di}&data_fim=${df}`;
  else if (di) qs = `data_inicio=${di}`;
  else if (df) qs = `data_fim=${df}`;
  else qs = `periodo=${periodo}`;
  const res = await authFetch(`/api/motoboys/resumo?${qs}`);
  const resumo = await res.json();

  const totalEntregas = resumo.reduce((s, m) => s + Number(m.entregas), 0);
  const totalTaxas = resumo.reduce((s, m) => s + Number(m.total_taxas), 0);

  document.getElementById('motoboys-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${totalEntregas}</div><div class="stat-label">Entregas</div></div>
    <div class="stat-card"><div class="stat-value">R$ ${totalTaxas.toFixed(2)}</div><div class="stat-label">Total das taxas</div></div>
  `;

  document.getElementById('motoboys-resumo').innerHTML = resumo.length ? `<table>
    <thead><tr><th>Motoboy</th><th>Entregas</th><th>Total das taxas</th></tr></thead>
    <tbody>${resumo.map(m => `<tr><td><strong>${escapeHtml(m.nome)}</strong></td><td>${m.entregas}</td><td>R$ ${Number(m.total_taxas).toFixed(2)}</td></tr>`).join('')}</tbody>
    ${resumo.length > 1 ? `<tfoot><tr><td><strong>Total</strong></td><td><strong>${totalEntregas}</strong></td><td><strong>R$ ${totalTaxas.toFixed(2)}</strong></td></tr></tfoot>` : ''}
  </table>` : '<p style="color:var(--gray);text-align:center;padding:20px">Nenhuma entrega com motoboy no período</p>';
}

async function confirmarPix(id) {
  await authFetch(`/api/pedidos/${id}/pix`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmado: true }) });
  showToast('Pix confirmado!');
  carregarPedidos();
}

function imprimirComandaObj(p){ return _imprimirComandaObj(p); }
async function imprimirComanda(pedidoId) {
  const win = window.open('', '_blank', 'width=420,height=650');
  if (!win) { showToast('Pop-up bloqueado: habilite pop-ups para impressão'); return; }
  win.document.write('<html><body style="font-family:monospace;padding:20px">Carregando comanda...</body></html>');
  try {
    let p = (typeof todosPedidos!=='undefined'?todosPedidos.find(x=>String(x.id)===String(pedidoId)):null);
    const precisaFetch = !p || !p.itens || String(p.id).startsWith('999')===false && p.itens.length===0;
    if (!p || precisaFetch) {
      const res = await authFetch(`/api/pedidos/${pedidoId}`);
      if (!res.ok) throw new Error('Pedido não encontrado');
      p = await res.json();
    }
    if(String(p.id).startsWith('999') && p.id===9999) {}
    win.document.open();
    win.document.write(_gerarHtmlComanda(p));
    win.document.close();
    win.focus();
    CarregarNomeLojaComanda(win).then(() => {
      setTimeout(() => { try{ win.print(); }catch(e){} setTimeout(() => { try{ win.close(); }catch(e){} }, 300); }, 250);
    });
  } catch(e){ try{ win.close(); }catch(_){} showToast('Erro ao gerar comanda: '+e.message); }
}
function _gerarHtmlComanda(p){
    const dataHora = new Date(p.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const payLabel = payLabels[p.forma_pagamento] || p.forma_pagamento;
    const statusLabel = statusLabels[p.status] || p.status;
    const _isPizzaPrint = n => /pizza/i.test(String(n||''));
    let itensHtml = '';
    let subtotalItens = 0;
    let totalAdicionais = 0;
    (p.itens||[]).forEach((item, idx) => {
      const itemTotal = (parseFloat(item.preco_unitario)||0) * (parseFloat(item.quantidade)||0);
      subtotalItens += itemTotal;
      const adicionaisTotal = (item.adicionais || []).reduce((s,a)=>s + (parseFloat(a.preco)||0) * (parseFloat(item.quantidade)||0), 0);
      totalAdicionais += adicionaisTotal;
      const isPizzaBordaPrint = _isPizzaPrint(item.produto_nome) && (item.adicionais||[]).some(a=> isBordaAdicional(a));
      const blocoCls = isPizzaBordaPrint ? 'item-bloco item-bloco--pizza-borda' : 'item-bloco';
      const bordaBadgePrint = isPizzaBordaPrint ? ' <span class="badge-borda-print">🧀 BORDA RECHEADA</span>' : '';
      itensHtml += `
        <div class="${blocoCls}">
          <div class="item-header">
            <span class="item-qty">${item.quantidade}x</span>
            <span class="item-nome">${escapeHtml(item.produto_nome)}${bordaBadgePrint}</span>
            <span class="item-val">R$ ${itemTotal.toFixed(2)}</span>
          </div>
          ${(item.adicionais && item.adicionais.length) ? `
            <div class="item-adics">
              ${item.adicionais.map(a=>{
                const borda = isBordaAdicional(a);
                const cls = borda ? 'adic-linha adic-linha--borda' : 'adic-linha';
                let pref = borda ? '🧀 BORDA RECHEADA: ' : '↳ ';
                const adicNome = a.adicional_nome || a.nome || '';
                if (!borda && a.tipo && a.tipo !== 'adicional') {
                   pref = `[${a.tipo.toUpperCase()}] `;
                } else if (!borda) {
                   pref = `[ADICIONAL] `;
                }
                const nEx = borda ? _displayBordaNome(a) : adicNome;
                return `<div class="${cls}"><span class="adic-nome">${pref}${escapeHtml(nEx)}</span><span class="adic-val">${a.preco > 0 ? 'R$ ' + ((parseFloat(a.preco)||0) * (parseFloat(item.quantidade)||0)).toFixed(2) : 'Incluído'}</span></div>`;
              }).join('')}
            </div>
          ` : ''}
          ${item.observacao ? `<div class="item-obs">💬 OBS: ${escapeHtml(item.observacao)}</div>` : ''}
        </div>
        ${idx < p.itens.length - 1 ? '<div class="item-sep"></div>' : ''}
      `;
    });
    let trocoHtml = '';
    if (p.forma_pagamento === 'dinheiro') {
      const match = p.observacoes?.match(/Troco para R\$ ([\d.,]+)/);
      if (match) {
        const valorRecebido = parseFloat(match[1].replace(',', '.'));
        const troco = valorRecebido - p.total;
        trocoHtml = `<div class="linha"><span>Troco para:</span><span>R$ ${valorRecebido.toFixed(2)}</span></div>
                     <div class="linha destaque"><span>Troco:</span><span>R$ ${troco.toFixed(2)}</span></div>`;
      }
    }
    let obsPedido = p.observacoes || '';
    if (p.forma_pagamento === 'dinheiro') obsPedido = obsPedido.replace(/\s*\|\s*Troco para R\$ [\d.,]+/, '').trim();
    obsPedido = obsPedido.replace(/\s*\|\s*Pedido WhatsApp \(admin\)/gi, '').replace(/Pedido WhatsApp \(admin\)/gi, '').trim();
    obsPedido = obsPedido.replace(/^\|\s*/, '').replace(/\s*\|\s*$/, '').trim();
    if (obsPedido === '|') obsPedido = '';
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Comanda #${p.id}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 80mm; font-family: 'Courier New', monospace; font-size: 11px; color: #000 !important; padding: 0; background: #fff !important; font-weight: 700; }
  .ticket * { font-weight: 700 !important; color: #000 !important; background: #fff !important; }
  .ticket { padding: 4mm; }
  .header { text-align: center; padding: 3mm 2mm; border-bottom: 2px solid #000; margin-bottom: 3mm; }
  .header h1 { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
  .header .sub { font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-top: 1mm; }
  .badge-pedido { display: inline-block; border: 2px solid #000; padding: 1.5mm 4mm; font-size: 11px; font-weight: 900; margin-top: 3mm; text-transform: uppercase; }
 .info-card { border: 1px solid #000; padding: 2.5mm; margin: 3mm 0; }
  .info-row { display: flex; gap: 2mm; margin: 1.5mm 0; font-size: 14.5px; line-height: 1.35; }
  .info-label { font-weight: 800; min-width: 18mm; flex-shrink: 0; color: #000; }
  .info-value { flex: 1; font-weight: 800; word-break: break-word; color: #000; }
  .sep { border: none; border-top: 1px dashed #000; margin: 3mm 0; }
  .sep-strong { border-top: 2px solid #000; margin: 3mm 0; }
  .itens-lista { border: 2px solid #000; padding: 2.5mm; margin: 3mm 0; }
  .itens-titulo { font-size: 9px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; text-align: center; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 1.5mm 0; margin-bottom: 2mm; }
  .item-bloco--pizza-borda { border: 2.5px solid #000 !important; background: #fff !important; padding: 2mm !important; }
  .badge-borda-print { display: inline-block; border: 1.5px solid #000; padding: 0.5mm 2mm; font-size: 9px; font-weight: 900; background: #fff; color: #000; margin-left: 1.5mm; vertical-align: middle; }
  .adic-linha--borda { background: #fff !important; border: 1.5px solid #000 !important; padding: 1.5mm 2mm !important; margin: 1mm 0; font-size: 12px !important; }
  .item-bloco { border-bottom: 1px dashed #000; padding: 0 0 2mm 0; margin: 0 0 2mm 0; }
  .item-bloco:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
  .item-header { display: flex; align-items: center; gap: 2mm; font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 1.5mm; margin-bottom: 1.5mm; }
  .item-qty { border: 1.5px solid #000; font-weight: 900; font-size: 13px; padding: 1mm 2.5mm; min-width: 11mm; text-align: center; flex-shrink: 0; background: #fff; color: #000; }
  .item-nome { flex: 1; font-weight: 900; font-size: 13px; text-transform: uppercase; letter-spacing: 0.3px; }
  .item-val { font-weight: 900; white-space: nowrap; font-size: 12px; border: 1px solid #000; padding: 0.5mm 2mm; background: #fff; color: #000; }
  .item-detalhe { font-size: 8px; margin: 1mm 0 0 0; font-style: italic; font-weight: 600; color: #000; }
  .item-adics { margin: 2mm 0 0 0; padding: 1.2mm 2mm; border: 1.2px dashed #000; background: #fff; }
  .adic-linha { display: flex; justify-content: space-between; align-items: flex-start; gap: 2mm; font-size: 11.5px; line-height: 1.35; padding: 1.3mm 0; border-bottom: 1px dashed #000; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 0.2px; }
  .adic-linha:last-child { border-bottom: none; }
  .adic-nome { color: #000; }
  .adic-val { font-weight: 900; white-space: nowrap; margin-left: 2mm; color: #000; }
  .item-obs { margin: 2.5mm 0 0 0; border: 2px solid #000; padding: 2.5mm; font-size: 13px; font-weight: 900; font-style: normal; background: #fff; text-transform: uppercase; color: #000; line-height: 1.4; }
  .item-obs::before { content: 'OBS: '; font-weight: 900; }
  .item-sep { display: none; }
  .totals { border: 1px solid #000; padding: 2.5mm; margin: 3mm 0; }
  .totals .linha { display: flex; justify-content: space-between; margin: 1mm 0; font-size: 10px; }
  .totals .linha span:last-child { font-weight: 800; color: #000; }
  .total-box { border: 2px solid #000; padding: 3mm; margin: 2.5mm 0; display: flex; justify-content: space-between; align-items: center; font-weight: 900; color: #000; }
  .total-box span:first-child { font-size: 12px; }
  .total-box span:last-child { font-size: 16px; }
  .pay-status { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; margin: 3mm 0; }
  .pay-card { border: 1px solid #000; padding: 2mm; text-align: center; background: #fff; }
  .pay-card .label { font-size: 7px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: #000; }
  .pay-card .value { font-size: 10px; font-weight: 900; margin-top: 1mm; color: #000; }
  .obs-box { border: 2.5px solid #000; padding: 3.5mm; margin: 3.5mm 0; font-size: 14px; font-weight: 900; text-align: center; text-transform: uppercase; color: #000; line-height: 1.4; }
  .troco-box { border: 2px solid #000; padding: 3mm; margin: 3mm 0; background: #fff; }
  .troco-box .linha { display:flex; justify-content:space-between; font-size: 13px; font-weight: 900; line-height: 1.4; color: #000; }
  .troco-box .linha.destaque { font-size: 15px; border-top: 1.5px solid #000; margin-top: 1.5mm; padding-top: 1.5mm; }
  .rodape { text-align: center; margin-top: 4mm; padding-top: 3mm; border-top: 2px solid #000; }
  .rodape .obrigado { font-size: 11px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #000; }
  .rodape .sub { font-size: 8px; margin-top: 1mm; color: #000; }
  .rodape .contato { font-size: 7.5px; margin-top: 2mm; border: 1px solid #000; padding: 2mm; color: #000; }
  @media print {
    body { width: auto; }
    @page { size: 80mm auto; margin: 2mm; }
    .ticket { padding: 0; }
  }
</style>
</head>
<body>
  <div class="ticket">
  <div class="header">
    <h1 id="loja-nome-comanda">Lanchonete</h1>
    <div class="sub">✦ Comanda de Pedido ✦</div>
    <div class="badge-pedido">PEDIDO #${p.id} • ${statusLabel.toUpperCase()}</div>
  </div>
  <div style="text-align:center; font-size:8px; color:#000; margin:2.5mm 0 1mm">${dataHora}</div>
  <div class="info-card">
    <div class="info-row"><span class="info-label">👤 Cliente</span><span class="info-value">${escapeHtml(p.cliente_nome)}</span></div>
    <div class="info-row"><span class="info-label">📞 Telefone</span><span class="info-value">${escapeHtml(p.cliente_telefone)}</span></div>
    ${p.endereco_entrega ? `<div class="info-row"><span class="info-label">📍 Entrega</span><span class="info-value">${escapeHtml(p.endereco_entrega)}</span></div>` : ''}
    ${p.bairro_entrega ? `<div class="info-row"><span class="info-label">🏘️ Bairro</span><span class="info-value">${escapeHtml(p.bairro_entrega)}</span></div>` : ''}
    ${p.mesa_id ? `<div class="info-row"><span class="info-label">🪑 Mesa</span><span class="info-value">Mesa ${p.mesa_id}${p.comanda_id ? ` • Comanda #${p.comanda_id}` : ''}</span></div>` : ''}
  </div>
  <div class="sep-strong"></div>
  <div class="itens-lista"><div class="itens-titulo">🍽️ Itens do Pedido</div>${itensHtml}</div>
  <div class="totals">
    <div class="linha"><span>Subtotal itens</span><span>R$ ${subtotalItens.toFixed(2)}</span></div>
    ${totalAdicionais > 0 ? `<div class="linha"><span>Adicionais</span><span>R$ ${totalAdicionais.toFixed(2)}</span></div>` : ''}
    <div class="linha" style="border-top:1px solid #000; padding-top:1mm; margin-top:1mm; font-weight:800"><span>Subtotal geral</span><span>R$ ${(subtotalItens + totalAdicionais).toFixed(2)}</span></div>
    ${p.taxa_entrega > 0 ? `<div class="linha"><span>Taxa de entrega</span><span>R$ ${Number(p.taxa_entrega).toFixed(2)}</span></div>` : `<div class="linha"><span>Taxa de entrega</span><span>Grátis</span></div>`}
  </div>
  <div class="total-box">
    <span>TOTAL A PAGAR</span><span>R$ ${Number(p.total).toFixed(2)}</span>
  </div>
  <div class="pay-status">
    <div class="pay-card ${p.forma_pagamento==='pix'?'pix':''}"><div class="label">Pagamento</div><div class="value">${payLabel}</div></div>
    <div class="pay-card"><div class="label">Status</div><div class="value">${statusLabel}</div></div>
  </div>
  ${trocoHtml ? `<div class="troco-box">${trocoHtml}</div>` : ''}
  ${obsPedido ? `<div class="obs-box"><strong>Obs:</strong> ${escapeHtml(obsPedido)}</div>` : ''}
  <div class="rodape">
    <div class="obrigado">Obrigado pela preferência! 💛</div>
    <div class="sub">Volte sempre • Pedido preparado com carinho</div>
    <div class="contato" id="loja-contato-comanda">Aguardamos seu próximo pedido!</div>
  </div>
  </div>
</body>
</html>`;
}
function _imprimirComandaObj(p){
  try {
    const win = window.open('', '_blank', 'width=420,height=650');
    if (!win) { showToast('Pop-up bloqueado: habilite pop-ups para impressão'); return; }
    win.document.open();
    win.document.write(_gerarHtmlComanda(p));
    win.document.close();
    win.focus();
    CarregarNomeLojaComanda(win).then(() => {
      setTimeout(() => { try{ win.print(); }catch(e){} setTimeout(() => { try{ win.close(); }catch(e){} }, 300); }, 250);
    });
  } catch (e) { showToast('Erro ao gerar comanda: ' + e.message); }
}

async function CarregarNomeLojaComanda(win) {
  try {
    const res = await authFetch('/api/config');
    const cfg = await res.json();
    const el = win.document.getElementById('loja-nome-comanda');
    if (el && cfg.loja_nome) el.textContent = cfg.loja_nome;
    const el2 = win.document.getElementById('loja-contato-comanda');
    if (el2) el2.style.display = 'none';
  } catch (e) {}
}

// PRODUTOS
async function carregarProdutosAdmin() {
  const [prodRes, catRes] = await Promise.all([authFetch('/api/produtos'), authFetch('/api/categorias')]);
  const produtos = await prodRes.json();
  const categorias = await catRes.json();

  // Armazenar produtos para filtro
  window.produtosAdmin = produtos;
  window.categoriasAdmin = categorias;

  const select = document.getElementById('prod-categoria');
  select.innerHTML = categorias.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');

  // Popular select de filtro preservando a seleção atual
  const filtroSelect = document.getElementById('filtro-categoria-produtos');
  if (filtroSelect) {
    const filtroAtual = filtroSelect.value;
    filtroSelect.innerHTML = '<option value="">Todas as categorias</option>' + 
      categorias.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
    if ([...filtroSelect.options].some(o => o.value === filtroAtual)) {
      filtroSelect.value = filtroAtual;
    }
  }

  filtrarProdutosAdmin();
}

function renderizarProdutosAdmin(produtos) {
  const container = document.getElementById('produtos-list');
  if (!produtos.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--gray);padding:40px">Nenhum produto encontrado</p>';
    return;
  }

  // Ordenar pela ordem da categoria e, dentro dela, por preco
  const ordemMap = new Map((window.categoriasAdmin || []).map(c => [c.id, c.ordem ?? 999]));
  const ordenados = [...produtos].sort((a, b) =>
    ((ordemMap.get(a.categoria_id) ?? 999) - (ordemMap.get(b.categoria_id) ?? 999)) || (a.preco - b.preco)
  );

  container.innerHTML = `
    <div style="padding: var(--space-2) var(--space-3); color: var(--color-text-muted); font-size: var(--text-xs);">
      ${ordenados.length} produto(s)
    </div>
    <table>
    <thead><tr><th>Foto</th><th>Nome</th><th>Categoria</th><th>Preço</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${ordenados.map(p => {
      const categoria = (window.categoriasAdmin || []).find(c => c.id === p.categoria_id);
      return `
      <tr style="${p.ativo ? '' : 'opacity:.55'}">
        <td>${p.foto ? `<img src="${p.foto}" style="width:50px;height:50px;object-fit:cover;border-radius:6px" alt="${escapeHtml(p.nome)}" data-categoria="${escapeHtml(p.categoria_nome||'')}" data-nome="${escapeHtml(p.nome)}" onerror="handleImgError(this)">` : `<div style="width:50px;height:50px;border-radius:6px;background:var(--color-bg-alt);display:flex;align-items:center;justify-content:center;font-size:22px">${(window.categoriaIcon?window.categoriaIcon(p.nome,p.categoria_nome):'&#127828;')}</div>`}</td>
        <td><strong>${escapeHtml(p.nome)}</strong><br><small style="color:var(--gray)">${escapeHtml(p.descricao || '')}</small></td>
        <td><span class="pix-badge" style="background:var(--color-bg-alt);color:var(--color-text-secondary)">${escapeHtml(p.categoria_nome)}${categoria ? ` (#${categoria.ordem})` : ''}</span></td>
        <td><strong>R$ ${p.preco.toFixed(2)}</strong>${p.unidade === 'kg' ? '/kg' : ''}</td>
        <td>
          <span class="status-badge ${p.ativo ? 'pix-confirmado' : 'status-cancelado'}">${p.ativo ? 'Ativo' : 'Inativo'}</span>
          ${p.somente_garcom ? '<span class="status-badge status-em_preparo" style="margin-top:4px">&#127968; Só na loja</span>' : ''}
        </td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm ${p.ativo ? 'btn-warning' : 'btn-success'}" onclick="alternarProduto(${p.id}, ${p.ativo ? 0 : 1})">${p.ativo ? 'Desativar' : 'Ativar'}</button>
          <button class="btn btn-sm btn-primary" onclick="editarProdutoPorId(${p.id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="excluirProduto(${p.id})">Excluir</button>
        </td>
      </tr>
    `}).join('')}</tbody>
  </table>`;
}

function filtrarProdutosAdmin() {
  const categoriaId = document.getElementById('filtro-categoria-produtos').value;
  const busca = (document.getElementById('busca-produto')?.value || '').trim().toLowerCase();

  let produtosFiltrados = window.produtosAdmin;
  if (categoriaId) {
    produtosFiltrados = produtosFiltrados.filter(p => p.categoria_id == categoriaId);
  }
  if (busca) {
    produtosFiltrados = produtosFiltrados.filter(p => p.nome.toLowerCase().includes(busca));
  }

  renderizarProdutosAdmin(produtosFiltrados);
}

// CATEGORIAS
async function carregarCategoriasAdmin() {
  const res = await authFetch('/api/categorias');
  const categorias = await res.json();
  const container = document.getElementById('categorias-list');
  container.innerHTML = `<table>
    <thead><tr><th>Nome</th><th>Ordem</th><th>Ações</th></tr></thead>
    <tbody>${categorias.map(c => `
      <tr>
        <td>${escapeHtml(c.nome)}</td>
        <td>${c.ordem}</td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="editarCategoria(${c.id}, '${escapeHtml(c.nome)}', ${c.ordem})">Editar</button>
          <button class="btn btn-xs btn-danger" onclick="excluirCategoria(${c.id})">Excluir</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table>`;
}

async function verificarResposta(res) {
  if (!res.ok) {
    let msg = 'Erro ' + res.status;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) { /* sem corpo JSON */ }
    throw new Error(msg);
  }
  return res;
}

async function salvarCategoria() {
  const nome = document.getElementById('cat-nome').value.trim();
  const ordem = parseInt(document.getElementById('cat-ordem').value) || 0;
  if (!nome) { showToast('Informe o nome da categoria'); return; }
  try {
    const res = await authFetch('/api/categorias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, ordem }) });
    await verificarResposta(res);
    document.getElementById('cat-nome').value = '';
    document.getElementById('cat-ordem').value = '';
    carregarCategoriasAdmin();
    showToast('Categoria cadastrada!');
  } catch (e) {
    showToast(e.message === 'Failed to fetch' ? 'Erro de conexão com o servidor' : e.message);
  }
}

async function excluirCategoria(id) {
  if (!confirm('Excluir esta categoria? Produtos vinculados ficarão sem categoria.')) return;
  try {
    const res = await authFetch(`/api/categorias/${id}`, { method: 'DELETE' });
    await verificarResposta(res);
    carregarCategoriasAdmin();
    showToast('Categoria excluída!');
  } catch (e) {
    showToast(e.message === 'Failed to fetch' ? 'Erro de conexão com o servidor' : e.message);
  }
}

async function editarCategoria(id, nome, ordem) {
  const novoNome = prompt('Novo nome:', nome);
  if (!novoNome) return;
  const novaOrdem = parseInt(prompt('Nova ordem:', ordem)) || 0;
  await authFetch(`/api/categorias/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: novoNome, ordem: novaOrdem }) });
  carregarCategoriasAdmin();
  showToast('Categoria atualizada!');
}

async function abrirFormProduto() {
  document.getElementById('prod-id').value = '';
  document.getElementById('form-produto').reset();
  document.getElementById('prod-ativo').checked = true;
  document.getElementById('prod-somente-garcom').checked = false;
  document.getElementById('prod-limite-sabores').value = '0';
  document.getElementById('prod-unidade').value = 'un';
  document.getElementById('form-produto-title').textContent = 'Novo Produto';
  document.getElementById('modal-produto-admin').classList.add('active');
}

function editarProduto(p) {
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-nome').value = p.nome;
  document.getElementById('prod-descricao').value = p.descricao || '';
  document.getElementById('prod-preco').value = p.preco;
  document.getElementById('prod-unidade').value = p.unidade === 'kg' ? 'kg' : 'un';
  document.getElementById('prod-ativo').checked = !!p.ativo;
  document.getElementById('prod-somente-garcom').checked = !!p.somente_garcom;
  document.getElementById('prod-limite-sabores').value = p.limite_sabores || 0;
  document.getElementById('form-produto-title').textContent = 'Editar Produto';

  setTimeout(() => {
    document.getElementById('prod-categoria').value = p.categoria_id;
    document.getElementById('modal-produto-admin').classList.add('active');
  }, 100);
}

function editarProdutoPorId(id) {
  const p = (window.produtosAdmin || []).find(x => x.id == id);
  if (!p) { showToast('Produto não encontrado'); return; }
  editarProduto(p);
}

function fecharModalProduto() {
  document.getElementById('modal-produto-admin').classList.remove('active');
}

async function salvarProduto(e) {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;
  const formData = new FormData();
  formData.append('nome', document.getElementById('prod-nome').value);
  formData.append('categoria_id', document.getElementById('prod-categoria').value);
  formData.append('descricao', document.getElementById('prod-descricao').value);
  formData.append('preco', document.getElementById('prod-preco').value);
  formData.append('unidade', document.getElementById('prod-unidade').value);
  formData.append('ativo', document.getElementById('prod-ativo').checked ? '1' : '0');
  formData.append('somente_garcom', document.getElementById('prod-somente-garcom').checked ? '1' : '0');
  formData.append('limite_sabores', document.getElementById('prod-limite-sabores').value || '0');

  const foto = document.getElementById('prod-foto').files[0];
  if (foto) formData.append('foto', foto);

  const url = id ? `/api/produtos/${id}` : '/api/produtos';
  const method = id ? 'PUT' : 'POST';
  try {
    const res = await authFetch(url, { method, body: formData });
    await verificarResposta(res);
    fecharModalProduto();
    carregarProdutosAdmin();
    showToast(id ? 'Produto atualizado!' : 'Produto cadastrado!');
  } catch (e) {
    showToast(e.message === 'Failed to fetch' ? 'Erro de conexão com o servidor' : e.message);
  }
}

async function alternarProduto(id, novoAtivo) {
  try {
    const res = await authFetch(`/api/produtos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: novoAtivo })
    });
    await verificarResposta(res);
    carregarProdutosAdmin();
    showToast(novoAtivo ? 'Produto ativado!' : 'Produto desativado!');
  } catch (e) {
    showToast(e.message === 'Failed to fetch' ? 'Erro de conexão com o servidor' : e.message);
  }
}

async function excluirProduto(id) {
  if (!confirm('Excluir este produto?')) return;
  try {
    const res = await authFetch(`/api/produtos/${id}`, { method: 'DELETE' });
    await verificarResposta(res);
    carregarProdutosAdmin();
    showToast('Produto excluído!');
  } catch (e) {
    showToast(e.message === 'Failed to fetch' ? 'Erro de conexão com o servidor' : e.message);
  }
}

// ADICIONAIS
async function carregarAdicionais() {
  try {
    const [adcRes, catRes, prodRes] = await Promise.all([
      authFetch('/api/adicionais?incluir_inativos=1'),
      authFetch('/api/categorias'),
      authFetch('/api/produtos')
    ]);
    adicionaisAdmin = await adcRes.json();
    categoriasAdmin = await catRes.json();
    produtosAdmin = await prodRes.json();

    console.log('Categorias carregadas:', categoriasAdmin);
    console.log('Adicionais carregados:', adicionaisAdmin);
    console.log('Produtos carregados:', produtosAdmin);

    // Popular filtros preservando a seleção atual
    const filtroSelect = document.getElementById('filtro-categoria-adicionais');
    if (filtroSelect) {
      const filtroAtual = filtroSelect.value;
      filtroSelect.innerHTML = '<option value="">Todas as categorias</option>' +
        categoriasAdmin.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');
      if ([...filtroSelect.options].some(o => o.value === filtroAtual)) {
        filtroSelect.value = filtroAtual;
      }
    }

    const filtroProd = document.getElementById('filtro-produto-adicionais');
    if (filtroProd) {
      atualizarFiltroProdutosAdicionais(filtroSelect ? filtroSelect.value : '');
    }

    filtrarAdicionaisAdmin();
  } catch (e) {
    console.error('Erro ao carregar adicionais:', e);
    showToast('Erro ao carregar adicionais: ' + e.message);
  }
}

function abrirSeletorCategorias() {
  const modal = document.getElementById('modal-categorias-adic');
  const container = document.getElementById('categorias-checkboxes');
  
  container.innerHTML = categoriasAdmin.map(c => `
    <div style="padding: 8px; border-bottom: 1px solid #e5e5e5;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; min-height: 40px;">
        <input type="checkbox" value="${c.id}" class="cat-checkbox-adic" ${categoriasAdicionaisSelecionadas.includes(c.id) ? 'checked' : ''}>
        <span>${escapeHtml(c.nome)}</span>
      </label>
    </div>
  `).join('');
  
  modal.style.display = 'flex';
}

function fecharSeletorCategorias() {
  const modal = document.getElementById('modal-categorias-adic');
  // Atualizar categorias selecionadas
  categoriasAdicionaisSelecionadas = Array.from(
    document.querySelectorAll('.cat-checkbox-adic:checked')
  ).map(cb => parseInt(cb.value));

  // Remover produtos selecionados que não pertencem mais às categorias escolhidas
  const prodsValidos = new Set(
    produtosAdmin.filter(p => categoriasAdicionaisSelecionadas.includes(p.categoria_id)).map(p => p.id)
  );
  produtosAdicionaisSelecionadas = produtosAdicionaisSelecionadas.filter(id => prodsValidos.has(id));

  atualizarBtnSelecao();
  modal.style.display = 'none';

  // Fluxo unico: escolheu categorias -> mostra os produtos delas
  if (categoriasAdicionaisSelecionadas.length > 0) {
    abrirSeletorProdutos();
  }
}

function atualizarLabelCategorias() { atualizarBtnSelecao(); }

function atualizarLabelProdutos() { atualizarBtnSelecao(); }

function atualizarBtnSelecao() {
  const btn = document.getElementById('btn-seletor-alvo');
  if (!btn) return;
  const nCat = categoriasAdicionaisSelecionadas.length;
  const nProd = produtosAdicionaisSelecionadas.length;

  if (nCat === 0) {
    btn.textContent = 'Aplicar a: todas as categorias';
  } else if (nProd > 0) {
    btn.textContent = `Aplicar a: ${nProd} produto(s) em ${nCat} categoria(s)`;
  } else {
    btn.textContent = `Aplicar a: ${nCat} categoria(s) inteira(s)`;
  }
}

function abrirSeletorProdutos() {
  if (categoriasAdicionaisSelecionadas.length === 0) {
    showToast('Selecione primeiro as categorias');
    return;
  }

  const modal = document.getElementById('modal-produtos-adic');
  const container = document.getElementById('produtos-checkboxes');

  // Mostrar apenas produtos das categorias selecionadas
  const produtosFiltrados = produtosAdmin.filter(p => categoriasAdicionaisSelecionadas.includes(p.categoria_id));

  container.innerHTML = produtosFiltrados.length ? produtosFiltrados.map(p => `
    <div style="padding: 8px; border-bottom: 1px solid #e5e5e5;">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; min-height: 40px;">
        <input type="checkbox" value="${p.id}" class="prod-checkbox-adic" ${produtosAdicionaisSelecionadas.includes(p.id) ? 'checked' : ''}>
        <span>${escapeHtml(p.nome)} <small style="color:var(--gray)">(${escapeHtml(categoriasAdmin.find(c => c.id === p.categoria_id)?.nome || 'sem categoria')})</small></span>
      </label>
    </div>
  `).join('') : '<p style="text-align:center;color:var(--gray);padding:20px">Nenhum produto encontrado nas categorias selecionadas</p>';

  modal.style.display = 'flex';
}

function fecharSeletorProdutos() {
  const modal = document.getElementById('modal-produtos-adic');
  produtosAdicionaisSelecionadas = Array.from(
    document.querySelectorAll('.prod-checkbox-adic:checked')
  ).map(cb => parseInt(cb.value));

  atualizarBtnSelecao();
  modal.style.display = 'none';
}

function limparSelecaoProdutos() {
  document.querySelectorAll('.prod-checkbox-adic').forEach(cb => { cb.checked = false; });
}

function renderizarAdicionais(adicionais) {
  const container = document.getElementById('adicionais-list');
  if (!adicionais.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--gray);padding:30px">Nenhum item encontrado</p>';
    return;
  }
  const tipoLabels = {
    'adicional': { text: 'Adicional', bg: '#fff3e0' },
    'sabor': { text: '🍕 Sabor', bg: '#e8f5e9' },
    'borda': { text: '🧀 Borda Recheada', bg: '#fff8e1' },
    'base': { text: '🥣 Base', bg: '#e3f2fd' },
    'cobertura': { text: '🍓 Cobertura', bg: '#fce4ec' },
    'acompanhamento': { text: '🍟 Acompanhamento', bg: '#f3e5f5' }
  };
  // Ordenar pela ordem da categoria, depois por valor e depois por tipo
  const ordemMap = new Map((categoriasAdmin || []).map(c => [c.id, c.ordem ?? 999]));
  const ordenados = [...adicionais].sort((a, b) =>
    ((ordemMap.get(a.categoria_id) ?? 999) - (ordemMap.get(b.categoria_id) ?? 999)) ||
    (parseFloat(a.preco) - parseFloat(b.preco)) ||
    ((a.tipo || '').localeCompare(b.tipo || '')) ||
    ((a.nome || '').localeCompare(b.nome || ''))
  );

  container.innerHTML = `
    <div style="padding: var(--space-2) var(--space-3); color: var(--color-text-muted); font-size: var(--text-xs);">
      ${ordenados.length} item(ns)
    </div>
    <table>
    <thead><tr><th>Nome</th><th>Descrição</th><th>Tipo</th><th>Limite</th><th>Categoria</th><th>Produto</th><th>Preço</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${ordenados.map(a => {
      const produtoIds = a.produto_ids || (a.produto_id ? [a.produto_id] : []);
      const produtoNome = produtoIds.length
        ? produtoIds.map(pid => produtosAdmin.find(p => p.id == pid)?.nome || 'ID: ' + pid).join(', ')
        : '-';
      const tl = tipoLabels[a.tipo] || tipoLabels['adicional'];
      const limiteText = a.limite > 0 ? a.limite : 'Livre';
      return `
      <tr style="${a.ativo ? '' : 'opacity:.55'}">
        <td><strong>${escapeHtml(a.nome)}</strong></td>
        <td><small style="color:var(--color-text-secondary)">${escapeHtml(a.descricao || '-')}</small></td>
        <td><span style="background: ${tl.bg}; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${tl.text}</span></td>
        <td>${limiteText}</td>
        <td>${escapeHtml(a.categoria_nome || 'Todas')}</td>
        <td>${escapeHtml(produtoNome)}</td>
        <td>R$ ${a.preco.toFixed(2)}</td>
        <td>${a.ativo ? '<span style="color:var(--success)">Ativo</span>' : '<span style="color:var(--danger)">Inativo</span>'}</td>
        <td>
          <button class="btn btn-xs btn-primary" onclick='editarAdicional(JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(a))}")))'>Editar</button>
          <button class="btn btn-xs ${a.ativo ? 'btn-warning' : 'btn-success'}" onclick='toggleAdicional(JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(a))}")), ${a.ativo ? 0 : 1})'>${a.ativo ? 'Desativar' : 'Ativar'}</button>
          <button class="btn btn-xs btn-danger" onclick="excluirAdicional(${a.id})">Excluir</button>
        </td>
      </tr>
    `}).join('')}</tbody>
  </table>`;
}

function filtrarAdicionaisAdmin() {
  const categoriaId = document.getElementById('filtro-categoria-adicionais').value;
  const produtoId = document.getElementById('filtro-produto-adicionais').value;

  // Filtro de produto mostra apenas itens da(s) categoria selecionada
  atualizarFiltroProdutosAdicionais(categoriaId);

  let adicionaisFiltrados = adicionaisAdmin;
  if (categoriaId) {
    adicionaisFiltrados = adicionaisFiltrados.filter(a => a.categoria_id == categoriaId);
  }
  if (produtoId) {
    adicionaisFiltrados = adicionaisFiltrados.filter(a =>
      (a.produto_ids || []).map(Number).includes(Number(produtoId)) || a.produto_id == produtoId
    );
  }

  renderizarAdicionais(adicionaisFiltrados);
}

function atualizarFiltroProdutosAdicionais(categoriaId) {
  const filtroProd = document.getElementById('filtro-produto-adicionais');
  if (!filtroProd) return;

  // Se a opcao escolhida ainda existe na lista filtrada, mantem
  const valorAtual = filtroProd.value;
  const produtosDisponiveis = categoriaId
    ? produtosAdmin.filter(p => p.categoria_id == categoriaId)
    : produtosAdmin;

  filtroProd.innerHTML = '<option value="">Todos os produtos</option>' +
    produtosDisponiveis.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');

  if ([...filtroProd.options].some(o => o.value === valorAtual)) {
    filtroProd.value = valorAtual;
  }
}

function editarAdicional(a) {
  adicionalEmEdicao = a.id;
  document.getElementById('adic-nome').value = a.nome;
  document.getElementById('adic-descricao').value = a.descricao || '';
  document.getElementById('adic-preco').value = a.preco;
  document.getElementById('adic-tipo').value = a.tipo || 'adicional';
  document.getElementById('adic-limite').value = a.limite || 0;
  produtosAdicionaisSelecionadas = (a.produto_ids && a.produto_ids.length) ? a.produto_ids.map(x => parseInt(x)) : (a.produto_id ? [parseInt(a.produto_id)] : []);
  atualizarLabelProdutos();
  categoriasAdicionaisSelecionadas = a.categoria_id ? [parseInt(a.categoria_id)] : [];
  atualizarLabelCategorias();

  document.getElementById('btn-salvar-adic').textContent = 'Atualizar';
  document.getElementById('btn-cancelar-adic').style.display = 'inline-block';
  document.getElementById('adic-nome').focus();
}

function cancelarEdicaoAdicional() {
  adicionalEmEdicao = null;
  document.getElementById('adic-nome').value = '';
  document.getElementById('adic-descricao').value = '';
  document.getElementById('adic-preco').value = '0';
  document.getElementById('adic-tipo').value = 'adicional';
  document.getElementById('adic-limite').value = '0';
  produtosAdicionaisSelecionadas = [];
  atualizarLabelProdutos();
  categoriasAdicionaisSelecionadas = [];
  atualizarLabelCategorias();
  document.getElementById('btn-salvar-adic').textContent = 'Adicionar';
  document.getElementById('btn-cancelar-adic').style.display = 'none';
}

async function salvarAdicional() {
  const nome = document.getElementById('adic-nome').value.trim();
  const descricao = document.getElementById('adic-descricao').value.trim();
  const precoVal = document.getElementById('adic-preco').value;
  const tipo = document.getElementById('adic-tipo').value;
  const limite = parseInt(document.getElementById('adic-limite').value) || 0;

  if (!nome) { showToast('Preencha o nome'); return; }
  if (precoVal === '' || precoVal === null) { showToast('Informe o preço (use 0 para sabor grátis)'); return; }
  if (!adicionalEmEdicao && categoriasAdicionaisSelecionadas.length === 0) {
    showToast('Selecione pelo menos uma categoria');
    return;
  }

  try {
    const preco = parseFloat(precoVal);

    if (adicionalEmEdicao) {
      const catId = categoriasAdicionaisSelecionadas.length > 0 ? categoriasAdicionaisSelecionadas[0] : null;
      await authFetch(`/api/adicionais/${adicionalEmEdicao}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, preco, categoria_id: catId, tipo, descricao: descricao || null, produto_ids: produtosAdicionaisSelecionadas, limite })
      });
      showToast('Item atualizado!');
      cancelarEdicaoAdicional();
    } else {
      if (produtosAdicionaisSelecionadas.length > 0) {
        // Com produtos especificos selecionados, um unico registro basta
        const res = await authFetch('/api/adicionais', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome, preco, categoria_id: categoriasAdicionaisSelecionadas[0] || null, tipo, descricao: descricao || null, produto_ids: produtosAdicionaisSelecionadas, limite })
        });
        await verificarResposta(res);
        showToast('Item cadastrado!');
      } else {
        // Sem produtos especificos: cria uma copia global por categoria
        for (const cat_id of categoriasAdicionaisSelecionadas) {
          const res = await authFetch('/api/adicionais', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, preco, categoria_id: cat_id, tipo, descricao: descricao || null, produto_ids: [], limite })
          });
          await verificarResposta(res);
        }
        showToast(`Item cadastrado em ${categoriasAdicionaisSelecionadas.length} categoria(s)!`);
      }
    }

    document.getElementById('adic-nome').value = '';
    document.getElementById('adic-descricao').value = '';
    document.getElementById('adic-preco').value = '0';
    document.getElementById('adic-tipo').value = 'adicional';
    document.getElementById('adic-limite').value = '0';
    produtosAdicionaisSelecionadas = [];
    atualizarLabelProdutos();
    categoriasAdicionaisSelecionadas = [];
    atualizarLabelCategorias();
    carregarAdicionais();
  } catch (e) {
    console.error('Erro ao salvar adicional:', e);
    showToast('Erro: ' + e.message);
  }
}

async function toggleAdicional(a, novoAtivo) {
  await authFetch(`/api/adicionais/${a.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: a.nome,
      preco: a.preco,
      ativo: novoAtivo,
      categoria_id: a.categoria_id || null,
      tipo: a.tipo || 'adicional',
      descricao: a.descricao || null,
      produto_ids: a.produto_ids || [],
      limite: a.limite || 0
    })
  });
  carregarAdicionais();
}

async function excluirAdicional(id) {
  if (!confirm('Excluir este adicional?')) return;
  await authFetch(`/api/adicionais/${id}`, { method: 'DELETE' });
  carregarAdicionais();
}

// CLIENTES
const CLIENTES_POR_PAGINA = 20;
let clientesPagina = 1;
let clientesFiltrados = [];

async function carregarClientes() {
  const res = await authFetch('/api/clientes');
  allClientes = await res.json();
  const campo = document.getElementById('busca-cliente');
  const busca = campo ? campo.value.trim().toLowerCase() : '';
  clientesFiltrados = busca
    ? allClientes.filter(c => (c.nome || '').toLowerCase().includes(busca) || (c.telefone || '').includes(busca))
    : allClientes;
  renderClientes(clientesFiltrados);
}

function filtrarClientes() {
  const busca = document.getElementById('busca-cliente').value.toLowerCase();
  clientesPagina = 1;
  clientesFiltrados = allClientes.filter(c => c.nome.toLowerCase().includes(busca) || c.telefone.includes(busca));
  renderClientes(clientesFiltrados);
}

function irParaPaginaClientes(pagina) {
  clientesPagina = pagina;
  renderClientes(clientesFiltrados);
  const lista = document.getElementById('clientes-list');
  if (lista) lista.scrollTop = 0;
}

function renderClientes(clientes) {
  clientesFiltrados = clientes || [];
  const total = clientesFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / CLIENTES_POR_PAGINA));
  if (clientesPagina > totalPaginas) clientesPagina = totalPaginas;
  if (clientesPagina < 1) clientesPagina = 1;
  const inicio = (clientesPagina - 1) * CLIENTES_POR_PAGINA;
  const daPagina = clientesFiltrados.slice(inicio, inicio + CLIENTES_POR_PAGINA);

  document.getElementById('clientes-list').innerHTML = `<table>
    <thead><tr><th>Nome</th><th>Telefone</th><th>Bairro</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${daPagina.map(c => `
      <tr style="${c.bloqueado ? 'background-color: #ffe6e6;' : ''}">
        <td>${escapeHtml(c.nome)}</td>
        <td>${escapeHtml(c.telefone)}</td>
        <td>${escapeHtml(c.bairro || '-')}</td>
        <td>${c.bloqueado ? '<span class="status-badge status-cancelado">Bloqueado</span>' : '<span class="status-badge status-entregue">Ativo</span>'}</td>
        <td style="white-space:nowrap;display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-xs btn-primary" onclick="verDetalhesCliente(${c.id})">Detalhes</button>
          <button class="btn btn-xs btn-primary" onclick="verPedidosCliente(${c.id}, '${escapeHtml(c.nome)}')">Pedidos</button>
          <button class="btn btn-xs ${c.bloqueado ? 'btn-success' : 'btn-warning'}" onclick="toggleBloqueioCliente(${c.id}, ${c.bloqueado})">
            ${c.bloqueado ? 'Desbloquear' : 'Bloquear'}
          </button>
          <button class="btn btn-xs btn-danger" onclick="excluirCliente(${c.id})">Excluir</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table>`;

  renderPaginacaoClientes(total, totalPaginas, inicio, daPagina.length);
}

function renderPaginacaoClientes(total, totalPaginas, inicio, qtd) {
  const el = document.getElementById('clientes-paginacao');
  if (!el) return;
  if (!total) { el.innerHTML = '<div class="tp-info">Nenhum cliente encontrado.</div>'; return; }

  const janela = [];
  const ini = Math.max(1, clientesPagina - 2);
  const fim = Math.min(totalPaginas, clientesPagina + 2);
  if (ini > 1) { janela.push(1); if (ini > 2) janela.push('…'); }
  for (let p = ini; p <= fim; p++) janela.push(p);
  if (fim < totalPaginas) { if (fim < totalPaginas - 1) janela.push('…'); janela.push(totalPaginas); }

  const botoes = janela.map(p => p === '…'
    ? '<span class="tp-reticencias">…</span>'
    : `<button class="tp-btn${p === clientesPagina ? ' active' : ''}" onclick="irParaPaginaClientes(${p})">${p}</button>`
  ).join('');

  el.innerHTML = `
    <div class="tp-info">Mostrando <strong>${inicio + 1}–${inicio + qtd}</strong> de <strong>${total}</strong></div>
    <div class="tp-botoes">
      <button class="tp-btn" ${clientesPagina === 1 ? 'disabled' : ''} onclick="irParaPaginaClientes(${clientesPagina - 1})" aria-label="Página anterior">‹</button>
      ${botoes}
      <button class="tp-btn" ${clientesPagina === totalPaginas ? 'disabled' : ''} onclick="irParaPaginaClientes(${clientesPagina + 1})" aria-label="Próxima página">›</button>
    </div>`;
}

async function verDetalhesCliente(id) {
  const c = allClientes.find(x => x.id === id);
  if (!c) { showToast('Cliente não encontrado'); return; }
  let pedidosCount = '-';
  try {
    const r = await authFetch(`/api/clientes/${id}/pedidos`);
    if (r.ok) { const ped = await r.json(); pedidosCount = ped.length; }
  } catch(e) {}
  const end = [c.rua, c.numero ? `, ${c.numero}` : '', c.complemento ? ` - ${c.complemento}` : '', c.bairro ? ` - ${c.bairro}` : '', c.ponto_referencia ? ` (${c.ponto_referencia})` : ''].join('') || 'Não informado';
  const html = `
    <div style="display:grid;gap:10px;font-size:0.9rem">
      <div><strong>Nome:</strong> ${escapeHtml(c.nome)}</div>
      <div><strong>Telefone:</strong> ${escapeHtml(c.telefone)} ${c.telefone ? `<a href="https://wa.me/${c.telefone.replace(/\D/g,'').replace(/^0+/,'')}" target="_blank" style="margin-left:6px;color:var(--color-primary)">WhatsApp</a>` : ''}</div>
      <div><strong>Bairro:</strong> ${escapeHtml(c.bairro || '-')}</div>
      <div><strong>Endereço:</strong> ${escapeHtml(end)}</div>
      <div><strong>Status:</strong> ${c.bloqueado ? '<span class="status-badge status-cancelado">Bloqueado</span>' : '<span class="status-badge status-entregue">Ativo</span>'}</div>
      <div><strong>Cadastro:</strong> ${c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) : '-'}</div>
      <div><strong>Total de pedidos:</strong> ${pedidosCount}</div>
    </div>
  `;
  document.getElementById('cliente-detalhes-conteudo').innerHTML = html;
  document.getElementById('modal-cliente-detalhes').classList.add('active');
}

async function toggleBloqueioCliente(id, statusAtual) {
  const acao = statusAtual ? 'desbloquear' : 'bloquear';
  if (!confirm(`Deseja ${acao} este cliente?`)) return;
  try {
    const res = await authFetch(`/api/clientes/${id}/bloquear`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bloqueado: !statusAtual })
    });
    await verificarResposta(res);
    carregarClientes();
    showToast(`Cliente ${statusAtual ? 'desbloqueado' : 'bloqueado'}!`);
  } catch (e) {
    showToast(e.message === 'Failed to fetch' ? 'Erro de conexão com o servidor' : e.message);
  }
}

async function excluirCliente(id) {
  if (!confirm('Tem certeza que deseja excluir permanentemente este cliente?')) return;
  try {
    const res = await authFetch(`/api/clientes/${id}`, { method: 'DELETE' });
    await verificarResposta(res);
    carregarClientes();
    showToast('Cliente excluído!');
  } catch (e) {
    showToast(e.message === 'Failed to fetch' ? 'Erro de conexão com o servidor' : e.message);
  }
}

async function verPedidosCliente(id, nome) {
  document.getElementById('cliente-pedidos-title').textContent = `Pedidos de ${nome}`;
  const res = await authFetch(`/api/clientes/${id}/pedidos`);
  const pedidos = await res.json();
  document.getElementById('cliente-pedidos-list').innerHTML = pedidos.length
    ? `<table>
        <thead><tr><th>#</th><th>Data</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>${pedidos.map(p => `
          <tr>
            <td>${p.id}</td>
            <td>${new Date(p.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
            <td>R$ ${p.total.toFixed(2)}</td>
            <td><span class="status-badge status-${p.status}">${statusLabels[p.status]}</span></td>
          </tr>
        `).join('')}</tbody>
      </table>`
    : '<p style="text-align:center;color:var(--gray);padding:20px">Nenhum pedido</p>';
  document.getElementById('modal-cliente-pedidos').classList.add('active');
}

// BAIRROS
async function carregarBairrosAdmin() {
  const res = await authFetch('/api/bairros');
  const bairros = await res.json();
  document.getElementById('bairros-list').innerHTML = `<table>
    <thead><tr><th>Bairro</th><th>Taxa</th><th>Atendido</th><th>Ações</th></tr></thead>
    <tbody>${bairros.map(b => `
      <tr>
        <td>${escapeHtml(b.nome)}</td>
        <td>R$ ${b.taxa_entrega.toFixed(2)}</td>
        <td>
          <label class="toggle-switch">
            <input type="checkbox" ${b.atendido ? 'checked' : ''} onchange="toggleBairro(${b.id}, '${escapeHtml(b.nome)}', ${b.taxa_entrega}, this.checked ? 1 : 0)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="editarBairroPrompt(${b.id}, '${escapeHtml(b.nome)}', ${b.taxa_entrega})">Editar</button>
          <button class="btn btn-xs btn-danger" onclick="excluirBairro(${b.id})">Excluir</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table>`;
}

async function salvarBairro() {
  const nome = document.getElementById('bairro-nome').value.trim();
  const taxa = document.getElementById('bairro-taxa').value;
  if (!nome) { showToast('Informe o nome do bairro'); return; }
  try {
    const res = await authFetch('/api/bairros', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, taxa_entrega: taxa || 0 }) });
    await verificarResposta(res);
    document.getElementById('bairro-nome').value = '';
    document.getElementById('bairro-taxa').value = '';
    carregarBairrosAdmin();
    showToast('Bairro cadastrado!');
  } catch (e) {
    showToast(e.message === 'Failed to fetch' ? 'Erro de conexão com o servidor' : e.message);
  }
}

async function toggleBairro(id, nome, taxa, atendido) {
  await authFetch(`/api/bairros/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, taxa_entrega: taxa, atendido }) });
  carregarBairrosAdmin();
}

async function editarBairroPrompt(id, nome, taxa) {
  const novaTaxa = prompt(`Nova taxa de entrega para ${nome}:`, taxa);
  if (novaTaxa === null) return;
  const taxaNum = parseFloat(String(novaTaxa).replace(',', '.')) || 0;
  if (taxaNum < 0) { showToast('Taxa inválida'); return; }
  try {
    // Preserva status atendido atual para não reativar bairros desativados sem querer
    let atendido = 1;
    try {
      const r = await authFetch('/api/bairros');
      if (r.ok) {
        const lista = await r.json();
        const atual = lista.find(b => String(b.id) === String(id));
        if (atual) atendido = atual.atendido ? 1 : 0;
      }
    } catch {}
    const res = await authFetch(`/api/bairros/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, taxa_entrega: taxaNum, atendido }) });
    await verificarResposta(res);
    await carregarBairrosAdmin();
    showToast('Taxa atualizada!');
  } catch (e) {
    showToast(e.message);
  }
}

async function excluirBairro(id) {
  if (!confirm('Excluir este bairro?')) return;
  await authFetch(`/api/bairros/${id}`, { method: 'DELETE' });
  carregarBairrosAdmin();
}

// RELATÓRIOS
async function carregarRelatorios() {
  const periodo = document.getElementById('periodo-relatorio').value;
  const di = document.getElementById('rel-data-inicio')?.value || '';
  const df = document.getElementById('rel-data-fim')?.value || '';
  let qs = '';
  if (di && df) qs = `data_inicio=${di}&data_fim=${df}`;
  else if (di) qs = `data_inicio=${di}`;
  else if (df) qs = `data_fim=${df}`;
  else qs = `periodo=${periodo}`;
  const res = await authFetch(`/api/config/relatorios/vendas?${qs}`);
  const data = await res.json();
  const fmt = v => `R$ ${Number(v||0).toFixed(2)}`;
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-value">${data.resumo.total_pedidos}</div><div class="stat-label">Pedidos</div></div>
    <div class="stat-card"><div class="stat-value">${fmt(data.resumo.faturamento_itens)}</div><div class="stat-label">Itens (sem taxa)</div></div>
    <div class="stat-card"><div class="stat-value">${fmt(data.resumo.total_taxas)}</div><div class="stat-label">Taxas de entrega</div></div>
    <div class="stat-card"><div class="stat-value">${fmt(data.resumo.faturamento)}</div><div class="stat-label">Faturamento total</div></div>
    <div class="stat-card"><div class="stat-value">${fmt(data.resumo.ticket_medio)}</div><div class="stat-label">Ticket médio</div></div>
  `;
  document.getElementById('vendas-dia').innerHTML = data.porDia.length ? `<table>
    <thead><tr><th>Data</th><th>Pedidos</th><th>Itens</th><th>Taxas</th><th>Total</th></tr></thead>
    <tbody>${data.porDia.map(d => `<tr><td>${d.dia ? String(d.dia).slice(0,10) : ''}</td><td>${d.qtd}</td><td>${fmt(d.subtotal)}</td><td>${fmt(d.taxas)}</td><td>${fmt(d.valor)}</td></tr>`).join('')}</tbody>
  </table>` : '<p style="color:var(--gray)">Sem dados</p>';
  document.getElementById('produtos-top').innerHTML = data.produtosMaisVendidos.length ? `<table>
    <thead><tr><th>Produto</th><th>Qtd</th><th>Valor</th></tr></thead>
    <tbody>${data.produtosMaisVendidos.map(p => `<tr><td>${escapeHtml(p.produto_nome)}</td><td>${p.qtd}</td><td>${fmt(p.valor)}</td></tr>`).join('')}</tbody>
  </table>` : '<p style="color:var(--gray)">Sem dados</p>';
  document.getElementById('vendas-pagamento').innerHTML = data.porFormaPagamento.length ? `<table>
    <thead><tr><th>Forma</th><th>Qtd</th><th>Itens</th><th>Taxas</th><th>Total</th></tr></thead>
    <tbody>${data.porFormaPagamento.map(p => `<tr><td>${payLabels[p.forma_pagamento] || p.forma_pagamento}</td><td>${p.qtd}</td><td>${fmt(Number(p.valor||0)-Number(p.taxas||0))}</td><td>${fmt(p.taxas)}</td><td>${fmt(p.valor)}</td></tr>`).join('')}</tbody>
  </table>` : '<p style="color:var(--gray)">Sem dados</p>';
}
function limparFiltroDataRelatorio(){ const a=document.getElementById('rel-data-inicio'); const b=document.getElementById('rel-data-fim'); if(a) a.value=''; if(b) b.value=''; carregarRelatorios(); }
function limparFiltroDataMotoboy(){ const a=document.getElementById('motoboy-data-inicio'); const b=document.getElementById('motoboy-data-fim'); if(a) a.value=''; if(b) b.value=''; carregarRelatorioMotoboys(); }

// CONFIGURAÇÕES
async function carregarConfigAdmin() {
  const res = await authFetch('/api/config');
  const cfg = await res.json();
  document.getElementById('cfg-loja-nome').value = cfg.loja_nome || '';
   document.getElementById('cfg-loja-telefone').value = cfg.loja_telefone || '';
  const elEnd = document.getElementById('cfg-loja-endereco');
  if (elEnd) elEnd.value = cfg.loja_endereco || '';
   document.getElementById('cfg-whatsapp-msg-saiu').value = cfg.whatsapp_mensagem_saiu_entrega || '';
  // Logo preview
  const logoPrev = document.getElementById('cfg-logo-preview');
  if (logoPrev) logoPrev.src = cfg.logo_url || '/logo.jpeg';
  // Horário automático
  const auto = cfg.loja_modo === 'auto';
  const chkAuto = document.getElementById('cfg-horario-auto');
  if (chkAuto) chkAuto.checked = auto;
  const boxH = document.getElementById('horario-campos');
  if (boxH) boxH.style.display = auto ? 'block' : 'none';
  const elAb = document.getElementById('cfg-horario-abertura');
  if (elAb) elAb.value = cfg.loja_horario_abertura || '';
  const elFe = document.getElementById('cfg-horario-fechamento');
  if (elFe) elFe.value = cfg.loja_horario_fechamento || '';
  try {
    const dias = cfg.loja_horario_dias ? JSON.parse(cfg.loja_horario_dias) : ['1','2','3','4','5','6','0'];
    document.querySelectorAll('#cfg-horario-dias input[type=checkbox]').forEach(cb => { cb.checked = dias.includes(cb.value); });
  } catch(_) {}
  if (chkAuto && !chkAuto._bound) {
    chkAuto.addEventListener('change', () => { const b = document.getElementById('horario-campos'); if (b) b.style.display = chkAuto.checked ? 'block' : 'none'; });
    chkAuto._bound = true;
  }
  document.getElementById('cfg-tempo-espera').value = cfg.tempo_espera || '';
  document.getElementById('cfg-pix-tipo').value = cfg.pix_tipo || 'cpf';
  document.getElementById('cfg-pix-chave').value = cfg.pix_chave || '';
  document.getElementById('cfg-pix-nome').value = cfg.pix_nome || '';
  // Pix Automático (Banco)
  const prov = cfg.psp_provider || 'desativado';
  const elProv = document.getElementById('cfg-psp-provider');
  if (elProv) elProv.value = prov;
  const elAmb = document.getElementById('cfg-psp-ambiente');
  if (elAmb) elAmb.value = cfg.psp_ambiente || 'producao';
  const elCid = document.getElementById('cfg-psp-client-id');
  if (elCid) elCid.value = cfg.psp_client_id || '';
  const elCsec = document.getElementById('cfg-psp-client-secret');
  if (elCsec) elCsec.value = cfg.psp_client_secret || '';
  const elPix = document.getElementById('cfg-psp-pix-chave');
  if (elPix) elPix.value = cfg.psp_pix_chave || '';
  const elExp = document.getElementById('cfg-pix-expiracao');
  if (elExp) elExp.value = cfg.pix_expiracao || '3600';
  const elWhs = document.getElementById('cfg-psp-webhook-secret');
  if (elWhs) elWhs.value = cfg.psp_webhook_secret || '';
  const elWhu = document.getElementById('cfg-psp-webhook-url');
  if (elWhu) elWhu.value = `${window.location.origin}/api/webhooks/pix`;
  const status = document.getElementById('pix-auto-status');
  if (status) {
    if (prov === 'desativado') status.textContent = 'Pix automático desativado — usando Pix estático + WhatsApp.';
    else status.textContent = `Ativo: ${prov} (${cfg.psp_ambiente || 'producao'}) — webhook pronto para colar no banco.`;
  }
  config = cfg;
  // atualizar logo do sidebar admin
  const logoAdmin = document.getElementById('site-logo-admin');
  if (logoAdmin && cfg.logo_url) logoAdmin.src = cfg.logo_url;
  togglePspFields();
  carregarSomPrefs();
}

function togglePspFields() {
  const prov = document.getElementById('cfg-psp-provider')?.value || 'desativado';
  const box = document.getElementById('psp-fields');
  if (box) box.style.display = prov === 'desativado' ? 'none' : 'block';
}

function toggleSecret(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const isPwd = inp.type === 'password';
  inp.type = isPwd ? 'text' : 'password';
  if (btn) btn.textContent = isPwd ? 'Ocultar' : 'Mostrar';
}

function copiarWebhookUrl() {
  const inp = document.getElementById('cfg-psp-webhook-url');
  if (!inp || !inp.value) return;
  navigator.clipboard.writeText(inp.value).then(() => showToast('URL do webhook copiada! Cole no painel do banco.')).catch(() => {});
}

async function testarConexaoPsp() {
  const provider = document.getElementById('cfg-psp-provider')?.value;
  if (!provider || provider === 'desativado') { showToast('Selecione um banco/provedor antes.'); return; }
  showToast('Teste de conexão: salve as credenciais e use o webhook. Validação automática será ativada no backend.');
}

async function registrarWebhookPsp() {
  const url = document.getElementById('cfg-psp-webhook-url')?.value;
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => showToast('URL copiada! Cole no painel do banco em: Config > Webhook Pix.')).catch(() => showToast('Copie manualmente a URL do webhook.'));
}

async function uploadLogo() {
  const inp = document.getElementById('cfg-logo-file');
  if (!inp || !inp.files[0]) { showToast('Selecione uma imagem (máx 2MB)'); return; }
  const fd = new FormData();
  fd.append('logo', inp.files[0]);
  const res = await authFetch('/api/config/logo', { method: 'PUT', body: fd });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) { showToast(data.error || 'Erro ao enviar logo'); return; }
  const prev = document.getElementById('cfg-logo-preview');
  if (prev && data.logo_url) prev.src = data.logo_url;
  if (inp) inp.value = '';
  showToast('Logo enviada!');
}

async function removerLogo() {
  if (!confirm('Remover logo? Voltará para /logo.jpeg e o arquivo será apagado do storage.')) return;
  const res = await authFetch('/api/config/logo', { method: 'DELETE' });
  if (!res.ok) { showToast('Erro ao remover logo'); return; }
  const prev = document.getElementById('cfg-logo-preview');
  if (prev) prev.src = '/logo.jpeg';
  const inp = document.getElementById('cfg-logo-file');
  if (inp) inp.value = '';
  showToast('Logo removida');
}

async function salvarConfig(e) {
  e.preventDefault();
  const diasSel = Array.from(document.querySelectorAll('#cfg-horario-dias input[type=checkbox]:checked')).map(cb => cb.value);
  const auto = document.getElementById('cfg-horario-auto')?.checked || false;
  const config = {
    loja_nome: document.getElementById('cfg-loja-nome').value,
    loja_telefone: document.getElementById('cfg-loja-telefone').value,
    loja_endereco: document.getElementById('cfg-loja-endereco')?.value || '',
    whatsapp_mensagem_saiu_entrega: document.getElementById('cfg-whatsapp-msg-saiu')?.value || '',
    loja_modo: auto ? 'auto' : 'manual',
    loja_horario_abertura: document.getElementById('cfg-horario-abertura')?.value || '',
    loja_horario_fechamento: document.getElementById('cfg-horario-fechamento')?.value || '',
    loja_horario_dias: JSON.stringify(diasSel),
    tempo_espera: document.getElementById('cfg-tempo-espera').value,
    pix_tipo: document.getElementById('cfg-pix-tipo').value,
    pix_chave: document.getElementById('cfg-pix-chave').value,
    pix_nome: document.getElementById('cfg-pix-nome').value,
    psp_provider: document.getElementById('cfg-psp-provider')?.value || 'desativado',
    psp_ambiente: document.getElementById('cfg-psp-ambiente')?.value || 'producao',
    psp_client_id: document.getElementById('cfg-psp-client-id')?.value || '',
    psp_client_secret: document.getElementById('cfg-psp-client-secret')?.value || '',
    psp_pix_chave: document.getElementById('cfg-psp-pix-chave')?.value || '',
    pix_expiracao: document.getElementById('cfg-pix-expiracao')?.value || '3600',
    psp_webhook_secret: document.getElementById('cfg-psp-webhook-secret')?.value || ''
  };
  await authFetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
  salvarSomPrefs();
  showToast('Configurações salvas!');
  const status = document.getElementById('pix-auto-status');
  if (status) {
    if (config.psp_provider === 'desativado') status.textContent = 'Pix automático desativado — usando Pix estático + WhatsApp.';
    else status.textContent = `Ativo: ${config.psp_provider} (${config.psp_ambiente}) — webhook pronto para colar no banco.`;
  }
}

// ===== STATUS DA LOJA =====

async function carregarLojaStatus() {
  try {
    // Usa endpoint público que já calcula loja_aberta_efetiva (auto vs manual)
    const res = await fetch('/api/config/public');
    if (!res.ok) return;
    const cfg = await res.json();
    const efetiva = cfg.loja_aberta_efetiva !== 'false';
    const modoAuto = cfg.loja_modo === 'auto';
    atualizarBotaoLoja(efetiva, modoAuto);
  } catch (e) { /* mantem padrao aberto */ }
}

function atualizarBotaoLoja(aberta, modoAuto) {
  const btn = document.getElementById('loja-status-btn');
  const txt = document.getElementById('loja-status-texto');
  if (!btn || !txt) return;
  btn.classList.toggle('aberto', aberta);
  btn.classList.toggle('fechado', !aberta);
  if (modoAuto === true) {
    txt.textContent = aberta ? 'Loja Aberta (Auto)' : 'Loja Fechada (Auto)';
  } else if (modoAuto === false) {
    txt.textContent = aberta ? 'Loja Aberta' : 'Loja Fechada';
  } else {
    txt.textContent = aberta ? 'Loja Aberta' : 'Loja Fechada';
  }
}

async function toggleLojaStatus() {
  try {
    const resPub = await fetch('/api/config/public');
    const cfgPub = resPub.ok ? await resPub.json() : null;
    const res = await authFetch('/api/config');
    if (!res.ok) { showToast('Erro ao ler status da loja'); return; }
    const cfg = await res.json();
    const efetiva = cfgPub ? cfgPub.loja_aberta_efetiva !== 'false' : cfg.loja_aberta !== 'false';
    const vaiAbrir = !efetiva;
    // Se estava em modo auto e vai fechar manualmente, desativa automático para override manual vencer
    const payload = { loja_aberta: vaiAbrir ? 'true' : 'false' };
    if (cfg.loja_modo === 'auto' && !vaiAbrir) {
      payload.loja_modo = 'manual';
      const chk = document.getElementById('cfg-horario-auto');
      if (chk) chk.checked = false;
      const box = document.getElementById('horario-campos');
      if (box) box.style.display = 'none';
    }
    const put = await authFetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!put.ok) { showToast('Erro ao alterar status da loja'); return; }
    // Recarrega status efetivo após alteração
    setTimeout(carregarLojaStatus, 300);
    showToast(vaiAbrir ? 'Loja ABERTA - recebendo pedidos' : 'Loja FECHADA - automático pausado');
  } catch (e) { showToast('Erro de conexão'); }
}

// Polling do status efetivo quando em modo auto (para refletir fechamento automático sem refresh)
setInterval(() => {
  const chk = document.getElementById('cfg-horario-auto');
  if (chk && chk.checked) carregarLojaStatus();
}, 60000);

// ===== RELÓGIO BRT =====
function atualizarRelogio() {
  const elHora = document.querySelector('#admin-relogio .relogio-hora');
  const elData = document.querySelector('#admin-relogio .relogio-data');
  if (!elHora || !elData) return;
  const agora = new Date();
  elHora.textContent = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  elData.textContent = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
}
setInterval(atualizarRelogio, 1000);
setTimeout(atualizarRelogio, 100);

// ===== PEDIDO WHATSAPP (ADMIN) =====
let whatsappProdutos = [];
let whatsappCarrinho = [];
let whatsappCategoriaFiltro = '';
let whatsappProdutoSelecionado = null;
let whatsappQtd = 1;
let adicionandoItemWhatsApp = false;

function adicionarItemWhatsApp(item) {
  if (adicionandoItemWhatsApp) return;
  adicionandoItemWhatsApp = true;
  try {
    whatsappCarrinho.push(item);
    renderCarrinhoWhatsApp();
    showToast(`${item.quantidade}x ${escapeHtml(item.produto_nome)} adicionado!`);
  } finally {
    adicionandoItemWhatsApp = false;
  }
}

async function abrirModalPedidoWhatsApp() {
  try {
    whatsappCarrinho = [];
    whatsappCategoriaFiltro = '';
    safeSetValue('whatsapp-cliente-nome', '');
    safeSetValue('whatsapp-cliente-telefone', '');
    safeSetValue('whatsapp-cliente-cep', '');
    safeSetValue('whatsapp-cliente-bairro', '');
    safeSetValue('whatsapp-cliente-rua', '');
    safeSetValue('whatsapp-cliente-numero', '');
    safeSetValue('whatsapp-cliente-complemento', '');
    safeSetValue('whatsapp-cliente-referencia', '');
    safeSetValue('whatsapp-forma-pagamento', 'pix');
    safeHide('whatsapp-troco-box');
    safeSetValue('whatsapp-observacoes', '');
    safeSetValue('whatsapp-busca-produto', '');
    const radioEntrega=document.querySelector('input[name="whatsapp-tipo"][value="entrega"]');
    if(radioEntrega) radioEntrega.checked=true;
    
    const modal = document.getElementById('modal-pedido-whatsapp');
    if (!modal) { console.error('Modal WhatsApp não encontrado'); showToast('Erro interno'); return; }
    modal.classList.add('active');
    
    await carregarDadosWhatsApp();
    alternarTipoWhatsApp();
    renderCarrinhoWhatsApp();
  } catch (e) {
    console.error('Erro ao abrir modal WhatsApp:', e);
    showToast('Erro ao carregar dados do pedido');
    fecharModalPedidoWhatsApp();
  }
}

function safeSetValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function safeHide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function fecharModalPedidoWhatsApp() {
  document.getElementById('modal-pedido-whatsapp').classList.remove('active');
}

function getTipoWhatsApp(){ const el=document.querySelector('input[name="whatsapp-tipo"]:checked'); return el?el.value:'entrega'; }
function alternarTipoWhatsApp(){
  const tipo=getTipoWhatsApp();
  const campos=document.getElementById('whatsapp-endereco-campos');
  const info=document.getElementById('whatsapp-retirada-info');
  const titulo=document.getElementById('whatsapp-modal-titulo');
  if(tipo==='retirada'){
    if(campos) campos.style.display='none';
    if(info){
      info.style.display='block';
      const endereco=(typeof config!=='undefined'&&config.loja_endereco)?config.loja_endereco:'';
      const mapsUrl=endereco?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`:'#';
      info.innerHTML=endereco?`<div style="font-weight:700;margin-bottom:4px">🏠 Retirada no local</div><div>${escapeHtml(endereco)}</div><a href="${mapsUrl}" target="_blank" class="btn btn-outline btn-sm" style="margin-top:8px;display:inline-flex;align-items:center;gap:6px">📍 Abrir no Google Maps</a>`:`<div>🏠 Retirada no local</div><small style="color:var(--color-text-muted)">Endereço da loja não configurado — configure em Configurações.</small>`;
    }
    if(titulo) titulo.textContent='📱 Novo Pedido - WhatsApp (Retirada)';
  } else {
    if(campos) campos.style.display='grid';
    if(info) info.style.display='none';
    if(titulo) titulo.textContent='📱 Novo Pedido - WhatsApp (Entrega)';
  }
  renderCarrinhoWhatsApp();
}

function isPizzaWhatsApp(p){ return !!(p && p.categoria_nome && p.categoria_nome.toLowerCase().includes('pizza')); }

// Item vendido por peso: unidade 'kg' OU categoria Açaí (vendido a R$/kg, digita-se o valor)
function isPorPeso(p){
  if(!p) return false;
  if(p.unidade==='kg') return true;
  const cat = String(p.categoria_nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return cat.includes('acai');
}

function whatsappProdutoCardHtml(p){
  if(!p.adicionais) p.adicionais = [];
  return `
    <div class="product-card" onclick="abrirModalWhatsAppQtd(${p.id})">
      <div class="product-media">
        ${p.foto?`<img class="product-img" src="${p.foto}" alt="${escapeHtml(p.nome)}" data-categoria="${escapeHtml(p.categoria_nome||'')}" data-nome="${escapeHtml(p.nome)}" loading="lazy" onerror="handleImgError(this)">`:`<div class="product-img-placeholder">${(window.categoriaIcon?window.categoriaIcon(p.nome,p.categoria_nome):'🍔')}</div>`}
      </div>
      <div class="product-info">
        <div>
          <div class="product-name">${escapeHtml(p.nome)}</div>
          ${p.descricao?`<div class="product-desc">${escapeHtml(p.descricao)}</div>`:''}
        </div>
        <div class="product-footer">
          <span class="product-price">R$ ${p.preco.toFixed(2)}${p.unidade==='kg'?'\/kg':''}</span>
          <button class="btn-add" onclick="event.stopPropagation(); abrirModalWhatsAppQtd(${p.id})" aria-label="Adicionar ${escapeHtml(p.nome)}">+</button>
        </div>
      </div>
    </div>`;
}

function whatsappRenderAgrupado(lista){
  const grupos=[]; const mapa=new Map();
  lista.forEach(p=>{
    const catId=p.categoria_id;
    if(!mapa.has(catId)){
      const itens=[];
      mapa.set(catId,itens);
      grupos.push({id:catId, nome:p.categoria_nome||'Outros', pizza:isPizzaWhatsApp(p), itens});
    }
    mapa.get(catId).push(p);
  });
  let pizzasInseridas=false;
  return grupos.map(g=>{
    if(g.pizza){
      if(pizzasInseridas) return '';
      pizzasInseridas=true;
      if(window.PizzaModal){
        window.__pizzaCfgWhatsApp={ produtos: whatsappProdutos, toast: showToast, onAdd:item=>adicionarItemWhatsApp(item) };
      }
      const cardHtml = window.PizzaModal ? window.PizzaModal.cardHtml('cliente').replace(/window\.__pizzaCfg/g,'window.__pizzaCfgWhatsApp') : '';
      return `<div class="category-section"><div class="category-heading">Pizzas</div><div class="category-items">${cardHtml}</div></div>`;
    }
    return `<div class="category-section"><div class="category-heading">${escapeHtml(g.nome)}</div><div class="category-items">${g.itens.map(p=>whatsappProdutoCardHtml(p)).join('')}</div></div>`;
  }).join('');
}

async function carregarDadosWhatsApp() {
  try {
    const [prodRes, catRes, bairroRes] = await Promise.all([
      authFetch('/api/produtos/ativos?canal=garcom'),
      authFetch('/api/categorias'),
      authFetch('/api/bairros')
    ]);
    whatsappProdutos = await prodRes.json();
    const categorias = await catRes.json();
    const bairros = await bairroRes.json();
    // Bairros
    const bairroSel = document.getElementById('whatsapp-cliente-bairro');
    const atual = bairroSel.value;
    bairroSel.innerHTML = '<option value="">Bairro *</option>' + bairros.filter(b=>b.atendido).map(b=>`<option value="${escapeHtml(b.nome)}" data-taxa="${b.taxa_entrega}">${escapeHtml(b.nome)} - R$ ${parseFloat(b.taxa_entrega).toFixed(2)}</option>`).join('');
    if (atual) bairroSel.value = atual;
    // Categorias - dropdown igual cliente/garçom (Pizzas colapsada)
    const catContainer = document.getElementById('whatsapp-categorias');
    let html = `<option value="">Todas as categorias</option>`;
    const tabs=[]; const vistos=new Set();
    let pizzaOrdem = Infinity;
    whatsappProdutos.forEach(p=>{
      if(vistos.has(p.categoria_id)) return;
      vistos.add(p.categoria_id);
      if(isPizzaWhatsApp(p)){
        if(!tabs.includes('__pizzas__')){
          tabs.push('__pizzas__');
          const pizzaCats=categorias.filter(c=>c.nome.toLowerCase().includes('pizza'));
          pizzaOrdem=Math.min(...pizzaCats.map(c=>c.ordem ?? 999), pizzaOrdem);
        }
      } else tabs.push(p.categoria_nome);
    });
    const ordemMap=new Map(categorias.map(c=>[c.nome, c.ordem ?? 999]));
    ordemMap.set('__pizzas__', pizzaOrdem);
    tabs.sort((a,b)=>(ordemMap.get(a)??999)-(ordemMap.get(b)??999));
    tabs.forEach(c=>{
      const label=c==='__pizzas__'?'Pizzas':c;
      const selected=whatsappCategoriaFiltro===c?'selected':'';
      html+=`<option value="${c}" ${selected}>${label}</option>`;
    });
    catContainer.innerHTML = html;
    catContainer.value = whatsappCategoriaFiltro;
    // Configurar pizza para WhatsApp
    if(window.PizzaModal){
      window.__pizzaCfgWhatsApp={ produtos: whatsappProdutos, toast: showToast, onAdd:item=>adicionarItemWhatsApp(item) };
    }
    renderProdutosWhatsApp();
  } catch(e){
    console.error('carregarDadosWhatsApp falhou:', e);
    throw e;
  }
}

function filtrarCategoriaWhatsApp(cat) {
  whatsappCategoriaFiltro = cat;
  renderProdutosWhatsApp();
}
function filtrarProdutosWhatsApp(){ renderProdutosWhatsApp(); }

function renderProdutosWhatsApp() {
  const container = document.getElementById('whatsapp-produtos-lista');
  const busca = (document.getElementById('whatsapp-busca-produto')?.value || '').trim().toLowerCase();
  let html='';
  const agrupar = !whatsappCategoriaFiltro && !busca;
  if(agrupar){
    html += whatsappRenderAgrupado(whatsappProdutos);
  } else {
    let lista = whatsappProdutos.filter(p=>{
      if(whatsappCategoriaFiltro){
        if(whatsappCategoriaFiltro==='__pizzas__'){
          if(!isPizzaWhatsApp(p)) return false;
        } else if(p.categoria_nome!==whatsappCategoriaFiltro) return false;
      }
      if(busca && !p.nome.toLowerCase().includes(busca) && !(p.descricao||'').toLowerCase().includes(busca)) return false;
      return true;
    });
    if(lista.length){
      let extraPizza = '';
      const temPizza = lista.some(p=>isPizzaWhatsApp(p));
      if(temPizza && window.PizzaModal){
        const prodsPizza = whatsappCategoriaFiltro==='__pizzas__' ? whatsappProdutos.filter(p=>isPizzaWhatsApp(p)) : whatsappProdutos.filter(p=>p.categoria_nome===whatsappCategoriaFiltro);
        window.__pizzaCfgWhatsApp={ produtos: prodsPizza.length?prodsPizza:whatsappProdutos, toast: showToast, onAdd:item=>adicionarItemWhatsApp(item) };
        const card = window.PizzaModal.cardHtml('cliente').replace(/window\.__pizzaCfg/g,'window.__pizzaCfgWhatsApp');
        extraPizza = `<div class="category-section"><div class="category-heading">Montar Pizza</div><div class="category-items">${card}</div></div>`;
        // Para Pizzas, não mostrar lista de tamanhos individuais, só o card
        if(whatsappCategoriaFiltro==='__pizzas__'){
          html += extraPizza;
          // não adicionar lista de itens pizza individuais
        } else {
          html += extraPizza;
          const outrosItens = lista.filter(p=>!isPizzaWhatsApp(p));
          if(outrosItens.length){
            html += `<div class="category-section"><div class="category-heading">${whatsappCategoriaFiltro || 'Produtos'}</div><div class="category-items">${outrosItens.map(p=>whatsappProdutoCardHtml(p)).join('')}</div></div>`;
          }
        }
      } else {
        html += `<div class="category-section"><div class="category-heading">${whatsappCategoriaFiltro || 'Produtos'}</div><div class="category-items">${lista.map(p=>whatsappProdutoCardHtml(p)).join('')}</div></div>`;
      }
    } else if(whatsappCategoriaFiltro==='__pizzas__' && !busca){
      // Busca vazia + filtro Pizzas sem itens (caso pizza sem produtos, mostrar só card)
      if(window.PizzaModal){
        window.__pizzaCfgWhatsApp={ produtos: whatsappProdutos.filter(p=>isPizzaWhatsApp(p)), toast: showToast, onAdd:item=>adicionarItemWhatsApp(item) };
        const card = window.PizzaModal.cardHtml('cliente').replace(/window\.__pizzaCfg/g,'window.__pizzaCfgWhatsApp');
        html += `<div class="category-section"><div class="category-heading">Pizzas</div><div class="category-items">${card}</div></div>`;
      }
    }
  }
  container.innerHTML = html || '<p style="text-align:center; color:var(--color-text-muted); padding:20px">Nenhum produto</p>';
}

function abrirModalWhatsAppQtd(prodId) {
  whatsappProdutoSelecionado = whatsappProdutos.find(p=>p.id===prodId);
  if(!whatsappProdutoSelecionado) return;
  whatsappQtd = 1;
  const porKg = isPorPeso(whatsappProdutoSelecionado);
  document.getElementById('whatsapp-qtd-nome').textContent = whatsappProdutoSelecionado.nome;
  document.getElementById('whatsapp-qtd-preco').textContent = `R$ ${whatsappProdutoSelecionado.preco.toFixed(2)}${porKg ? ' /kg' : ''}`;
  document.getElementById('whatsapp-qtd-valor').textContent = '1';
  document.getElementById('whatsapp-qtd-unit-control').style.display = porKg ? 'none' : 'flex';
  document.getElementById('whatsapp-qtd-kg-control').style.display = porKg ? 'block' : 'none';
  if (porKg) document.getElementById('whatsapp-qtd-kg-valor').value = 15;
  document.getElementById('whatsapp-qtd-obs').value = '';
  const adcBox = document.getElementById('whatsapp-qtd-adicionais');
  const adcList = document.getElementById('whatsapp-qtd-adicionais-lista');
  const adicionaisAcaI = (whatsappProdutoSelecionado.adicionais || []).filter(a=>['base','cobertura','acompanhamento'].includes(a.tipo));
  const isAcaI = adicionaisAcaI.length>0;
  if(whatsappProdutoSelecionado.adicionais && whatsappProdutoSelecionado.adicionais.length){
    adcBox.style.display='block';
    let html='';
    if(isAcaI){
      const bases=whatsappProdutoSelecionado.adicionais.filter(a=>a.tipo==='base');
      const coberturas=whatsappProdutoSelecionado.adicionais.filter(a=>a.tipo==='cobertura');
      const acompanhamentos=whatsappProdutoSelecionado.adicionais.filter(a=>a.tipo==='acompanhamento');
      if(bases.length){
        html+=`<div style="margin-bottom:10px; font-size:0.8rem; font-weight:700; color:var(--color-text); border-bottom:1px solid var(--color-border); padding-bottom:4px">Base</div>`;
        html+=bases.map(a=>`
          <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f1f1f1; cursor:pointer">
            <input type="radio" name="whatsapp-base" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="base" onchange="whatsappAtualizarTotal()">
            <span style="flex:1; font-size:0.85rem">${escapeHtml(a.nome)}</span>
            <span style="font-size:0.8rem; font-weight:700; color:var(--color-primary)">${a.preco>0?`+ R$ ${a.preco.toFixed(2)}`:'Incluído'}</span>
          </label>
        `).join('');
      }
      if(coberturas.length){
        html+=`<div style="margin:10px 0 6px; font-size:0.8rem; font-weight:700; color:var(--color-text); border-bottom:1px solid var(--color-border); padding-bottom:4px">Coberturas</div>`;
        html+=coberturas.map(a=>`
          <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f1f1f1; cursor:pointer">
            <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="cobertura" data-limite="${a.limite||0}" onchange="whatsappAtualizarTotal()">
            <span style="flex:1; font-size:0.85rem">${escapeHtml(a.nome)}</span>
            <span style="font-size:0.8rem; font-weight:700; color:var(--color-primary)">${a.preco>0?`+ R$ ${a.preco.toFixed(2)}`:'Incluído'}</span>
          </label>
        `).join('');
      }
      if(acompanhamentos.length){
        html+=`<div style="margin:10px 0 6px; font-size:0.8rem; font-weight:700; color:var(--color-text); border-bottom:1px solid var(--color-border); padding-bottom:4px">Acompanhamentos</div>`;
        html+=acompanhamentos.map(a=>`
          <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f1f1f1; cursor:pointer">
            <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="acompanhamento" data-limite="${a.limite||0}" onchange="whatsappAtualizarTotal()">
            <span style="flex:1; font-size:0.85rem">${escapeHtml(a.nome)}</span>
            <span style="font-size:0.8rem; font-weight:700; color:var(--color-primary)">${a.preco>0?`+ R$ ${a.preco.toFixed(2)}`:'Incluído'}</span>
          </label>
        `).join('');
      }
      setTimeout(()=>{
        ['cobertura','acompanhamento'].forEach(grupo=>{
          document.querySelectorAll(`#whatsapp-qtd-adicionais-lista input[data-tipo="${grupo}"]`).forEach(cb=>{
            cb.addEventListener('change', function(){
              const limite=parseInt(this.dataset.limite)||0;
              if(limite>0){
                const checked=document.querySelectorAll(`#whatsapp-qtd-adicionais-lista input[data-tipo="${grupo}"]:checked`).length;
                if(checked>limite){ this.checked=false; showToast(`Máximo ${limite} ${grupo}(s) permitido(s)`); }
              }
            });
          });
        });
      },10);
    } else {
      // Tradicionais: agrupar por tipo se houver sabores/borda
      const porTipo={};
      whatsappProdutoSelecionado.adicionais.forEach(a=>{
        const t=a.tipo||'adicional';
        if(!porTipo[t]) porTipo[t]=[];
        porTipo[t].push(a);
      });
      const ordemTipo=['sabor','borda','adicional'];
      const titulos={sabor:'Sabores', borda:'Borda Recheada', adicional:'Adicionais'};
      let first=true;
      for(let tipo of ordemTipo){
        if(!porTipo[tipo] || !porTipo[tipo].length) continue;
        if(!first) html+=`<div style="margin:10px 0 6px; font-size:0.8rem; font-weight:700; color:var(--color-text); border-bottom:1px solid var(--color-border); padding-bottom:4px">${titulos[tipo]||tipo}</div>`;
        first=false;
        if(!html.includes('Sabores') && tipo==='sabor' && porTipo[tipo].length) html=`<div style="margin-bottom:6px; font-size:0.8rem; font-weight:700; color:var(--color-text); border-bottom:1px solid var(--color-border); padding-bottom:4px">${titulos[tipo]}</div>`+html;
        html+=porTipo[tipo].map(a=>`
          <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f1f1f1; cursor:pointer">
            <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="${a.tipo||'adicional'}" onchange="whatsappAtualizarTotal()">
            <span style="flex:1; font-size:0.85rem">${escapeHtml(a.nome)}</span>
            <span style="font-size:0.8rem; font-weight:700; color:var(--color-primary)">+ R$ ${a.preco.toFixed(2)}</span>
          </label>
        `).join('');
      }
      // Se sobraram tipos não listados (ex: base já tratada, mas aqui já é não-açaí, então só esses)
      const outrosTipos=Object.keys(porTipo).filter(t=>!ordemTipo.includes(t));
      outrosTipos.forEach(t=>{
        html+=`<div style="margin:10px 0 6px; font-size:0.8rem; font-weight:700; color:var(--color-text); border-bottom:1px solid var(--color-border); padding-bottom:4px">${t}</div>`;
        html+=porTipo[t].map(a=>`
          <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f1f1f1; cursor:pointer">
            <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="${a.tipo}" onchange="whatsappAtualizarTotal()">
            <span style="flex:1; font-size:0.85rem">${escapeHtml(a.nome)}</span>
            <span style="font-size:0.8rem; font-weight:700; color:var(--color-primary)">+ R$ ${a.preco.toFixed(2)}</span>
          </label>
        `).join('');
      });
    }
    adcList.innerHTML=html;
  } else { adcBox.style.display='none'; }
  whatsappAtualizarTotal();
  document.getElementById('modal-whatsapp-qtd').classList.add('active');
}
function fecharModalWhatsAppQtd(){ document.getElementById('modal-whatsapp-qtd').classList.remove('active'); }
function whatsappAlterarQtd(d){ whatsappQtd=Math.max(1, whatsappQtd+d); document.getElementById('whatsapp-qtd-valor').textContent=whatsappQtd; whatsappAtualizarTotal(); }
function whatsappAtualizarTotal(){
  if(!whatsappProdutoSelecionado) return;
  const porKg = isPorPeso(whatsappProdutoSelecionado);
  let kg = 1;
  let total = 0;
  if(porKg){
    const valor = parseFloat(document.getElementById('whatsapp-qtd-kg-valor')?.value) || 0;
    kg = whatsappProdutoSelecionado.preco > 0 ? valor / whatsappProdutoSelecionado.preco : 0;
    total = valor;
  } else {
    total = whatsappProdutoSelecionado.preco * whatsappQtd;
  }
  document.querySelectorAll('#whatsapp-qtd-adicionais-lista input:checked').forEach(c=>{ total += parseFloat(c.dataset.preco) * (porKg ? kg : whatsappQtd); });
  document.getElementById('whatsapp-qtd-total').textContent=`R$ ${total.toFixed(2)}`;
}
function confirmarAddWhatsApp(){
  if(!whatsappProdutoSelecionado) return;
  const adicionais=[];
  document.querySelectorAll('#whatsapp-qtd-adicionais-lista input:checked').forEach(c=>{
    adicionais.push({id: parseInt(c.value), nome: c.dataset.nome, preco: parseFloat(c.dataset.preco)});
  });
  const porKg = isPorPeso(whatsappProdutoSelecionado);
  let quantidade, unidade;
  if(porKg){
    const valor = parseFloat(document.getElementById('whatsapp-qtd-kg-valor')?.value);
    if(!valor || valor <= 0){ showToast('Informe o valor desejado'); return; }
    // O campo "Valor desejado (R$)" representa o preço; converte para kg
    quantidade = valor / (whatsappProdutoSelecionado.preco || 1);
    unidade = 'kg';
  } else {
    quantidade = whatsappQtd;
    unidade = 'un';
  }
  adicionarItemWhatsApp({
    produto_id: whatsappProdutoSelecionado.id,
    produto_nome: whatsappProdutoSelecionado.nome,
    preco_unitario: whatsappProdutoSelecionado.preco,
    quantidade,
    unidade,
    observacao: document.getElementById('whatsapp-qtd-obs').value.trim(),
    adicionais
  });
  fecharModalWhatsAppQtd();
}
function renderCarrinhoWhatsApp(){
  const lista=document.getElementById('whatsapp-carrinho-lista');
  const vazio=document.getElementById('whatsapp-carrinho-vazio');
  const totalBox=document.getElementById('whatsapp-carrinho-total');
  const countEl=document.getElementById('whatsapp-carrinho-count');
  const taxaEl=document.getElementById('whatsapp-taxa');
  const subtotalEl=document.getElementById('whatsapp-subtotal');
  const totalEl=document.getElementById('whatsapp-total');
  const bairroSel=document.getElementById('whatsapp-cliente-bairro');
  let taxa=0;
  if(getTipoWhatsApp()==='retirada'){
    taxa=0;
  } else if(bairroSel && bairroSel.selectedIndex>0){
    const opt=bairroSel.options[bairroSel.selectedIndex];
    taxa=parseFloat(opt.dataset.taxa)||0;
  }
  if(!whatsappCarrinho.length){
    lista.innerHTML='';
    vazio.style.display='block';
    totalBox.style.display='none';
    countEl.textContent='0';
    return;
  }
  vazio.style.display='none';
  totalBox.style.display='block';
  let subtotal=0;
  lista.innerHTML=whatsappCarrinho.map((it,i)=>{
    const tot=it.preco_unitario*it.quantidade + it.adicionais.reduce((s,a)=>s+a.preco*it.quantidade,0);
    subtotal+=tot;
    const adic = it.adicionais.map(a=>`+ ${escapeHtml(a.nome)}`).join(', ');
    const isKg = it.unidade==='kg';
    const qtdLabel = isKg ? `${it.quantidade.toFixed(2).replace('.',',')} kg` : `${it.quantidade}x`;
    const qtdDisplay = isKg ? it.quantidade.toFixed(2).replace('.',',') : it.quantidade;
    return `<div style="border:1px solid var(--color-border); border-radius:8px; padding:8px; margin-bottom:8px; background:white">
      <div style="display:flex; justify-content:space-between; gap:8px">
        <div style="flex:1; min-width:0">
          <div style="font-weight:700; font-size:0.85rem">${escapeHtml(it.produto_nome)}</div>
          ${adic?`<div style="font-size:0.75rem; color:var(--color-text-muted)">${escapeHtml(adic)}</div>`:''}
          ${it.observacao?`<div style="font-size:0.75rem; color:#D97706; font-style:italic">Obs: ${escapeHtml(it.observacao)}</div>`:''}
          <div style="font-size:0.8rem; color:var(--color-text-secondary)">R$ ${it.preco_unitario.toFixed(2)}${isKg?'/kg':''} x ${qtdLabel}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800; color:var(--color-primary)">R$ ${tot.toFixed(2)}</div>
          <div style="display:flex; gap:4px; margin-top:4px; justify-content:flex-end">
            <button onclick="whatsappAlterarQtdCarrinho(${i},-1)" style="width:26px; height:26px; border-radius:50%; border:1px solid var(--color-border); background:white; cursor:pointer">-</button>
            <span style="min-width:38px; text-align:center; font-weight:700; font-size:0.85rem; line-height:26px">${qtdDisplay}</span>
            <button onclick="whatsappAlterarQtdCarrinho(${i},1)" style="width:26px; height:26px; border-radius:50%; border:1px solid var(--color-border); background:white; cursor:pointer">+</button>
            <button onclick="whatsappRemover(${i})" style="width:26px; height:26px; border-radius:50%; border:none; background:#FEF2F2; color:#DC2626; cursor:pointer">×</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  countEl.textContent=whatsappCarrinho.length;
  subtotalEl.textContent=`R$ ${subtotal.toFixed(2)}`;
  taxaEl.textContent=`R$ ${taxa.toFixed(2)}`;
  totalEl.textContent=`R$ ${(subtotal+taxa).toFixed(2)}`;
}
function whatsappAlterarQtdCarrinho(idx,delta){
  const it=whatsappCarrinho[idx];
  if(!it) return;
  const step = it.unidade==='kg' ? 0.1 : 1;
  it.quantidade = +(it.quantidade + delta*step).toFixed(3);
  if(it.quantidade < (it.unidade==='kg' ? 0.1 : 1)) whatsappCarrinho.splice(idx,1);
  renderCarrinhoWhatsApp();
}
function whatsappRemover(idx){ whatsappCarrinho.splice(idx,1); renderCarrinhoWhatsApp(); }
function formatarTelefoneWhatsApp(inp){
  // Permite apagar números normalmente
  let v = inp.value.replace(/\D/g,'');
  
  // Se o usuário está apagando, não precisamos forçar a formatação imediatamente se for curto
  // Apenas limitamos a 11 dígitos
  if (v.length > 11) v = v.slice(0, 11);
  
  // Aplica a formatação apenas se houver o suficiente para formatar
  let formatted = v;
  if (v.length > 7) {
    formatted = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  } else if (v.length > 2) {
    formatted = `(${v.slice(0, 2)}) ${v.slice(2)}`;
  } else if (v.length > 0) {
    formatted = `(${v}`;
  }
  
  inp.value = formatted;
  
  // Buscar cliente quando telefone estiver completo (10 ou 11 dígitos)
  if(v.length >= 10) {
    buscarClientePorTelefoneWhatsApp(v);
  }
}

async function buscarClientePorTelefoneWhatsApp(telefone) {
  try {
    const res = await authFetch(`/api/clientes/telefone/${encodeURIComponent(telefone)}`);
    if (res.ok) {
      const cliente = await res.json();
      // Cliente encontrado - preencher campos
      document.getElementById('whatsapp-cliente-nome').value = cliente.nome || '';
      document.getElementById('whatsapp-cliente-rua').value = cliente.rua || '';
      document.getElementById('whatsapp-cliente-numero').value = cliente.numero || '';
      document.getElementById('whatsapp-cliente-complemento').value = cliente.complemento || '';
      document.getElementById('whatsapp-cliente-referencia').value = cliente.ponto_referencia || '';
      // Selecionar bairro se existir
      if (cliente.bairro) {
        const bairroSel = document.getElementById('whatsapp-cliente-bairro');
        for (let i = 0; i < bairroSel.options.length; i++) {
          if (bairroSel.options[i].value.toLowerCase() === cliente.bairro.toLowerCase()) {
            bairroSel.selectedIndex = i;
            break;
          }
        }
        renderCarrinhoWhatsApp(); // Atualiza taxa
      }
      showToast('Cliente encontrado: ' + cliente.nome, 'success');
    } else {
      // Cliente não encontrado - limpar campos para novo cadastro
      limparCamposClienteWhatsApp();
      showToast('Cliente não cadastrado. Preencha os dados para novo cadastro.', 'info');
    }
  } catch (e) {
    console.error('Erro ao buscar cliente:', e);
  }
}

function limparCamposClienteWhatsApp() {
  document.getElementById('whatsapp-cliente-nome').value = '';
  document.getElementById('whatsapp-cliente-rua').value = '';
  document.getElementById('whatsapp-cliente-numero').value = '';
  document.getElementById('whatsapp-cliente-complemento').value = '';
  document.getElementById('whatsapp-cliente-referencia').value = '';
  document.getElementById('whatsapp-cliente-bairro').value = '';
  // Não limpa o telefone
}

document.getElementById('whatsapp-cliente-bairro')?.addEventListener('change', renderCarrinhoWhatsApp);
document.getElementById('whatsapp-forma-pagamento')?.addEventListener('change', function(){
  document.getElementById('whatsapp-troco-box').style.display=this.value==='dinheiro'?'block':'none';
});
async function buscarCepWhatsApp() {
  const cep = document.getElementById('whatsapp-cliente-cep').value.replace(/\D/g, '');
  if (cep.length !== 8) { showToast('CEP inválido (digite 8 números)'); return; }
  const btn = document.querySelector('button[onclick="buscarCepWhatsApp()"]');
  const originalTxt = btn.textContent;
  btn.disabled = true; btn.textContent = '...';
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (data.erro) { showToast('CEP não encontrado'); return; }
    document.getElementById('whatsapp-cliente-rua').value = data.logradouro || '';
    document.getElementById('whatsapp-cliente-complemento').value = data.complemento || '';
    if (data.bairro) {
      const bairroSel = document.getElementById('whatsapp-cliente-bairro');
      let encontrou = false;
      for (let i = 0; i < bairroSel.options.length; i++) {
        if (bairroSel.options[i].value.toLowerCase() === data.bairro.toLowerCase()) {
          bairroSel.selectedIndex = i;
          encontrou = true;
          break;
        }
      }
      if (!encontrou) {
        showToast(`Bairro "${data.bairro}" não atendido, selecione manualmente.`);
      } else {
        renderCarrinhoWhatsApp(); // Atualiza taxa
      }
    }
    document.getElementById('whatsapp-cliente-numero').focus();
  } catch (e) {
    showToast('Erro ao buscar CEP');
  } finally {
    btn.disabled = false; btn.textContent = originalTxt;
  }
}

async function enviarPedidoWhatsApp(){
  if(!whatsappCarrinho.length){ showToast('Carrinho vazio'); return; }
  const tipoEntrega=getTipoWhatsApp();
  const isRetirada=tipoEntrega==='retirada';
  const nome=document.getElementById('whatsapp-cliente-nome').value.trim();
  const telefone=document.getElementById('whatsapp-cliente-telefone').value.trim();
  const rua=document.getElementById('whatsapp-cliente-rua').value.trim();
  const numero=document.getElementById('whatsapp-cliente-numero').value.trim();
  const complemento=document.getElementById('whatsapp-cliente-complemento').value.trim();
  const referencia=document.getElementById('whatsapp-cliente-referencia').value.trim();
  const forma=document.getElementById('whatsapp-forma-pagamento').value;
  const observacoes=document.getElementById('whatsapp-observacoes').value.trim();
  let bairro=isRetirada?'Retirada no local':document.getElementById('whatsapp-cliente-bairro').value;
  if(!nome || !telefone){ showToast('Informe nome e telefone'); return; }
  if(!isRetirada && !bairro){ showToast('Selecione o bairro'); return; }
  if(telefone.replace(/\D/g,'').length<10){ showToast('Telefone inválido'); return; }
  const btn=document.getElementById('whatsapp-btn-enviar');
  btn.disabled=true; btn.textContent='Enviando...';
  try{
    let clienteId;
    let clientePrevio=null;
    const cliRes=await authFetch(`/api/clientes/telefone/${encodeURIComponent(telefone)}`);
    if(cliRes.ok){
      clientePrevio=await cliRes.json();
      clienteId=clientePrevio.id;
      if(isRetirada){
        const keepBairro=clientePrevio.bairro && clientePrevio.bairro!=='Retirada no local' ? clientePrevio.bairro : undefined;
        const keepRua=clientePrevio.rua || undefined;
        const keepNum=clientePrevio.numero || undefined;
        const keepComp=clientePrevio.complemento || undefined;
        const keepRef=clientePrevio.ponto_referencia || undefined;
        const payload={nome, telefone};
        if(keepBairro) payload.bairro=keepBairro;
        if(keepRua) payload.rua=keepRua;
        if(keepNum) payload.numero=keepNum;
        if(keepComp) payload.complemento=keepComp;
        if(keepRef) payload.ponto_referencia=keepRef;
        await authFetch(`/api/clientes/${clienteId}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}).catch(()=>{});
      } else {
        await authFetch(`/api/clientes/${clienteId}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nome, telefone, bairro, rua, numero, complemento, ponto_referencia: referencia})}).catch(()=>{});
      }
    } else {
      if(isRetirada){
        const novoRes=await authFetch('/api/clientes', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nome, telefone})});
        if(!novoRes.ok){ const err=await novoRes.json(); throw new Error(err.error||'Erro ao cadastrar cliente'); }
        const novo=await novoRes.json();
        clienteId=novo.id;
      } else {
        const novoRes=await authFetch('/api/clientes', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nome, telefone, bairro, rua, numero, complemento, ponto_referencia: referencia})});
        if(!novoRes.ok){ const err=await novoRes.json(); throw new Error(err.error||'Erro ao cadastrar cliente'); }
        const novo=await novoRes.json();
        clienteId=novo.id;
      }
    }
    let taxa=0;
    let endereco='';
    if(isRetirada){
      taxa=0;
      const lojaEnd=(typeof config!=='undefined'&&config.loja_endereco)?config.loja_endereco:'';
      endereco=lojaEnd?`Retirada no local - ${lojaEnd}`:'Retirada no local';
    } else {
      const bairroSel=document.getElementById('whatsapp-cliente-bairro');
      taxa=parseFloat(bairroSel.options[bairroSel.selectedIndex]?.dataset.taxa||0);
      endereco=`${rua||''}${numero?`, ${numero}`:''}${complemento?` - ${complemento}`:''}${referencia?` (Ref: ${referencia})`:''}`.trim();
      if(!endereco) endereco=bairro;
    }
    let obsFinal=observacoes;
    if(forma==='dinheiro'){
      const troco=document.getElementById('whatsapp-troco-valor').value;
      if(troco) obsFinal += ` | Troco para R$ ${parseFloat(troco).toFixed(2)}`;
    }
    obsFinal = obsFinal ? obsFinal + ' | Pedido WhatsApp (admin)' : 'Pedido WhatsApp (admin)';
    const pedidoRes=await authFetch('/api/pedidos', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      cliente_id: clienteId,
      itens: whatsappCarrinho,
      forma_pagamento: forma,
      observacoes: obsFinal,
      endereco_entrega: endereco,
      bairro_entrega: bairro,
      taxa_entrega: taxa
    })});
    if(!pedidoRes.ok){ const err=await pedidoRes.json(); throw new Error(err.error||'Erro ao criar pedido'); }
    const pedido=await pedidoRes.json();
    showToast(`Pedido #${pedido.id} criado! Cliente ${escapeHtml(nome)} cadastrado.`);
    fecharModalPedidoWhatsApp();
    carregarPedidos();
    carregarClientes();
  }catch(e){ showToast(e.message); }
  finally{ btn.disabled=false; btn.textContent='✅ Enviar Pedido para Cozinha'; }
}

// ===== SOM DE NOTIFICACAO =====

let audioDesbloqueado = false;
function desbloquearAudio() {
  if (audioDesbloqueado) return;
  document.querySelectorAll('audio[id^="som-"]').forEach(a => {
    a.muted = true; a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(()=>{});
  });
  audioDesbloqueado = true;
}
document.addEventListener('click', desbloquearAudio, { once: true });
document.addEventListener('keydown', desbloquearAudio, { once: true });
function tocarSomNovoPedido() {
  try {
    const prefs = JSON.parse(localStorage.getItem('somPrefs')) || {};
    if (prefs.ativo === false) return;
    if ((prefs.volume !== undefined ? prefs.volume : 100) === 0) return;
    const tipo = prefs.tipo || 'classic';
    const vol = (prefs.volume !== undefined ? prefs.volume : 100) / 100;
    const el = document.getElementById('som-' + tipo);
    if (el) {
      el.volume = vol; el.currentTime = 0;
      const p = el.play();
      if (p && p.catch) p.catch(() => {
        const fb = new Audio(`/sounds/${tipo}.wav`);
        fb.volume = vol; fb.play().catch(()=>{});
      });
      return;
    }
    const fb2 = new Audio(`/sounds/${tipo}.wav`);
    fb2.volume = vol; fb2.play().catch(()=>{});
  } catch (e) {}
}

function carregarSomPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem('somPrefs')) || {};
    document.getElementById('cfg-som-ativo').checked = prefs.ativo !== false;
    document.getElementById('cfg-som-tipo').value = prefs.tipo || 'classic';
    document.getElementById('cfg-som-volume').value = prefs.volume !== undefined ? prefs.volume : 100;
    document.getElementById('cfg-volume-label').textContent = (prefs.volume !== undefined ? prefs.volume : 100) + '%';
  } catch (e) {
    const ativo = document.getElementById('cfg-som-ativo');
    const volume = document.getElementById('cfg-som-volume');
    if (ativo) ativo.checked = true;
    if (volume) volume.value = 100;
  }
}

function salvarSomPrefs() {
  const prefs = {
    ativo: document.getElementById('cfg-som-ativo').checked,
    tipo: document.getElementById('cfg-som-tipo').value,
    volume: parseInt(document.getElementById('cfg-som-volume').value)
  };  localStorage.setItem('somPrefs', JSON.stringify(prefs));
}

function getSomPrefs() {
  try { return JSON.parse(localStorage.getItem('somPrefs')) || {}; }
  catch (e) { return {}; }
}

function testarSom() {
  const prefs = getSomPrefs();
  const tipo = document.getElementById('cfg-som-tipo').value;
  const volume = parseInt(document.getElementById('cfg-som-volume').value) / 100;
  const audio = document.getElementById('som-' + tipo);
  if (audio) {
    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
  document.getElementById('cfg-volume-label').textContent = Math.round(volume * 100) + '%';
}

function showToast(msg, type='info', icon='') {
  const existing = document.querySelectorAll('.toast-admin');
  // permitir até 3 toasts empilhados
  if (existing.length >= 3) existing[0].remove();
  const toast = document.createElement('div');
  const bgMap = { success: 'var(--color-success)', warning: 'var(--color-warning)', info: 'var(--color-primary)', error: 'var(--color-danger)' };
  const bg = bgMap[type] || bgMap.info;
  toast.className = 'toast-admin toast-'+type;
  toast.style.cssText = `position:fixed;top:20px;right:20px;background:${bg};color:white;padding:14px 18px;border-radius:12px;z-index:9999;animation:toastSlideIn 0.35s cubic-bezier(0.16,1,0.3,1);box-shadow:0 8px 24px rgba(0,0,0,0.18);display:flex;align-items:center;gap:10px;min-width:280px;max-width:420px;font-size:0.9rem;font-weight:600;line-height:1.3;`;
  toast.innerHTML = `${icon ? `<span style="font-size:1.3rem">${icon}</span>` : ''}<span style="flex:1">${escapeHtml(msg)}</span><button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1">×</button><div style="position:absolute;bottom:0;left:0;height:3px;background:rgba(255,255,255,0.5);border-radius:0 0 12px 12px;animation:toastProgress 3.5s linear forwards;right:0"></div>`;
  toast.style.position = 'fixed';
  // empilhar
  const offset = document.querySelectorAll('.toast-admin').length * 76;
  toast.style.top = (20 + offset) + 'px';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.animation='toastSlideOut 0.3s forwards'; setTimeout(()=>toast.remove(),300); }, 3500);
}

function atualizarBadgeNotificacao() {
  const el = document.getElementById('pedidos-count');
  if (!el) return;
  const novos = pedidosNovos.size;
  // base count de ativos (sem sufixo)
  const baseText = el.dataset.baseCount || el.textContent.split('•')[0].trim();
  el.dataset.baseCount = baseText;
  if (novos > 0) {
    el.textContent = `${baseText} • ${novos} NOVO${novos>1?'S':''}`;
    el.classList.add('badge-pulse');
    el.style.background = 'var(--color-danger)';
    el.style.color = 'white';
  } else {
    el.textContent = baseText;
    el.classList.remove('badge-pulse');
    el.style.background = '';
    el.style.color = '';
  }
  // notificação no título
  if (novos > 0) document.title = `(${novos}) Novo pedido! - ${document.title.replace(/^\(\d+\)\s*/, '')}`;
  else document.title = document.title.replace(/^\(\d+\)\s*.*-\s*/, '');
}

function marcarPedidoLido(id) {
  if (!pedidosNovos.has(id)) return;
  pedidosNovos.delete(id);
  const card = document.querySelector(`.pedido-card[data-pedido-id="${id}"]`);
  if (card) {
    card.classList.remove('pedido-card--novo');
    const badge = card.querySelector('.badge-novo');
    if (badge) badge.remove();
    // limpar também itens restantes
    card.querySelectorAll('.pedido-item-line--novo').forEach(el => {
      el.classList.remove('pedido-item-line--novo');
      const b = el.querySelector('.badge-item-novo');
      if (b) b.remove();
      el.style.cursor = '';
      el.removeAttribute('title');
      el.removeAttribute('onclick');
    });
    card.style.cursor = '';
    card.removeAttribute('title');
  }
  atualizarBadgeNotificacao();
  // remover dot pulsante
  if (pedidosNovos.size === 0) {
    document.title = document.title.replace(/^\(\d+\) Novo pedido! - /, '');
  }
}

function marcarItemLido(event, pedidoId, itemId) {
  event.stopPropagation();
  const card = document.querySelector(`.pedido-card[data-pedido-id="${pedidoId}"]`);
  if (!card) return;
  const target = event.currentTarget;
  target.classList.remove('pedido-item-line--novo');
  const badge = target.querySelector('.badge-item-novo');
  if (badge) badge.remove();
  target.style.cursor = '';
  target.removeAttribute('title');
  target.removeAttribute('onclick');
  // se não há mais itens novos neste pedido, limpar card também
  const restantes = card.querySelectorAll('.pedido-item-line--novo').length;
  if (restantes === 0) {
    // remover pedido do Set sem re-render completo para manter outros itens
    if (pedidosNovos.has(pedidoId)) {
      pedidosNovos.delete(pedidoId);
      card.classList.remove('pedido-card--novo');
      const badgeNovo = card.querySelector('.badge-novo');
      if (badgeNovo) badgeNovo.remove();
      card.style.cursor = '';
      card.removeAttribute('title');
      atualizarBadgeNotificacao();
      if (pedidosNovos.size === 0) {
        document.title = document.title.replace(/^\(\d+\) Novo pedido! - /, '');
      }
    }
  }
}

// MESAS
async function carregarMesasAdmin() {
  const res = await authFetch('/api/mesas');
  const mesas = await res.json();
  document.getElementById('mesas-list').innerHTML = `<table>
    <thead><tr><th>Nº</th><th>Nome</th><th>Capacidade</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${mesas.map(m => `
      <tr>
        <td>${m.numero}</td>
        <td>${escapeHtml(m.nome || '-')}</td>
        <td>${m.capacidade}</td>
        <td>
          <select class="form-control" onchange="atualizarStatusMesa(${m.id}, this.value)" style="width:auto;display:inline-block">
            <option value="livre" ${m.status === 'livre' ? 'selected' : ''}>Livre</option>
            <option value="ocupada" ${m.status === 'ocupada' ? 'selected' : ''}>Ocupada</option>
            <option value="reservada" ${m.status === 'reservada' ? 'selected' : ''}>Reservada</option>
          </select>
        </td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="editarMesaPrompt(${m.id}, ${m.numero}, '${escapeHtml((m.nome || '').replace(/'/g, "\\'"))}', ${m.capacidade})">Editar</button>
          <button class="btn btn-xs btn-danger" onclick="excluirMesa(${m.id})">Excluir</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table>`;
}

async function salvarMesa() {
  const numero = parseInt(document.getElementById('mesa-numero').value);
  const nome = document.getElementById('mesa-nome').value.trim();
  const capacidade = parseInt(document.getElementById('mesa-capacidade').value) || 4;
  if (!numero) { showToast('Informe o número da mesa'); return; }
  await authFetch('/api/mesas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero, nome, capacidade }) });
  document.getElementById('mesa-numero').value = '';
  document.getElementById('mesa-nome').value = '';
  document.getElementById('mesa-capacidade').value = '';
  carregarMesasAdmin();
}

function formatarHora(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

async function excluirMesa(id) {
  if (!confirm('Excluir esta mesa?')) return;
  await authFetch(`/api/mesas/${id}`, { method: 'DELETE' });
  carregarMesasAdmin();
  showToast('Mesa excluída!');
}

function editarMesaPrompt(id, numero, nome, capacidade) {
  const novoNumero = parseInt(prompt('Novo número:', numero)) || numero;
  const novoNome = prompt('Novo nome:', nome) || nome;
  const novaCap = parseInt(prompt('Nova capacidade:', capacidade)) || capacidade;
  authFetch(`/api/mesas/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero: novoNumero, nome: novoNome, capacidade: novaCap }) })
    .then(() => { carregarMesasAdmin(); showToast('Mesa atualizada!'); });
}

async function atualizarStatusMesa(id, status) {
  await authFetch(`/api/mesas/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  showToast('Status atualizado!');
}

// ===== USUÁRIOS =====
async function carregarUsuariosAdmin() {
  const res = await authFetch('/api/auth/usuarios');
  const usuarios = await res.json();
  document.getElementById('usuarios-list').innerHTML = `<table>
    <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Status</th><th>Trocar senha</th><th>Ações</th></tr></thead>
    <tbody>${usuarios.map(u => `
      <tr>
        <td>${escapeHtml(u.nome)}</td>
        <td>${escapeHtml(u.usuario)}</td>
        <td>${escapeHtml(u.perfil)}</td>
        <td>
          <label class="toggle-switch">
            <input type="checkbox" ${u.ativo ? 'checked' : ''} onchange="toggleUsuarioStatus(${u.id}, this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>${u.trocar_senha ? '<span style="color:var(--warning)">Sim</span>' : '<span style="color:var(--success)">Não</span>'}</td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="editarUsuario(${u.id}, '${escapeHtml(u.nome)}', '${escapeHtml(u.usuario)}', '${escapeHtml(u.perfil)}', ${u.ativo})">Editar</button>
          <button class="btn btn-xs btn-warning" onclick="redefinirSenhaUsuario(${u.id}, '${escapeHtml(u.usuario)}')">Redefinir senha (1234)</button>
          ${u.id !== usuarioLogado.id ? `<button class="btn btn-xs btn-danger" onclick="excluirUsuario(${u.id}, '${escapeHtml(u.usuario)}')">Desativar</button>
          <button class="btn btn-xs btn-danger" onclick="excluirUsuarioPermanente(${u.id}, '${escapeHtml(u.usuario)}')" title="Excluir definitivamente">Excluir</button>` : ''}
        </td>
      </tr>
    `).join('')}</tbody>
  </table>`;
}

function editarUsuario(id, nome, usuario, perfil, ativo) {
  document.getElementById('usr-id').value = id;
  document.getElementById('usr-edit-nome').value = nome;
  document.getElementById('usr-edit-usuario').value = usuario;
  document.getElementById('usr-edit-perfil').value = perfil;
  document.getElementById('usr-edit-ativo').checked = ativo;
  document.getElementById('form-usuario-title').textContent = 'Editar Usuário';
  document.getElementById('modal-usuario-admin').classList.add('active');
}

function fecharModalUsuario() {
  document.getElementById('modal-usuario-admin').classList.remove('active');
  document.getElementById('form-usuario').reset();
  document.getElementById('usr-id').value = '';
}

async function salvarEdicaoUsuario(e) {
  e.preventDefault();
  const id = document.getElementById('usr-id').value;
  if (!id) return;

  const nome = document.getElementById('usr-edit-nome').value.trim();
  const usuario = document.getElementById('usr-edit-usuario').value.trim();
  const perfil = document.getElementById('usr-edit-perfil').value;
  const ativo = document.getElementById('usr-edit-ativo').checked ? 1 : 0;

  if (!nome) { showToast('Informe o nome'); return; }
  if (!usuario) { showToast('Informe o usuário (login)'); return; }

  try {
    const res = await authFetch(`/api/auth/usuarios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, usuario, perfil, ativo })
    });
    if (!res.ok) { const err = await res.json(); showToast(err.error || 'Erro ao atualizar usuário'); return; }
    fecharModalUsuario();
    showToast('Usuário atualizado!');
    carregarUsuariosAdmin();
  } catch (e) { showToast('Erro ao atualizar usuário'); }
}

async function salvarUsuario() {
  const nome = document.getElementById('usr-nome').value.trim();
  const usuario = document.getElementById('usr-usuario').value.trim();
  const senha = document.getElementById('usr-senha').value;
  const perfil = document.getElementById('usr-perfil').value;

  if (!nome || !usuario) { showToast('Informe nome e usuário'); return; }
  if (!senha || senha.length < 8) { showToast('Defina uma senha com no mínimo 8 caracteres'); return; }

  try {
    const res = await authPost('/api/auth/usuarios', { nome, usuario, senha, perfil });
    if (!res.ok) { const err = await res.json(); showToast(err.error || err.detalhes?.[0] || 'Erro ao criar usuário'); return; }
    showToast(`Usuário ${escapeHtml(usuario)} criado!`);
    document.getElementById('usr-nome').value = '';
    document.getElementById('usr-usuario').value = '';
    document.getElementById('usr-senha').value = '';
    document.getElementById('usr-perfil').value = 'garcom';
    carregarUsuariosAdmin();
  } catch (e) { showToast('Erro ao criar usuário'); }
}

async function toggleUsuarioStatus(id, ativo) {
  try {
    await authFetch(`/api/auth/usuarios/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: ativo ? 1 : 0 }) });
    showToast(ativo ? 'Usuário ativado' : 'Usuário desativado');
    carregarUsuariosAdmin();
  } catch (e) { showToast('Erro ao alterar status'); }
}

async function redefinirSenhaUsuario(id, usuario) {
  if (!confirm(`Redefinir senha de ${usuario} para 1234? O usuário será obrigado a trocar no próximo login.`)) return;
  try {
    const res = await authPost(`/api/auth/usuarios/${id}/redefinir-senha`);
    if (!res.ok) { const err = await res.json(); showToast(err.error); return; }
    const data = await res.json();
    showToast(`Senha redefinida! Nova senha: ${data.senha_inicial}`);
    carregarUsuariosAdmin();
  } catch (e) { showToast('Erro ao redefinir senha'); }
}

async function excluirUsuario(id, usuario) {
  if (!confirm(`Desativar usuário ${usuario}? (Mantém histórico, não pode desativar a si mesmo)`)) return;
  try {
    const res = await authDelete(`/api/auth/usuarios/${id}`);
    if (!res.ok) { const err = await res.json(); showToast(err.error); return; }
    showToast('Usuário desativado');
    carregarUsuariosAdmin();
  } catch (e) { showToast('Erro ao desativar usuário'); }
}

async function excluirUsuarioPermanente(id, usuario) {
  if (!confirm(`EXCLUIR definitivamente o usuário ${usuario}? Esta ação não pode ser desfeita.`)) return;
  if (!confirm(`Confirma a exclusão permanente de ${usuario}? Ele perderá o acesso imediatamente.`)) return;
  try {
    const res = await authDelete(`/api/auth/usuarios/${id}/excluir`);
    if (!res.ok) { const err = await res.json(); showToast(err.error || 'Erro ao excluir'); return; }
    showToast('Usuário excluído permanentemente');
    carregarUsuariosAdmin();
  } catch (e) { showToast('Erro ao excluir usuário'); }
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'modal-usuario-admin') fecharModalUsuario();
});
