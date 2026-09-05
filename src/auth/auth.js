const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

const TOKEN_EXPIRY = '2h';
const REFRESH_EXPIRY = '7d';

let jwtSecretCache = null;

async function getJwtSecret() {
  if (jwtSecretCache) return jwtSecretCache;

  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.length >= 32) {
    jwtSecretCache = envSecret;
    return jwtSecretCache;
  }

  const row = await db.get('SELECT valor FROM configuracoes WHERE chave = $1', 'jwt_secret');
  if (row && row.valor) {
    jwtSecretCache = row.valor;
    return jwtSecretCache;
  }

  const secret = crypto.randomBytes(64).toString('hex');
  await db.run('INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = $2', 'jwt_secret', secret);
  jwtSecretCache = secret;
  return secret;
}

function gerarHash(senha) {
  return bcrypt.hashSync(senha, 10);
}

function verificarSenha(senha, hash) {
  return bcrypt.compareSync(senha, hash);
}

async function gerarToken(usuario) {
  const secret = await getJwtSecret();
  const payload = {
    id: usuario.id,
    usuario: usuario.usuario,
    nome: usuario.nome,
    perfil: usuario.perfil,
    trocar_senha: usuario.trocar_senha === true || usuario.trocar_senha === 1
  };
  return jwt.sign(payload, secret, { expiresIn: TOKEN_EXPIRY });
}

async function gerarRefreshToken(usuario) {
  const secret = await getJwtSecret();
  const payload = {
    id: usuario.id,
    tipo: 'refresh'
  };
  return jwt.sign(payload, secret, { expiresIn: REFRESH_EXPIRY });
}

async function verificarToken(token) {
  if (!token) return null;
  try {
    const secret = await getJwtSecret();
    return jwt.verify(token, secret);
  } catch (e) {
    return null;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function revogarRefreshToken(token, usuarioId) {
  const h = hashToken(token);
  try {
    const payload = jwt.decode(token);
    const expira = payload && payload.exp ? new Date(payload.exp * 1000).toISOString() : null;
    await db.run('INSERT INTO refresh_tokens_revogados (token_hash, usuario_id, expira_em) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', h, usuarioId || null, expira);
  } catch (e) {}
}

async function isRefreshRevogado(token) {
  const h = hashToken(token);
  try {
    const row = await db.get('SELECT 1 FROM refresh_tokens_revogados WHERE token_hash = $1', h);
    return !!row;
  } catch (e) { return false; }
}

function extrairToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

async function middleware(req, res, next) {
  const token = extrairToken(req);
  const usuario = await verificarToken(token);
  if (!usuario) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
  try {
    const row = await db.get('SELECT id, ativo FROM usuarios WHERE id = $1', usuario.id);
    if (!row || !row.ativo) {
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
    }
  } catch (e) {}
  req.usuario = usuario;
  next();
}

async function middlewareAdmin(req, res, next) {
  await middleware(req, res, () => {
    if (req.usuario.perfil !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
  });
}

async function middlewareGarcom(req, res, next) {
  await middleware(req, res, () => {
    if (!['garcom', 'admin'].includes(req.usuario.perfil)) {
      return res.status(403).json({ error: 'Acesso restrito a garçons e administradores' });
    }
    next();
  });
}

module.exports = {
  gerarHash,
  verificarSenha,
  gerarToken,
  gerarRefreshToken,
  verificarToken,
  hashToken,
  revogarRefreshToken,
  isRefreshRevogado,
  middleware,
  middlewareAdmin,
  middlewareGarcom,
  TOKEN_EXPIRY,
  REFRESH_EXPIRY
};