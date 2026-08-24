-- Tabela de vinculo N:N entre adicionais e produtos
-- Permite que um adicional esteja ligado a varios produtos especificos
CREATE TABLE IF NOT EXISTS adicional_produtos (
  adicional_id INTEGER NOT NULL REFERENCES adicionais(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  PRIMARY KEY (adicional_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_adicional_produtos_produto ON adicional_produtos(produto_id);

-- Migra vinculos existentes da coluna legado adicionais.produto_id
INSERT INTO adicional_produtos (adicional_id, produto_id)
SELECT id, produto_id FROM adicionais WHERE produto_id IS NOT NULL
ON CONFLICT DO NOTHING;
