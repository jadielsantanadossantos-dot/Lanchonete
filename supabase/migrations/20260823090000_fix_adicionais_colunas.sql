-- Adicionar colunas tipo e descricao se não existirem
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adicionais' AND column_name = 'tipo'
  ) THEN
    ALTER TABLE adicionais ADD COLUMN tipo TEXT DEFAULT 'adicional';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adicionais' AND column_name = 'descricao'
  ) THEN
    ALTER TABLE adicionais ADD COLUMN descricao TEXT;
  END IF;
END $$;

-- Adicionar constraint se tipo não tiver
ALTER TABLE adicionais 
ADD CONSTRAINT check_tipo_valid CHECK (tipo IN ('adicional', 'sabor'));

-- Criar índice
CREATE INDEX IF NOT EXISTS idx_adicionais_tipo ON adicionais(tipo);
