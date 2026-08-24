-- Cadastro de motoboys (entregadores)
CREATE TABLE IF NOT EXISTS motoboys (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Vinculo do pedido com o motoboy que fez a entrega
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS motoboy_id BIGINT REFERENCES motoboys(id) ON DELETE SET NULL;
