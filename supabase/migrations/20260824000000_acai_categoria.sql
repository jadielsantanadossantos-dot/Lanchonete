-- Configuração do Açaí: categoria, bases, coberturas e acompanhamentos
-- Açaí tem preço por kg (R$25/kg). Adicionais são gratuitos (incluídos no preço do kg)

-- Criar categoria Açaí
INSERT INTO categorias (nome, ordem) VALUES
    ('Açaí', 5)
ON CONFLICT (nome) DO NOTHING;

-- Inserir bases de açaí (tipo=base, unidade=kg, preço por kg)
INSERT INTO produtos (nome, categoria_id, descricao, preco, ativo, unidade) VALUES
    ('Açaí Tradicional', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Base de Açaí tradicional', 25.00, true, 'kg'),
    ('Açaí Cremoso', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Base de Açaí cremoso', 25.00, true, 'kg'),
    ('Mesclado de Banana', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Mesclado de banana', 25.00, true, 'kg'),
    ('Mesclado de Morango', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Mesclado de morango', 25.00, true, 'kg'),
    ('Cupuaçu', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Base de Cupuaçu', 25.00, true, 'kg'),
    ('Cupuaçu com Morango', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Cupuaçu com morango', 25.00, true, 'kg'),
    ('Oca Power', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Base de Oca power', 25.00, true, 'kg'),
    ('Maltine', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Base de Maltine', 25.00, true, 'kg'),
    ('Oreo', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Base com Oreo', 25.00, true, 'kg'),
    ('Ninho Trufado', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Base com Ninho trufado', 25.00, true, 'kg'),
    ('Sorvete de Morango', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Base com sorvete de morango', 25.00, true, 'kg'),
    ('Sorvete de Chocolate', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Base com sorvete de chocolate', 25.00, true, 'kg'),
    ('Sorvete de Leite Condensado', (SELECT id FROM categorias WHERE nome = 'Açaí'), 'Base com sorvete de leite condensado', 25.00, true, 'kg')
ON CONFLICT DO NOTHING;

-- Inserir bases como adicionais do tipo 'base' (limite 1 - escolher 1 base, preço 0 = incluído)
INSERT INTO adicionais (nome, preco, categoria_id, tipo, descricao, limite, ativo) VALUES
    ('Açaí Tradicional', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'base', 'Base tradicional', 1, true),
    ('Açaí Cremoso', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'base', 'Base cremosa', 1, true),
    ('Cupuaçu', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'base', 'Base de cupuaçu', 1, true),
    ('Maltine', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'base', 'Base de maltine', 1, true),
    ('Oreo', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'base', 'Base com Oreo', 1, true),
    ('Ninho Trufado', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'base', 'Base com ninho trufado', 1, true)
ON CONFLICT DO NOTHING;

-- Coberturas (tipo=cobertura, preço 0 = incluído, limite 0 = ilimitado)
INSERT INTO adicionais (nome, preco, categoria_id, tipo, descricao, limite, ativo) VALUES
    ('Morango', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'cobertura', 'Morango fatiado', 0, true),
    ('Chocolate', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'cobertura', 'Chocolate granulado', 0, true),
    ('Pistache', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'cobertura', 'Pistache picado', 0, true),
    ('Maracaju', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'cobertura', 'Polpa de maracaju', 0, true),
    ('Caramelo', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'cobertura', 'Calda de caramelo', 0, true),
    ('Leite Condensado', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'cobertura', 'Leite condensado', 0, true)
ON CONFLICT DO NOTHING;

-- Acompanhamentos (tipo=acompanhamento, preço 0 = incluído, limite 0 = ilimitado)
INSERT INTO adicionais (nome, preco, categoria_id, tipo, descricao, limite, ativo) VALUES
    ('Amendoim', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Amendoim picado', 0, true),
    ('Amendoim Triturado', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Amendoim triturado', 0, true),
    ('Granola', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Granola crocante', 0, true),
    ('Leite em Po', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Leite em po', 0, true),
    ('Farinha Lactea', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Farinha lactea', 0, true),
    ('Pacoca', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Pacoca', 0, true),
    ('MM', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'M&M', 0, true),
    ('Fini Bananinha', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Fini Bananinha', 0, true),
    ('Fini Beijinho', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Fini Beijinho', 0, true),
    ('Fini Amora', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Fini Amora', 0, true),
    ('Marshmallow', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Marshmallow', 0, true),
    ('Chocoboll Misturado', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Chocoboll misturado', 0, true),
    ('Chocoboll', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Chocoboll', 0, true),
    ('Jujuba', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Jujuba', 0, true),
    ('Gotas de Chocolate', 0.00, (SELECT id FROM categorias WHERE nome = 'Açaí'), 'acompanhamento', 'Gotas de chocolate', 0, true)
ON CONFLICT DO NOTHING;
