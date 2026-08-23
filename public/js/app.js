let produtos = [];
let categorias = [];
let bairros = [];
let carrinho = [];
let produtoAtual = null;
let modalQtd = 1;
let formaPagamento = 'pix';
let taxaEntregaAtual = 0;
let ultimoPedidoId = null;
let config = {};
let clienteLogado = null;
let lojaAberta = true;

// Supabase Realtime config (unused in local version)
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await Promise.all([carregarConfig(), carregarProdutos(), carregarBairros()]);
  carregarCarrinhoLocal();
  atualizarCartFab();
  carregarClienteLocal();

// Inicializar Socket.io Realtime local
    if (window.Realtime && window.Realtime.init) {
      window.Realtime.init();
    
    // Escutar confirmação de Pix quando estiver na página de pix
    let pixUnsubscribe = null;
    
    // Observar quando entra na página de pix para começar a escutar
    const originalMostrarPagina = window.mostrarPagina;
    window.mostrarPagina = function(pageId) {
      // Cleanup anterior
      if (pixUnsubscribe) {
        pixUnsubscribe();
        pixUnsubscribe = null;
      }
      
      originalMostrarPagina(pageId);
      
      // Se entrou na página de pix e tem ultimoPedidoId, começar a escutar
      if (pageId === 'page-pix' && ultimoPedidoId) {
        pixUnsubscribe = window.Realtime.subscribePixConfirmado(ultimoPedidoId, (pedido) => {
          mostrarToast('Pagamento Pix confirmado!');
          if (Notification.permission === 'granted') {
            new Notification('Pagamento confirmado!', { body: `Seu pedido #${pedido.id} foi confirmado.` });
          }
          document.getElementById('success-msg').textContent = `Seu pedido #${pedido.id} foi recebido com sucesso!`;
          mostrarPagina('page-sucesso');
        });
      }
    };
  }

  // Solicitar permissão para notificações
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Restaurar página do hash URL
  const hash = window.location.hash.replace('#', '');
  const paginasTransitorias = ['page-pix', 'page-sucesso', 'page-pagamento', 'page-editar-cadastro'];
  if (hash && document.getElementById(hash) && !paginasTransitorias.includes(hash)) {
    mostrarPagina(hash);
  }

  // Navegação por botão voltar/avançar do navegador
  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '');
    if (h && document.getElementById(h) && !paginasTransitorias.includes(h)) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(h).classList.add('active');
      window.scrollTo(0, 0);
      if (h === 'page-carrinho') renderCarrinho();
      if (h === 'page-cardapio') {
        document.getElementById('cart-fab').style.display = carrinho.length ? 'flex' : 'none';
      }
    } else if (!h) {
      mostrarPagina('page-cardapio');
    }
  });
}

async function carregarConfig() {
  try {
    const res = await fetch('/api/config');
    config = await res.json();
    if (config.loja_nome) {
      document.getElementById('loja-nome').textContent = config.loja_nome;
      document.title = config.loja_nome;
    }
    atualizarStatusLoja(config.loja_aberta !== 'false');
  } catch (e) {}
}

async function verificarLojaAberta() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    const aberta = cfg.loja_aberta !== 'false';
    atualizarStatusLoja(aberta);
    return aberta;
  } catch (e) { return true; }
}

function atualizarStatusLoja(aberta) {
  lojaAberta = aberta;
  const banner = document.getElementById('loja-fechada-banner');
  if (banner) banner.style.display = aberta ? 'none' : 'block';
}

async function carregarProdutos() {
  try {
    const res = await fetch('/api/produtos/ativos');
    produtos = await res.json();
    const cats = [...new Set(produtos.map(p => p.categoria_nome))];
    renderCategorias(cats);
    renderProdutos(produtos);
  } catch (e) {
    document.getElementById('products-grid').innerHTML = '<div class="empty-state"><p>Erro ao carregar cardápio</p></div>';
  }
}

async function carregarBairros() {
  try {
    const res = await fetch('/api/bairros/atendidos');
    bairros = await res.json();
    const select = document.getElementById('cli-bairro');
    select.innerHTML = '<option value="">Selecione o bairro</option>';
    bairros.forEach(b => {
      select.innerHTML += `<option value="${b.id}" data-taxa="${b.taxa_entrega}">${b.nome} - R$ ${b.taxa_entrega.toFixed(2)}</option>`;
    });
  } catch (e) {}
}

function renderCategorias(cats) {
  const container = document.getElementById('categories');
  container.innerHTML = `<button class="cat-btn active" onclick="filtrarCategoria('', this)">Todos</button>`;
  cats.forEach(c => {
    container.innerHTML += `<button class="cat-btn" onclick="filtrarCategoria('${c}', this)">${c}</button>`;
  });
}

function filtrarCategoria(cat, btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtrados = cat ? produtos.filter(p => p.categoria_nome === cat) : produtos;
  renderProdutos(filtrados);
}

function renderProdutos(lista) {
  const grid = document.getElementById('products-grid');
  if (!lista.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#127828;</div><p>Nenhum produto disponível</p></div>';
    return;
  }
  grid.innerHTML = lista.map(p => `
    <div class="product-card" onclick="abrirProduto(${p.id})">
      ${p.foto
        ? `<img class="product-img" src="${p.foto}" alt="${p.nome}" loading="lazy">`
        : `<div class="product-img-placeholder">&#127828;</div>`}
      <div class="product-info">
        <div>
          <div class="product-name">${p.nome}</div>
          <div class="product-desc">${p.descricao || ''}</div>
        </div>
        <div class="product-bottom">
          <span class="product-price">R$ ${p.preco.toFixed(2)}</span>
          <button class="btn-add" onclick="event.stopPropagation(); abrirProduto(${p.id})">+</button>
        </div>
      </div>
    </div>
  `).join('');
}

function abrirProduto(id) {
  produtoAtual = produtos.find(p => p.id === id);
  if (!produtoAtual) return;

  modalQtd = 1;
  document.getElementById('modal-nome').textContent = produtoAtual.nome;
  document.getElementById('modal-desc').textContent = produtoAtual.descricao || '';
  document.getElementById('modal-preco').textContent = `R$ ${produtoAtual.preco.toFixed(2)}`;
  document.getElementById('modal-qty').textContent = '1';
  document.getElementById('modal-obs').value = '';

  const img = document.getElementById('modal-img');
  if (produtoAtual.foto) { img.src = produtoAtual.foto; img.style.display = 'block'; }
  else { img.style.display = 'none'; }

  const adcSection = document.getElementById('modal-adicionais');
  const adcList = document.getElementById('adicionais-list');
  if (produtoAtual.adicionais && produtoAtual.adicionais.length) {
    adcSection.style.display = 'block';
    adcList.innerHTML = produtoAtual.adicionais.map(a => `
      <div class="adicional-item">
        <label>
          <input type="checkbox" value="${a.id}" data-nome="${a.nome}" data-preco="${a.preco}">
          ${a.nome}
        </label>
        <span class="adicional-price">+ R$ ${a.preco.toFixed(2)}</span>
      </div>
    `).join('');
  } else {
    adcSection.style.display = 'none';
  }

  atualizarBtnAdd();
  document.getElementById('modal-produto').classList.add('active');
}

function fecharModal() {
  document.getElementById('modal-produto').classList.remove('active');
}

function alterarQtd(delta) {
  modalQtd = Math.max(1, modalQtd + delta);
  document.getElementById('modal-qty').textContent = modalQtd;
  atualizarBtnAdd();
}

function atualizarBtnAdd() {
  let total = produtoAtual.preco * modalQtd;
  const checks = document.querySelectorAll('#adicionais-list input:checked');
  checks.forEach(c => { total += parseFloat(c.dataset.preco) * modalQtd; });
  document.getElementById('btn-add-cart').textContent = `Adicionar - R$ ${total.toFixed(2)}`;
}

document.addEventListener('change', (e) => {
  if (e.target.closest('#adicionais-list')) atualizarBtnAdd();
});

function adicionarAoCarrinho() {
  const adicionais = [];
  document.querySelectorAll('#adicionais-list input:checked').forEach(c => {
    adicionais.push({ id: parseInt(c.value), nome: c.dataset.nome, preco: parseFloat(c.dataset.preco) });
  });

  carrinho.push({
    produto_id: produtoAtual.id,
    produto_nome: produtoAtual.nome,
    preco_unitario: produtoAtual.preco,
    quantidade: modalQtd,
    observacao: document.getElementById('modal-obs').value,
    adicionais
  });

  salvarCarrinhoLocal();
  atualizarCartFab();
  fecharModal();
  mostrarToast('Item adicionado ao carrinho!');
}

function atualizarCartFab() {
  const fab = document.getElementById('cart-fab');
  const badge = document.getElementById('cart-badge');
  const total = carrinho.reduce((s, i) => s + i.quantidade, 0);
  if (total > 0) { fab.style.display = 'flex'; badge.textContent = total; }
  else { fab.style.display = 'none'; }
}

function renderCarrinho() {
  const container = document.getElementById('cart-items');
  const empty = document.getElementById('cart-empty');
  const summary = document.getElementById('cart-summary');
  const btnCheckout = document.getElementById('btn-checkout');

  if (!carrinho.length) {
    container.innerHTML = '';
    empty.style.display = 'block';
    summary.style.display = 'none';
    btnCheckout.style.display = 'none';
    return;
  }

  // Se o cliente logado tem bairro e nenhum bairro foi escolhido
  // manualmente ainda, usa a taxa do cadastro como padrao
  const selectBairro = document.getElementById('cli-bairro');
  if (!selectBairro.value && clienteLogado && clienteLogado.bairro) {
    const b = bairros.find(x => x.nome === clienteLogado.bairro);
    if (b) taxaEntregaAtual = parseFloat(b.taxa_entrega) || 0;
  }

  empty.style.display = 'none';
  summary.style.display = 'block';
  btnCheckout.style.display = 'block';

  container.innerHTML = carrinho.map((item, i) => {
    let itemTotal = item.preco_unitario * item.quantidade;
    const adcTexto = item.adicionais.map(a => {
      itemTotal += a.preco * item.quantidade;
      return `+ ${a.nome} (R$ ${a.preco.toFixed(2)})`;
    }).join(', ');

    return `
      <div class="cart-item">
        <div class="cart-item-header">
          <div>
            <div class="cart-item-name">${item.quantidade}x ${item.produto_nome}</div>
            ${adcTexto ? `<div class="cart-item-details">${adcTexto}</div>` : ''}
            ${item.observacao ? `<div class="cart-item-details">Obs: ${item.observacao}</div>` : ''}
          </div>
          <button class="cart-item-remove" onclick="removerItem(${i})">&times;</button>
        </div>
        <div class="cart-item-price">R$ ${itemTotal.toFixed(2)}</div>
      </div>
    `;
  }).join('');

  atualizarTotais();
}

function removerItem(i) {
  carrinho.splice(i, 1);
  salvarCarrinhoLocal();
  atualizarCartFab();
  renderCarrinho();
}

function atualizarTotais() {
  let subtotal = 0;
  carrinho.forEach(item => {
    subtotal += item.preco_unitario * item.quantidade;
    item.adicionais.forEach(a => { subtotal += a.preco * item.quantidade; });
  });

  document.getElementById('cart-subtotal').textContent = `R$ ${subtotal.toFixed(2)}`;
  document.getElementById('cart-taxa').textContent = `R$ ${taxaEntregaAtual.toFixed(2)}`;
  document.getElementById('cart-total').textContent = `R$ ${(subtotal + taxaEntregaAtual).toFixed(2)}`;
  const paySub = document.getElementById('pay-subtotal');
  if (paySub) {
    paySub.textContent = `R$ ${subtotal.toFixed(2)}`;
    document.getElementById('pay-taxa').textContent = `R$ ${taxaEntregaAtual.toFixed(2)}`;
  }
  document.getElementById('pay-total').textContent = `R$ ${(subtotal + taxaEntregaAtual).toFixed(2)}`;
}

function renderResumoPagamento() {
  const container = document.getElementById('pagamento-itens');
  if (!container) return;

  container.innerHTML = carrinho.map(item => {
    let itemTotal = item.preco_unitario * item.quantidade;
    const adcTexto = item.adicionais.map(a => {
      itemTotal += a.preco * item.quantidade;
      return `<div class="pedido-item-adicional" style="padding-left:12px">+ ${a.nome} (R$ ${a.preco.toFixed(2)})</div>`;
    }).join('');

    return `
      <div class="cart-item">
        <div class="cart-item-header">
          <div class="cart-item-name">${item.quantidade}x ${item.produto_nome}</div>
          <div class="cart-item-price">R$ ${itemTotal.toFixed(2)}</div>
        </div>
        ${adcTexto ? `<div>${adcTexto}</div>` : ''}
        ${item.observacao ? `<div class="cart-item-details">Obs: ${item.observacao}</div>` : ''}
      </div>
    `;
  }).join('');
}

function atualizarTaxaBairro() {
  const select = document.getElementById('cli-bairro');
  const option = select.options[select.selectedIndex];
  taxaEntregaAtual = option && option.dataset.taxa ? parseFloat(option.dataset.taxa) : 0;
  atualizarTotais();
}

function mostrarPagina(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  window.scrollTo(0, 0);

  // Atualizar hash URL (exceto páginas transitórias)
  const paginasTransitorias = ['page-pix', 'page-sucesso', 'page-pagamento', 'page-editar-cadastro'];
  if (!paginasTransitorias.includes(pageId)) {
    if (window.location.hash !== '#' + pageId) {
      history.replaceState(null, '', '#' + pageId);
    }
  }

  if (pageId === 'page-carrinho') { renderCarrinho(); verificarLojaAberta(); }
  if (pageId === 'page-dados') preencherDadosClientePaginaDados();
  if (pageId === 'page-cadastro') {
    if (clienteLogado) mostrarTelaLogado();
    preencherSelectBairrosCadastro();
  }
  if (pageId === 'page-editar-cadastro') preencherEdicaoCliente();
  if (pageId === 'page-acompanhar') {
    if (clienteLogado && clienteLogado.telefone) {
      document.getElementById('acomp-telefone').value = clienteLogado.telefone;
      buscarPedidos();
    }
  }
  if (pageId === 'page-cardapio') {
    document.getElementById('cart-fab').style.display = carrinho.length ? 'flex' : 'none';
  } else {
    document.getElementById('cart-fab').style.display = 'none';
  }
}

function selecionarPagamento(el, tipo) {
  document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  formaPagamento = tipo;
  document.getElementById('troco-section').style.display = tipo === 'dinheiro' ? 'block' : 'none';
}

function irParaPagamento() {
  const nome = document.getElementById('cli-nome').value.trim();
  const telefone = document.getElementById('cli-telefone').value.trim();
  const bairro = document.getElementById('cli-bairro').value;

  if (!lojaAberta) { mostrarToast('A loja está fechada e não está aceitando pedidos'); return; }
  if (!nome || !telefone) { mostrarToast('Preencha nome e telefone!'); return; }
  if (!bairro) { mostrarToast('Selecione o bairro!'); return; }

  renderResumoPagamento();
  atualizarTotais();
  mostrarPagina('page-pagamento');
}

async function finalizarPedido() {
  if (!(await verificarLojaAberta())) {
    mostrarToast('A loja está fechada e não está aceitando pedidos');
    mostrarPagina('page-cardapio');
    return;
  }
  const nome = document.getElementById('cli-nome').value.trim();
  const telefone = document.getElementById('cli-telefone').value.trim();
  const bairroId = document.getElementById('cli-bairro').value;
  const bairroSelect = document.getElementById('cli-bairro');
  const bairroNome = bairroSelect.options[bairroSelect.selectedIndex].text.split(' - ')[0];

  const rua = document.getElementById('cli-rua').value.trim();
  const numero = document.getElementById('cli-numero').value.trim();
  const complemento = document.getElementById('cli-complemento').value.trim();
  const referencia = document.getElementById('cli-referencia').value.trim();
  const obs = document.getElementById('pedido-obs').value.trim();

  let enderecoCompleto = '';
  if (rua) enderecoCompleto += rua;
  if (numero) enderecoCompleto += `, ${numero}`;
  if (complemento) enderecoCompleto += ` - ${complemento}`;
  if (referencia) enderecoCompleto += ` (Ref: ${referencia})`;

  try {
    const clienteRes = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, telefone, rua, numero, bairro: bairroNome, complemento, ponto_referencia: referencia })
    });
    const cliente = await clienteRes.json();

    let observacoes = obs;
    if (formaPagamento === 'dinheiro') {
      const troco = document.getElementById('troco-valor').value;
      if (troco) observacoes += ` | Troco para R$ ${parseFloat(troco).toFixed(2)}`;
    }

    const pedidoRes = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: cliente.id,
        itens: carrinho,
        forma_pagamento: formaPagamento,
        observacoes,
        endereco_entrega: enderecoCompleto,
        bairro_entrega: bairroNome,
        taxa_entrega: taxaEntregaAtual
      })
    });
    const pedido = await pedidoRes.json();
    ultimoPedidoId = pedido.id;

    carrinho = [];
    salvarCarrinhoLocal();
    atualizarCartFab();

    if (formaPagamento === 'pix') {
      await gerarPixQR(pedido.total);
      mostrarPagina('page-pix');
    } else {
      document.getElementById('success-msg').textContent = `Seu pedido #${pedido.id} foi recebido com sucesso!`;
      mostrarPagina('page-sucesso');
    }
  } catch (e) {
    mostrarToast('Erro ao finalizar pedido. Tente novamente.');
  }
}

async function gerarPixQR(valor) {
  try {
    const res = await fetch(`/api/config/pix/qrcode?valor=${valor}`);
    const data = await res.json();
    if (data.qrcode) {
      document.getElementById('pix-qr').innerHTML = `<img src="${data.qrcode}" alt="QR Code Pix">`;
      document.getElementById('pix-key').textContent = data.chave;
    } else {
      document.getElementById('pix-qr').innerHTML = '<p>Chave Pix não configurada</p>';
      document.getElementById('pix-key').textContent = 'Configure a chave Pix no painel admin';
    }
  } catch (e) {
    document.getElementById('pix-qr').innerHTML = '<p>Erro ao gerar QR Code</p>';
  }
}

function copiarPix() {
  const chave = document.getElementById('pix-key').textContent;
  navigator.clipboard.writeText(chave).then(() => mostrarToast('Chave Pix copiada!')).catch(() => {});
}

function novoPedido() {
  mostrarPagina('page-cardapio');
}

function acompanharPedido() {
  const tel = document.getElementById('cli-telefone').value.trim();
  if (tel) document.getElementById('acomp-telefone').value = tel;
  mostrarPagina('page-acompanhar');
  if (tel) buscarPedidos();
}

let meusPedidosCache = [];

async function buscarPedidos() {
  const telefone = document.getElementById('acomp-telefone').value.trim();
  if (!telefone) { mostrarToast('Informe seu telefone'); return; }

  try {
    const pedRes = await fetch(`/api/clientes/telefone/${encodeURIComponent(telefone)}/pedidos`);
    if (!pedRes.ok) throw new Error('erro');
    const pedidos = await pedRes.json();
    meusPedidosCache = pedidos;

    if (!pedidos.length) {
      document.getElementById('meus-pedidos').innerHTML = '<div class="empty-state"><p>Nenhum pedido encontrado</p></div>';
      return;
    }

    const statusLabels = { recebido: 'Recebido', em_preparo: 'Em preparo', saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado' };
    const payLabels = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão (na entrega)' };

    document.getElementById('meus-pedidos').innerHTML = pedidos.map(p => `
      <details class="pedido-detail" style="margin-bottom:12px">
        <summary class="cart-item" style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <div class="cart-item-name">Pedido #${p.id}</div>
            <div class="cart-item-details">${new Date(p.criado_em).toLocaleString('pt-BR')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span class="status-badge status-${p.status}">${statusLabels[p.status] || p.status}</span>
            <div class="cart-item-price">R$ ${p.total.toFixed(2)}</div>
          </div>
        </summary>
        <div class="pedido-detail-content" id="pedido-detail-${p.id}" style="padding-top:12px;border-top:1px solid var(--light);margin-top:8px">
          <div class="carregando" style="text-align:center;padding:16px;color:var(--gray)">Carregando detalhes...</div>
        </div>
      </details>
    `).join('');

    // Carregar detalhes quando expandir
    document.querySelectorAll('.pedido-detail').forEach(detail => {
      detail.addEventListener('toggle', async function() {
        if (this.open) {
          const pedidoId = this.querySelector('[id^="pedido-detail-"]').id.replace('pedido-detail-', '');
          await carregarDetalhesPedido(pedidoId);
        }
      });
    });

  } catch (e) {
    mostrarToast('Erro ao buscar pedidos');
  }
}

async function carregarDetalhesPedido(pedidoId) {
  const container = document.getElementById(`pedido-detail-${pedidoId}`);
  if (!container) return;

  try {
    const p = meusPedidosCache.find(x => String(x.id) === String(pedidoId));
    if (!p) throw new Error('Pedido não encontrado');

    const statusLabels = { recebido: 'Recebido', em_preparo: 'Em preparo', saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado' };
    const payLabels = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão (na entrega)' };

    const itensHtml = p.itens.map(item => {
      let line = `<div class="pedido-item-line">${item.quantidade}x ${item.produto_nome} - R$ ${(item.preco_unitario * item.quantidade).toFixed(2)}</div>`;
      if (item.adicionais && item.adicionais.length) {
        line += item.adicionais.map(a => `<div class="pedido-item-adicional">+ ${a.adicional_nome} (R$ ${a.preco.toFixed(2)})</div>`).join('');
      }
      if (item.observacao) line += `<div class="pedido-item-adicional">Obs: ${item.observacao}</div>`;
      return line;
    }).join('');

    let trocoHtml = '';
    if (p.forma_pagamento === 'dinheiro') {
      const match = p.observacoes?.match(/Troco para R\$ ([\d.,]+)/);
      if (match) {
        const valorRecebido = parseFloat(match[1].replace(',', '.'));
        const troco = valorRecebido - p.total;
        trocoHtml = `
          <div class="pedido-detalhe-row"><span>Recebido:</span><span>R$ ${valorRecebido.toFixed(2)}</span></div>
          <div class="pedido-detalhe-row"><span>Troco:</span><span style="color:var(--warning);font-weight:700">R$ ${troco.toFixed(2)}</span></div>
        `;
      } else {
        trocoHtml = `<div class="pedido-detalhe-row"><span>Troco:</span><span style="color:var(--gray);font-style:italic">Não informado</span></div>`;
      }
    }

    container.innerHTML = `
      <div class="pedido-detalhe-section">
        <h4 style="margin-bottom:8px;font-size:0.9rem;color:var(--dark)">Itens</h4>
        <div class="pedido-items" style="background:var(--bg);border-radius:8px;padding:12px;font-size:0.85rem">
          ${itensHtml}
        </div>
      </div>
      <div class="pedido-detalhe-section" style="margin-top:12px">
        <div class="pedido-detalhe-row" style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.85rem">
          <span>Forma de pagamento:</span><span>${payLabels[p.forma_pagamento] || p.forma_pagamento}</span>
        </div>
        ${p.endereco_entrega ? `<div class="pedido-detalhe-row" style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.85rem"><span>Endereço:</span><span>${p.endereco_entrega} - ${p.bairro_entrega}</span></div>` : ''}
        ${trocoHtml}
        ${p.observacoes && !p.observacoes.includes('Troco para') ? `<div class="pedido-detalhe-row" style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.85rem"><span>Observações:</span><span>${p.observacoes.replace(' | Troco para R$', '').replace(/Troco para R\$ [\d.,]+/,'').trim()}</span></div>` : ''}
        <div class="pedido-detalhe-row" style="display:flex;justify-content:space-between;padding:8px 0;font-size:0.95rem;font-weight:700;border-top:1px solid var(--light);margin-top:8px">
          <span>Total</span><span style="color:var(--primary)">R$ ${p.total.toFixed(2)}</span>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="refazerPedido(${p.id})">Refazer pedido</button>
        <button class="btn btn-outline btn-sm" onclick="fecharDetalhe('pedido-detail-${p.id}')">Fechar</button>
      </div>
    `;
  } catch (e) {
    container.innerHTML = '<div class="empty-state" style="padding:16px"><p>Erro ao carregar detalhes</p></div>';
  }
}

function fecharDetalhe(detailId) {
  const detail = document.getElementById(detailId)?.closest('details');
  if (detail) detail.open = false;
}

async function refazerPedido(pedidoId) {
  try {
    const p = meusPedidosCache.find(x => String(x.id) === String(pedidoId));
    if (!p || !p.itens) throw new Error('Pedido não encontrado');

    carrinho = p.itens.map(item => ({
      produto_id: item.produto_id,
      produto_nome: item.produto_nome,
      preco_unitario: item.preco_unitario,
      quantidade: item.quantidade,
      observacao: item.observacao || '',
      adicionais: (item.adicionais || []).map(a => ({ nome: a.adicional_nome, preco: a.preco }))
    }));

    salvarCarrinhoLocal();
    atualizarCartFab();

    fecharDetalhe(`pedido-detail-${pedidoId}`);
    mostrarPagina('page-carrinho');
    mostrarToast('Itens copiados para o carrinho!');
  } catch (e) {
    mostrarToast('Erro ao carregar pedido para refazer');
  }
}

function mostrarToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function salvarCarrinhoLocal() {
  localStorage.setItem('carrinho', JSON.stringify(carrinho));
}

function carregarCarrinhoLocal() {
  try { carrinho = JSON.parse(localStorage.getItem('carrinho')) || []; } catch (e) { carrinho = []; }
}

function formatarTelefone(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  input.value = v;
}

document.getElementById('modal-produto').addEventListener('click', function(e) {
  if (e.target === this || e.target.closest('.modal') === null) {
    fecharModal();
  }
});

// ===== CADASTRO CLIENTE =====

function switchTab(tabId, btn) {
  document.querySelectorAll('.cad-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.cad-tab-content').forEach(c => c.style.display = 'none');
  btn.classList.add('active');
  document.getElementById(tabId).style.display = 'block';
}

function formatarTelefoneInput(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  input.value = v;
}

async function preencherSelectBairrosCadastro() {
  await carregarBairros();
  const selects = ['cad-bairro', 'edit-bairro', 'cli-bairro'];
  selects.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="">Selecione o bairro</option>';
    bairros.forEach(b => {
      if (b.atendido) {
        select.innerHTML += `<option value="${b.id}" data-taxa="${b.taxa_entrega}">${b.nome} - R$ ${b.taxa_entrega.toFixed(2)}</option>`;
      }
    });
  });
}

async function cadastrarCliente() {
  const nome = document.getElementById('cad-nome').value.trim();
  const telefone = document.getElementById('cad-telefone').value.trim();
  const bairroId = document.getElementById('cad-bairro').value;
  const rua = document.getElementById('cad-rua').value.trim();
  const numero = document.getElementById('cad-numero').value.trim();
  const complemento = document.getElementById('cad-complemento').value.trim();
  const referencia = document.getElementById('cad-referencia').value.trim();

  if (!nome || !telefone) { mostrarErroCad('Preencha nome e telefone!'); return; }
  if (telefone.replace(/\D/g, '').length < 10) { mostrarErroCad('Telefone inválido!'); return; }

  const bairroSelect = document.getElementById('cad-bairro');
  const bairroNome = bairroSelect.selectedIndex > 0
    ? bairroSelect.options[bairroSelect.selectedIndex].text.split(' - ')[0].trim()
    : '';

  try {
    const res = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, telefone, rua, numero, bairro: bairroNome, complemento, ponto_referencia: referencia })
    });
    const cliente = await res.json();
    salvarClienteLocal(cliente);
    clienteLogado = cliente;
    mostrarTelaLogado();
    mostrarToast('Cadastro realizado!');
  } catch (e) {
    mostrarErroCad('Erro ao cadastrar. Tente novamente.');
  }
}

async function entrarCliente() {
  const telefone = document.getElementById('login-telefone').value.trim();
  if (!telefone) { mostrarErroCad('Informe o telefone'); return; }

  try {
    const res = await fetch(`/api/clientes/telefone/${encodeURIComponent(telefone)}`);
    if (!res.ok) { mostrarErroCad('Cliente não encontrado'); return; }
    const cliente = await res.json();
    salvarClienteLocal(cliente);
    clienteLogado = cliente;
    mostrarTelaLogado();
    mostrarToast('Bem-vindo de volta!');
  } catch (e) {
    mostrarErroCad('Erro ao buscar cliente');
  }
}

function sairCliente() {
  localStorage.removeItem('clienteLogado');
  clienteLogado = null;
  document.getElementById('cadastro-logged-out').style.display = 'block';
  document.getElementById('cadastro-logged-in').style.display = 'none';
  document.getElementById('cad-tab-cadastrar').style.display = 'block';
  document.getElementById('cad-tab-entrar').style.display = 'block';
  document.querySelector('.cadastro-tabs').style.display = 'flex';
  document.getElementById('cad-error').textContent = '';
  mostrarToast('Saiu da conta');
}

function carregarClienteLocal() {
  try {
    const saved = localStorage.getItem('clienteLogado');
    if (saved) {
      clienteLogado = JSON.parse(saved);
      // Sessoes antigas podem ter salvo apenas {id} - invalida para forcar novo login
      if (!clienteLogado || !clienteLogado.telefone) {
        clienteLogado = null;
        localStorage.removeItem('clienteLogado');
        return;
      }
      if (document.getElementById('page-cadastro').classList.contains('active')) {
        mostrarTelaLogado();
      }
    }
  } catch (e) {}
}

function salvarClienteLocal(cliente) {
  clienteLogado = cliente;
  localStorage.setItem('clienteLogado', JSON.stringify(cliente));
}

function mostrarTelaLogado() {
  if (!clienteLogado) return;
  document.getElementById('cadastro-logged-out').style.display = 'none';
  document.getElementById('cadastro-logged-in').style.display = 'block';
  document.getElementById('cad-tab-cadastrar').style.display = 'none';
  document.getElementById('cad-tab-entrar').style.display = 'none';
  document.querySelector('.cadastro-tabs').style.display = 'none';
  document.getElementById('perfil-nome').textContent = clienteLogado.nome;
  document.getElementById('perfil-tel').textContent = clienteLogado.telefone;
  let end = '';
  if (clienteLogado.rua) end += clienteLogado.rua;
  if (clienteLogado.numero) end += `, ${clienteLogado.numero}`;
  if (clienteLogado.complemento) end += ` - ${clienteLogado.complemento}`;
  if (clienteLogado.bairro) end += ` - ${clienteLogado.bairro}`;
  if (clienteLogado.ponto_referencia) end += ` (${clienteLogado.ponto_referencia})`;
  document.getElementById('perfil-end').textContent = end || 'Endereço não cadastrado';
}

function verMeusPedidos() {
  if (clienteLogado && clienteLogado.telefone) {
    document.getElementById('acomp-telefone').value = clienteLogado.telefone;
  }
  mostrarPagina('page-acompanhar');
  buscarPedidos();
}

function preencherDadosClientePaginaDados() {
  if (!clienteLogado) return;
  document.getElementById('cli-nome').value = clienteLogado.nome || '';
  document.getElementById('cli-telefone').value = clienteLogado.telefone || '';
  document.getElementById('cli-rua').value = clienteLogado.rua || '';
  document.getElementById('cli-numero').value = clienteLogado.numero || '';
  document.getElementById('cli-complemento').value = clienteLogado.complemento || '';
  document.getElementById('cli-referencia').value = clienteLogado.ponto_referencia || '';
  if (clienteLogado.bairro) {
    const select = document.getElementById('cli-bairro');
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].text.includes(clienteLogado.bairro)) {
        select.selectedIndex = i;
        atualizarTaxaBairro();
        break;
      }
    }
  }
}

function preencherEdicaoCliente() {
  if (!clienteLogado) { mostrarPagina('page-cadastro'); return; }
  document.getElementById('edit-nome').value = clienteLogado.nome || '';
  document.getElementById('edit-telefone').value = clienteLogado.telefone || '';
  document.getElementById('edit-rua').value = clienteLogado.rua || '';
  document.getElementById('edit-numero').value = clienteLogado.numero || '';
  document.getElementById('edit-complemento').value = clienteLogado.complemento || '';
  document.getElementById('edit-referencia').value = clienteLogado.ponto_referencia || '';
  preencherSelectBairrosCadastro();
  if (clienteLogado.bairro) {
    const select = document.getElementById('edit-bairro');
    for (let i = 0; i < select.options.length; i++) {
      if (select.options[i].text.includes(clienteLogado.bairro)) {
        select.selectedIndex = i;
        break;
      }
    }
  }
}

async function salvarEdicaoCliente() {
  if (!clienteLogado) return;
  const nome = document.getElementById('edit-nome').value.trim();
  const telefone = document.getElementById('edit-telefone').value.trim();
  const rua = document.getElementById('edit-rua').value.trim();
  const numero = document.getElementById('edit-numero').value.trim();
  const complemento = document.getElementById('edit-complemento').value.trim();
  const referencia = document.getElementById('edit-referencia').value.trim();
  const bairroSelect = document.getElementById('edit-bairro');
  const bairro = bairroSelect.options[bairroSelect.selectedIndex]?.text?.split(' - ')[0] || '';

  if (!nome || !telefone) { mostrarToast('Preencha nome e telefone!'); return; }

  try {
    await fetch(`/api/clientes/${clienteLogado.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, telefone, rua, numero, bairro, complemento, ponto_referencia: referencia })
    });
    const updated = { ...clienteLogado, nome, telefone, rua, numero, bairro, complemento, ponto_referencia: referencia };
    salvarClienteLocal(updated);
    mostrarToast('Dados atualizados!');
    mostrarPagina('page-cadastro');
  } catch (e) {
    mostrarToast('Erro ao salvar');
  }
}

function mostrarErroCad(msg) {
  document.getElementById('cad-error').textContent = msg;
}

// Formatar telefone em todos os campos relevantes
['cad-telefone', 'login-telefone', 'edit-telefone', 'cli-telefone', 'acomp-telefone'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', function() { formatarTelefoneInput(this); });
});
