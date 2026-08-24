// ============================================
// PIZZA MODAL - Montar sua Pizza
// Fluxo: tipo -> tamanho -> sabores -> extras
// Usado pelo cardapio do cliente (app.js) e painel do garcom (garcom.js)
// O item entra no carrinho/comanda como o produto real do tamanho escolhido
// ============================================

(function () {
  'use strict';

  let cfg = null;           // { produtos, onAdd, toast }
  let tipoId = null;        // categoria_id do tipo escolhido
  let tamanhoId = null;     // produto_id do tamanho escolhido
  let quantidade = 1;
  const saboresSel = new Set();
  const extrasSel = new Map(); // id -> adicional

  function isPizza(p) {
    return !!(p && p.categoria_nome && p.categoria_nome.toLowerCase().includes('pizza'));
  }

  function tamanhoDe(nome) {
    const m = (nome || '').trim().match(/\s([PMGF])$/i);
    return m ? m[1].toUpperCase() : '';
  }

  function limiteSabores(produto) {
    if (!produto) return 3;
    const config = parseInt(produto.limite_sabores) || 0;
    if (config > 0) return config;
    const tam = tamanhoDe(produto.nome);
    return tam === 'P' ? 1 : tam === 'F' ? 3 : 2;
  }

  function categoriasPizza() {
    const vistos = new Set();
    const cats = [];
    (cfg?.produtos || []).forEach(p => {
      if (isPizza(p) && !vistos.has(p.categoria_id)) {
        vistos.add(p.categoria_id);
        cats.push({ id: p.categoria_id, nome: p.categoria_nome });
      }
    });
    return cats;
  }

  // CSS proprio injetado (garante estilo no cliente e no garcom)
  function injetarCss() {
    if (document.getElementById('pm-style')) return;
    const style = document.createElement('style');
    style.id = 'pm-style';
    style.textContent = `
      .pm-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:9999; align-items:center; justify-content:center; padding:16px; }
      .pm-overlay.active { display:flex; }
      .pm-modal { background:#fff; border-radius:16px; width:100%; max-width:520px; max-height:92vh; overflow-y:auto; }
      .pm-header { position:sticky; top:0; background:#fff; padding:16px 20px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; z-index:2; }
      .pm-header h3 { margin:0; font-size:1.1rem; color:#1a1a1a; }
      .pm-close { background:none; border:none; font-size:26px; cursor:pointer; color:#888; line-height:1; }
      .pm-body { padding:16px 20px 20px; }
      .pm-step-label { font-size:.8rem; color:#777; margin:14px 0 8px; text-transform:uppercase; letter-spacing:.4px; }
      .pm-chips { display:flex; flex-wrap:wrap; gap:8px; }
      .pm-chip { padding:10px 14px; border-radius:24px; border:1.5px solid #ddd; background:#fff; cursor:pointer; font-size:.9rem; transition:all .15s; }
      .pm-chip:hover { border-color:#e05a2b; }
      .pm-chip.selected { background:#fdeee7; border-color:#e05a2b; color:#c74a1d; font-weight:600; }
      .pm-tamanhos { display:grid; grid-template-columns:repeat(auto-fill,minmax(105px,1fr)); gap:8px; }
      .pm-tam { padding:12px 8px; border-radius:12px; border:1.5px solid #ddd; background:#fff; cursor:pointer; text-align:center; transition:all .15s; }
      .pm-tam:hover { border-color:#e05a2b; }
      .pm-tam.selected { background:#fdeee7; border-color:#e05a2b; }
      .pm-tam-letra { font-size:1.3rem; font-weight:700; color:#1a1a1a; }
      .pm-tam-preco { font-size:.82rem; color:#666; margin-top:2px; }
      .pm-item { display:flex; justify-content:space-between; align-items:center; padding:9px 4px; border-bottom:1px solid #f2f2f2; cursor:pointer; }
      .pm-item:last-child { border-bottom:none; }
      .pm-item label { display:flex; align-items:center; gap:10px; cursor:pointer; flex:1; }
      .pm-item input { width:18px; height:18px; accent-color:#e05a2b; }
      .pm-preco-adic { font-size:.85rem; color:#666; white-space:nowrap; }
      .pm-qty-row { display:flex; align-items:center; gap:14px; margin-top:6px; }
      .pm-qty-btn { width:38px; height:38px; border-radius:10px; border:1.5px solid #ddd; background:#fff; font-size:1.2rem; cursor:pointer; }
      .pm-qty-val { font-size:1.15rem; font-weight:700; min-width:26px; text-align:center; }
      .pm-footer { position:sticky; bottom:0; background:#fff; padding:12px 20px; border-top:1px solid #eee; display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .pm-total { font-size:1.05rem; font-weight:700; color:#1a1a1a; }
      .pm-add-btn { background:#e05a2b; color:#fff; border:none; border-radius:10px; padding:12px 22px; font-size:.95rem; font-weight:600; cursor:pointer; }
      .pm-add-btn:disabled { opacity:.5; cursor:not-allowed; }
      .pm-vazio { color:#999; text-align:center; padding:14px 0; font-size:.9rem; }
      textarea.pm-obs { width:100%; box-sizing:border-box; border:1.5px solid #ddd; border-radius:10px; padding:10px; font-family:inherit; font-size:.9rem; resize:vertical; min-height:56px; }

      /* Responsivo: bottom sheet no celular, centralizado e amplo no desktop */
      @media (max-width: 767px) {
        .pm-overlay { align-items: flex-end; padding: 0; }
        .pm-modal { border-radius: 16px 16px 0 0; max-height: 92vh; }
        .pm-tamanhos { grid-template-columns: repeat(4, 1fr); }
      }
      @media (max-width: 479px) {
        .pm-chip { padding: 9px 12px; font-size: .85rem; }
        .pm-header { padding: 14px 16px; }
        .pm-body { padding: 14px 16px 18px; }
        .pm-footer { padding: 10px 16px; }
      }
      @media (min-width: 768px) {
        .pm-modal { max-width: 600px; }
        .pm-add-btn { min-width: 180px; }
      }
      @media (min-width: 1024px) {
        .pm-modal { max-width: 640px; }
      }
    `;
    document.head.appendChild(style);
  }

  function produtosDoTipo(catId) {
    return (cfg.produtos || []).filter(p => p.categoria_id === catId);
  }

  function produtoTamanho() {
    return produtosDoTipo(tipoId).find(p => p.id === tamanhoId) || null;
  }

  function saboresDoTipo() {
    const prods = produtosDoTipo(tipoId);
    const porId = new Map();
    prods.forEach(p => (p.adicionais || []).forEach(a => {
      if (a.tipo === 'sabor' && a.ativo !== false) porId.set(a.id, a);
    }));
    return [...porId.values()];
  }

  function extrasDoTamanho() {
    const p = produtoTamanho();
    if (!p) return [];
    return (p.adicionais || []).filter(a => ['adicional', 'borda'].includes(a.tipo));
  }

  function totalAtual() {
    const prod = produtoTamanho();
    if (!prod) return 0;
    let total = prod.preco * quantidade;
    extrasSel.forEach(a => { total += a.preco * quantidade; });
    return total;
  }

  function renderCorpo() {
    const cats = categoriasPizza();
    const prod = produtoTamanho();
    const lim = prod ? limiteSabores(prod) : null;

    const tipoNome = (cats.find(c => c.id === tipoId) || {}).nome || '';

    let html = `
      <div class="pm-step-label">1. Tipo da pizza</div>
      <div class="pm-chips">
        ${cats.map(c => `<button class="pm-chip ${tipoId === c.id ? 'selected' : ''}" onclick="PizzaModal._selTipo(${c.id})">${c.nome}</button>`).join('')}
      </div>
    `;

    if (tipoId) {
      html += `<div class="pm-step-label">2. Tamanho</div><div class="pm-tamanhos">`;
      produtosDoTipo(tipoId).forEach(p => {
        html += `
          <div class="pm-tam ${tamanhoId === p.id ? 'selected' : ''}" onclick="PizzaModal._selTamanho(${p.id})">
            <div class="pm-tam-letra">${tamanhoDe(p.nome) || '&#127869;'}</div>
            <div class="pm-tam-preco">R$ ${p.preco.toFixed(2)}</div>
          </div>`;
      });
      html += `</div>`;
    }

    if (prod) {
      const sabores = saboresDoTipo();
      html += `<div class="pm-step-label">3. Sabores${lim ? ` (máx: ${lim})` : ''} — ${tipoNome}</div>`;
      if (sabores.length) {
        html += sabores.map(a => `
          <div class="pm-item">
            <label onclick="event.stopPropagation()">
              <input type="checkbox" ${saboresSel.has(a.id) ? 'checked' : ''} onchange="PizzaModal._selSabor(${a.id}, this)">
              <span>${a.nome}</span>
            </label>
            <span class="pm-preco-adic">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
          </div>`).join('');
      } else {
        html += `<div class="pm-vazio">Nenhum sabor cadastrado para este tipo</div>`;
      }

      const extras = extrasDoTamanho();
      const bordas = extras.filter(a => a.tipo === 'borda');
      const adicionaisExtras = extras.filter(a => a.tipo !== 'borda');
      let passo = 4;

      if (bordas.length) {
        html += `<div class="pm-step-label">${passo++}. Borda Recheada</div>`;
        html += bordas.map(a => `
          <div class="pm-item">
            <label onclick="event.stopPropagation()">
              <input type="checkbox" ${extrasSel.has(a.id) ? 'checked' : ''} onchange="PizzaModal._selExtra(${a.id}, this)">
              <span>🧀 ${a.nome}</span>
            </label>
            <span class="pm-preco-adic">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
          </div>`).join('');
      }

      if (adicionaisExtras.length) {
        html += `<div class="pm-step-label">${passo++}. Adicionais</div>`;
        html += adicionaisExtras.map(a => `
          <div class="pm-item">
            <label onclick="event.stopPropagation()">
              <input type="checkbox" ${extrasSel.has(a.id) ? 'checked' : ''} onchange="PizzaModal._selExtra(${a.id}, this)">
              <span>${a.nome}</span>
            </label>
            <span class="pm-preco-adic">${a.preco > 0 ? '+ R$ ' + a.preco.toFixed(2) : 'Incluído'}</span>
          </div>`).join('');
      }

      html += `
        <div class="pm-step-label">Quantidade</div>
        <div class="pm-qty-row">
          <button class="pm-qty-btn" onclick="PizzaModal._qtd(-1)">−</button>
          <span class="pm-qty-val">${quantidade}</span>
          <button class="pm-qty-btn" onclick="PizzaModal._qtd(1)">+</button>
        </div>
        <div class="pm-step-label">Observação (opcional)</div>
        <textarea class="pm-obs" id="pm-obs" placeholder="Ex.: bem assada, cebola à parte..."></textarea>
      `;
    }

    document.getElementById('pm-corpo').innerHTML = html;
    atualizarRodape();
  }

  function atualizarRodape() {
    const btn = document.getElementById('pm-btn-add');
    const totalEl = document.getElementById('pm-total');
    const pronto = !!(produtoTamanho());
    btn.disabled = !pronto;
    totalEl.textContent = 'R$ ' + totalAtual().toFixed(2);
  }

  function abrir(config) {
    cfg = config;
    tipoId = null;
    tamanhoId = null;
    quantidade = 1;
    saboresSel.clear();
    extrasSel.clear();

    injetarCss();
    if (!document.getElementById('pm-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'pm-overlay';
      overlay.className = 'pm-overlay';
      overlay.innerHTML = `
        <div class="pm-modal">
          <div class="pm-header">
            <h3>🍕 Montar sua Pizza</h3>
            <button class="pm-close" onclick="PizzaModal.fechar()">&times;</button>
          </div>
          <div class="pm-body" id="pm-corpo"></div>
          <div class="pm-footer">
            <span class="pm-total" id="pm-total">R$ 0.00</span>
            <button class="pm-add-btn" id="pm-btn-add" onclick="PizzaModal._adicionar()">Adicionar</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });
    }
    renderCorpo();
    document.getElementById('pm-overlay').classList.add('active');
  }

  function fechar() {
    const el = document.getElementById('pm-overlay');
    if (el) el.classList.remove('active');
  }

  function aplicarLimiteSabores() {
    const prod = produtoTamanho();
    if (!prod) return;
    const base = limiteSabores(prod);
    const max = base * Math.max(1, quantidade);
    // Remover excesso se o limite diminuiu
    while (saboresSel.size > max) {
      saboresSel.delete(saboresSel.values().next().value);
    }
    renderCorpo();
  }

  window.PizzaModal = {
    isPizza,
    abrir,
    fechar,
    cardHtml(contexto) {
      // Preco minimo entre as pizzas para exibir como os outros cards
      const pizzas = ((window.__pizzaCfg && window.__pizzaCfg.produtos) || []).filter(p => this.isPizza(p));
      const minPreco = pizzas.length ? Math.min(...pizzas.map(p => parseFloat(p.preco) || 0)) : null;
      const precoTxt = minPreco ? `A partir de R$ ${minPreco.toFixed(2)}` : '';

      if (contexto === 'garcom') {
        return `
          <div class="g-produto-card" onclick="PizzaModal.abrir(window.__pizzaCfg)">
            <div class="g-produto-placeholder">&#127829;</div>
            <div class="g-produto-info">
              <div class="g-produto-text">
                <div class="g-produto-nome">Montar sua Pizza</div>
                <div class="g-produto-desc">Tipo, tamanho e sabores</div>
                ${precoTxt ? `<div class="g-produto-preco">${precoTxt}</div>` : ''}
              </div>
              <button class="g-produto-add-icon">+</button>
            </div>
          </div>`;
      }
      return `
        <div class="product-card" onclick="PizzaModal.abrir(window.__pizzaCfg)">
          <div class="product-media">
            <div class="product-img-placeholder">&#127829;</div>
          </div>
          <div class="product-info">
            <div>
              <div class="product-name">Montar sua Pizza</div>
              <div class="product-desc">Escolha o tipo, o tamanho e os sabores</div>
            </div>
            <div class="product-footer">
              ${precoTxt ? `<span class="product-price" style="font-size:var(--text-base)">${precoTxt}</span>` : ''}
              <button class="btn-add" onclick="event.stopPropagation(); PizzaModal.abrir(window.__pizzaCfg)" aria-label="Montar pizza">+</button>
            </div>
          </div>
        </div>`;
    },
    _selTipo(id) {
      if (tipoId !== id) { tamanhoId = null; saboresSel.clear(); extrasSel.clear(); }
      tipoId = id;
      renderCorpo();
    },
    _selTamanho(id) {
      if (tamanhoId !== id) { saboresSel.clear(); extrasSel.clear(); }
      tamanhoId = id;
      renderCorpo();
    },
    _selSabor(id, cb) {
      const prod = produtoTamanho();
      const max = limiteSabores(prod) * Math.max(1, quantidade);
      if (cb.checked) {
        if (saboresSel.size >= max) {
          cb.checked = false;
          (cfg.toast || (() => {}))(`Máximo ${max} sabor(es) para esta pizza`);
          return;
        }
        saboresSel.add(id);
      } else {
        saboresSel.delete(id);
      }
    },
    _selExtra(id, cb) {
      const extra = extrasDoTamanho().find(a => a.id === id);
      if (!extra) return;
      if (cb.checked) extrasSel.set(id, extra);
      else extrasSel.delete(id);
      atualizarRodape();
    },
    _qtd(delta) {
      quantidade = Math.max(1, quantidade + delta);
      aplicarLimiteSabores();
    },
    _adicionar() {
      const prod = produtoTamanho();
      if (!prod) return;

      const adicionais = [];
      const todosPorId = new Map();
      produtosDoTipo(tipoId).forEach(p => (p.adicionais || []).forEach(a => todosPorId.set(a.id, a)));
      saboresSel.forEach(id => {
        const a = todosPorId.get(id);
        if (a) adicionais.push({ id: a.id, nome: a.nome, preco: parseFloat(a.preco) || 0, tipo: 'sabor' });
      });
      extrasSel.forEach(a => adicionais.push({ id: a.id, nome: a.nome, preco: parseFloat(a.preco) || 0, tipo: a.tipo }));

      const obs = (document.getElementById('pm-obs')?.value || '').trim();

      const item = {
        produto_id: prod.id,
        produto_nome: prod.nome,
        preco_unitario: parseFloat(prod.preco),
        quantidade,
        unidade: 'un',
        observacao: obs,
        adicionais
      };

      fechar();
      cfg.onAdd(item);
    }
  };
})();
