CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  pedido_id BIGINT REFERENCES pedidos(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_criado ON idempotency_keys(criado_em);
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE idempotency_keys TO service_role;
