// ============================================
// REALTIME CLIENT - Socket.io
// Servidor persistente (VPS/Shard/Docker).
// Requer: /socket.io/socket.io.js carregado antes deste arquivo.
// ============================================

let socket = null;
let initPromise = null;
const listeners = new Map();
const joinedRooms = new Set();
const roomRefs = new Map();
const EVENTS = ['novo-pedido', 'pedido-atualizado', 'pix-confirmado', 'motoboy-atribuido', 'comanda-atualizada', 'mesa-atualizada'];

function getToken() {
  try {
    return localStorage.getItem('auth_token') || '';
  } catch (e) {
    return '';
  }
}

function notifyListeners(event, data) {
  const eventListeners = listeners.get(event) || [];
  eventListeners.forEach(callback => {
    try {
      callback(data);
    } catch (e) {
      console.error(`Erro no listener ${event}:`, e);
    }
  });
}

function sendJoin(room) {
  if (!socket || !socket.connected) return;
  socket.emit('join', room, (res) => {
    if (res && res.ok === false) {
      console.warn(`Realtime: nao foi possivel entrar na sala ${room}:`, res.error);
    }
  });
}

function joinRoom(room) {
  if (!room) return;
  const refs = (roomRefs.get(room) || 0) + 1;
  roomRefs.set(room, refs);
  if (refs > 1) return;
  joinedRooms.add(room);
  initRealtime();
  sendJoin(room);
}

function leaveRoom(room) {
  if (!room) return;
  const refs = (roomRefs.get(room) || 1) - 1;
  if (refs > 0) {
    roomRefs.set(room, refs);
    return;
  }
  roomRefs.delete(room);
  joinedRooms.delete(room);
  if (socket && socket.connected) socket.emit('leave', room);
}

function registerHandlers(sock) {
  EVENTS.forEach(ev => {
    sock.on(ev, data => notifyListeners(ev, data));
  });
}

function initRealtime() {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    if (typeof window.io !== 'function') {
      console.error('Realtime: socket.io client nao carregado (/socket.io/socket.io.js)');
      resolve(null);
      return;
    }

    socket = window.io({
      path: '/socket.io',
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    registerHandlers(socket);

    socket.on('connect', () => {
      console.log('Socket.io conectado');
      // Reconectou: reentra em todas as salas ativas.
      joinedRooms.forEach(room => sendJoin(room));
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket.io erro de conexao:', err.message);
    });

    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') {
        console.warn('Socket.io desconectado:', reason);
      }
    });

    if (socket.connected) {
      joinedRooms.forEach(room => sendJoin(room));
      resolve(socket);
    }
  });

  return initPromise;
}

function subscribe(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, []);
  }
  listeners.get(event).push(callback);

  return () => {
    const arr = listeners.get(event) || [];
    const idx = arr.indexOf(callback);
    if (idx !== -1) arr.splice(idx, 1);
  };
}

function unsubscribe(event, callback) {
  const arr = listeners.get(event) || [];
  const idx = arr.indexOf(callback);
  if (idx !== -1) arr.splice(idx, 1);
}

function joinMesa(mesaId) {
  joinRoom(`mesa-${mesaId}`);
}

function leaveMesa(mesaId) {
  leaveRoom(`mesa-${mesaId}`);
}

function joinAdmin() {
  joinRoom('admin');
}

function joinGarcom() {
  joinRoom('garcom');
}

function joinPedido(pedidoId) {
  joinRoom(`pedido-${pedidoId}`);
}

function leavePedido(pedidoId) {
  leaveRoom(`pedido-${pedidoId}`);
}

// ============================================
// PAINEL CLIENTE (app.js)
// ============================================

function subscribePixConfirmado(pedidoId, callback) {
  joinPedido(pedidoId);
  const handler = (data) => {
    if (String(data.id) === String(pedidoId)) callback(data);
  };
  const unsub = subscribe('pix-confirmado', handler);
  return () => {
    unsub();
    leavePedido(pedidoId);
  };
}

function subscribePedidoStatus(pedidoId, callback) {
  joinPedido(pedidoId);
  const handler = (data) => {
    if (String(data.id) === String(pedidoId)) callback(data);
  };
  const unsub = subscribe('pedido-atualizado', handler);
  return () => {
    unsub();
    leavePedido(pedidoId);
  };
}

// ============================================
// PAINEL GARÇOM (garcom.js)
// ============================================

function subscribeComandaMesa(mesaId, callback) {
  joinMesa(mesaId);
  const handler = (data) => {
    if (Number(data.mesaId) === Number(mesaId)) callback({ eventType: 'UPDATE' });
  };
  const unsub = subscribe('comanda-atualizada', handler);
  return () => {
    unsub();
    leaveMesa(mesaId);
  };
}

function subscribeMesasStatus(callback) {
  joinGarcom();
  const handler = (data) => {
    callback(data);
  };
  return subscribe('mesa-atualizada', handler);
}

function subscribeNovoPedidoGarcom(callback) {
  joinGarcom();
  const handler = (data) => {
    callback(data);
  };
  return subscribe('novo-pedido', handler);
}

// ============================================
// PAINEL ADMIN (admin.js)
// ============================================

function subscribeNovoPedidoAdmin(callback) {
  joinAdmin();
  const handler = (data) => {
    callback(data);
  };
  return subscribe('novo-pedido', handler);
}

function subscribePedidosAdmin(callback) {
  joinAdmin();
  const unsub1 = subscribe('novo-pedido', (data) => callback({ eventType: 'INSERT', new: data }));
  const unsub2 = subscribe('pedido-atualizado', (data) => callback({ eventType: 'UPDATE', new: data }));
  const unsub3 = subscribe('pix-confirmado', (data) => callback({ eventType: 'UPDATE', new: { ...data, pix_confirmado: true } }));
  return () => { unsub1(); unsub2(); unsub3(); };
}

function subscribeComandaAdmin(callback) {
  joinAdmin();
  const handler = (data) => {
    callback(data);
  };
  return subscribe('comanda-atualizada', handler);
}

// ============================================
// COMUM
// ============================================

function cleanupRealtime() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  initPromise = null;
  joinedRooms.clear();
  roomRefs.clear();
  listeners.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupRealtime);
  window.addEventListener('pagehide', cleanupRealtime);

  window.Realtime = {
    init: initRealtime,
    subscribePixConfirmado,
    subscribePedidoStatus,
    joinPedido,
    leavePedido,
    subscribeComandaMesa,
    subscribeMesasStatus,
    subscribeNovoPedidoGarcom,
    subscribeNovoPedidoAdmin,
    subscribePedidosAdmin,
    subscribeComandaAdmin,
    cleanup: cleanupRealtime
  };
}
