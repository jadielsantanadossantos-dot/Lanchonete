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
let carrinhoAvulso = [];
let categoriaFiltroAvulso = '';
let usuarioLogado = null;

document.addEventListener('DOMContentLoaded', () => init());

async function init() {
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
  } else if (ativa.id === 'g-page-avulso') {
    if (carrinhoAvulso.length && !confirm('Há itens no carrinho. Descartar e voltar?')) return;
    carrinhoAvulso = [];
    mostrarTela('g-page-mesas', 'Mesas');
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
        <div class="g-mesa-numero">${m.nome || ('Mesa ' + m.numero)}</div>
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

async function confirmarEnviarCozinha() {
  if (!mesaAtual) return;
  const itensNaoEnviados = comandaItens.filter(i => !i.enviado_cozinha);
  if (!itensNaoEnviados.length) {
    showToast('Todos os itens já foram enviados');
    return;
  }

  const nomes = itensNaoEnviados.map(i => `${i.quantidade}x ${i.produto_nome}`).join(', ');
  if (!confirm(`Enviar para a cozinha:\n${nomes}\n\nA comanda continuará aberta para adicionar mais itens.`)) return;

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
      return `+ ${a.nome} (R$ ${a.preco.toFixed(2)})`;
    }).join(', ');

    const badgeEnviado = item.enviado_cozinha 
      ? '<span class="g-badge-enviado">✓ Cozinha</span>' 
      : '';

    return `
      <div class="g-comanda-item">
        <div class="g-comanda-item-header">
          <div style="flex:1">
            <div class="g-item-name">${item.quantidade}x ${item.produto_nome} ${badgeEnviado}</div>
            ${adcText ? `<div class="g-item-details">${adcText}</div>` : ''}
            ${item.observacao ? `<div class="g-item-details">Obs: ${item.observacao}</div>` : ''}
          </div>
          <button class="g-item-remove" onclick="removerItemComanda(${item.id})">&times;</button>
        </div>
        <div class="g-item-price">R$ ${itemTotal.toFixed(2)}</div>
      </div>
    `;
  }).join('');

  document.getElementById('g-comanda-valor').textContent = `R$ ${comandaTotal.toFixed(2)}`;
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
      fetch('/api/produtos/ativos'),
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
  document.getElementById('g-categorias').innerHTML = renderCategoriasBtns('filtrarProduto', '');
  renderProdutos(produtos);
  mostrarTela('g-page-produtos', 'Adicionar Item');
}

function renderCategoriasBtns(fnName, ativa) {
  const cats = [...new Set(produtos.map(p => p.categoria_nome))];
  let html = `<button class="g-cat-btn ${ativa === '' ? 'active' : ''}" onclick="${fnName}('', this)">Todos</button>`;
  cats.forEach(c => {
    html += `<button class="g-cat-btn ${ativa === c ? 'active' : ''}" onclick="${fnName}('${c}', this)">${c}</button>`;
  });
  return html;
}

function filtrarProduto(cat, btn) {
  categoriaFiltro = cat;
  document.querySelectorAll('#g-categorias .g-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const filtrados = cat ? produtos.filter(p => p.categoria_nome === cat) : produtos;
  renderProdutos(filtrados);
}

function renderProdutos(lista) {
  const container = document.getElementById('g-produtos-lista');
  if (!lista.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--gray);padding:30px">Nenhum produto disponível</p>';
    return;
  }

  container.innerHTML = lista.map(p => `
    <div class="g-produto-card" onclick="abrirModalQuant(${p.id})">
      ${p.foto
        ? `<img class="g-produto-img" src="${p.foto}" alt="${p.nome}" loading="lazy">`
        : `<div class="g-produto-placeholder">&#127828;</div>`}
      <div class="g-produto-info">
        <div class="g-produto-text">
          <div class="g-produto-nome">${p.nome}</div>
          ${p.descricao ? `<div class="g-produto-desc">${p.descricao}</div>` : ''}
          <div class="g-produto-preco">R$ ${p.preco.toFixed(2)}</div>
        </div>
        <button class="g-produto-add-icon">+</button>
      </div>
    </div>
  `).join('');
}

async function abrirModalQuant(produtoId) {
  produtoSelecionado = produtos.find(p => p.id === produtoId);
  if (!produtoSelecionado) return;

  quantAtual = 1;
  adicionaisSelecionados = [];

  document.getElementById('g-quant-produto-nome').textContent = produtoSelecionado.nome;
  document.getElementById('g-quant-produto-preco').textContent = `R$ ${produtoSelecionado.preco.toFixed(2)}`;
  document.getElementById('g-quant-value').textContent = '1';
  document.getElementById('g-quant-obs').value = '';

  const adcSection = document.getElementById('g-quant-adicionais');
  const adcList = document.getElementById('g-quant-adicionais-list');

  if (produtoSelecionado.adicionais && produtoSelecionado.adicionais.length) {
    adcSection.style.display = 'block';
    adcList.innerHTML = produtoSelecionado.adicionais.map(a => `
      <div class="g-adicional-item">
        <label>
          <input type="checkbox" value="${a.id}" data-nome="${a.nome}" data-preco="${a.preco}" onchange="atualizarTotalQuant()">
          ${a.nome}
        </label>
        <span class="g-adicional-price">+ R$ ${a.preco.toFixed(2)}</span>
      </div>
    `).join('');
  } else {
    adcSection.style.display = 'none';
  }

  atualizarTotalQuant();
  document.getElementById('g-modal-quant').classList.add('active');
}

function fecharModalQuant() {
  document.getElementById('g-modal-quant').classList.remove('active');
}

function alterarQuant(delta) {
  quantAtual = Math.max(1, quantAtual + delta);
  document.getElementById('g-quant-value').textContent = quantAtual;
  atualizarTotalQuant();
}

function atualizarTotalQuant() {
  let total = produtoSelecionado.preco * quantAtual;
  document.querySelectorAll('#g-quant-adicionais-list input:checked').forEach(c => {
    total += parseFloat(c.dataset.preco) * quantAtual;
  });
  document.getElementById('g-quant-total').textContent = `R$ ${total.toFixed(2)}`;
}

async function confirmarAdicionarItem() {
  if (!mesaAtual || !produtoSelecionado) return;

  const adicionais = [];
  document.querySelectorAll('#g-quant-adicionais-list input:checked').forEach(c => {
    adicionais.push({ id: parseInt(c.value), nome: c.dataset.nome, preco: parseFloat(c.dataset.preco) });
  });

  const observacao = document.getElementById('g-quant-obs').value.trim();

  try {
    const res = await authFetch(`/api/comandas/mesa/${mesaAtual.id}/item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        produto_id: produtoSelecionado.id,
        quantidade: quantAtual,
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
    showToast(`${quantAtual}x ${produtoSelecionado.nome} adicionado!`);
    await carregarComanda();
    mostrarTela('g-page-comanda', mesaAtual.nome || ('Mesa ' + mesaAtual.numero));
  } catch (e) { showToast('Erro ao adicionar item'); }
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

async function confirmarFechamento() {
  if (!mesaAtual || !comandaItens.length) return;

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
}

// ============= LIBERAR MESA (GARÇOM) =============
async function confirmarLiberarMesa() {
  if (!mesaAtual) return;

  const temItensNaoEnviados = comandaItens.some(i => !i.enviado_cozinha);

  let msg = 'Liberar esta mesa?';
  if (temItensNaoEnviados) {
    msg = `Ha ${comandaItens.length} item(ns) nao enviado(s) para a cozinha.\nEles serao REMOVIDOS permanentemente.\n\n${msg}`;
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

// ============= PEDIDO AVULSO =============
function abrirPedidoAvulso() {
  categoriaFiltroAvulso = '';
  carrinhoAvulso = [];
  document.getElementById('g-avulso-nome').value = '';
  document.getElementById('g-avulso-telefone').value = '';
  document.getElementById('g-categorias-avulso').innerHTML = renderCategoriasBtns('filtrarAvulso', '');
  renderProdutosAvulso(produtos);
  renderCarrinhoAvulso();
  mostrarTela('g-page-avulso', 'Pedido Avulso');
}

function filtrarAvulso(cat, btn) {
  categoriaFiltroAvulso = cat;
  document.querySelectorAll('#g-categorias-avulso .g-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const filtrados = cat ? produtos.filter(p => p.categoria_nome === cat) : produtos;
  renderProdutosAvulso(filtrados);
}

function renderProdutosAvulso(lista) {
  const container = document.getElementById('g-produtos-avulso');
  if (!lista.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--gray);padding:30px">Nenhum produto</p>';
    return;
  }

  container.innerHTML = lista.map(p => `
    <div class="g-produto-card" onclick="adicionarAvulso(${p.id})">
      ${p.foto
        ? `<img class="g-produto-img" src="${p.foto}" alt="${p.nome}" loading="lazy">`
        : `<div class="g-produto-placeholder">&#127828;</div>`}
      <div class="g-produto-info">
        <div class="g-produto-text">
          <div class="g-produto-nome">${p.nome}</div>
          ${p.descricao ? `<div class="g-produto-desc">${p.descricao}</div>` : ''}
          <div class="g-produto-preco">R$ ${p.preco.toFixed(2)}</div>
        </div>
        <button class="g-produto-add-icon">+</button>
      </div>
    </div>
  `).join('');
}

function adicionarAvulso(produtoId) {
  const p = produtos.find(x => x.id === produtoId);
  if (!p) return;

  const noCarrinho = carrinhoAvulso.find(it => it.produto_id === produtoId);
  if (noCarrinho) {
    noCarrinho.quantidade++;
  } else {
    carrinhoAvulso.push({
      produto_id: p.id,
      produto_nome: p.nome,
      preco_unitario: p.preco,
      quantidade: 1,
      observacao: '',
      adicionais: []
    });
  }
  renderCarrinhoAvulso();
  showToast(`${p.nome} adicionado!`);
}

function alterarQtdAvulso(idx, delta) {
  const item = carrinhoAvulso[idx];
  if (!item) return;
  item.quantidade += delta;
  if (item.quantidade < 1) {
    carrinhoAvulso.splice(idx, 1);
  }
  renderCarrinhoAvulso();
}

function removerAvulso(idx) {
  carrinhoAvulso.splice(idx, 1);
  renderCarrinhoAvulso();
}

function renderCarrinhoAvulso() {
  const container = document.getElementById('g-avulso-carrinho');
  const empty = document.getElementById('g-avulso-empty');
  const totalBox = document.getElementById('g-avulso-total');
  const btnEnviar = document.getElementById('g-btn-enviar-avulso');

  if (!carrinhoAvulso.length) {
    container.innerHTML = '';
    empty.style.display = 'block';
    totalBox.style.display = 'none';
    btnEnviar.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  totalBox.style.display = 'block';
  btnEnviar.style.display = 'block';

  let total = 0;
  container.innerHTML = carrinhoAvulso.map((item, i) => {
    const itemTotal = item.preco_unitario * item.quantidade;
    total += itemTotal;
    return `
      <div class="g-carrinho-item">
        <div class="g-carrinho-item-info">
          <div class="g-carrinho-item-nome">${item.produto_nome}</div>
          <div class="g-carrinho-item-detail">R$ ${item.preco_unitario.toFixed(2)} cada</div>
          <div class="g-qty-control" style="justify-content:flex-start;margin-top:6px">
            <button class="g-qty-btn" style="width:32px;height:32px;font-size:1.1rem" onclick="alterarQtdAvulso(${i}, -1)">-</button>
            <span style="font-weight:700;min-width:30px;text-align:center">${item.quantidade}</span>
            <button class="g-qty-btn" style="width:32px;height:32px;font-size:1.1rem" onclick="alterarQtdAvulso(${i}, 1)">+</button>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;color:var(--primary)">R$ ${itemTotal.toFixed(2)}</div>
          <button class="g-carrinho-item-remove" onclick="removerAvulso(${i})">&times;</button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('g-avulso-valor').textContent = `R$ ${total.toFixed(2)}`;
}

async function enviarPedidoAvulso() {
  if (!carrinhoAvulso.length) { showToast('Carrinho vazio'); return; }

  const telefoneRaw = document.getElementById('g-avulso-telefone').value.trim();
  const telefone = telefoneRaw.replace(/\D/g, '');
  if (!telefone || telefone.length < 10) {
    showToast('Informe um telefone válido');
    return;
  }

  const nomeAvulso = document.getElementById('g-avulso-nome').value.trim();
  const forma = document.getElementById('g-avulso-forma').value;

  let clienteId;
  try {
    const cliRes = await authFetch(`/api/clientes/telefone/${encodeURIComponent(telefoneRaw)}`);
    if (cliRes.ok) {
      const cli = await cliRes.json();
      clienteId = cli.id;
    } else {
      const nomeParaCadastrar = nomeAvulso || 'Avulso ' + telefoneRaw;
      const novoRes = await authFetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeParaCadastrar, telefone: telefoneRaw, bairro: 'Avulso' })
      });
      if (!novoRes.ok) { showToast('Erro ao cadastrar cliente'); return; }
      const novo = await novoRes.json();
      clienteId = novo.id;
    }

    const pedidoRes = await authFetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: clienteId,
        itens: carrinhoAvulso,
        forma_pagamento: forma,
        observacoes: 'PEDIDO AVULSO (sem mesa)',
        endereco_entrega: '',
        bairro_entrega: 'Avulso',
        taxa_entrega: 0,
        mesa_id: null
      })
    });

    if (!pedidoRes.ok) { showToast('Erro ao enviar pedido'); return; }

    carrinhoAvulso = [];
    document.getElementById('g-avulso-telefone').value = '';
    showToast('Pedido avulso enviado!');
    mostrarTela('g-page-mesas', 'Mesas');
  } catch (e) { showToast('Erro ao enviar pedido'); }
}

// ============= TOAST =============
function showToast(msg) {
  const existing = document.querySelector('.g-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'g-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// Fechar modais ao tocar fora
document.addEventListener('click', (e) => {
  if (e.target.id === 'g-modal-quant') fecharModalQuant();
  if (e.target.id === 'g-modal-fechar') fecharModalFechar();
});
