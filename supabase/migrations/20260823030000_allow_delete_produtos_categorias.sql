ALTER TABLE pedido_itens ALTER COLUMN produto_id DROP NOT NULL;
ALTER TABLE pedido_itens DROP CONSTRAINT IF EXISTS pedido_itens_produto_id_fkey;
ALTER TABLE pedido_itens ADD CONSTRAINT pedido_itens_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;

ALTER TABLE comanda_itens ALTER COLUMN produto_id DROP NOT NULL;
ALTER TABLE comanda_itens DROP CONSTRAINT IF EXISTS comanda_itens_produto_id_fkey;
ALTER TABLE comanda_itens ADD CONSTRAINT comanda_itens_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;

ALTER TABLE produtos DROP CONSTRAINT IF EXISTS produtos_categoria_id_fkey;
ALTER TABLE produtos ADD CONSTRAINT produtos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL;

ALTER TABLE adicionais DROP CONSTRAINT IF EXISTS adicionais_categoria_id_fkey;
ALTER TABLE adicionais ADD CONSTRAINT adicionais_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL;
