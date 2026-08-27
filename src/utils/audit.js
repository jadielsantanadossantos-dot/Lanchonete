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

async function registrarAuditoria({ usuarioId, usuarioNome, acao, detalhes = null, req = null }) {
  try {
    const ip = req?.ip || req?.connection?.remoteAddress || 'unknown';
    const userAgent = req?.headers?.['user-agent'] || 'unknown';

    await db.run(`
      INSERT INTO auditoria (usuario_id, usuario_nome, acao, detalhes, ip, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, usuarioId || null, usuarioNome || null, acao, detalhes ? JSON.stringify(detalhes) : null, ip, userAgent);
  } catch (e) {
    console.error('Erro ao registrar auditoria:', e);
  }
}

async function getAuditoria(filtros = {}) {
  let sql = 'SELECT * FROM auditoria WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (filtros.usuarioId) {
    sql += ` AND usuario_id = $${paramIndex++}`;
    params.push(filtros.usuarioId);
  }
  if (filtros.acao) {
    sql += ` AND acao = $${paramIndex++}`;
    params.push(filtros.acao);
  }
  if (filtros.dataInicio) {
    sql += ` AND criado_em >= $${paramIndex++}`;
    params.push(filtros.dataInicio);
  }
  if (filtros.dataFim) {
    sql += ` AND criado_em <= $${paramIndex++}`;
    params.push(filtros.dataFim + ' 23:59:59');
  }
  sql += ' ORDER BY criado_em DESC';

  if (filtros.limite) {
    sql += ` LIMIT $${paramIndex}`;
    params.push(filtros.limite);
  }

  return db.all(sql, ...params);
}

module.exports = {
  registrarAuditoria,
  getAuditoria,
  AUDIT_ACTIONS
};