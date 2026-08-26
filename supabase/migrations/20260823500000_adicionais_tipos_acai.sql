-- Extensao de tipos de adicionais: base, cobertura, acompanhamento
-- e adicao da coluna limite para controle de quantidade maxima por tipo

-- Adicionar coluna limite (0 = ilimitado)
ALTER TABLE adicionais ADD COLUMN IF NOT EXISTS limite INTEGER DEFAULT 0;

-- Garantir que nao existem valores NULL na coluna tipo (pode acontecer se coluna foi criada sem DEFAULT)
UPDATE adicionais SET tipo = 'adicional' WHERE tipo IS NULL;

-- Atualizar constraint de tipo para incluir os novos tipos do acai
-- Primeiro remover todas as constraints de tipo antigas (a nomeada check_tipo_valid
-- e a auto-gerada adicionais_tipo_check vinda de CHECK inline em migrations anteriores)
ALTER TABLE adicionais DROP CONSTRAINT IF EXISTS check_tipo_valid;
ALTER TABLE adicionais DROP CONSTRAINT IF EXISTS adicionais_tipo_check;

ALTER TABLE adicionais
ADD CONSTRAINT check_tipo_valid
CHECK (tipo IN ('adicional', 'sabor', 'base', 'cobertura', 'acompanhamento'));

-- Recriar indice para incluir ordem por tipo + limite
CREATE INDEX IF NOT EXISTS idx_adicionais_tipo_limite ON adicionais(tipo, limite);
