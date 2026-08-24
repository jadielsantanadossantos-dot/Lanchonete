-- Produtos exclusivos para venda na loja (visiveis apenas para garcom)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS somente_garcom BOOLEAN NOT NULL DEFAULT false;
