-- Limite de sabores configuravel por produto (0 = automatico por tamanho da pizza)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS limite_sabores INTEGER NOT NULL DEFAULT 0;
