const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

const TOKEN_EXPIRY = '2h';
const REFRESH_EXPIRY = '7d';

function getJwtSecret() {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get('jwt_secret');
  if (row && row.valor) return row.valor;
  const secret = crypto.randomBytes(64).toString('hex');
  db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)').run('jwt_secret', secret);
  return secret;
}

function gerarHash(senha) {
  return bcrypt.hashSync(senha, 10);
}

function verificarSenha(senha, hash) {
  return bcrypt.compareSync(senha, hash);
}

function gerarToken(usuario) {
  const payload = {
    id: usuario.id,
    usuario: usuario.usuario,
    nome: usuario.nome,
    perfil: usuario.perfil,
    trocar_senha: usuario.trocar_senha === 1
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY });
}

function gerarRefreshToken(usuario) {
  const payload = {
    id: usuario.id,
    tipo: 'refresh'
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: REFRESH_EXPIRY });
}

function verificarToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (e) {
    return null;
  }
}

function extrairToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

function middleware(req, res, next) {
  const token = extrairToken(req);
  const usuario = verificarToken(token);
  if (!usuario) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
  req.usuario = usuario;
  next();
}

function middlewareAdmin(req, res, next) {
  middleware(req, res, () => {
    if (req.usuario.perfil !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
  });
}

function middlewareGarcom(req, res, next) {
  middleware(req, res, () => {
    if (req.usuario.perfil !== 'garcom' && req.usuario.perfil !== 'admin') {
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
  middleware,
  middlewareAdmin,
  middlewareGarcom,
  TOKEN_EXPIRY,
  REFRESH_EXPIRY
};