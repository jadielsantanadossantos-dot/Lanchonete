-- Adicionar coluna produto_id na tabela adicionais
-- Para permitir adicionais específicos de um produto
ALTER TABLE adicionais 
ADD COLUMN produto_id BIGINT REFERENCES produtos(id) ON DELETE CASCADE;

-- Índice para performance
CREATE INDEX idx_adicionais_produto ON adicionais(produto_id);
