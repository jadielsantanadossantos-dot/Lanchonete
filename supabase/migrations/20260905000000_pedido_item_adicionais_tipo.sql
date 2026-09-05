ALTER TABLE pedido_item_adicionais ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'adicional';
UPDATE pedido_item_adicionais SET tipo='sabor' WHERE preco=0 AND tipo='adicional';
UPDATE pedido_item_adicionais pia SET tipo='borda'
FROM pedido_itens pi JOIN produtos p ON p.id=pi.produto_id
WHERE pia.pedido_item_id=pi.id AND pia.tipo='adicional'
  AND UPPER(TRIM(pia.adicional_nome)) IN ('CHOCOLATE','CHOCOLATE BRANCO','NUTELLA','GOIABADA','CATUPIRY','CHEDDAR','CREAM CHEESE')
  AND pia.preco IN (6,10)
  AND (p.categoria_id IN (7,26,27,28) OR p.nome ILIKE '%pizza%');
UPDATE pedido_item_adicionais pia SET tipo='borda'
FROM pedido_itens pi JOIN produtos p ON p.id=pi.produto_id
WHERE pia.pedido_item_id=pi.id AND pia.tipo='adicional'
  AND UPPER(TRIM(pia.adicional_nome)) LIKE 'BORDA %'
  AND (p.categoria_id IN (7,26,27,28) OR p.nome ILIKE '%pizza%');
