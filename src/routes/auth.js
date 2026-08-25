const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const db = require('../db/database');
const { gerarHash, verificarSenha, gerarToken, gerarRefreshToken, verificarToken, middleware, middlewareAdmin } = require('../auth/auth');
const { criarValidador } = require('../utils/validation');
const { registrarAuditoria, AUDIT_ACTIONS } = require('../utils/audit');

const isDev = process.env.NODE_ENV !== 'production';

const loginLimiter = isDev
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { error: 'Muitas tentativas de login, tente novamente em 15 minutos' },
      standardHeaders: true,
      legacyHeaders: false
    });

const validarLogin = criarValidador({
  usuario: { obrigatorio: true, tipo: 'string', tamanho: { min: 3, max: 50 } },
  senha: { obrigatorio: true, tipo: 'string', tamanho: { min: 1, max: 100 } },
  perfil_esperado: { tipo: 'string', enum: ['admin', 'garcom', 'observador'] }
});

const validarAlterarSenha = criarValidador({
  senha_atual: { obrigatorio: true, tipo: 'string', tamanho: { min: 1, max: 100 } },
  nova_senha: { obrigatorio: true, tipo: 'string', tamanho: { min: 4, max: 100 } }
});

const validarCriarUsuario = criarValidador({
  nome: { obrigatorio: true, tipo: 'string', tamanho: { min: 2, max: 100 }, sanitizar: true },
  usuario: { obrigatorio: true, tipo: 'string', tamanho: { min: 3, max: 50 } },
  senha: { tipo: 'string', tamanho: { min: 8, max: 100 } },
  perfil: { obrigatorio: true, tipo: 'string', enum: ['admin', 'garcom', 'observador'] }
});

const validarAtualizarUsuario = criarValidador({
  nome: { tipo: 'string', tamanho: { min: 2, max: 100 }, sanitizar: true },
  usuario: { tipo: 'string', tamanho: { min: 3, max: 50 } },
  perfil: { tipo: 'string', enum: ['admin', 'garcom', 'observador'] },
  ativo: { tipo: 'boolean' }
});

function gerarSenhaAleatoria(tamanho = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let senha = '';
  for (let i = 0; i < tamanho; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
}

const SENHA_PADRAO_GARCOM = gerarSenhaAleatoria();

function validarSenhaForte(senha) {
  if (senha.length < 4) return 'A senha deve ter no mínimo 4 caracteres';
  return null;
}

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// LOGIN
router.post('/login', loginLimiter, validarLogin, wrapAsync(async (req, res) => {
  const { usuario, senha, perfil_esperado } = req.body;

  const user = await db.get('SELECT * FROM usuarios WHERE usuario = $1 AND ativo = true', usuario);
  if (!user || !verificarSenha(senha, user.senha_hash)) {
    registrarAuditoria({ usuarioNome: usuario, acao: AUDIT_ACTIONS.LOGIN_FAILED, detalhes: { motivo: 'credenciais_invalidas' }, req });
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }

  if (perfil_esperado) {
    const permissaoValida = perfil_esperado === 'garcom'
      ? (['garcom', 'admin', 'observador'].includes(user.perfil))
      : (perfil_esperado === 'admin' ? ['admin', 'observador'].includes(user.perfil) : user.perfil === perfil_esperado);

    if (!permissaoValida) {
      registrarAuditoria({ usuarioId: user.id, usuarioNome: user.usuario, acao: AUDIT_ACTIONS.LOGIN_FAILED, detalhes: { motivo: 'perfil_incompativel' }, req });
      return res.status(403).json({ error: 'Este usuário não tem permissão para acessar este sistema' });
    }
  }

  const token = await gerarToken(user);
  const refreshToken = await gerarRefreshToken(user);
  registrarAuditoria({ usuarioId: user.id, usuarioNome: user.usuario, acao: AUDIT_ACTIONS.LOGIN_SUCCESS, req });
  res.json({
    token,
    refreshToken,
    perfil: user.perfil,
    nome: user.nome,
    usuario: user.usuario,
    trocar_senha: user.trocar_senha === true || user.trocar_senha === 1
  });
}));

// REFRESH TOKEN
router.post('/refresh', wrapAsync(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token obrigatório' });

  const payload = await verificarToken(refreshToken);
  if (!payload || payload.tipo !== 'refresh') {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado' });
  }

  const user = await db.get('SELECT * FROM usuarios WHERE id = $1 AND ativo = true', payload.id);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });

  const token = await gerarToken(user);
  const novoRefreshToken = await gerarRefreshToken(user);
  registrarAuditoria({ usuarioId: user.id, usuarioNome: user.usuario, acao: AUDIT_ACTIONS.TOKEN_REFRESHED, req });
  res.json({ token, refreshToken: novoRefreshToken });
}));

// ME (dados do usuário logado)
router.get('/me', middleware, wrapAsync(async (req, res) => {
  res.json({
    id: req.usuario.id,
    nome: req.usuario.nome,
    usuario: req.usuario.usuario,
    perfil: req.usuario.perfil,
    trocar_senha: req.usuario.trocar_senha
  });
}));

// ALTERAR SENHA (qualquer usuário logado)
router.post('/alterar-senha', middleware, validarAlterarSenha, wrapAsync(async (req, res) => {
  const { senha_atual, nova_senha } = req.body;

  const erroSenha = validarSenhaForte(nova_senha);
  if (erroSenha) return res.status(400).json({ error: erroSenha });

  const user = await db.get('SELECT * FROM usuarios WHERE id = $1', req.usuario.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!verificarSenha(senha_atual, user.senha_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta' });
  }

  const novoHash = gerarHash(nova_senha);
  await db.run('UPDATE usuarios SET senha_hash = $1, trocar_senha = false WHERE id = $2', novoHash, user.id);

  const userAtualizado = { ...user, senha_hash: novoHash, trocar_senha: false };
  const novoToken = await gerarToken(userAtualizado);
  const novoRefreshToken = await gerarRefreshToken(userAtualizado);

  registrarAuditoria({ usuarioId: user.id, usuarioNome: user.usuario, acao: AUDIT_ACTIONS.PASSWORD_CHANGED, req });
  res.json({ success: true, token: novoToken, refreshToken: novoRefreshToken });
}));

// ===== GESTÃO DE USUÁRIOS (somente admin) =====

// Listar usuários
router.get('/usuarios', middlewareAdmin, wrapAsync(async (req, res) => {
  const usuarios = await db.all('SELECT id, nome, usuario, perfil, ativo, trocar_senha, criado_em FROM usuarios ORDER BY nome');
  res.json(usuarios);
}));

// Criar usuário
router.post('/usuarios', middlewareAdmin, validarCriarUsuario, wrapAsync(async (req, res) => {
  const { nome, usuario, senha, perfil } = req.body;

  const existente = await db.get('SELECT id FROM usuarios WHERE usuario = $1', usuario);
  if (existente) return res.status(400).json({ error: 'Nome de usuário já existe' });

  const senhaFinal = senha || SENHA_PADRAO_GARCOM;
  const erroSenha = validarSenhaForte(senhaFinal);
  if (erroSenha) return res.status(400).json({ error: erroSenha });

  const hash = gerarHash(senhaFinal);

  try {
    const info = await db.run(
      'INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha) VALUES ($1, $2, $3, $4, true, true) RETURNING id',
      nome, usuario, hash, perfil
    );
    registrarAuditoria({ usuarioId: req.usuario.id, usuarioNome: req.usuario.usuario, acao: AUDIT_ACTIONS.USER_CREATED, detalhes: { novoUsuario: usuario, perfil }, req });
    res.json({ id: info.lastInsertRowid, senha_inicial: senhaFinal });
  } catch (e) {
    res.status(400).json({ error: 'Erro ao criar usuário' });
  }
}));

// Atualizar usuário (nome, usuario, perfil, ativo)
router.put('/usuarios/:id', middlewareAdmin, validarAtualizarUsuario, wrapAsync(async (req, res) => {
  const { nome, usuario, perfil, ativo } = req.body;
  const user = await db.get('SELECT * FROM usuarios WHERE id = $1', req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (usuario !== undefined && usuario !== user.usuario) {
    const duplicado = await db.get('SELECT id FROM usuarios WHERE usuario = $1 AND id != $2', usuario, req.params.id);
    if (duplicado) return res.status(400).json({ error: 'Nome de usuário já está em uso' });
  }

  const alteracoes = {};
  if (nome !== undefined && nome !== user.nome) alteracoes.nome = { antes: user.nome, depois: nome };
  if (usuario !== undefined && usuario !== user.usuario) alteracoes.usuario = { antes: user.usuario, depois: usuario };
  if (perfil !== undefined && perfil !== user.perfil) alteracoes.perfil = { antes: user.perfil, depois: perfil };
  if (ativo !== undefined && ativo !== user.ativo) alteracoes.ativo = { antes: user.ativo ? 1 : 0, depois: ativo ? 1 : 0 };

  await db.run('UPDATE usuarios SET nome = $1, usuario = $2, perfil = $3, ativo = $4 WHERE id = $5',
    nome || user.nome, usuario || user.usuario, perfil || user.perfil, ativo !== undefined ? ativo : user.ativo, req.params.id);

  if (Object.keys(alteracoes).length > 0) {
    registrarAuditoria({ usuarioId: req.usuario.id, usuarioNome: req.usuario.usuario, acao: AUDIT_ACTIONS.USER_UPDATED, detalhes: { usuarioAlvo: user.usuario, alteracoes }, req });
  }

  res.json({ success: true });
}));

// Redefinir senha do garçom (gera senha forte + flag trocar_senha)
router.post('/usuarios/:id/redefinir-senha', middlewareAdmin, wrapAsync(async (req, res) => {
  const user = await db.get('SELECT * FROM usuarios WHERE id = $1', req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.id === req.usuario.id) return res.status(400).json({ error: 'Use a página de alterar senha para sua própria conta' });

  const novaSenha = '1234';
  const hash = gerarHash(novaSenha);
  await db.run('UPDATE usuarios SET senha_hash = $1, trocar_senha = true WHERE id = $2', hash, req.params.id);

  registrarAuditoria({ usuarioId: req.usuario.id, usuarioNome: req.usuario.usuario, acao: AUDIT_ACTIONS.PASSWORD_RESET, detalhes: { usuarioAlvo: user.usuario }, req });
  res.json({ success: true, senha_inicial: novaSenha });
}));

// Excluir usuario permanentemente
router.delete('/usuarios/:id/excluir', middlewareAdmin, wrapAsync(async (req, res) => {
  const user = await db.get('SELECT * FROM usuarios WHERE id = $1', req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.id === req.usuario.id) return res.status(400).json({ error: 'Você não pode excluir sua própria conta' });

  if (user.perfil === 'admin') {
    const adminCount = await db.get("SELECT COUNT(*)::int AS total FROM usuarios WHERE perfil = 'admin' AND ativo = true");
    if (adminCount.total <= 1) {
      return res.status(400).json({ error: 'Não é possível excluir o último administrador ativo' });
    }
  }

  await db.run('UPDATE auditoria SET usuario_id = NULL WHERE usuario_id = $1', user.id);
  await db.run('DELETE FROM usuarios WHERE id = $1', user.id);
  registrarAuditoria({ usuarioId: req.usuario.id, usuarioNome: req.usuario.usuario, acao: 'USUARIO_EXCLUIDO', detalhes: { usuarioAlvo: user.usuario }, req });
  res.json({ success: true });
}));

// Desativar usuário (manter histórico)
router.delete('/usuarios/:id', middlewareAdmin, wrapAsync(async (req, res) => {
  const user = await db.get('SELECT * FROM usuarios WHERE id = $1', req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.id === req.usuario.id) return res.status(400).json({ error: 'Você não pode desativar sua própria conta' });

  if (user.perfil === 'admin') {
    const adminCount = await db.get("SELECT COUNT(*) as total FROM usuarios WHERE perfil = 'admin' AND ativo = true");
    if (adminCount.total <= 1) {
      return res.status(400).json({ error: 'Não é possível desativar o último administrador ativo' });
    }
  }

  await db.run('UPDATE usuarios SET ativo = false WHERE id = $1', req.params.id);
  registrarAuditoria({ usuarioId: req.usuario.id, usuarioNome: req.usuario.usuario, acao: AUDIT_ACTIONS.USER_DEACTIVATED, detalhes: { usuarioAlvo: user.usuario }, req });
  res.json({ success: true });
}));

// Auditoria (somente admin)
router.get('/auditoria', middlewareAdmin, wrapAsync(async (req, res) => {
  const { usuario_id, acao, data_inicio, data_fim, limite } = req.query;
  const auditoria = require('../utils/audit');
  const resultados = auditoria.getAuditoria({
    usuarioId: usuario_id ? parseInt(usuario_id) : null,
    acao,
    dataInicio: data_inicio,
    dataFim: data_fim,
    limite: limite ? parseInt(limite) : 100
  });
  res.json(resultados);
}));

module.exports = router;