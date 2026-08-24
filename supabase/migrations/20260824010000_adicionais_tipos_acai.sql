-- Extensão de tipos de adicionais: base, cobertura, acompanhamento
-- e adição da coluna limite para controle de quantidade máxima por tipo

-- Adicionar coluna limite (0 = ilimitado)
ALTER TABLE adicionais ADD COLUMN IF NOT EXISTS limite INTEGER DEFAULT 0;

-- Garantir que não existem valores NULL na coluna tipo (pode acontencer se coluna foi criada sem DEFAULT)
UPDATE adicionais SET tipo = 'adicional' WHERE tipo IS NULL;

-- Atualizar constraint de tipo para incluir os novos tipos do açaí
-- Primeiro remover constraint antiga e recriar com novos valores
ALTER TABLE adicionais DROP CONSTRAINT IF EXISTS check_tipo_valid;

ALTER TABLE adicionais 
ADD CONSTRAINT check_tipo_valid 
CHECK (tipo IN ('adicional', 'sabor', 'base', 'cobertura', 'acompanhamento'));

-- Recriar índice para incluir ordem por tipo + limite
CREATE INDEX IF NOT EXISTS idx_adicionais_tipo_limite ON adicionais(tipo, limite);
