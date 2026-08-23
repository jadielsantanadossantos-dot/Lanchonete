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
    origin: isDev || allowedOrigins.length === 0 ? true : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
  };

  const supabaseOrigin = process.env.SUPABASE_URL
    ? process.env.SUPABASE_URL.replace(/\/$/, '')
    : '';

  const cspValue = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
    script-src-attr 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: ${supabaseOrigin};
    connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace('https://', 'wss://')};
    font-src 'self';
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

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: 'Muitas requisições, tente novamente mais tarde' },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(globalLimiter);

  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, '..', 'public')));
  }

  app.use('/api/auth', require('./routes/auth'));

  app.use('/api', (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const usuario = require('./auth/auth').verificarToken(token);
      if (usuario) req.usuario = usuario;
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
  app.use('/api/config', require('./routes/config'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const publicDir = path.join(__dirname, '..', 'public');
  app.get('/login-admin', (req, res) => res.sendFile(path.join(publicDir, 'login-admin.html')));
  app.get('/login-garcom', (req, res) => res.sendFile(path.join(publicDir, 'login-garcom.html')));
  app.get('/alterar-senha', (req, res) => res.sendFile(path.join(publicDir, 'alterar-senha.html')));

  app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));
  app.get('/garcom', (req, res) => res.sendFile(path.join(publicDir, 'garcom.html')));

  app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  app.get('/favicon.ico', (req, res) => res.status(204).end());

  return app;
}

module.exports = buildApp();
