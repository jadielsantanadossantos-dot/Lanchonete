-- Adicionais por categoria: NULL = disponivel em todas as categorias
ALTER TABLE adicionais ADD COLUMN IF NOT EXISTS categoria_id BIGINT REFERENCES categorias(id);

CREATE INDEX IF NOT EXISTS idx_adicionais_categoria ON adicionais(categoria_id);
