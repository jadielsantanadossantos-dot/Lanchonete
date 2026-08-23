-- Verificar e adicionar coluna tipo se não existir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'adicionais' AND column_name = 'tipo'
  ) THEN
    ALTER TABLE adicionais ADD COLUMN tipo TEXT DEFAULT 'adicional' CHECK (tipo IN ('adicional', 'sabor'));
    CREATE INDEX idx_adicionais_tipo ON adicionais(tipo);
  END IF;
END $$;
