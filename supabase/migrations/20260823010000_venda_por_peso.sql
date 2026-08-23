-- Venda por peso: produtos podem ser por unidade ou por KG
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS unidade TEXT NOT NULL DEFAULT 'un';

-- Quantidades fracionadas (ex: 0.5 kg de acai)
ALTER TABLE pedido_itens ALTER COLUMN quantidade TYPE NUMERIC(6,3);
ALTER TABLE comanda_itens ALTER COLUMN quantidade TYPE NUMERIC(6,3);
