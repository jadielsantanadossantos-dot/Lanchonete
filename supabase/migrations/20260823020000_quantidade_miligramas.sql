-- Precisao de miligramas para vendas por valor exato
ALTER TABLE pedido_itens ALTER COLUMN quantidade TYPE NUMERIC(8,6);
ALTER TABLE comanda_itens ALTER COLUMN quantidade TYPE NUMERIC(8,6);
