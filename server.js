// Entrada local/self-hosted (VPS, Shard, Docker).
// Na Vercel, a entrada é api/index.js (sem Socket.io; usa fallback Supabase Broadcast).
process.env.TZ = 'America/Sao_Paulo';
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const db = require('./src/db/database');

const ROOM_RE = /^(admin|garcom|mesa-\d+|pedido-\d+)$/;

function buildCorsOrigin() {
  if (process.env.NODE_ENV !== 'production') return true;
  const origins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  if (origins.length === 0 && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  if (origins.length === 0 && process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }
  return origins.length > 0 ? origins : false;
}

async function startServer() {
  await db.initialize();

  const app = require('./src/app');
  const notifier = require('./src/realtime/notifier');
  const { verificarToken } = require('./src/auth/auth');

  const PORT = process.env.PORT || 4000;
  const HOST = process.env.HOST || '0.0.0.0';

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: buildCorsOrigin(),
      methods: ['GET', 'POST'],
      credentials: false
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 25000,
    pingInterval: 20000
  });

  notifier.init(io);

  io.on('connection', (socket) => {
    socket.on('join', async (room, ack) => {
      try {
        if (typeof room !== 'string' || !ROOM_RE.test(room)) {
          if (typeof ack === 'function') ack({ ok: false, error: 'sala invalida' });
          return;
        }

        // Salas administrativas exigem JWT valido (admin/garcom).
        if (room === 'admin' || room === 'garcom') {
          const token = socket.handshake.auth && socket.handshake.auth.token;
          const usuario = await verificarToken(token);
          if (!usuario) {
            if (typeof ack === 'function') ack({ ok: false, error: 'nao autenticado' });
            return;
          }
          // Confere no banco se a conta continua ativa e usa o perfil atual.
          const conta = await db.get('SELECT ativo, perfil FROM usuarios WHERE id = $1', usuario.id);
          if (!conta || !conta.ativo) {
            if (typeof ack === 'function') ack({ ok: false, error: 'usuario inativo' });
            return;
          }
          if (room === 'admin' && conta.perfil !== 'admin') {
            if (typeof ack === 'function') ack({ ok: false, error: 'sem permissao' });
            return;
          }
          if (room === 'garcom' && !['admin', 'garcom'].includes(conta.perfil)) {
            if (typeof ack === 'function') ack({ ok: false, error: 'sem permissao' });
            return;
          }
        }

        socket.join(room);
        if (typeof ack === 'function') ack({ ok: true, room });
      } catch (e) {
        console.error('[socket] erro ao entrar na sala:', e.message);
        if (typeof ack === 'function') ack({ ok: false, error: 'erro interno' });
      }
    });

    socket.on('leave', (room) => {
      if (typeof room === 'string') socket.leave(room);
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`Painel admin em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/admin`);
    console.log(`Painel garçom em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/garcom`);
    console.log(`Acesso na rede local: http://<SEU_IP>:${PORT}`);
  });

  let encerrando = false;
  const shutdown = async (sinal) => {
    if (encerrando) return;
    encerrando = true;
    console.log(`[server] ${sinal} recebido, encerrando...`);
    io.close();
    await new Promise(resolve => server.close(resolve));
    try { await db.close(); } catch (e) { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(e => {
  console.error('Falha ao iniciar servidor:', e);
  process.exit(1);
});
