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
let pedidoAtivoUnsub = null;
let pixPayloadAtual = '';

function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

document.addEventListener('DOMContentLoaded', init);

// Acompanha em tempo real o pedido ativo do cliente (pix confirmado + mudanças de status)
function inscreverAcompanhamentoPedido(pedidoId) {
  if (!window.Realtime || !window.Realtime.subscribePedidoStatus) return;
  if (pedidoAtivoUnsub) { try { pedidoAtivoUnsub(); } catch (e) {} pedidoAtivoUnsub = null; }

  let finalizado = false;
  let statusConhecido = 'recebido';

  const encerrar = () => {
    finalizado = true;
    localStorage.removeItem('ultimoPedidoId');
    localStorage.removeItem('pedidoAguardando');
    localStorage.removeItem('pedidoPixDetalhes');
    if (pedidoAtivoUnsub) { try { pedidoAtivoUnsub(); } catch (e) {} pedidoAtivoUnsub = null; }
  };

  const notificar = (msg) => {
    mostrarToast(msg);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Pedido atualizado!', { body: msg });
    }
  };

  const aoConfirmarPix = (p) => {
    if (finalizado) return;
    encerrar();
    notificar('Pagamento Pix confirmado!');
    document.getElementById('success-msg').textContent = `Seu pedido #${p.id} foi recebido com sucesso!`;
    mostrarPagina('page-sucesso');
  };

  const aoMudarStatus = (data) => {
    if (finalizado || !data.status || data.status === statusConhecido) return;
    statusConhecido = data.status;
    if (data.status === 'entregue' || data.status === 'cancelado') { encerrar(); return; }
    const label = PEDIDO_STATUS_LABELS[data.status] || data.status;
    notificar(`Pedido #${data.id}: ${label}`);
    const msgEl = document.getElementById('success-msg');
    if (msgEl && document.getElementById('page-sucesso').classList.contains('active')) {
      msgEl.textContent = `Seu pedido #${data.id}: ${label}`;
    }
  };

  const unsubs = [];

  unsubs.push(window.Realtime.subscribePixConfirmado(pedidoId, aoConfirmarPix));
  unsubs.push(window.Realtime.subscribePedidoStatus(pedidoId, aoMudarStatus));

  // Fallback: polling periodico caso o websocket realtime seja bloqueado
  const pollar = async () => {
    if (finalizado) return;
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}/publico`);
      if (!res.ok) return;
      const p = await res.json();
      if (p.pix_confirmado) { aoConfirmarPix(p); return; }
      if (p.status) aoMudarStatus(p);
    } catch (e) { /* offline: tenta no proximo ciclo */ }
  };

  // Primeira checagem imediata: pega confirmacao que ocorreu antes da inscricao
  setTimeout(pollar, 600);
  const pollTimer = setInterval(pollar, 10000);

  pedidoAtivoUnsub = () => { clearInterval(pollTimer); unsubs.forEach(u => { try { u(); } catch (e) {} }); };
}

async function init() {
  await Promise.all([carregarConfig(), carregarProdutos(), carregarBairros()]);
  carregarCarrinhoLocal();
  atualizarCartFab();
  carregarClienteLocal();

  if (window.Realtime && window.Realtime.init) {
    window.Realtime.init();

    // Retomar acompanhamento de pedido pendente (sobrevive a refresh da página)
    const pedidoPendente = parseInt(localStorage.getItem('ultimoPedidoId'));
    if (pedidoPendente) inscreverAcompanhamentoPedido(pedidoPendente);
  }

  // Solicitar permissão para notificações
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Restaurar página do hash URL (exceto páginas transitórias)
  const hash = window.location.hash.replace('#', '');
  const paginasTransitorias = ['page-pix', 'page-sucesso', 'page-pagamento', 'page-editar-cadastro'];
  if (hash && document.getElementById(hash) && !paginasTransitorias.includes(hash)) {
    mostrarPagina(hash);
  }

  // Cliente aguardando confirmacao de Pix: tem prioridade total sobre qualquer hash
  const aguardandoRaw = localStorage.getItem('pedidoAguardando');
  if (aguardandoRaw) {
    try {
      const aguardando = JSON.parse(aguardandoRaw);
      await gerarPixQR(aguardando.total);
      atualizarVisibilidadeComprovante();
      mostrarPagina('page-pix');
    } catch (e) {
      localStorage.removeItem('pedidoAguardando');
    }
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
    const res = await fetch('/api/config/public');
    config = await res.json();
    if (config.loja_nome) {
      document.getElementById('loja-nome').textContent = config.loja_nome;
      document.title = config.loja_nome;
    }
    // Logo dinâmica para cliente não logado
    const logoEl = document.getElementById('site-logo');
    if (logoEl && config.logo_url) logoEl.src = config.logo_url;
    const efetiva = config.loja_aberta_efetiva !== undefined ? config.loja_aberta_efetiva !== 'false' : config.loja_aberta !== 'false';
    atualizarStatusLoja(efetiva);
    atualizarBotaoWhatsapp(config.loja_telefone);
    atualizarVisibilidadeComprovante();
    const box = document.getElementById('tempo-espera-box');
    const val = document.getElementById('tempo-espera-valor');
    if (box && val) {
      if (config.tempo_espera && config.tempo_espera.trim()) {
        val.textContent = config.tempo_espera;
        box.style.display = 'flex';
      } else {
        box.style.display = 'none';
      }
    }

    // Chamada para exibir o prompt
    renderPwaInstallPrompt();
  } catch (e) {}
}

async function verificarLojaAberta() {
  try {
    const res = await fetch('/api/config/public');
    const cfg = await res.json();
    const aberta = cfg.loja_aberta_efetiva !== undefined ? cfg.loja_aberta_efetiva !== 'false' : cfg.loja_aberta !== 'false';
    atualizarStatusLoja(aberta);
    return aberta;
  } catch (e) { return true; }
}

function atualizarStatusLoja(aberta) {
  lojaAberta = aberta;
  const banner = document.getElementById('loja-fechada-banner');
  if (banner) banner.style.display = aberta ? 'none' : 'block';
}

function atualizarBotaoWhatsapp(telefone) {
  const fab = document.getElementById('whatsapp-fab');
  if (!fab) return;
  const raw = (telefone || '').trim();
  if (!raw) {
    fab.style.display = 'none';
    fab.classList.add('hidden');
    fab.removeAttribute('href');
    return;
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) {
    fab.style.display = 'none';
    fab.classList.add('hidden');
    return;
  }
  // Normaliza para E.164 brasileiro: se veio 10/11 digitos, prefixa 55
  let num = digits;
  if (digits.length === 10 || digits.length === 11) num = '55' + digits;
  const msg = encodeURIComponent('Olá! Gostaria de fazer um pedido 😊');
  fab.href = `https://wa.me/${num}?text=${msg}`;
  fab.style.display = 'flex';
  fab.classList.remove('hidden');
}

async function carregarProdutos() {
  try {
    const res = await fetch('/api/produtos/ativos');
    produtos = await res.json();

    // Config do modal "Montar sua Pizza" (sempre com a lista atual)
    window.__pizzaCfg = {
      produtos,
      toast: mostrarToast,
      onAdd(item) {
        carrinho.push(item);
        salvarCarrinhoLocal();
        atualizarCartFab();
        mostrarToast('Pizza adicionada ao carrinho!');
      }
    };

    renderCategorias();
    filtrarCategoria('', null);
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
      select.innerHTML += `<option value="${b.id}" data-taxa="${b.taxa_entrega}">${escapeHtml(b.nome)} - R$ ${b.taxa_entrega.toFixed(2)}</option>`;
    });
  } catch (e) {}
}

function ehPizza(p) {
  return !!(p && p.categoria_nome && p.categoria_nome.toLowerCase().includes('pizza'));
}

function renderCategorias() {
  // Colapsar as categorias de pizza em uma unica aba "Pizzas", na posicao da primeira
  const tabs = [];
  const vistos = new Set();
  produtos.forEach(p => {
    if (vistos.has(p.categoria_id)) return;
    vistos.add(p.categoria_id);
    if (ehPizza(p)) {
      if (!tabs.includes('__pizzas__')) tabs.push('__pizzas__');
    } else {
      tabs.push(p.categoria_nome);
    }
  });

  const container = document.getElementById('categories');
  container.innerHTML = `<button class="cat-btn active" onclick="filtrarCategoria('', this)">Todos</button>`;
  tabs.forEach(c => {
    const token = c === '__pizzas__' ? '__pizzas__' : c;
    const label = c === '__pizzas__' ? 'Pizzas' : c;
    container.innerHTML += `<button class="cat-btn" data-cat="${token}" onclick="filtrarCategoria('${c}', this)">${label}</button>`;
  });
}

function filtrarCategoria(cat, btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (cat === '__pizzas__') {
    renderGridHtml(PizzaModal.cardHtml('cliente'));
    return;
  }

  let filtrados;
  if (cat) {
    filtrados = produtos.filter(p => p.categoria_nome === cat && !ehPizza(p));
  } else {
    filtrados = produtos;
  }
  renderProdutos(filtrados);
}

function renderGridHtml(html) {
  document.getElementById('products-grid').innerHTML = html;
}

function renderProdutos(lista) {
  const grid = document.getElementById('products-grid');
  if (!lista.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#127828;</div><p>Nenhum produto disponível</p></div>';
    return;
  }

  // Agrupar por categoria preservando a ordem (categoria -> preco)
  const grupos = [];
  const mapa = new Map();
  lista.forEach(p => {
    if (!mapa.has(p.categoria_id)) {
      const itens = [];
      mapa.set(p.categoria_id, itens);
      grupos.push({ id: p.categoria_id, nome: p.categoria_nome || 'Outros', pizza: ehPizza(p), itens });
    }
    mapa.get(p.categoria_id).push(p);
  });

  // Colapsar grupos de pizza em um unico bloco com o card "Montar sua Pizza"
  let htmlGrupos = '';
  let pizzasInseridas = false;
  grupos.forEach(g => {
    if (g.pizza) {
      if (pizzasInseridas) return;
      pizzasInseridas = true;
      htmlGrupos += `
        <div class="category-section">
          <h2 class="category-heading">Pizzas</h2>
          <div class="category-items">
            ${PizzaModal.cardHtml('cliente')}
          </div>
        </div>`;
      return;
    }
    htmlGrupos += `
      <div class="category-section">
        <h2 class="category-heading">${escapeHtml(g.nome)}</h2>
        <div class="category-items">
          ${g.itens.map(produtoCardHtml).join('')}
        </div>
      </div>`;
  });

  grid.innerHTML = htmlGrupos;
}

function produtoCardHtml(p) {
  return `
    <div class="product-card" onclick="abrirProduto(${p.id})">
      <div class="product-media">
        ${p.foto
           ? `<img class="product-img" src="${p.foto}" alt="${escapeHtml(p.nome)}" data-categoria="${escapeHtml(p.categoria_nome||'')}" data-nome="${escapeHtml(p.nome)}" loading="lazy" onerror="handleImgError(this)">`
           : `<div class="product-img-placeholder">${(window.categoriaIcon?window.categoriaIcon(p.nome,p.categoria_nome):'&#127828;')}</div>`}
      </div>
      <div class="product-info">
        <div>
          <div class="product-name">${escapeHtml(p.nome)}</div>
          ${p.descricao ? `<div class="product-desc">${escapeHtml(p.descricao)}</div>` : ''}
        </div>
        <div class="product-footer">
          <span class="product-price">R$ ${p.preco.toFixed(2)}${p.unidade === 'kg' ? '/kg' : ''}</span>
          <button class="btn-add" onclick="event.stopPropagation(); abrirProduto(${p.id})" aria-label="Adicionar ${escapeHtml(p.nome)}">+</button>
        </div>
      </div>
    </div>
  `;
}

function formatarPeso(qtd) {
  return qtd >= 1 ? `${qtd} kg` : `${Math.round(qtd * 1000)} g`;
}

function abrirProduto(id) {
  try {
  produtoAtual = produtos.find(p => p.id === id);
  if (!produtoAtual) return;
  if (!Array.isArray(produtoAtual.adicionais)) produtoAtual.adicionais = [];

  const porKg = produtoAtual.unidade === 'kg';
  const isPizza = produtoAtual.categoria_nome && ['Pizza', 'Tradicional', 'Especial', 'Doce'].some(cat => String(produtoAtual.categoria_nome).toLowerCase().includes(cat.toLowerCase()));
  const isSuco = produtoAtual.categoria_nome && ['suco', 'bebida', 'milk', 'shake'].some(cat => String(produtoAtual.categoria_nome).toLowerCase().includes(cat.toLowerCase()));
  const isProdutoComSabores = isPizza || isSuco;
  // Limite de sabores: configuracao do produto tem prioridade; senao, automatico por tamanho da pizza
  let maxSabores = 1;
  if (isProdutoComSabores) {
    const limiteConfigurado = parseInt(produtoAtual.limite_sabores) || 0;
    if (limiteConfigurado > 0) {
      maxSabores = limiteConfigurado;
    } else if (produtoAtual.categoria_nome && produtoAtual.categoria_nome.toLowerCase().includes('pizza')) {
      const tamMatch = produtoAtual.nome.trim().match(/\s([PMGF])$/i);
      if (tamMatch) {
        const tam = tamMatch[1].toUpperCase();
        maxSabores = tam === 'P' ? 1 : tam === 'F' ? 3 : 2;
      } else {
        maxSabores = 3;
      }
    }
  }
  document.getElementById('modal-nome').textContent = produtoAtual.nome;
  document.getElementById('modal-desc').textContent = produtoAtual.descricao || '';
  document.getElementById('modal-preco').textContent = `R$ ${produtoAtual.preco.toFixed(2)}${porKg ? ' /kg' : ''}`;
  document.getElementById('modal-qty').textContent = '1';
  document.getElementById('modal-obs').value = '';
  document.getElementById('modal-kg-control').style.display = porKg ? 'flex' : 'none';
  document.getElementById('modal-qtd-control').style.display = porKg ? 'none' : 'flex';
  const dica = document.getElementById('modal-kg-dica');
  if (porKg) {
    if (dica) {
      dica.style.display = 'block';
      dica.textContent = `Digite quanto quer gastar. Preço: R$ ${produtoAtual.preco.toFixed(2)} por kg`;
    }
    const kgValor = document.getElementById('modal-kg-valor');
    if (kgValor) kgValor.value = 15;
  } else if (dica) {
    dica.style.display = 'none';
  }

  const img = document.getElementById('modal-img');
  if (produtoAtual.foto) { img.onerror=function(){ this.style.display='none'; this.onerror=null; }; img.src = produtoAtual.foto; img.style.display = 'block'; }
  else { img.style.display = 'none'; img.onerror=null; }

  const adcSection = document.getElementById('modal-adicionais');
  const adcList = document.getElementById('adicionais-list');
  
  // Detectar se é produto com tipos de açaí (base/cobertura/acompanhamento)
  const adicionaisAcai = produtoAtual.adicionais.filter(a => ['base', 'cobertura', 'acompanhamento'].includes(a.tipo));
  const isProdutoComTipos = adicionaisAcai.length > 0;
  
  // Adicionais tradicionais (sabor, adicional, borda)
  const adicionaisTradicionais = produtoAtual.adicionais.filter(a => !a.tipo || ['adicional', 'sabor', 'borda'].includes(a.tipo));
  
  const renderGrupoAdicionais = (items, titulo, inputType, grupo, limite) => {
    if (!items.length) return '';
    const isRadio = inputType === 'radio';
    const limiteTexto = limite > 0 ? ` (máx: ${limite})` : '';
    return `<div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border);">
      <div class="modal-section-title" style="margin: 8px 0;">${titulo}${limiteTexto}</div>
      ${items.map(a => `
        <div class="pm-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--color-border);">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
            <input type="${inputType}" name="${grupo}" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="${a.tipo}" data-grupo="${grupo}" data-limite="${limite}" class="${grupo}-checkbox" style="width:18px;height:18px;accent-color:var(--color-primary);">
            <div>
              <span style="font-weight:600;color:var(--color-text);">${escapeHtml(a.nome)}</span>
              ${a.descricao ? `<br><small style="color:var(--color-text-secondary);display:block;margin-top:2px;font-size:0.8rem;">${escapeHtml(a.descricao)}</small>` : ''}
            </div>
          </label>
          <span style="font-size:0.85rem;color:var(--color-text-secondary);white-space:nowrap;font-weight:600;">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
        </div>
      `).join('')}
    </div>`;
  }
  
  if (produtoAtual.adicionais && produtoAtual.adicionais.length) {
    let html = '';
    
    // Seções de açaí: base, cobertura, acompanhamento
    if (isProdutoComTipos) {
      const bases = produtoAtual.adicionais.filter(a => a.tipo === 'base');
      const coberturas = produtoAtual.adicionais.filter(a => a.tipo === 'cobertura');
      const acompanhamentos = produtoAtual.adicionais.filter(a => a.tipo === 'acompanhamento');
      
      html += renderGrupoAdicionais(bases, 'Base', 'radio', 'base', 1);
      html += renderGrupoAdicionais(coberturas, 'Coberturas', 'checkbox', 'cobertura', coberturas[0]?.limite || 0);
      html += renderGrupoAdicionais(acompanhamentos, 'Acompanhamentos', 'checkbox', 'acompanhamento', acompanhamentos[0]?.limite || 0);
      
      // Limitar seleção de coberturas e acompanhamentos
      setTimeout(() => {
        ['cobertura', 'acompanhamento'].forEach(grupo => {
          const checks = document.querySelectorAll(`.${grupo}-checkbox`);
          checks.forEach(cb => {
            cb.addEventListener('change', function() {
              const limite = parseInt(this.dataset.limite) || 0;
              if (limite > 0) {
                const checked = document.querySelectorAll(`.${grupo}-checkbox:checked`).length;
                if (checked > limite) {
                  this.checked = false;
                  mostrarToast(`Máximo ${limite} ${grupo}(s) permitido(s)`);
                }
              }
            });
          });
        });
      }, 10);
    }
    
    // Se é pizza/suco: sabores + adicionais extras
    if (isProdutoComSabores) {
      const sabores = produtoAtual.adicionais.filter(a => a.tipo === 'sabor');
      const adicionaisExtras = adicionaisTradicionais.filter(a => ['adicional', 'borda'].includes(a.tipo) && a.preco > 0);
      
      let htmlSabores = '';
      let htmlAdicionais = '';
      
      if (sabores.length) {
        const titulo = isPizza ? `Escolha até ${maxSabores} sabores` : `Escolha ${maxSabores} sabor`;
        htmlSabores = `<div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border);">
          <div class="modal-section-title" style="margin: 8px 0;">${titulo}</div>
          ${sabores.map(a => `
            <div class="pm-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--color-border);">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
                <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="sabor" class="sabor-checkbox" data-max="${maxSabores}" style="width:18px;height:18px;accent-color:var(--color-primary);">
                <div>
                  <span style="font-weight:600;color:var(--color-text);">${escapeHtml(a.nome)}</span>
                  ${a.descricao ? `<br><small style="color:var(--color-text-secondary);display:block;margin-top:2px;font-size:0.8rem;">${escapeHtml(a.descricao)}</small>` : ''}
                </div>
              </label>
              <span style="font-size:0.85rem;color:var(--color-text-secondary);white-space:nowrap;font-weight:600;">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
            </div>
          `).join('')}
        </div>`;
        
        // Limitar seleção de sabores
        setTimeout(() => {
          document.querySelectorAll('.sabor-checkbox').forEach(cb => {
            cb.addEventListener('change', function() {
              const checked = document.querySelectorAll('.sabor-checkbox:checked').length;
              if (checked > maxSabores) {
                this.checked = false;
                mostrarToast(`Máximo ${maxSabores} sabor(es) permitido(s)`);
              }
            });
          });
        }, 10);
      }
      
      if (adicionaisExtras.length) {
        const bordasExtras = adicionaisExtras.filter(a => a.tipo === 'borda');
        const outrosExtras = adicionaisExtras.filter(a => a.tipo !== 'borda');

        // Grupo com limite configurado no painel admin (campo "Limite" do adicional)
        const renderGrupo = (items, titulo, grupo) => {
          const limiteGrupo = parseInt(items[0]?.limite) || 0;
          const tituloTxt = limiteGrupo > 0 ? `${titulo} (máx: ${limiteGrupo})` : titulo;
          return `<div style="margin-top: 12px;">
          <div class="modal-section-title" style="margin: 8px 0;">${tituloTxt}</div>
          ${items.map(a => `
            <div class="pm-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--color-border);">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
                <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="${a.tipo}" class="check-lim" data-grupo="${grupo}" data-grupo-label="${titulo.toLowerCase()}" data-max="${limiteGrupo}" style="width:18px;height:18px;accent-color:var(--color-primary);">
                <div>
                  <span style="font-weight:600;color:var(--color-text);">${escapeHtml(a.nome)}</span>
                  ${a.descricao ? `<br><small style="color:var(--color-text-secondary);display:block;margin-top:2px;font-size:0.8rem;">${escapeHtml(a.descricao)}</small>` : ''}
                </div>
              </label>
              <span style="font-size:0.85rem;color:var(--color-text-secondary);white-space:nowrap;font-weight:600;">+ R$ ${a.preco.toFixed(2)}</span>
            </div>
          `).join('')}
        </div>`;
        };

        if (bordasExtras.length) htmlAdicionais += renderGrupo(bordasExtras, 'Borda Recheada', 'borda');
        if (outrosExtras.length) htmlAdicionais += renderGrupo(outrosExtras, 'Adicionais extras', 'extra');
      }
      
      html += htmlSabores + htmlAdicionais;
    } else if (!isProdutoComTipos) {
      // Para não-pizzas/não-sucos/não-açaí, mostrar sabores e adicionais normalmente
      const sabores = adicionaisTradicionais.filter(a => a.tipo === 'sabor');
      const bordas = adicionaisTradicionais.filter(a => a.tipo === 'borda');
      const adicionaisFiltrados = adicionaisTradicionais.filter(a => !a.tipo || a.tipo === 'adicional');

      if (sabores.length) {
        // Limite configurado no painel admin (campo "Limite" do adicional)
        const limiteSabores = parseInt(sabores[0]?.limite) || 0;
        const tituloSabores = limiteSabores > 0 ? `Sabores (máx: ${limiteSabores})` : 'Sabores';
        html += `<div class="modal-section-title titulo-grupo-lim" style="margin: 8px 0;" data-base="${limiteSabores}" data-label="Sabores">${tituloSabores}</div>` +
          sabores.map(a => `
            <div class="pm-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--color-border);">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
                <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="sabor" class="sabor-check-gen" data-max="${limiteSabores}" data-base-max="${limiteSabores}" style="width:18px;height:18px;accent-color:var(--color-primary);">
                <div>
                  <span style="font-weight:600;color:var(--color-text);">${escapeHtml(a.nome)}</span>
                  ${a.descricao ? `<br><small style="color:var(--color-text-secondary);display:block;margin-top:2px;font-size:0.8rem;">${escapeHtml(a.descricao)}</small>` : ''}
                </div>
              </label>
              <span style="font-size:0.85rem;color:var(--color-text-secondary);white-space:nowrap;font-weight:600;">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
            </div>
          `).join('');

        setTimeout(() => {
          document.querySelectorAll('#adicionais-list .sabor-check-gen').forEach(cb => {
            cb.addEventListener('change', function() {
              const max = parseInt(this.dataset.max) || 0;
              if (max > 0) {
                const checked = document.querySelectorAll('#adicionais-list .sabor-check-gen:checked').length;
                if (checked > max) {
                  this.checked = false;
                  mostrarToast(`Máximo ${max} sabor(es) permitido(s)`);
                }
              }
            });
          });
        }, 10);
      }

      if (bordas.length) {
        const limiteBordas = parseInt(bordas[0]?.limite) || 0;
        const tituloBordas = limiteBordas > 0 ? `Borda Recheada (máx: ${limiteBordas})` : 'Borda Recheada';
        html += `<div class="modal-section-title titulo-grupo-lim" style="margin: 8px 0;" data-base="${limiteBordas}" data-label="Borda Recheada">${tituloBordas}</div>` +
          bordas.map(a => `
            <div class="pm-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--color-border);">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
                <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="borda" class="check-lim" data-grupo="gen-borda" data-grupo-label="borda recheada" data-max="${limiteBordas}" data-base-max="${limiteBordas}" style="width:18px;height:18px;accent-color:var(--color-primary);">
                <div>
                  <span style="font-weight:600;color:var(--color-text);">${escapeHtml(a.nome)}</span>
                  ${a.descricao ? `<br><small style="color:var(--color-text-secondary);display:block;margin-top:2px;font-size:0.8rem;">${escapeHtml(a.descricao)}</small>` : ''}
                </div>
              </label>
              <span style="font-size:0.85rem;color:var(--color-text-secondary);white-space:nowrap;font-weight:600;">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
            </div>
          `).join('');
      }

      if (adicionaisFiltrados.length) {
        const limiteAdic = parseInt(adicionaisFiltrados[0]?.limite) || 0;
        const tituloAdic = limiteAdic > 0 ? `Adicionais (máx: ${escapeHtml(limiteAdic)})` : 'Adicionais';
        html += `<div class="modal-section-title titulo-grupo-lim" style="margin: 8px 0;" data-base="${escapeHtml(limiteAdic)}" data-label="Adicionais">${escapeHtml(tituloAdic)}</div>` +
          adicionaisFiltrados.map(a => `
            <div class="pm-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--color-border);">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
                <input type="checkbox" value="${a.id}" data-nome="${escapeHtml(a.nome)}" data-preco="${a.preco}" data-tipo="adicional" class="check-lim" data-grupo="gen-adic" data-grupo-label="adicional" data-max="${escapeHtml(limiteAdic)}" data-base-max="${escapeHtml(limiteAdic)}" style="width:18px;height:18px;accent-color:var(--color-primary);">
                <div>
                  <span style="font-weight:600;color:var(--color-text);">${escapeHtml(a.nome)}</span>
                  ${a.descricao ? `<br><small style="color:var(--color-text-secondary);display:block;margin-top:2px;font-size:0.8rem;">${escapeHtml(a.descricao)}</small>` : ''}
                </div>
              </label>
              <span style="font-size:0.85rem;color:var(--color-text-secondary);white-space:nowrap;font-weight:600;">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
            </div>
          `).join('');
      }
    }
    
    if (html) {
      adcSection.style.display = 'block';
      adcList.innerHTML = html;
      aplicarLimitesDinamicos();

      // Aplicar limites por grupo (campo "Limite" do adicional)
      setTimeout(() => {
        document.querySelectorAll('#adicionais-list .check-lim').forEach(cb => {
          cb.addEventListener('change', function() {
            const max = parseInt(this.dataset.max) || 0;
            if (max <= 0) return;
            const checked = document.querySelectorAll(`#adicionais-list .check-lim[data-grupo="${this.dataset.grupo}"]:checked`).length;
            if (checked > max) {
              this.checked = false;
              mostrarToast(`Máximo ${max} ${this.dataset.grupoLabel || 'item'}(s) permitido(s)`);
            }
          });
        });
      }, 10);
    } else {
      adcSection.style.display = 'none';
      adcList.innerHTML = '';
    }
  } else {
    adcSection.style.display = 'none';
    adcList.innerHTML = '';
  }

  atualizarBtnAdd();
  abrirModalEl();
  } catch (e) {
    console.error('abrirProduto falhou:', e);
    // Fallback: mostra modal mesmo com erro parcial
    try { abrirModalEl(); } catch (_) {}
    mostrarToast('Erro ao abrir produto. Tente novamente.');
  }
}

// Abre/fecha o modal de produto garantindo consistencia entre classe CSS e display inline
// (o CSS define .modal-overlay{display:none} e .modal-overlay.active{display:flex})
function abrirModalEl() {
  const m = document.getElementById('modal-produto');
  if (!m) return;
  m.classList.add('active');
  m.style.display = 'flex';
}

function fecharModal() {
  const m = document.getElementById('modal-produto');
  if (!m) return;
  m.classList.remove('active');
  m.style.display = 'none';
}

function alterarQtd(delta) {
  modalQtd = Math.max(1, modalQtd + delta);
  document.getElementById('modal-qty').textContent = modalQtd;
  atualizarBtnAdd();
  aplicarLimitesDinamicos();
}

// Multiplica o limite configurado pela quantidade de itens (2 trufas = ate 2 sabores)
function aplicarLimitesDinamicos() {
  if (!produtoAtual || produtoAtual.unidade !== 'un') return;
  const mult = Math.max(1, modalQtd || 1);

  document.querySelectorAll('#adicionais-list [data-base-max]').forEach(cb => {
    const base = parseInt(cb.dataset.baseMax) || 0;
    cb.dataset.max = base > 0 ? base * mult : 0;
  });

  document.querySelectorAll('#adicionais-list .titulo-grupo-lim').forEach(t => {
    const base = parseInt(t.dataset.base) || 0;
    const label = t.dataset.label || '';
    t.textContent = base > 0 ? `${label} (máx: ${base * mult})` : label;
  });
}

function lerValorKg() {
  const v = parseFloat(document.getElementById('modal-kg-valor').value);
  return isNaN(v) ? 0 : v;
}

// Converte o valor em reais escolhido em quantidade (kg)
function atualizarQtdKg() {
  const valor = lerValorKg();
  modalQtd = valor > 0 ? valor / produtoAtual.preco : 0;
  return valor;
}

function atualizarBtnAdd() {
  const porKg = produtoAtual && produtoAtual.unidade === 'kg';
  if (porKg) atualizarQtdKg();
  let total = produtoAtual.preco * modalQtd;
  const checks = document.querySelectorAll('#adicionais-list input:checked');
  checks.forEach(c => { total += parseFloat(c.dataset.preco) * modalQtd; });
  const btn = document.getElementById('btn-add-cart');
  if (porKg) {
    if (!modalQtd || modalQtd <= 0) { btn.textContent = 'Informe o valor desejado'; return; }
    btn.textContent = `Adicionar ${formatarPeso(modalQtd)} - R$ ${total.toFixed(2)}`;
  } else {
    btn.textContent = `Adicionar - R$ ${total.toFixed(2)}`;
  }
}

document.addEventListener('change', (e) => {
  if (e.target.closest('#adicionais-list')) atualizarBtnAdd();
});

function adicionarAoCarrinho() {
  const porKg = produtoAtual.unidade === 'kg';
  if (porKg) {
    atualizarQtdKg();
    if (!modalQtd || modalQtd <= 0) { mostrarToast('Informe o valor desejado'); return; }
    if (modalQtd > 10) { mostrarToast('Valor máximo: R$ 450,00 (10 kg)'); return; }
  }

  const adicionais = [];
  document.querySelectorAll('#adicionais-list input:checked').forEach(c => {
    adicionais.push({ id: parseInt(c.value), nome: c.dataset.nome, preco: parseFloat(c.dataset.preco), tipo: c.dataset.tipo || 'adicional' });
  });

  carrinho.push({
    produto_id: produtoAtual.id,
    produto_nome: produtoAtual.nome,
    preco_unitario: produtoAtual.preco,
    quantidade: modalQtd,
    unidade: porKg ? 'kg' : 'un',
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
    const qtdTexto = item.unidade === 'kg' ? formatarPeso(item.quantidade) : `${item.quantidade}x`;
    
    // Agrupar adicionais por tipo para exibição
    const tiposAcai = { base: [], cobertura: [], acompanhamento: [] };
    item.adicionais.forEach(a => {
      const tipo = a.tipo || 'adicional';
      if (tiposAcai[tipo]) tiposAcai[tipo].push(a);
    });
    const temAcai = tiposAcai.base.length || tiposAcai.cobertura.length || tiposAcai.acompanhamento.length;
    const adcTradicionais = item.adicionais.filter(a => !tiposAcai[a.tipo || 'adicional']);
    
    let adcHtml = '';
    if (temAcai) {
      const labels = { base: 'Base', cobertura: 'Coberturas', acompanhamento: 'Acompanhamentos' };
      ['base', 'cobertura', 'acompanhamento'].forEach(tipo => {
        if (tiposAcai[tipo].length) {
          adcHtml += `<div class="cart-item-details">${labels[tipo]}: ${tiposAcai[tipo].map(a => a.nome + (a.preco > 0 ? ` (+R$ ${a.preco.toFixed(2)})` : '')).join(', ')}</div>`;
        }
      });
    }
    
    const adcTradicionalHtml = adcTradicionais.map(a => {
      itemTotal += a.preco * item.quantidade;
      return `+ ${escapeHtml(a.nome)} (R$ ${a.preco.toFixed(2)})`;
    }).join(', ');
    
    // Recalcular totais para açaí
    if (temAcai) {
      item.adicionais.forEach(a => { itemTotal += a.preco * item.quantidade; });
    }
    
    const adcHtmlFinal = adcHtml + (adcTradicionalHtml ? `<div class="cart-item-details">${escapeHtml(adcTradicionalHtml)}</div>` : '');
    
    return `
      <div class="cart-item">
        <div class="cart-item-header">
          <div>
            <div class="cart-item-name">${escapeHtml(item.produto_nome)}</div>
            ${adcHtmlFinal ? adcHtmlFinal : ''}
            ${item.observacao ? `<div class="cart-item-details">Obs: ${escapeHtml(item.observacao)}</div>` : ''}
            ${item.unidade === 'un' ? `
              <div class="qty-control" style="margin-top: 8px; justify-content: flex-start;">
                <button class="qty-btn" onclick="alterarQtdCarrinho(${i}, -1)" aria-label="Diminuir" style="width: 28px; height: 28px; font-size: 14px;">-</button>
                <span class="qty-value" style="font-size: 14px; margin: 0 10px;">${item.quantidade}</span>
                <button class="qty-btn" onclick="alterarQtdCarrinho(${i}, 1)" aria-label="Aumentar" style="width: 28px; height: 28px; font-size: 14px;">+</button>
              </div>
            ` : `<div style="font-size: 13px; color: var(--color-primary); font-weight: bold; margin-top: 6px;">Peso: ${qtdTexto}</div>`}
          </div>
          <button class="cart-item-remove" onclick="removerItem(${i})">&times;</button>
        </div>
        <div class="cart-item-price">R$ ${itemTotal.toFixed(2)}</div>
      </div>
    `;
  }).join('');

  atualizarTotais();
}

function alterarQtdCarrinho(index, delta) {
  if (carrinho[index].unidade !== 'un') return;
  const novaQtd = carrinho[index].quantidade + delta;
  if (novaQtd <= 0) {
    removerItem(index);
  } else {
    carrinho[index].quantidade = novaQtd;
    salvarCarrinhoLocal();
    atualizarCartFab();
    renderCarrinho();
  }
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
    const qtdTexto = item.unidade === 'kg' ? formatarPeso(item.quantidade) : `${item.quantidade}x`;
    const adcHtml = item.adicionais.map(a => {
      itemTotal += a.preco * item.quantidade;
      return `<div class="pedido-item-adicional" style="padding-left:12px">+ ${escapeHtml(a.nome)} (R$ ${a.preco.toFixed(2)})</div>`;
    }).join('');

    return `
      <div class="cart-item">
        <div class="cart-item-header">
          <div class="cart-item-name">${qtdTexto} ${escapeHtml(item.produto_nome)}</div>
          <div class="cart-item-price">R$ ${itemTotal.toFixed(2)}</div>
        </div>
        ${adcHtml ? `<div>${adcHtml}</div>` : ''}
        ${item.observacao ? `<div class="cart-item-details">Obs: ${escapeHtml(item.observacao)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function getTipoEntrega() {
  const el = document.querySelector('input[name="tipo-entrega"]:checked');
  return el ? el.value : 'entrega';
}
function alternarTipoEntrega() {
  const tipo = getTipoEntrega();
  const entrega = document.getElementById('entrega-campos');
  const retirada = document.getElementById('retirada-info');
  if (tipo === 'retirada') {
    if (entrega) entrega.style.display = 'none';
    if (retirada) retirada.style.display = 'block';
    taxaEntregaAtual = 0;
    atualizarTotais();
    const end = (config && config.loja_endereco) ? config.loja_endereco : '';
    const elEnd = document.getElementById('retirada-endereco');
    if (elEnd) elEnd.textContent = end ? end : 'Endereço não configurado — informe na administração';
    const elMaps = document.getElementById('retirada-maps');
    if (elMaps) elMaps.href = end ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}` : '#';
  } else {
    if (entrega) entrega.style.display = 'block';
    if (retirada) retirada.style.display = 'none';
    atualizarTaxaBairro();
  }
}
function atualizarTaxaBairro() {
  if (getTipoEntrega() === 'retirada') { taxaEntregaAtual = 0; atualizarTotais(); return; }
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
  const tipo = getTipoEntrega();
  const bairro = document.getElementById('cli-bairro').value;

  if (!lojaAberta) { mostrarToast('A loja está fechada e não está aceitando pedidos'); return; }
  if (!nome || !telefone) { mostrarToast('Preencha nome e telefone!'); return; }
  if (tipo === 'entrega' && !bairro) { mostrarToast('Selecione o bairro!'); return; }
  if (tipo === 'retirada' && !config.loja_endereco) { mostrarToast('Retirada indisponível: endereço da loja não configurado'); return; }

  renderResumoPagamento();
  atualizarTotais();
  mostrarPagina('page-pagamento');
}

let finalizandoPedido = false;

async function finalizarPedido() {
  if (finalizandoPedido) return;
  finalizandoPedido = true;
  const btnFinalizar = document.getElementById('btn-finalizar');
  if (btnFinalizar) { btnFinalizar.disabled = true; btnFinalizar.textContent = 'Enviando pedido...'; }

  try {
    await concluirPedido();
  } finally {
    finalizandoPedido = false;
    if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.textContent = 'Finalizar pedido'; }
  }
}

async function concluirPedido() {
  if (!(await verificarLojaAberta())) {
    mostrarToast('A loja está fechada e não está aceitando pedidos');
    mostrarPagina('page-cardapio');
    return;
  }
  const tipoEntrega = getTipoEntrega();
  const nome = document.getElementById('cli-nome').value.trim();
  const telefone = document.getElementById('cli-telefone').value.trim();
  const bairroId = document.getElementById('cli-bairro').value;
  const bairroSelect = document.getElementById('cli-bairro');
  let bairroNome = bairroSelect.options[bairroSelect.selectedIndex]?.text.split(' - ')[0] || '';
  if (tipoEntrega === 'retirada') bairroNome = 'Retirada no local';

  const rua = document.getElementById('cli-rua').value.trim();
  const numero = document.getElementById('cli-numero').value.trim();
  const complemento = document.getElementById('cli-complemento').value.trim();
  const referencia = document.getElementById('cli-referencia').value.trim();
  const obs = document.getElementById('pedido-obs').value.trim();

  let enderecoCompleto = '';
  if (tipoEntrega === 'retirada') {
    enderecoCompleto = config.loja_endereco ? `Retirada no local - ${config.loja_endereco}` : 'Retirada no local';
    taxaEntregaAtual = 0;
  } else {
    if (rua) enderecoCompleto += rua;
    if (numero) enderecoCompleto += `, ${numero}`;
    if (complemento) enderecoCompleto += ` - ${escapeHtml(complemento)}`;
    if (referencia) enderecoCompleto += ` (Ref: ${escapeHtml(referencia)})`;
  }

  try {
    // preservar endereço cadastrado quando for retirada (não sobrescrever com "Retirada no local")
    let clientePayload;
    const telNorm = (s) => String(s || '').replace(/\D/g, '');
    if (tipoEntrega === 'retirada') {
      if (clienteLogado && telNorm(clienteLogado.telefone) === telNorm(telefone)) {
        clientePayload = { nome, telefone, rua: clienteLogado.rua || '', numero: clienteLogado.numero || '', bairro: clienteLogado.bairro || '', complemento: clienteLogado.complemento || '', ponto_referencia: clienteLogado.ponto_referencia || '' };
      } else {
        // novo cliente sem cadastro prévio e escolheu retirada: não salvar "Retirada" como bairro
        clientePayload = { nome, telefone, rua: '', numero: '', bairro: '', complemento: '', ponto_referencia: '' };
      }
    } else {
      clientePayload = { nome, telefone, rua, numero, bairro: bairroNome, complemento, ponto_referencia: referencia };
    }
    const clienteRes = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientePayload)
    });
    const cliente = await clienteRes.json();
    // manter cache com endereço real, não "Retirada"
    if (tipoEntrega === 'retirada' && clienteLogado && String(clienteLogado.telefone).replace(/\D/g,'') === String(telefone).replace(/\D/g,'')) {
      salvarClienteLocal({ ...cliente, rua: clienteLogado.rua, numero: clienteLogado.numero, bairro: clienteLogado.bairro, complemento: clienteLogado.complemento, ponto_referencia: clienteLogado.ponto_referencia });
    } else if (tipoEntrega === 'retirada') {
      salvarClienteLocal(cliente);
    }

    let observacoes = obs;
    if (formaPagamento === 'dinheiro') {
      const troco = document.getElementById('troco-valor').value;
      if (troco) observacoes += ` | Troco para R$ ${parseFloat(troco).toFixed(2)}`;
    }

    const idempotencyKey = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
    const pedidoRes = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
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
    
    if (!pedidoRes.ok) {
      let msg = 'Erro ao finalizar pedido. Tente novamente.';
      try { const j = await pedidoRes.json(); if (j.error) msg = j.error; } catch (e) {}
      mostrarToast(msg);
      return;
    }
    
    const pedido = await pedidoRes.json();
    ultimoPedidoId = pedido.id;
    localStorage.setItem('ultimoPedidoId', String(pedido.id));
    if (formaPagamento === 'pix') {
      localStorage.setItem('pedidoAguardando', JSON.stringify({ id: pedido.id, total: pedido.total }));
      try {
        const itensParaComprovante = (pedido.itens && pedido.itens.length) ? pedido.itens.map(it => ({
          produto_nome: it.produto_nome,
          quantidade: it.quantidade,
          preco_unitario: it.preco_unitario,
          unidade: it.unidade || 'un',
          observacao: it.observacao || '',
          adicionais: (it.adicionais || []).map(a => ({ nome: a.adicional_nome || a.nome, preco: a.preco }))
        })) : carrinho.map(c => ({
          produto_nome: c.produto_nome,
          quantidade: c.quantidade,
          preco_unitario: c.preco_unitario,
          unidade: c.unidade || 'un',
          observacao: c.observacao || '',
          adicionais: (c.adicionais || []).map(a => ({ nome: a.nome, preco: a.preco }))
        }));
        const detalhesPix = {
          id: pedido.id,
          total: pedido.total,
          subtotal: pedido.subtotal,
          taxa_entrega: pedido.taxa_entrega != null ? pedido.taxa_entrega : taxaEntregaAtual,
          forma_pagamento: 'pix',
          cliente: { nome, telefone, endereco: enderecoCompleto, bairro: bairroNome },
          itens: itensParaComprovante
        };
        localStorage.setItem('pedidoPixDetalhes', JSON.stringify(detalhesPix));
      } catch (e) {}
    }
    inscreverAcompanhamentoPedido(pedido.id);

    carrinho = [];
    salvarCarrinhoLocal();
    atualizarCartFab();

    if (formaPagamento === 'pix') {
      await gerarPixQR(pedido.total);
      atualizarVisibilidadeComprovante();
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
    const res = await fetch(`/api/config/pix/qrcode?valor=${valor}&_t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.qrcode) {
      pixPayloadAtual = data.payload || '';
      document.getElementById('pix-qr').innerHTML = `<img src="${data.qrcode}" alt="QR Code Pix">`;
      const keyEl = document.getElementById('pix-key');
      keyEl.textContent = data.chave;
      keyEl.style.display = 'none';
    } else {
      pixPayloadAtual = '';
      document.getElementById('pix-qr').innerHTML = '<p>Chave Pix não configurada</p>';
      const keyEl = document.getElementById('pix-key');
      keyEl.textContent = 'Configure a chave Pix no painel admin';
      keyEl.style.display = 'none';
    }
  } catch (e) {
    pixPayloadAtual = '';
    document.getElementById('pix-qr').innerHTML = '<p>Erro ao gerar QR Code</p>';
    const keyEl2 = document.getElementById('pix-key');
    if (keyEl2) keyEl2.style.display = 'none';
  }
}

function copiarPix() {
  const codigo = pixPayloadAtual || document.getElementById('pix-key').textContent;
  navigator.clipboard.writeText(codigo).then(() => mostrarToast('Código Pix copiado! Cole no app do seu banco')).catch(() => {});
}

function atualizarVisibilidadeComprovante() {
  const btn = document.getElementById('btn-enviar-comprovante');
  const btn2 = document.getElementById('btn-falar-loja');
  const dica = document.getElementById('pix-comprovante-dica');
  if (!btn) return;
  // Normaliza telefone removendo zeros à esquerda (ex: 0839... -> 839...)
  const telRaw = config && config.loja_telefone ? String(config.loja_telefone).trim() : '';
  const digits = telRaw.replace(/\D/g, '').replace(/^0+/, '');
  const temTelefone = digits.length >= 10;
  // Garante visibilidade mesmo se config ainda não carregou
  btn.style.display = 'inline-flex';
  if (btn2) btn2.style.display = 'inline-flex';
  if (dica) dica.style.display = 'block';
  if (!temTelefone) {
    btn.title = 'WhatsApp da loja não configurado — contate o estabelecimento';
    if (btn2) btn2.title = 'WhatsApp da loja não configurado';
    btn.style.opacity = '0.7';
    if (btn2) btn2.style.opacity = '0.7';
  } else {
    btn.title = '';
    if (btn2) btn2.title = '';
    btn.style.opacity = '1';
    if (btn2) btn2.style.opacity = '1';
  }
}

function enviarComprovantePix() {
  const telRaw = config && config.loja_telefone ? String(config.loja_telefone).trim() : '';
  if (!telRaw) {
    mostrarToast('WhatsApp da loja não configurado. Contate o estabelecimento.');
    return;
  }
  let digits = telRaw.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 10) {
    mostrarToast('Telefone da loja inválido');
    return;
  }
  let num = digits;
  if (digits.length === 10 || digits.length === 11) num = '55' + digits;

  let detalhes = null;
  try { detalhes = JSON.parse(localStorage.getItem('pedidoPixDetalhes') || 'null'); } catch (e) {}
  if (!detalhes) {
    try {
      const pend = JSON.parse(localStorage.getItem('pedidoAguardando') || 'null');
      if (pend && pend.id) detalhes = { id: pend.id, total: pend.total, itens: [], cliente: { nome: document.getElementById('cli-nome').value.trim(), telefone: document.getElementById('cli-telefone').value.trim(), endereco: '', bairro: '' } };
    } catch (e) {}
  }
  if (!detalhes || !detalhes.id) {
    const pid = localStorage.getItem('ultimoPedidoId');
    if (pid) detalhes = { id: parseInt(pid), total: 0, itens: [], cliente: { nome: '', telefone: '' } };
  }
  if (!detalhes || !detalhes.id) {
    mostrarToast('Pedido não encontrado para envio do comprovante');
    return;
  }

  const lojaNome = config.loja_nome || 'Loja';
  let raw = `Olá ${lojaNome}! Acabei de pagar via Pix e estou enviando o comprovante.\n\n`;
  raw += `*Pedido #${detalhes.id}*\n`;
  if (detalhes.itens && detalhes.itens.length) {
    raw += `*Itens:*\n`;
    detalhes.itens.forEach(it => {
      const qtd = it.unidade === 'kg' ? formatarPeso(Number(it.quantidade)) : `${it.quantidade}x`;
      raw += `• ${qtd} ${it.produto_nome} - R$ ${(Number(it.preco_unitario) * Number(it.quantidade)).toFixed(2)}\n`;
      if (it.adicionais && it.adicionais.length) {
        it.adicionais.forEach(a => {
          const nomeAd = a.nome || a.adicional_nome || '';
          raw += `  + ${nomeAd} (R$ ${Number(a.preco).toFixed(2)})\n`;
        });
      }
      if (it.observacao) raw += `  Obs: ${it.observacao}\n`;
    });
  }
  if (detalhes.total) raw += `\n*Total: R$ ${Number(detalhes.total).toFixed(2)}*\n`;
  if (detalhes.taxa_entrega && Number(detalhes.taxa_entrega) > 0) raw += `Taxa entrega: R$ ${Number(detalhes.taxa_entrega).toFixed(2)}\n`;
  if (detalhes.cliente) {
    const c = detalhes.cliente;
    if (c.nome || c.telefone) raw += `\n*Cliente:* ${c.nome || ''}${c.telefone ? ' - ' + c.telefone : ''}\n`;
    if (c.endereco) raw += `Endereço: ${c.endereco}${c.bairro ? ' - ' + c.bairro : ''}\n`;
  }
  raw += `\n*Forma de pagamento:* Pix\n`;
  raw += `\n_Anexo o comprovante nesta conversa para confirmação_ 🙏`;

  const url = `https://wa.me/${num}?text=${encodeURIComponent(raw)}`;
  window.open(url, '_blank', 'noopener');
}

function novoPedido() {
  mostrarPagina('page-cardapio');
}

function acompanharPedido() {
  let tel = document.getElementById('cli-telefone').value.trim();
  if (!tel && clienteLogado && clienteLogado.telefone) tel = clienteLogado.telefone;
  if (tel) document.getElementById('acomp-telefone').value = tel;
  mostrarPagina('page-acompanhar');
  if (tel) buscarPedidos();
  else if (clienteLogado && clienteLogado.telefone) buscarPedidos();
}

let meusPedidosCache = [];
let pedidosStatusUnsubs = [];

function limparInscricoesPedidos() {
  pedidosStatusUnsubs.forEach(unsub => { try { unsub(); } catch (e) {} });
  pedidosStatusUnsubs = [];
}

const PEDIDO_STATUS_LABELS = { recebido: 'Recebido', em_preparo: 'Em preparo', saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado' };

function atualizarStatusPedidoVisual(pedidoId, novoStatus) {
  const p = meusPedidosCache.find(x => String(x.id) === String(pedidoId));
  if (p) p.status = novoStatus;
  const detail = document.querySelector(`.pedido-detail[data-pedido-id="${pedidoId}"]`);
  const badge = detail?.querySelector('.status-badge');
  if (badge) {
    badge.textContent = PEDIDO_STATUS_LABELS[novoStatus] || novoStatus;
    badge.className = `status-badge status-${novoStatus}`;
  }
}

function inscreverStatusPedidos(pedidos) {
  if (!window.Realtime || !window.Realtime.subscribePedidoStatus) return;
  limparInscricoesPedidos();
  pedidos.forEach(p => {
    pedidosStatusUnsubs.push(window.Realtime.subscribePedidoStatus(p.id, (data) => {
      if (!data.status) return;
      const eraAntigo = p.status;
      atualizarStatusPedidoVisual(p.id, data.status);
      p.status = data.status;
      if (eraAntigo !== data.status) {
        mostrarToast(`Pedido #${p.id}: ${PEDIDO_STATUS_LABELS[data.status] || data.status}`);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Pedido atualizado!', { body: `Pedido #${p.id}: ${PEDIDO_STATUS_LABELS[data.status] || data.status}` });
        }
      }
    }));
  });
}

async function buscarPedidos() {
  let telefone = document.getElementById('acomp-telefone').value.trim();
  if (!telefone && clienteLogado && clienteLogado.telefone) telefone = clienteLogado.telefone;
  if (!telefone) { mostrarToast('Informe seu telefone'); return; }
  document.getElementById('acomp-telefone').value = telefone;

  try {
    const pedRes = await fetch(`/api/clientes/telefone/${encodeURIComponent(telefone)}/pedidos`);
    if (!pedRes.ok) throw new Error('erro');
    const pedidos = await pedRes.json();
    meusPedidosCache = pedidos;

    if (!pedidos.length) {
      limparInscricoesPedidos();
      document.getElementById('meus-pedidos').innerHTML = '<div class="empty-state"><p>Nenhum pedido encontrado</p></div>';
      return;
    }

    const payLabels = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão (na entrega)' };

    document.getElementById('meus-pedidos').innerHTML = pedidos.map(p => `
      <details class="pedido-detail" data-pedido-id="${p.id}" style="margin-bottom:12px">
        <summary class="cart-item" style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <div class="cart-item-name">Pedido #${p.id}</div>
            <div class="cart-item-details">${new Date(p.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span class="status-badge status-${p.status}">${PEDIDO_STATUS_LABELS[p.status] || p.status}</span>
            <div class="cart-item-price">R$ ${p.total.toFixed(2)}</div>
          </div>
        </summary>
        <div class="pedido-detail-content" id="pedido-detail-${p.id}" style="padding-top:12px;border-top:1px solid var(--light);margin-top:8px">
          <div class="carregando" style="text-align:center;padding:16px;color:var(--gray)">Carregando detalhes...</div>
        </div>
      </details>
    `).join('');

    inscreverStatusPedidos(pedidos);

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
      const qtdTexto = item.unidade === 'kg' ? formatarPeso(Number(item.quantidade)) : `${item.quantidade}x`;
      let line = `<div class="pedido-item-line">${qtdTexto} ${escapeHtml(item.produto_nome)} - R$ ${(item.preco_unitario * item.quantidade).toFixed(2)}</div>`;
      if (item.adicionais && item.adicionais.length) {
        line += item.adicionais.map(a => {
          let prefix = '+ ';
          if (a.tipo && a.tipo !== 'adicional') prefix = `[${a.tipo.toUpperCase()}] `;
          return `<div class="pedido-item-adicional">${prefix}${escapeHtml(a.adicional_nome || a.nome)} (R$ ${a.preco.toFixed(2)})</div>`;
        }).join('');
      }
      if (item.observacao) line += `<div class="pedido-item-adicional">Obs: ${escapeHtml(item.observacao)}</div>`;
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

    const isRetirada = p.bairro_entrega === 'Retirada no local' || (p.endereco_entrega && String(p.endereco_entrega).startsWith('Retirada'));
    const lojaEnd = config.loja_endereco || '';
    const lojaEndHtml = isRetirada ? `
      <div class="pedido-detalhe-section" style="margin-top:12px;background:#E8F5E9;border:1px solid #A5D6A7;border-radius:8px;padding:12px">
        <div style="font-weight:700;margin-bottom:6px">🏠 Retirada no local</div>
        <div style="font-size:0.85rem;line-height:1.4">${escapeHtml(lojaEnd || 'Endereço da loja não configurado')}</div>
        ${lojaEnd ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lojaEnd)}" target="_blank" class="btn btn-outline btn-sm" style="margin-top:8px;display:inline-flex;align-items:center;gap:6px">📍 Abrir no Google Maps</a>` : ''}
      </div>
    ` : '';
    const enderecoHtml = isRetirada ? lojaEndHtml : (p.endereco_entrega ? `<div class="pedido-detalhe-row" style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.85rem"><span>Endereço:</span><span>${escapeHtml(p.endereco_entrega)} - ${escapeHtml(p.bairro_entrega)}</span></div>` : '');
    const solicitarEntregaBtn = isRetirada && !['entregue','cancelado'].includes(p.status) ? `<button class="btn btn-warning btn-sm" onclick="solicitarEntrega(${p.id})">🚚 Solicitar entrega</button>` : '';
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
        ${enderecoHtml}
        ${trocoHtml}
        ${p.observacoes && !p.observacoes.includes('Troco para') ? `<div class="pedido-detalhe-row" style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.85rem"><span>Observações:</span><span>${p.observacoes.replace(' | Troco para R$', '').replace(/Troco para R\$ [\d.,]+/,'').trim()}</span></div>` : ''}
        <div class="pedido-detalhe-row" style="display:flex;justify-content:space-between;padding:8px 0;font-size:0.95rem;font-weight:700;border-top:1px solid var(--light);margin-top:8px">
          <span>Total</span><span style="color:var(--primary)">R$ ${p.total.toFixed(2)}</span>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="refazerPedido(${p.id})">Refazer pedido</button>
        ${solicitarEntregaBtn}
        <button class="btn btn-outline btn-sm" onclick="fecharDetalhe('pedido-detail-${p.id}')">Fechar</button>
      </div>
    `;
  } catch (e) {
    container.innerHTML = '<div class="empty-state" style="padding:16px"><p>Erro ao carregar detalhes</p></div>';
  }
}

function solicitarEntrega(pedidoId) {
  const p = meusPedidosCache.find(x => String(x.id) === String(pedidoId));
  if (!p) return;
  // dispara solicitação em segundo plano sem bloquear gesto do usuário (evita bloqueio de popup no celular)
  fetch(`/api/pedidos/${pedidoId}/solicitar-entrega`, { method: 'PUT', headers: { 'Content-Type': 'application/json' } }).catch(()=>{}).then(()=> setTimeout(() => buscarPedidos(), 800));
  let lojaTel = (config && config.loja_telefone ? String(config.loja_telefone) : '').replace(/\D/g, '');
  if (!lojaTel) {
    // tenta buscar telefone fresco se config ainda não carregou
    fetch('/api/config/public').then(r=>r.json()).then(cfg=>{
      if (cfg.loja_telefone) config.loja_telefone = cfg.loja_telefone;
    }).catch(()=>{});
  }
  const tel = lojaTel ? (lojaTel.startsWith('55') ? lojaTel : '55' + lojaTel) : '';
  if (!tel) {
    mostrarToast('Telefone da loja não configurado em Configurações → Dados da Loja');
    // ainda abre WhatsApp genérico para não travar
  }
  let cliEnd = '';
  const c = clienteLogado;
  if (c) {
    if (c.rua) cliEnd += c.rua;
    if (c.numero) cliEnd += `, ${c.numero}`;
    if (c.complemento) cliEnd += ` - ${c.complemento}`;
    if (c.bairro) cliEnd += ` - ${c.bairro}`;
    if (c.ponto_referencia) cliEnd += ` (Ref: ${c.ponto_referencia})`;
  }
  if (!cliEnd) cliEnd = p.endereco_entrega && !String(p.endereco_entrega).startsWith('Retirada') ? `${p.endereco_entrega} - ${p.bairro_entrega}` : 'endereço cadastrado (atualize em Minha Conta)';
  const msg = `Olá! Pedido #${p.id} (Retirada no local) - gostaria de solicitar entrega.\nMeu endereço: ${cliEnd}\nTotal atual: R$ ${Number(p.total).toFixed(2)}\nAguardo confirmação da taxa de entrega.`;
  const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  // abertura síncrona via anchor para funcionar no celular (iOS/Android bloqueiam window.open após await)
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=> a.remove(), 500);
  mostrarToast('Solicitação enviada! Aguarde o PDV confirmar.');
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
        select.innerHTML += `<option value="${b.id}" data-taxa="${b.taxa_entrega}">${escapeHtml(b.nome)} - R$ ${b.taxa_entrega.toFixed(2)}</option>`;
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
    if (!res.ok) {
      let msg = 'Cliente não encontrado';
      try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) {}
      mostrarErroCad(msg);
      return;
    }
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
  const a = document.getElementById('cadastro-logged-out'); if (a) a.style.display = 'block';
  const b = document.getElementById('cadastro-logged-in'); if (b) b.style.display = 'none';
  const c = document.getElementById('cad-tab-cadastrar'); if (c) c.style.display = 'block';
  const d = document.getElementById('cad-tab-entrar'); if (d) d.style.display = 'block';
  const e = document.querySelector('.cadastro-tabs'); if (e) e.style.display = 'flex';
  const f = document.getElementById('cad-error'); if (f) f.textContent = '';
  try { if (typeof mostrarToast === 'function') mostrarToast('Saiu da conta'); } catch (_) {}
  try { if (window.V2 && V2.sairConta && V2._inside !== true) { /* evita loop */ } } catch (_) {}
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
  if (clienteLogado.numero) end += `, ${escapeHtml(clienteLogado.numero)}`;
  if (clienteLogado.complemento) end += ` - ${escapeHtml(clienteLogado.complemento)}`;
  if (clienteLogado.bairro) end += ` - ${escapeHtml(clienteLogado.bairro)}`;
  if (clienteLogado.ponto_referencia) end += ` (${escapeHtml(clienteLogado.ponto_referencia)})`;
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
    const res = await fetch(`/api/clientes/by-telefone/${encodeURIComponent(clienteLogado.telefone)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, telefone, rua, numero, bairro, complemento, ponto_referencia: referencia })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { mostrarToast(data.error || 'Erro ao salvar'); return; }
    const updated = data && data.telefone ? data : { ...clienteLogado, nome, telefone, rua, numero, bairro, complemento, ponto_referencia: referencia };
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


