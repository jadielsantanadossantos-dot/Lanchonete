const db = require('../db/database');

const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  CONFIG_CHANGED: 'CONFIG_CHANGED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED'
};

function registrarAuditoria({ usuarioId, usuarioNome, acao, detalhes = null, req = null }) {
  try {
    const ip = req?.ip || req?.connection?.remoteAddress || 'unknown';
    const userAgent = req?.headers?.['user-agent'] || 'unknown';

    db.prepare(`
      INSERT INTO auditoria (usuario_id, usuario_nome, acao, detalhes, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(usuarioId || null, usuarioNome || null, acao, detalhes ? JSON.stringify(detalhes) : null, ip, userAgent);
  } catch (e) {
    console.error('Erro ao registrar auditoria:', e);
  }
}

function getAuditoria(filtros = {}) {
  let sql = 'SELECT * FROM auditoria WHERE 1=1';
  const params = [];

  if (filtros.usuarioId) {
    sql += ' AND usuario_id = ?';
    params.push(filtros.usuarioId);
  }
  if (filtros.acao) {
    sql += ' AND acao = ?';
    params.push(filtros.acao);
  }
  if (filtros.dataInicio) {
    sql += ' AND criado_em >= ?';
    params.push(filtros.dataInicio);
  }
  if (filtros.dataFim) {
    sql += ' AND criado_em <= ?';
    params.push(filtros.dataFim + ' 23:59:59');
  }
  if (filtros.limite) {
    sql += ' LIMIT ?';
    params.push(filtros.limite);
  }

  sql += ' ORDER BY criado_em DESC';

  return db.prepare(sql).all(...params);
}

module.exports = {
  registrarAuditoria,
  getAuditoria,
  AUDIT_ACTIONS
};