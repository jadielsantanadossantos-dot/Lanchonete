-- Tabela para revogação de refresh tokens (logout / expiração forçada)
CREATE TABLE IF NOT EXISTS refresh_tokens_revogados (
  token_hash TEXT PRIMARY KEY,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE CASCADE,
  revogado_em TIMESTAMPTZ DEFAULT NOW(),
  expira_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refresh_revogados_expira ON refresh_tokens_revogados(expira_em);
