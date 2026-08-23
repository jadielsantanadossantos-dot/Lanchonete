ALTER TABLE pedidos ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_cliente_id_fkey;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
