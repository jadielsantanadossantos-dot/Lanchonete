-- Inserir categorias de pizzas
INSERT INTO categorias (nome, ordem) VALUES
('Pizza Tradicional', 10),
('Pizza Tradicional Doce', 11),
('Pizza Especial', 12),
('Pizza Especial Doce', 13)
ON CONFLICT (nome) DO NOTHING;

-- Inserir produtos Pizza Tradicional
INSERT INTO produtos (nome, categoria_id, descricao, preco, ativo) VALUES
('Pizza Tradicional P', (SELECT id FROM categorias WHERE nome = 'Pizza Tradicional'), 'Pequena - Até 3 sabores', 22.00, true),
('Pizza Tradicional M', (SELECT id FROM categorias WHERE nome = 'Pizza Tradicional'), 'Média - Até 3 sabores', 28.00, true),
('Pizza Tradicional G', (SELECT id FROM categorias WHERE nome = 'Pizza Tradicional'), 'Grande - Até 3 sabores', 36.00, true),
('Pizza Tradicional F', (SELECT id FROM categorias WHERE nome = 'Pizza Tradicional'), 'Família - Até 3 sabores', 44.00, true)
ON CONFLICT DO NOTHING;

-- Inserir produtos Pizza Tradicional Doce
INSERT INTO produtos (nome, categoria_id, descricao, preco, ativo) VALUES
('Pizza Tradicional Doce P', (SELECT id FROM categorias WHERE nome = 'Pizza Tradicional Doce'), 'Pequena - Até 3 sabores', 22.00, true),
('Pizza Tradicional Doce M', (SELECT id FROM categorias WHERE nome = 'Pizza Tradicional Doce'), 'Média - Até 3 sabores', 28.00, true),
('Pizza Tradicional Doce G', (SELECT id FROM categorias WHERE nome = 'Pizza Tradicional Doce'), 'Grande - Até 3 sabores', 36.00, true),
('Pizza Tradicional Doce F', (SELECT id FROM categorias WHERE nome = 'Pizza Tradicional Doce'), 'Família - Até 3 sabores', 44.00, true)
ON CONFLICT DO NOTHING;

-- Inserir produtos Pizza Especial
INSERT INTO produtos (nome, categoria_id, descricao, preco, ativo) VALUES
('Pizza Especial P', (SELECT id FROM categorias WHERE nome = 'Pizza Especial'), 'Pequena - Até 3 sabores', 25.00, true),
('Pizza Especial M', (SELECT id FROM categorias WHERE nome = 'Pizza Especial'), 'Média - Até 3 sabores', 32.00, true),
('Pizza Especial G', (SELECT id FROM categorias WHERE nome = 'Pizza Especial'), 'Grande - Até 3 sabores', 40.00, true),
('Pizza Especial F', (SELECT id FROM categorias WHERE nome = 'Pizza Especial'), 'Família - Até 3 sabores', 48.00, true)
ON CONFLICT DO NOTHING;

-- Inserir produtos Pizza Especial Doce
INSERT INTO produtos (nome, categoria_id, descricao, preco, ativo) VALUES
('Pizza Especial Doce P', (SELECT id FROM categorias WHERE nome = 'Pizza Especial Doce'), 'Pequena - Até 3 sabores', 25.00, true),
('Pizza Especial Doce M', (SELECT id FROM categorias WHERE nome = 'Pizza Especial Doce'), 'Média - Até 3 sabores', 32.00, true),
('Pizza Especial Doce G', (SELECT id FROM categorias WHERE nome = 'Pizza Especial Doce'), 'Grande - Até 3 sabores', 40.00, true),
('Pizza Especial Doce F', (SELECT id FROM categorias WHERE nome = 'Pizza Especial Doce'), 'Família - Até 3 sabores', 48.00, true)
ON CONFLICT DO NOTHING;
