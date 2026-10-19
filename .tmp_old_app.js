process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

function buildApp() {
  const app = express();

  if (process.env.VERCEL) {
    app.set('trust proxy', 1);
  }

  const notifier = require('./realtime/notifier');
  app.use((req, res, next) => {
    req.emitToAdmin = notifier.emitToAdmin;
    req.emitToGarcom = notifier.emitToGarcom;
    req.emitToMesa = notifier.emitToMesa;
    next();
  });

  const isDev = process.env.NODE_ENV !== 'production';

  const vercelOrigins = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]
    .filter(Boolean)
    .map(o => (o.startsWith('http') ? o : `https://${o}`));

  const allowedOrigins = [
    ...(isDev ? [] : (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean)),
    ...vercelOrigins
  ];

  const corsOptions = {
    origin: isDev ? true : (allowedOrigins.length > 0 ? allowedOrigins : false),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
  };

  const supabaseOrigin = process.env.SUPABASE_URL
    ? process.env.SUPABASE_URL.replace(/\/$/, '')
    : '';
  const supabaseWss = supabaseOrigin ? supabaseOrigin.replace('https://', 'wss://') : '';

  const cspValue = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
    script-src-attr 'unsafe-inline';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' data: blob: ${supabaseOrigin || 'https:'} https://images.unsplash.com https://*.unsplash.com https://via.placeholder.com https://picsum.photos;
    connect-src 'self' ${supabaseOrigin} ${supabaseWss};
    object-src 'none';
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
    ${isDev ? '' : 'upgrade-insecure-requests;'}
  `.replace(/\s+/g, ' ').trim();

  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', cspValue);
    next();
  });

  if (!isDev) {
    app.use(helmet.hsts({
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }));
  }
  app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));
  app.use(helmet.noSniff());
  app.use(helmet.xssFilter());
  app.use(helmet.frameguard({ action: 'deny' }));
  app.use(helmet.hidePoweredBy());
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });

  app.use(cors(corsOptions));

  // Limites maiores mas com json limit para mitigar DoS
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: 'Muitas requisi├º├Áes, tente novamente mais tarde' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS'
  });
  app.use(globalLimiter);

  if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, '..', 'public')));
  }

  app.use('/api/auth', require('./routes/auth'));

  app.use('/api', async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const usuario = await require('./auth/auth').verificarToken(authHeader.substring(7));
        if (usuario) req.usuario = usuario;
      } catch (e) { /* token invalido: segue anonimo */ }
    }
    next();
  });



  app.use('/api/categorias', require('./routes/categorias'));
  app.use('/api/produtos', require('./routes/produtos'));
  app.use('/api/adicionais', require('./routes/adicionais'));
  app.use('/api/clientes', require('./routes/clientes'));
  app.use('/api/bairros', require('./routes/bairros'));
  app.use('/api/pedidos', require('./routes/pedidos'));
  app.use('/api/mesas', require('./routes/mesas'));
  app.use('/api/comandas', require('./routes/comandas'));
  app.use('/api/motoboys', require('./routes/motoboys'));
  app.use('/api/config', require('./routes/config'));
  app.use('/api/cron', require('./routes/cron'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }), timezone: 'America/Sao_Paulo' });
  });

  const publicDir = path.join(__dirname, '..', 'public');
  app.get('/login-admin', (req, res) => res.sendFile(path.join(publicDir, 'login-admin.html')));
  app.get('/login-garcom', (req, res) => res.sendFile(path.join(publicDir, 'login-garcom.html')));
  app.get('/alterar-senha', (req, res) => res.sendFile(path.join(publicDir, 'alterar-senha.html')));

  app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
  app.get('/garcom', (req, res) => res.sendFile(path.join(publicDir, 'garcom.html')));
  app.get('/experimento', (req, res) => res.sendFile(path.join(publicDir, 'experimento.html')));

  app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  app.get('/favicon.ico', (req, res) => res.status(204).end());

  app.use((err, req, res, _next) => {
    console.error('[app] erro n├úo tratado:', err.message);
    if (res.headersSent) return;
    const status = err.status && Number.isInteger(err.status) ? err.status : 500;
    res.status(status).json({ error: status === 500 ? 'Erro interno' : (err.message || 'Erro') });
  });

  return app;
}

module.exports = buildApp();
