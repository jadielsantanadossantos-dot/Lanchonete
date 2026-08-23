-- Adicionar coluna tipo em adicionais para diferenciar sabores de outros adicionais
ALTER TABLE adicionais ADD COLUMN tipo TEXT DEFAULT 'adicional' CHECK (tipo IN ('adicional', 'sabor'));

-- Criar índice para melhor performance ao filtrar por tipo
CREATE INDEX idx_adicionais_tipo ON adicionais(tipo);
