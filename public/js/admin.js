let allClientes = [];
let usuarioLogado = null;
let realtimeUnsubscribes = [];
let pedidosNovos = new Set(); // ids de pedidos marcados como NOVO (60s)
let notificacaoCount = 0;
let adicionalEmEdicao = null;
let adicionaisAdmin = [];
let categoriasAdmin = [];
let produtosAdmin = [];
let categoriasAdicionaisSelecionadas = [];
let produtosAdicionaisSelecionadas = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!verificarAuth('admin')) {
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
  carregarSomPrefs();
  carregarLojaStatus();
  
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
        showToast(`Novo pedido recebido! #${pedido.id} - ${pedido.cliente_nome || ''}`, 'success', '🔔');
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
        showToast(`Garçom adicionou ${data.quantidade}x ${data.produto_nome} na Mesa ${data.mesaId}`, 'info', '📝');
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
    const res = await authFetch(url);
    todosPedidos = await res.json();
    const ativos = todosPedidos.filter(p => !['entregue', 'cancelado'].includes(p.status));
    document.getElementById('pedidos-count').textContent = ativos.length;
    filtrarPedidosPorTab();
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
  renderPedidos(filtrados);
}

const statusLabels = { recebido: 'Recebido', em_preparo: 'Em preparo', saiu_entrega: 'Saiu p/ entrega', entregue: 'Entregue', cancelado: 'Cancelado' };
const payLabels = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', mesa: 'Mesa (pagar na conta)' };
const nextStatus = { recebido: 'em_preparo', em_preparo: 'saiu_entrega', saiu_entrega: 'entregue' };
const nextLabels = { recebido: 'Preparar', em_preparo: 'Enviar', saiu_entrega: 'Entregar' };

function renderPedidos(pedidos) {
  const container = document.getElementById('pedidos-list');
  if (!pedidos.length) { container.innerHTML = '<p style="text-align:center;color:var(--gray);padding:40px">Nenhum pedido encontrado</p>'; return; }

  // Separar pedidos avulsos (sem mesa_id) de pedidos de mesa
  const avulsos = pedidos.filter(p => !p.mesa_id);
  const deMesa = pedidos.filter(p => p.mesa_id);

  // Agrupar pedidos de mesa por comanda_id
  const gruposComanda = {};
  deMesa.forEach(p => {
    const chave = p.comanda_id || `mesa-${p.mesa_id}`;
    if (!gruposComanda[chave]) gruposComanda[chave] = [];
    gruposComanda[chave].push(p);
  });

  // Renderizar avulsos como cards simples
  let html = '';
  avulsos.forEach(p => { html += renderPedidoCard(p); });

  // Renderizar grupos de mesa
  Object.keys(gruposComanda).forEach(chave => {
    const grupo = gruposComanda[chave];
    if (grupo.length === 1) {
      // 1 pedido: card simples
      html += renderPedidoCard(grupo[0]);
    } else {
      // 2+ pedidos: agrupar em wrapper
      const mesaId = grupo[0].mesa_id;
      const comandaId = grupo[0].comanda_id;
      let totalGrupo = 0;
      grupo.forEach(p => { totalGrupo += p.total; });

      html += `
        <div class="pedido-grupo">
          <div class="pedido-grupo-header">Mesa ${mesaId} — Comanda #${comandaId}</div>
          <div class="pedido-grupo-body">
            ${grupo.map(p => renderPedidoCard(p)).join('')}
          </div>
          <div class="pedido-grupo-footer">
            <span>Total a cobrar (Mesa ${mesaId}):</span>
            <span>R$ ${totalGrupo.toFixed(2)}</span>
          </div>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

function renderPedidoCard(p) {
  const isNovo = pedidosNovos.has(p.id);
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
  const itensHtml = p.itens.map(i => {
    const isItemNovo = isNovo && (() => {
      try {
        const it = new Date(i.criado_em).getTime();
        if (isNewPedido) return true;
        return (maxItemTime - it) < 5000;
      } catch(e){ return false; }
    })();
    const lineClass = isItemNovo ? 'pedido-item-line pedido-item-line--novo' : 'pedido-item-line';
    const badgeItemNovo = isItemNovo ? `<span class="badge-item-novo">NOVO</span>` : '';
    let line = `<div class="${lineClass}" ${isItemNovo ? `data-item-id="${i.id}" onclick="marcarItemLido(event, ${p.id}, ${i.id})" style="cursor:pointer" title="Clique para marcar item como lido"` : ''}><span>${i.quantidade}x ${i.produto_nome} ${badgeItemNovo}</span><span>R$ ${(i.preco_unitario * i.quantidade).toFixed(2)}</span></div>`;
    if (i.adicionais && i.adicionais.length) {
      line += i.adicionais.map(a => `<div class="pedido-item-adicional">+ ${a.adicional_nome} (R$ ${a.preco.toFixed(2)})</div>`).join('');
    }
    if (i.observacao) line += `<div class="pedido-item-adicional">Obs: ${i.observacao}</div>`;
    return line;
  }).join('');

  const pixHtml = p.forma_pagamento === 'pix'
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
  }
  if (p.status !== 'cancelado' && p.status !== 'entregue') {
    actionsHtml.push(`<button class="btn btn-danger btn-xs" onclick="atualizarStatus(${p.id}, 'cancelado')">Cancelar</button>`);
  }
  if (p.forma_pagamento === 'pix' && !p.pix_confirmado) {
    actionsHtml.push(`<button class="btn btn-warning btn-xs" onclick="confirmarPix(${p.id})">Confirmar Pix</button>`);
  }
  actionsHtml.push(`<button class="btn btn-primary btn-xs" onclick="imprimirComanda(${p.id})">Imprimir</button>`);

  // Selecao de motoboy para pedidos de entrega (oculta para mesa e avulso do garçom)
  const ehAvulsoGarcom = p.bairro_entrega === 'Avulso' || (p.observacoes && p.observacoes.includes('AVULSO'));
  const motoboySelect = !p.mesa_id && !ehAvulsoGarcom && p.status !== 'cancelado' ? `
    <div style="margin-top: 8px;">
      <select class="filter-select" style="width:100%; font-size: 0.78rem; padding: 6px 8px;" onchange="atribuirMotoboy(${p.id}, this.value)">
        <option value="">🏍️ Motoboy não definido</option>
        ${motoboysLista.filter(m => m.ativo).map(m => `<option value="${m.id}" ${p.motoboy_id == m.id ? 'selected' : ''}>${m.nome}</option>`).join('')}
      </select>
      ${p.motoboy_nome && !motoboysLista.some(m => m.id == p.motoboy_id && m.ativo) ? `<small style="color:var(--gray)">Entregou: ${p.motoboy_nome}</small>` : ''}
    </div>
  ` : '';

  const novoBadge = isNovo ? `<span class="badge-novo">🆕 NOVO • clique para marcar lido</span>` : '';
  const cardExtraClass = isNovo ? ' pedido-card--novo' : '';
  const mesaBadge = p.mesa_id ? `<span class="badge-mesa">Mesa ${p.mesa_id}</span>` : (p.bairro_entrega === 'Avulso' ? `<span class="badge-avulso">Avulso</span>` : '');

  return `
    <div class="pedido-card status-${p.status}${cardExtraClass}" data-pedido-id="${p.id}" onclick="marcarPedidoLido(${p.id})" style="${isNovo ? 'cursor:pointer' : ''}" title="${isNovo ? 'Clique para marcar como lido' : ''}">
      <div class="pedido-header">
        <span class="pedido-id">#${p.id} ${mesaBadge} ${novoBadge}</span>
        <span class="status-badge status-${p.status}">${statusLabels[p.status]}</span>
      </div>
      <div class="pedido-time">${new Date(p.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
      <div class="pedido-cliente">${p.cliente_nome}</div>
      <div class="pedido-tel">${p.cliente_telefone}</div>
      <div class="pedido-items">${itensHtml}</div>
      ${p.observacoes ? `<div class="pedido-obs">${p.observacoes}</div>` : ''}
      ${p.endereco_entrega ? `<div class="pedido-endereco">&#128205; ${p.endereco_entrega} - ${p.bairro_entrega}</div>` : ''}
      <div class="pedido-footer">
        <div>
          <div class="pedido-total">Total: R$ ${p.total.toFixed(2)}</div>
          <div class="pedido-payment">${payLabels[p.forma_pagamento] || p.forma_pagamento} ${pixHtml}</div>
          ${p.taxa_entrega > 0 ? `<div style="font-size:0.75rem;color:var(--gray)">Taxa: R$ ${p.taxa_entrega.toFixed(2)}</div>` : ''}
          ${trocoHtml}
        </div>
      </div>
      <div class="pedido-actions">${actionsHtml.join('')}</div>
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

  document.getElementById('motoboys-list').innerHTML = motoboysLista.length ? `<table>
    <thead><tr><th>Nome</th><th>Telefone</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${motoboysLista.map(m => `
      <tr style="${m.ativo ? '' : 'opacity:.55'}">
        <td><strong>${m.nome}</strong></td>
        <td>${m.telefone || '-'}</td>
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

async function atribuirMotoboy(pedidoId, motoboyId) {
  try {
    const res = await authFetch(`/api/pedidos/${pedidoId}/motoboy`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motoboy_id: motoboyId || null }) });
    await verificarResposta(res);
    showToast('Motoboy atualizado!');
  } catch (e) {
    showToast(e.message);
  }
}

async function carregarRelatorioMotoboys() {
  const periodo = document.getElementById('periodo-motoboys').value;
  const res = await authFetch(`/api/motoboys/resumo?periodo=${periodo}`);
  const resumo = await res.json();

  const totalEntregas = resumo.reduce((s, m) => s + Number(m.entregas), 0);
  const totalTaxas = resumo.reduce((s, m) => s + Number(m.total_taxas), 0);

  document.getElementById('motoboys-stats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${totalEntregas}</div><div class="stat-label">Entregas</div></div>
    <div class="stat-card"><div class="stat-value">R$ ${totalTaxas.toFixed(2)}</div><div class="stat-label">Total das taxas</div></div>
  `;

  document.getElementById('motoboys-resumo').innerHTML = resumo.length ? `<table>
    <thead><tr><th>Motoboy</th><th>Entregas</th><th>Total das taxas</th></tr></thead>
    <tbody>${resumo.map(m => `<tr><td><strong>${m.nome}</strong></td><td>${m.entregas}</td><td>R$ ${Number(m.total_taxas).toFixed(2)}</td></tr>`).join('')}</tbody>
    ${resumo.length > 1 ? `<tfoot><tr><td><strong>Total</strong></td><td><strong>${totalEntregas}</strong></td><td><strong>R$ ${totalTaxas.toFixed(2)}</strong></td></tr></tfoot>` : ''}
  </table>` : '<p style="color:var(--gray);text-align:center;padding:20px">Nenhuma entrega com motoboy no período</p>';
}

async function confirmarPix(id) {
  await authFetch(`/api/pedidos/${id}/pix`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmado: true }) });
  showToast('Pix confirmado!');
  carregarPedidos();
}

async function imprimirComanda(pedidoId) {
  try {
    const res = await authFetch(`/api/pedidos/${pedidoId}`);
    if (!res.ok) throw new Error('Pedido não encontrado');
    const p = await res.json();

    const dataHora = new Date(p.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const payLabel = payLabels[p.forma_pagamento] || p.forma_pagamento;
    const statusLabel = statusLabels[p.status] || p.status;

    let itensHtml = '';
    let subtotal = 0;
    p.itens.forEach(item => {
      const itemTotal = item.preco_unitario * item.quantidade;
      subtotal += itemTotal;
      itensHtml += `<tr><td class="qty">${item.quantidade}x</td><td class="nome">${item.produto_nome}</td><td class="val">R$ ${itemTotal.toFixed(2)}</td></tr>`;
      if (item.adicionais && item.adicionais.length) {
        item.adicionais.forEach(a => {
          itensHtml += `<tr class="adic"><td></td><td>+ ${a.adicional_nome}</td><td class="val">R$ ${(a.preco * item.quantidade).toFixed(2)}</td></tr>`;
        });
      }
      if (item.observacao) {
        itensHtml += `<tr class="obs"><td></td><td colspan="2">» ${item.observacao}</td></tr>`;
      }
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
    if (p.forma_pagamento === 'dinheiro') {
      obsPedido = obsPedido.replace(/\s*\|\s*Troco para R\$ [\d.,]+/, '').trim();
    }

    const win = window.open('', '_blank', 'width=400,height=600');
    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Comanda #${p.id}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 80mm; font-family: 'Courier New', monospace; font-size: 12px; color: #000; padding: 4mm; }
  .header { text-align: center; margin-bottom: 4mm; }
  .header h1 { font-size: 16px; font-weight: bold; text-transform: uppercase; }
  .header .sub { font-size: 11px; margin-top: 2mm; }
  .sep { border-top: 1px dashed #000; margin: 3mm 0; }
  .linha { display: flex; justify-content: space-between; margin: 1mm 0; }
  .linha.destaque { font-weight: bold; }
  .info { margin: 1mm 0; }
  .info span { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1mm 0; vertical-align: top; }
  td.qty { width: 10mm; font-weight: bold; }
  td.nome { font-weight: bold; }
  td.val { text-align: right; white-space: nowrap; }
  tr.adic td { font-size: 11px; padding-left: 8mm; color: #333; }
  tr.adic td.val { font-size: 11px; }
  tr.obs td { font-size: 11px; padding-left: 8mm; font-style: italic; color: #444; }
  .total-box { border: 1px solid #000; padding: 2mm; margin: 3mm 0; }
  .total-box .linha { font-size: 13px; }
  .rodape { text-align: center; margin-top: 4mm; font-size: 10px; }
  @media print {
    body { width: auto; padding: 0; }
    @page { size: 80mm auto; margin: 2mm; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1 id="loja-nome-comanda">Lanchonete</h1>
    <div class="sub">Comanda de Pedido</div>
  </div>
  <div class="sep"></div>
  <div class="linha"><span>Pedido:</span><span><strong>#${p.id}</strong></span></div>
  <div class="linha"><span>Data:</span><span>${dataHora}</span></div>
  <div class="sep"></div>
  <div class="info"><span>Cliente:</span> ${p.cliente_nome}</div>
  <div class="info"><span>Telefone:</span> ${p.cliente_telefone}</div>
  ${p.endereco_entrega ? `<div class="info"><span>Entrega:</span> ${p.endereco_entrega}</div>` : ''}
  ${p.bairro_entrega ? `<div class="info"><span>Bairro:</span> ${p.bairro_entrega}</div>` : ''}
  <div class="sep"></div>
  <table>${itensHtml}</table>
  <div class="sep"></div>
  <div class="linha"><span>Subtotal:</span><span>R$ ${p.subtotal.toFixed(2)}</span></div>
  ${p.taxa_entrega > 0 ? `<div class="linha"><span>Taxa de entrega:</span><span>R$ ${p.taxa_entrega.toFixed(2)}</span></div>` : ''}
  <div class="total-box">
    <div class="linha destaque"><span>TOTAL:</span><span>R$ ${p.total.toFixed(2)}</span></div>
  </div>
  <div class="linha"><span>Pagamento:</span><span>${payLabel}</span></div>
  <div class="linha"><span>Status:</span><span>${statusLabel}</span></div>
  ${trocoHtml}
  ${obsPedido ? `<div class="sep"></div><div class="info"><span>Obs:</span> ${obsPedido}</div>` : ''}
  <div class="sep"></div>
  <div class="rodape">*** Obrigado pela preferencia ***</div>
</body>
</html>`);
    win.document.close();
    win.focus();

    CarregarNomeLojaComanda(win).then(() => {
      setTimeout(() => {
        win.print();
        setTimeout(() => win.close(), 300);
      }, 250);
    });
  } catch (e) {
    showToast('Erro ao gerar comanda: ' + e.message);
  }
}

async function CarregarNomeLojaComanda(win) {
  try {
    const res = await authFetch('/api/config');
    const cfg = await res.json();
    const el = win.document.getElementById('loja-nome-comanda');
    if (el && cfg.loja_nome) el.textContent = cfg.loja_nome;
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
  select.innerHTML = categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

  // Popular select de filtro preservando a seleção atual
  const filtroSelect = document.getElementById('filtro-categoria-produtos');
  if (filtroSelect) {
    const filtroAtual = filtroSelect.value;
    filtroSelect.innerHTML = '<option value="">Todas as categorias</option>' + 
      categorias.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
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
        <td>${p.foto ? `<img src="${p.foto}" style="width:50px;height:50px;object-fit:cover;border-radius:6px">` : '<div style="width:50px;height:50px;border-radius:6px;background:var(--color-bg-alt);display:flex;align-items:center;justify-content:center;font-size:20px">&#127828;</div>'}</td>
        <td><strong>${p.nome}</strong><br><small style="color:var(--gray)">${p.descricao || ''}</small></td>
        <td><span class="pix-badge" style="background:var(--color-bg-alt);color:var(--color-text-secondary)">${p.categoria_nome}${categoria ? ` (#${categoria.ordem})` : ''}</span></td>
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
        <td>${c.nome}</td>
        <td>${c.ordem}</td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="editarCategoria(${c.id}, '${c.nome}', ${c.ordem})">Editar</button>
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
        categoriasAdmin.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
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
        <span>${c.nome}</span>
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
        <span>${p.nome} <small style="color:var(--gray)">(${categoriasAdmin.find(c => c.id === p.categoria_id)?.nome || 'sem categoria'})</small></span>
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
        <td><strong>${a.nome}</strong></td>
        <td><small style="color:var(--color-text-secondary)">${a.descricao || '-'}</small></td>
        <td><span style="background: ${tl.bg}; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${tl.text}</span></td>
        <td>${limiteText}</td>
        <td>${a.categoria_nome || 'Todas'}</td>
        <td>${produtoNome}</td>
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
    produtosDisponiveis.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

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
async function carregarClientes() {
  const res = await authFetch('/api/clientes');
  allClientes = await res.json();
  renderClientes(allClientes);
}

function filtrarClientes() {
  const busca = document.getElementById('busca-cliente').value.toLowerCase();
  const filtrados = allClientes.filter(c => c.nome.toLowerCase().includes(busca) || c.telefone.includes(busca));
  renderClientes(filtrados);
}

function renderClientes(clientes) {
  document.getElementById('clientes-list').innerHTML = `<table>
    <thead><tr><th>Nome</th><th>Telefone</th><th>Bairro</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${clientes.map(c => `
      <tr style="${c.bloqueado ? 'background-color: #ffe6e6;' : ''}">
        <td>${c.nome}</td>
        <td>${c.telefone}</td>
        <td>${c.bairro || '-'}</td>
        <td>${c.bloqueado ? '<span class="status-badge status-cancelado">Bloqueado</span>' : '<span class="status-badge status-entregue">Ativo</span>'}</td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="verPedidosCliente(${c.id}, '${c.nome}')">Pedidos</button>
          <button class="btn btn-xs ${c.bloqueado ? 'btn-success' : 'btn-warning'}" onclick="toggleBloqueioCliente(${c.id}, ${c.bloqueado})">
            ${c.bloqueado ? 'Desbloquear' : 'Bloquear'}
          </button>
          <button class="btn btn-xs btn-danger" onclick="excluirCliente(${c.id})">Excluir</button>
        </td>
      </tr>
    `).join('')}</tbody>
  </table>`;
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
        <td>${b.nome}</td>
        <td>R$ ${b.taxa_entrega.toFixed(2)}</td>
        <td>
          <label class="toggle-switch">
            <input type="checkbox" ${b.atendido ? 'checked' : ''} onchange="toggleBairro(${b.id}, '${b.nome}', ${b.taxa_entrega}, this.checked ? 1 : 0)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="editarBairroPrompt(${b.id}, '${b.nome}', ${b.taxa_entrega})">Editar</button>
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

function editarBairroPrompt(id, nome, taxa) {
  const novaTaxa = prompt(`Nova taxa de entrega para ${nome}:`, taxa);
  if (novaTaxa === null) return;
  fetch(`/api/bairros/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, taxa_entrega: parseFloat(novaTaxa) || 0, atendido: 1 }) })
    .then(() => { carregarBairrosAdmin(); showToast('Taxa atualizada!'); });
}

async function excluirBairro(id) {
  if (!confirm('Excluir este bairro?')) return;
  await authFetch(`/api/bairros/${id}`, { method: 'DELETE' });
  carregarBairrosAdmin();
}

// RELATÓRIOS
async function carregarRelatorios() {
  const periodo = document.getElementById('periodo-relatorio').value;
  const res = await authFetch(`/api/config/relatorios/vendas?periodo=${periodo}`);
  const data = await res.json();

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-value">${data.resumo.total_pedidos}</div><div class="stat-label">Pedidos</div></div>
    <div class="stat-card"><div class="stat-value">R$ ${data.resumo.faturamento.toFixed(2)}</div><div class="stat-label">Faturamento</div></div>
    <div class="stat-card"><div class="stat-value">R$ ${data.resumo.ticket_medio.toFixed(2)}</div><div class="stat-label">Ticket médio</div></div>
  `;

  document.getElementById('vendas-dia').innerHTML = data.porDia.length ? `<table>
    <thead><tr><th>Data</th><th>Pedidos</th><th>Valor</th></tr></thead>
    <tbody>${data.porDia.map(d => `<tr><td>${d.dia}</td><td>${d.qtd}</td><td>R$ ${d.valor.toFixed(2)}</td></tr>`).join('')}</tbody>
  </table>` : '<p style="color:var(--gray)">Sem dados</p>';

  document.getElementById('produtos-top').innerHTML = data.produtosMaisVendidos.length ? `<table>
    <thead><tr><th>Produto</th><th>Qtd</th><th>Valor</th></tr></thead>
    <tbody>${data.produtosMaisVendidos.map(p => `<tr><td>${p.produto_nome}</td><td>${p.qtd}</td><td>R$ ${p.valor.toFixed(2)}</td></tr>`).join('')}</tbody>
  </table>` : '<p style="color:var(--gray)">Sem dados</p>';

  document.getElementById('vendas-pagamento').innerHTML = data.porFormaPagamento.length ? `<table>
    <thead><tr><th>Forma</th><th>Qtd</th><th>Valor</th></tr></thead>
    <tbody>${data.porFormaPagamento.map(p => `<tr><td>${payLabels[p.forma_pagamento] || p.forma_pagamento}</td><td>${p.qtd}</td><td>R$ ${p.valor.toFixed(2)}</td></tr>`).join('')}</tbody>
  </table>` : '<p style="color:var(--gray)">Sem dados</p>';
}

// CONFIGURAÇÕES
async function carregarConfigAdmin() {
  const res = await authFetch('/api/config');
  const cfg = await res.json();
  document.getElementById('cfg-loja-nome').value = cfg.loja_nome || '';
  document.getElementById('cfg-loja-telefone').value = cfg.loja_telefone || '';
  document.getElementById('cfg-tempo-espera').value = cfg.tempo_espera || '';
  document.getElementById('cfg-pix-tipo').value = cfg.pix_tipo || 'cpf';
  document.getElementById('cfg-pix-chave').value = cfg.pix_chave || '';
  document.getElementById('cfg-pix-nome').value = cfg.pix_nome || '';
  carregarSomPrefs();
}

async function salvarConfig(e) {
  e.preventDefault();
  const config = {
    loja_nome: document.getElementById('cfg-loja-nome').value,
    loja_telefone: document.getElementById('cfg-loja-telefone').value,
    tempo_espera: document.getElementById('cfg-tempo-espera').value,
    pix_tipo: document.getElementById('cfg-pix-tipo').value,
    pix_chave: document.getElementById('cfg-pix-chave').value,
    pix_nome: document.getElementById('cfg-pix-nome').value
  };
  await authFetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
  salvarSomPrefs();
  showToast('Configurações salvas!');
}

// ===== STATUS DA LOJA =====

async function carregarLojaStatus() {
  try {
    const res = await authFetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    atualizarBotaoLoja(cfg.loja_aberta !== 'false');
  } catch (e) { /* mantem padrao aberto */ }
}

function atualizarBotaoLoja(aberta) {
  const btn = document.getElementById('loja-status-btn');
  const txt = document.getElementById('loja-status-texto');
  if (!btn || !txt) return;
  btn.classList.toggle('aberto', aberta);
  btn.classList.toggle('fechado', !aberta);
  txt.textContent = aberta ? 'Loja Aberta' : 'Loja Fechada';
}

async function toggleLojaStatus() {
  try {
    const res = await authFetch('/api/config');
    if (!res.ok) { showToast('Erro ao ler status da loja'); return; }
    const cfg = await res.json();
    const vaiAbrir = cfg.loja_aberta === 'false';
    const put = await authFetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loja_aberta: vaiAbrir ? 'true' : 'false' }) });
    if (!put.ok) { showToast('Erro ao alterar status da loja'); return; }
    atualizarBotaoLoja(vaiAbrir);
    showToast(vaiAbrir ? 'Loja ABERTA - recebendo pedidos' : 'Loja FECHADA - clientes não podem fazer pedidos');
  } catch (e) { showToast('Erro de conexão'); }
}

// ===== PEDIDO WHATSAPP (ADMIN) =====
let whatsappProdutos = [];
let whatsappCarrinho = [];
let whatsappCategoriaFiltro = '';
let whatsappProdutoSelecionado = null;
let whatsappQtd = 1;

async function abrirModalPedidoWhatsApp() {
  whatsappCarrinho = [];
  whatsappCategoriaFiltro = '';
  document.getElementById('whatsapp-cliente-nome').value = '';
  document.getElementById('whatsapp-cliente-telefone').value = '';
  document.getElementById('whatsapp-cliente-bairro').value = '';
  document.getElementById('whatsapp-cliente-rua').value = '';
  document.getElementById('whatsapp-cliente-numero').value = '';
  document.getElementById('whatsapp-cliente-complemento').value = '';
  document.getElementById('whatsapp-cliente-referencia').value = '';
  document.getElementById('whatsapp-forma-pagamento').value = 'pix';
  document.getElementById('whatsapp-troco-box').style.display = 'none';
  document.getElementById('whatsapp-observacoes').value = '';
  document.getElementById('whatsapp-busca-produto').value = '';
  document.getElementById('modal-pedido-whatsapp').classList.add('active');
  await carregarDadosWhatsApp();
  renderCarrinhoWhatsApp();
}

function fecharModalPedidoWhatsApp() {
  document.getElementById('modal-pedido-whatsapp').classList.remove('active');
}

function isPizzaWhatsApp(p){ return !!(p && p.categoria_nome && p.categoria_nome.toLowerCase().includes('pizza')); }

function whatsappProdutoCardHtml(p){
  return `
    <div class="product-card" onclick="abrirModalWhatsAppQtd(${p.id})">
      <div class="product-media">
        ${p.foto?`<img class="product-img" src="${p.foto}" alt="${p.nome}" loading="lazy">`:`<div class="product-img-placeholder">🍔</div>`}
      </div>
      <div class="product-info">
        <div>
          <div class="product-name">${p.nome}</div>
          ${p.descricao?`<div class="product-desc">${p.descricao}</div>`:''}
        </div>
        <div class="product-footer">
          <span class="product-price">R$ ${p.preco.toFixed(2)}${p.unidade==='kg'?'\/kg':''}</span>
          <button class="btn-add" onclick="event.stopPropagation(); abrirModalWhatsAppQtd(${p.id})" aria-label="Adicionar ${p.nome}">+</button>
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
        window.__pizzaCfgWhatsApp={ produtos: whatsappProdutos, toast: showToast, onAdd:item=>{
          whatsappCarrinho.push(item);
          renderCarrinhoWhatsApp();
          showToast(`${item.quantidade}x ${item.produto_nome} adicionado!`);
        }};
      }
      const cardHtml = window.PizzaModal ? window.PizzaModal.cardHtml('cliente').replace(/window\.__pizzaCfg/g,'window.__pizzaCfgWhatsApp') : '';
      return `<div class="category-section"><div class="category-heading">Pizzas</div><div class="category-items">${cardHtml}</div></div>`;
    }
    return `<div class="category-section"><div class="category-heading">${g.nome}</div><div class="category-items">${g.itens.map(p=>whatsappProdutoCardHtml(p)).join('')}</div></div>`;
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
    bairroSel.innerHTML = '<option value="">Bairro *</option>' + bairros.filter(b=>b.atendido).map(b=>`<option value="${b.nome}" data-taxa="${b.taxa_entrega}">${b.nome} - R$ ${parseFloat(b.taxa_entrega).toFixed(2)}</option>`).join('');
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
      window.__pizzaCfgWhatsApp={ produtos: whatsappProdutos, toast: showToast, onAdd:item=>{ whatsappCarrinho.push(item); renderCarrinhoWhatsApp(); showToast(`${item.quantidade}x ${item.produto_nome} adicionado!`); }};
    }
    renderProdutosWhatsApp();
  } catch(e){ showToast('Erro ao carregar dados do pedido'); }
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
        window.__pizzaCfgWhatsApp={ produtos: prodsPizza.length?prodsPizza:whatsappProdutos, toast: showToast, onAdd:item=>{ whatsappCarrinho.push(item); renderCarrinhoWhatsApp(); showToast(`${item.quantidade}x ${item.produto_nome} adicionado!`); }};
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
    } else if(whatsappCategoriaFiltro==='__pizzas__' && buscaPizza){
      // Busca vazia + filtro Pizzas sem itens (caso pizza sem produtos, mostrar só card)
      if(window.PizzaModal){
        window.__pizzaCfgWhatsApp={ produtos: whatsappProdutos.filter(p=>isPizzaWhatsApp(p)), toast: showToast, onAdd:item=>{ whatsappCarrinho.push(item); renderCarrinhoWhatsApp(); showToast(`${item.quantidade}x ${item.produto_nome} adicionado!`); }};
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
  document.getElementById('whatsapp-qtd-nome').textContent = whatsappProdutoSelecionado.nome;
  document.getElementById('whatsapp-qtd-preco').textContent = `R$ ${whatsappProdutoSelecionado.preco.toFixed(2)}`;
  document.getElementById('whatsapp-qtd-valor').textContent = '1';
  document.getElementById('whatsapp-qtd-obs').value = '';
  const adcBox = document.getElementById('whatsapp-qtd-adicionais');
  const adcList = document.getElementById('whatsapp-qtd-adicionais-lista');
  const adicionaisAcaI = whatsappProdutoSelecionado.adicionais.filter(a=>['base','cobertura','acompanhamento'].includes(a.tipo));
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
            <input type="radio" name="whatsapp-base" value="${a.id}" data-nome="${a.nome}" data-preco="${a.preco}" data-tipo="base" onchange="whatsappAtualizarTotal()">
            <span style="flex:1; font-size:0.85rem">${a.nome}</span>
            <span style="font-size:0.8rem; font-weight:700; color:var(--color-primary)">${a.preco>0?`+ R$ ${a.preco.toFixed(2)}`:'Incluído'}</span>
          </label>
        `).join('');
      }
      if(coberturas.length){
        html+=`<div style="margin:10px 0 6px; font-size:0.8rem; font-weight:700; color:var(--color-text); border-bottom:1px solid var(--color-border); padding-bottom:4px">Coberturas</div>`;
        html+=coberturas.map(a=>`
          <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f1f1f1; cursor:pointer">
            <input type="checkbox" value="${a.id}" data-nome="${a.nome}" data-preco="${a.preco}" data-tipo="cobertura" data-limite="${a.limite||0}" onchange="whatsappAtualizarTotal()">
            <span style="flex:1; font-size:0.85rem">${a.nome}</span>
            <span style="font-size:0.8rem; font-weight:700; color:var(--color-primary)">${a.preco>0?`+ R$ ${a.preco.toFixed(2)}`:'Incluído'}</span>
          </label>
        `).join('');
      }
      if(acompanhamentos.length){
        html+=`<div style="margin:10px 0 6px; font-size:0.8rem; font-weight:700; color:var(--color-text); border-bottom:1px solid var(--color-border); padding-bottom:4px">Acompanhamentos</div>`;
        html+=acompanhamentos.map(a=>`
          <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #f1f1f1; cursor:pointer">
            <input type="checkbox" value="${a.id}" data-nome="${a.nome}" data-preco="${a.preco}" data-tipo="acompanhamento" data-limite="${a.limite||0}" onchange="whatsappAtualizarTotal()">
            <span style="flex:1; font-size:0.85rem">${a.nome}</span>
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
            <input type="checkbox" value="${a.id}" data-nome="${a.nome}" data-preco="${a.preco}" data-tipo="${a.tipo||'adicional'}" onchange="whatsappAtualizarTotal()">
            <span style="flex:1; font-size:0.85rem">${a.nome}</span>
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
            <input type="checkbox" value="${a.id}" data-nome="${a.nome}" data-preco="${a.preco}" data-tipo="${a.tipo}" onchange="whatsappAtualizarTotal()">
            <span style="flex:1; font-size:0.85rem">${a.nome}</span>
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
  let total = whatsappProdutoSelecionado.preco * whatsappQtd;
  document.querySelectorAll('#whatsapp-qtd-adicionais-lista input:checked').forEach(c=>{ total+=parseFloat(c.dataset.preco)*whatsappQtd; });
  document.getElementById('whatsapp-qtd-total').textContent=`R$ ${total.toFixed(2)}`;
}
function confirmarAddWhatsApp(){
  if(!whatsappProdutoSelecionado) return;
  const adicionais=[];
  document.querySelectorAll('#whatsapp-qtd-adicionais-lista input:checked').forEach(c=>{
    adicionais.push({id: parseInt(c.value), nome: c.dataset.nome, preco: parseFloat(c.dataset.preco)});
  });
  whatsappCarrinho.push({
    produto_id: whatsappProdutoSelecionado.id,
    produto_nome: whatsappProdutoSelecionado.nome,
    preco_unitario: whatsappProdutoSelecionado.preco,
    quantidade: whatsappQtd,
    observacao: document.getElementById('whatsapp-qtd-obs').value.trim(),
    adicionais
  });
  fecharModalWhatsAppQtd();
  renderCarrinhoWhatsApp();
  showToast(`${whatsappProdutoSelecionado.nome} adicionado!`);
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
  if(bairroSel && bairroSel.selectedIndex>0){
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
    const adic = it.adicionais.map(a=>`+ ${a.nome}`).join(', ');
    return `<div style="border:1px solid var(--color-border); border-radius:8px; padding:8px; margin-bottom:8px; background:white">
      <div style="display:flex; justify-content:space-between; gap:8px">
        <div style="flex:1; min-width:0">
          <div style="font-weight:700; font-size:0.85rem">${it.produto_nome}</div>
          ${adic?`<div style="font-size:0.75rem; color:var(--color-text-muted)">${adic}</div>`:''}
          ${it.observacao?`<div style="font-size:0.75rem; color:#D97706; font-style:italic">Obs: ${it.observacao}</div>`:''}
          <div style="font-size:0.8rem; color:var(--color-text-secondary)">R$ ${it.preco_unitario.toFixed(2)} x ${it.quantidade}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800; color:var(--color-primary)">R$ ${tot.toFixed(2)}</div>
          <div style="display:flex; gap:4px; margin-top:4px; justify-content:flex-end">
            <button onclick="whatsappAlterarQtdCarrinho(${i},-1)" style="width:26px; height:26px; border-radius:50%; border:1px solid var(--color-border); background:white; cursor:pointer">-</button>
            <span style="min-width:22px; text-align:center; font-weight:700; font-size:0.85rem; line-height:26px">${it.quantidade}</span>
            <button onclick="whatsappAlterarQtdCarrinho(${i},1)" style="width:26px; height:26px; border-radius:50%; border:1px solid var(--color-border); background:white; cursor:pointer">+</button>
            <button onclick="whatsappRemover(${i})" style="width:26px; height:26px; border-radius:50%; border:none; background:#FEF2F2; color:#DC2626; cursor:pointer">×</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  countEl.textContent=whatsappCarrinho.reduce((s,i)=>s+i.quantidade,0);
  subtotalEl.textContent=`R$ ${subtotal.toFixed(2)}`;
  taxaEl.textContent=`R$ ${taxa.toFixed(2)}`;
  totalEl.textContent=`R$ ${(subtotal+taxa).toFixed(2)}`;
}
function whatsappAlterarQtdCarrinho(idx,delta){
  const it=whatsappCarrinho[idx];
  if(!it) return;
  it.quantidade+=delta;
  if(it.quantidade<1) whatsappCarrinho.splice(idx,1);
  renderCarrinhoWhatsApp();
}
function whatsappRemover(idx){ whatsappCarrinho.splice(idx,1); renderCarrinhoWhatsApp(); }
function formatarTelefoneWhatsApp(inp){
  let v=inp.value.replace(/\D/g,'');
  if(v.length>11) v=v.slice(0,11);
  if(v.length>6) v=`(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  else if(v.length>2) v=`(${v.slice(0,2)}) ${v.slice(2)}`;
  else if(v.length>0) v=`(${v}`;
  inp.value=v;
}
document.getElementById('whatsapp-cliente-bairro')?.addEventListener('change', renderCarrinhoWhatsApp);
document.getElementById('whatsapp-forma-pagamento')?.addEventListener('change', function(){
  document.getElementById('whatsapp-troco-box').style.display=this.value==='dinheiro'?'block':'none';
});
async function enviarPedidoWhatsApp(){
  if(!whatsappCarrinho.length){ showToast('Carrinho vazio'); return; }
  const nome=document.getElementById('whatsapp-cliente-nome').value.trim();
  const telefone=document.getElementById('whatsapp-cliente-telefone').value.trim();
  const bairro=document.getElementById('whatsapp-cliente-bairro').value;
  const rua=document.getElementById('whatsapp-cliente-rua').value.trim();
  const numero=document.getElementById('whatsapp-cliente-numero').value.trim();
  const complemento=document.getElementById('whatsapp-cliente-complemento').value.trim();
  const referencia=document.getElementById('whatsapp-cliente-referencia').value.trim();
  const forma=document.getElementById('whatsapp-forma-pagamento').value;
  const observacoes=document.getElementById('whatsapp-observacoes').value.trim();
  if(!nome || !telefone){ showToast('Informe nome e telefone'); return; }
  if(!bairro){ showToast('Selecione o bairro'); return; }
  if(telefone.replace(/\D/g,'').length<10){ showToast('Telefone inválido'); return; }
  const btn=document.getElementById('whatsapp-btn-enviar');
  btn.disabled=true; btn.textContent='Enviando...';
  try{
    let clienteId;
    const cliRes=await authFetch(`/api/clientes/telefone/${encodeURIComponent(telefone)}`);
    if(cliRes.ok){
      const cli=await cliRes.json();
      clienteId=cli.id;
      // atualizar dados do cliente se necessário
      await authFetch(`/api/clientes/${clienteId}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nome, telefone, bairro, rua, numero, complemento, ponto_referencia: referencia})}).catch(()=>{});
    } else {
      const novoRes=await authFetch('/api/clientes', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nome, telefone, bairro, rua, numero, complemento, ponto_referencia: referencia})});
      if(!novoRes.ok){ const err=await novoRes.json(); throw new Error(err.error||'Erro ao cadastrar cliente'); }
      const novo=await novoRes.json();
      clienteId=novo.id;
    }
    const bairroSel=document.getElementById('whatsapp-cliente-bairro');
    const taxa=parseFloat(bairroSel.options[bairroSel.selectedIndex]?.dataset.taxa||0);
    let endereco=`${rua||''}${numero?`, ${numero}`:''}${complemento?` - ${complemento}`:''}${referencia?` (Ref: ${referencia})`:''}`.trim();
    if(!endereco) endereco=bairro;
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
    showToast(`Pedido #${pedido.id} criado! Cliente ${nome} cadastrado.`);
    fecharModalPedidoWhatsApp();
    carregarPedidos();
    carregarClientes();
  }catch(e){ showToast(e.message); }
  finally{ btn.disabled=false; btn.textContent='✅ Enviar Pedido para Cozinha'; }
}

// ===== SOM DE NOTIFICACAO =====

function tocarSomNovoPedido() {
  try {
    const prefs = JSON.parse(localStorage.getItem('somPrefs')) || {};
    if (prefs.ativo === false) return;
    const tipo = prefs.tipo || 'classic';
    const audio = new Audio(`/sounds/${tipo}.wav`);
    audio.volume = (prefs.volume !== undefined ? prefs.volume : 100) / 100;
    audio.play().catch(() => {});
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
  toast.innerHTML = `${icon ? `<span style="font-size:1.3rem">${icon}</span>` : ''}<span style="flex:1">${msg}</span><button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,0.2);border:none;color:white;width:28px;height:28px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1">×</button><div style="position:absolute;bottom:0;left:0;height:3px;background:rgba(255,255,255,0.5);border-radius:0 0 12px 12px;animation:toastProgress 3.5s linear forwards;right:0"></div>`;
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
        <td>${m.nome || '-'}</td>
        <td>${m.capacidade}</td>
        <td>
          <select class="form-control" onchange="atualizarStatusMesa(${m.id}, this.value)" style="width:auto;display:inline-block">
            <option value="livre" ${m.status === 'livre' ? 'selected' : ''}>Livre</option>
            <option value="ocupada" ${m.status === 'ocupada' ? 'selected' : ''}>Ocupada</option>
            <option value="reservada" ${m.status === 'reservada' ? 'selected' : ''}>Reservada</option>
          </select>
        </td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="editarMesaPrompt(${m.id}, ${m.numero}, '${(m.nome || '').replace(/'/g, "\\'")}', ${m.capacidade})">Editar</button>
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
        <td>${u.nome}</td>
        <td>${u.usuario}</td>
        <td>${u.perfil}</td>
        <td>
          <label class="toggle-switch">
            <input type="checkbox" ${u.ativo ? 'checked' : ''} onchange="toggleUsuarioStatus(${u.id}, this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>${u.trocar_senha ? '<span style="color:var(--warning)">Sim</span>' : '<span style="color:var(--success)">Não</span>'}</td>
        <td>
          <button class="btn btn-xs btn-primary" onclick="editarUsuario(${u.id}, '${u.nome}', '${u.usuario}', '${u.perfil}', ${u.ativo})">Editar</button>
          <button class="btn btn-xs btn-warning" onclick="redefinirSenhaUsuario(${u.id}, '${u.usuario}')">Redefinir senha (1234)</button>
          ${u.id !== usuarioLogado.id ? `<button class="btn btn-xs btn-danger" onclick="excluirUsuario(${u.id}, '${u.usuario}')">Desativar</button>
          <button class="btn btn-xs btn-danger" onclick="excluirUsuarioPermanente(${u.id}, '${u.usuario}')" title="Excluir definitivamente">Excluir</button>` : ''}
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
    showToast(`Usuário ${usuario} criado!`);
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
