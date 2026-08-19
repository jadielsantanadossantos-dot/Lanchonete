const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const db = require('../db/database');
const { gerarHash, verificarSenha, gerarToken, gerarRefreshToken, verificarToken, middleware, middlewareAdmin } = require('../auth/auth');
const { criarValidador } = require('../utils/validation');
const { registrarAuditoria, AUDIT_ACTIONS } = require('../utils/audit');

const isDev = process.env.NODE_ENV !== 'production';

const loginLimiter = isDev 
  ? (req, res, next) => next()  // Desabilitado em dev
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
  perfil_esperado: { tipo: 'string', enum: ['admin', 'garcom'] }
});

const validarAlterarSenha = criarValidador({
  senha_atual: { obrigatorio: true, tipo: 'string', tamanho: { min: 1, max: 100 } },
  nova_senha: { obrigatorio: true, tipo: 'string', tamanho: { min: 4, max: 100 } }
});

const validarCriarUsuario = criarValidador({
  nome: { obrigatorio: true, tipo: 'string', tamanho: { min: 2, max: 100 }, sanitizar: true },
  usuario: { obrigatorio: true, tipo: 'string', tamanho: { min: 3, max: 50 } },
  senha: { tipo: 'string', tamanho: { min: 8, max: 100 } },
  perfil: { obrigatorio: true, tipo: 'string', enum: ['admin', 'garcom'] }
});

const validarAtualizarUsuario = criarValidador({
  nome: { tipo: 'string', tamanho: { min: 2, max: 100 }, sanitizar: true },
  usuario: { tipo: 'string', tamanho: { min: 3, max: 50 } },
  perfil: { tipo: 'string', enum: ['admin', 'garcom'] },
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

// LOGIN
router.post('/login', loginLimiter, validarLogin, (req, res) => {
  const { usuario, senha, perfil_esperado } = req.body;

  const user = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1').get(usuario);
  if (!user || !verificarSenha(senha, user.senha_hash)) {
    registrarAuditoria({ usuarioNome: usuario, acao: AUDIT_ACTIONS.LOGIN_FAILED, detalhes: { motivo: 'credenciais_invalidas' }, req });
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }

  if (perfil_esperado && user.perfil !== perfil_esperado) {
    registrarAuditoria({ usuarioId: user.id, usuarioNome: user.usuario, acao: AUDIT_ACTIONS.LOGIN_FAILED, detalhes: { motivo: 'perfil_incompativel' }, req });
    return res.status(403).json({ error: 'Este usuário não tem permissão para acessar este sistema' });
  }

  const token = gerarToken(user);
  const refreshToken = gerarRefreshToken(user);
  registrarAuditoria({ usuarioId: user.id, usuarioNome: user.usuario, acao: AUDIT_ACTIONS.LOGIN_SUCCESS, req });
  res.json({
    token,
    refreshToken,
    perfil: user.perfil,
    nome: user.nome,
    usuario: user.usuario,
    trocar_senha: user.trocar_senha === 1
  });
});

// REFRESH TOKEN
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token obrigatório' });

  const payload = verificarToken(refreshToken);
  if (!payload || payload.tipo !== 'refresh') {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado' });
  }

  const user = db.prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').get(payload.id);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });

  const token = gerarToken(user);
  const novoRefreshToken = gerarRefreshToken(user);
  registrarAuditoria({ usuarioId: user.id, usuarioNome: user.usuario, acao: AUDIT_ACTIONS.TOKEN_REFRESHED, req });
  res.json({ token, refreshToken: novoRefreshToken });
});

// ME (dados do usuário logado)
router.get('/me', middleware, (req, res) => {
  res.json({
    id: req.usuario.id,
    nome: req.usuario.nome,
    usuario: req.usuario.usuario,
    perfil: req.usuario.perfil,
    trocar_senha: req.usuario.trocar_senha
  });
});

// ALTERAR SENHA (qualquer usuário logado)
router.post('/alterar-senha', middleware, validarAlterarSenha, (req, res) => {
  const { senha_atual, nova_senha } = req.body;

  const erroSenha = validarSenhaForte(nova_senha);
  if (erroSenha) return res.status(400).json({ error: erroSenha });

  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!verificarSenha(senha_atual, user.senha_hash)) {
    return res.status(401).json({ error: 'Senha atual incorreta' });
  }

  const novoHash = gerarHash(nova_senha);
  db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0 WHERE id = ?').run(novoHash, user.id);

  const userAtualizado = { ...user, senha_hash: novoHash, trocar_senha: 0 };
  const novoToken = gerarToken(userAtualizado);
  const novoRefreshToken = gerarRefreshToken(userAtualizado);

  registrarAuditoria({ usuarioId: user.id, usuarioNome: user.usuario, acao: AUDIT_ACTIONS.PASSWORD_CHANGED, req });
  res.json({ success: true, token: novoToken, refreshToken: novoRefreshToken });
});

// ===== GESTÃO DE USUÁRIOS (somente admin) =====

// Listar usuários
router.get('/usuarios', middlewareAdmin, (req, res) => {
  const usuarios = db.prepare('SELECT id, nome, usuario, perfil, ativo, trocar_senha, criado_em FROM usuarios ORDER BY nome').all();
  res.json(usuarios);
});

// Criar usuário
router.post('/usuarios', middlewareAdmin, validarCriarUsuario, (req, res) => {
  const { nome, usuario, senha, perfil } = req.body;

  const existente = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuario);
  if (existente) return res.status(400).json({ error: 'Nome de usuário já existe' });

  const senhaFinal = senha || SENHA_PADRAO_GARCOM;
  const erroSenha = validarSenhaForte(senhaFinal);
  if (erroSenha) return res.status(400).json({ error: erroSenha });

  const hash = gerarHash(senhaFinal);

  try {
    const info = db.prepare(
      'INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha) VALUES (?, ?, ?, ?, 1, ?)'
    ).run(nome, usuario, hash, perfil, 1);
    registrarAuditoria({ usuarioId: req.usuario.id, usuarioNome: req.usuario.usuario, acao: AUDIT_ACTIONS.USER_CREATED, detalhes: { novoUsuario: usuario, perfil }, req });
    res.json({ id: info.lastInsertRowid, senha_inicial: senhaFinal });
  } catch (e) {
    res.status(400).json({ error: 'Erro ao criar usuário' });
  }
});

// Atualizar usuário (nome, usuario, perfil, ativo)
router.put('/usuarios/:id', middlewareAdmin, validarAtualizarUsuario, (req, res) => {
  const { nome, usuario, perfil, ativo } = req.body;
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (usuario !== undefined && usuario !== user.usuario) {
    const duplicado = db.prepare('SELECT id FROM usuarios WHERE usuario = ? AND id != ?').get(usuario, req.params.id);
    if (duplicado) return res.status(400).json({ error: 'Nome de usuário já está em uso' });
  }

  const alteracoes = {};
  if (nome !== undefined && nome !== user.nome) alteracoes.nome = { antes: user.nome, depois: nome };
  if (usuario !== undefined && usuario !== user.usuario) alteracoes.usuario = { antes: user.usuario, depois: usuario };
  if (perfil !== undefined && perfil !== user.perfil) alteracoes.perfil = { antes: user.perfil, depois: perfil };
  if (ativo !== undefined && ativo !== user.ativo) alteracoes.ativo = { antes: user.ativo ? 1 : 0, depois: ativo ? 1 : 0 };

  db.prepare('UPDATE usuarios SET nome = ?, usuario = ?, perfil = ?, ativo = ? WHERE id = ?')
    .run(nome || user.nome, usuario || user.usuario, perfil || user.perfil, ativo !== undefined ? (ativo ? 1 : 0) : user.ativo, req.params.id);

  if (Object.keys(alteracoes).length > 0) {
    registrarAuditoria({ usuarioId: req.usuario.id, usuarioNome: req.usuario.usuario, acao: AUDIT_ACTIONS.USER_UPDATED, detalhes: { usuarioAlvo: user.usuario, alteracoes }, req });
  }

  res.json({ success: true });
});

// Redefinir senha do garçom (gera senha forte + flag trocar_senha)
router.post('/usuarios/:id/redefinir-senha', middlewareAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.id === req.usuario.id) return res.status(400).json({ error: 'Use a página de alterar senha para sua própria conta' });

  const novaSenha = gerarSenhaAleatoria();
  const hash = gerarHash(novaSenha);
  db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?').run(hash, req.params.id);

  registrarAuditoria({ usuarioId: req.usuario.id, usuarioNome: req.usuario.usuario, acao: AUDIT_ACTIONS.PASSWORD_RESET, detalhes: { usuarioAlvo: user.usuario }, req });
  res.json({ success: true, senha_inicial: novaSenha });
});

// Desativar usuário (manter histórico)
router.delete('/usuarios/:id', middlewareAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.id === req.usuario.id) return res.status(400).json({ error: 'Você não pode desativar sua própria conta' });

  if (user.perfil === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as total FROM usuarios WHERE perfil = 'admin' AND ativo = 1").get();
    if (adminCount.total <= 1) {
      return res.status(400).json({ error: 'Não é possível desativar o último administrador ativo' });
    }
  }

  db.prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?').run(req.params.id);
  registrarAuditoria({ usuarioId: req.usuario.id, usuarioNome: req.usuario.usuario, acao: AUDIT_ACTIONS.USER_DEACTIVATED, detalhes: { usuarioAlvo: user.usuario }, req });
  res.json({ success: true });
});

// Auditoria (somente admin)
router.get('/auditoria', middlewareAdmin, (req, res) => {
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
});

module.exports = router;