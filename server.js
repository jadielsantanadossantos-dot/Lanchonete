const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { middleware, middlewareAdmin, middlewareGarcom } = require('./src/auth/auth');

const app = express();
const server = http.createServer(app);

const isDev = process.env.NODE_ENV !== 'production';

const allowedOrigins = isDev 
  ? ['*'] 
  : (process.env.CORS_ORIGIN || 'http://localhost:4000,http://127.0.0.1:4000').split(',').map(o => o.trim());

const corsOptions = {
  origin: isDev ? true : allowedOrigins,  // true = reflect request origin
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
};

const io = new Server(server, { cors: { origin: isDev ? '*' : allowedOrigins } });

app.set('io', io);

const wsOrigins = isDev 
  ? ['*'] 
  : allowedOrigins.flatMap(o => {
      const host = o.replace('http://', '').replace('https://', '');
      return [`ws://${host}`, `wss://${host}`];
    });

const cspValue = `
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  script-src-attr 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  connect-src 'self' ${wsOrigins.join(' ')};
  font-src 'self';
  object-src 'none';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  ${isDev ? '' : 'upgrade-insecure-requests;'}
`.replace(/\s+/g, ' ').trim();

// CSP manual - usa middleware individual do helmet, sem contentSecurityPolicy
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', cspValue);
  next();
});

// HSTS apenas em produção
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
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./src/routes/auth'));

app.use('/api', (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const usuario = require('./src/auth/auth').verificarToken(token);
    if (usuario) req.usuario = usuario;
  }
  next();
});

app.use('/api/categorias', require('./src/routes/categorias'));
app.use('/api/produtos', require('./src/routes/produtos'));
app.use('/api/adicionais', require('./src/routes/adicionais'));
app.use('/api/clientes', require('./src/routes/clientes'));
app.use('/api/bairros', require('./src/routes/bairros'));
app.use('/api/pedidos', require('./src/routes/pedidos'));
app.use('/api/mesas', require('./src/routes/mesas'));
app.use('/api/comandas', require('./src/routes/comandas'));
app.use('/api/config', require('./src/routes/config'));

app.get('/login-admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login-admin.html')));
app.get('/login-garcom', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login-garcom.html')));
app.get('/alterar-senha', (req, res) => res.sendFile(path.join(__dirname, 'public', 'alterar-senha.html')));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/garcom', (req, res) => res.sendFile(path.join(__dirname, 'public', 'garcom.html')));
app.get('/garcom/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'garcom.html')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Painel admin em http://localhost:${PORT}/admin`);
  console.log(`Painel garçom em http://localhost:${PORT}/garcom`);
});