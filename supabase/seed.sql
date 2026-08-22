-- Seed data for development

-- Default admin user (password: admin123 - change in production!)
-- Hash generated with bcrypt cost 10
INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha) VALUES
    ('Administrador', 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', true, true)
ON CONFLICT (usuario) DO NOTHING;

-- Default garçom user (password: garcom123)
INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha) VALUES
    ('Garçom', 'garcom', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'garcom', true, true)
ON CONFLICT (usuario) DO NOTHING;

-- Sample products
INSERT INTO produtos (nome, categoria_id, descricao, preco, ativo) VALUES
    ('X-Burger', 1, 'Hambúrguer, queijo, alface, tomate', 25.00, true),
    ('X-Bacon', 1, 'Hambúrguer, queijo, bacon, alface, tomate', 28.00, true),
    ('X-Tudo', 1, 'Hambúrguer, queijo, bacon, ovo, alface, tomate', 32.00, true),
    ('Coca-Cola 350ml', 2, 'Refrigerante lata', 6.00, true),
    ('Guaraná 350ml', 2, 'Refrigerante lata', 5.50, true),
    ('Suco Natural 300ml', 2, 'Laranja, limão, maracujá', 8.00, true),
    ('Batata Frita', 3, 'Porção média', 18.00, true),
    ('Onion Rings', 3, 'Anéis de cebola empanados', 20.00, true),
    ('Pudim', 4, 'Pudim de leite condensado', 10.00, true),
    ('Sorvete 2 bolas', 4, 'Sabores: chocolate, baunilha, morango', 12.00, true)
ON CONFLICT DO NOTHING;

-- Sample adicionais
INSERT INTO adicionais (nome, preco, ativo) VALUES
    ('Queijo extra', 3.00, true),
    ('Bacon extra', 4.00, true),
    ('Ovo', 2.00, true),
    ('Batata frita', 5.00, true),
    ('Molho especial', 1.50, true)
ON CONFLICT DO NOTHING;

-- Link some adicionais to produtos
INSERT INTO produto_adicionais (produto_id, adicional_id)
SELECT p.id, a.id FROM produtos p, adicionais a
WHERE p.nome IN ('X-Burger', 'X-Bacon', 'X-Tudo') AND a.nome IN ('Queijo extra', 'Bacon extra', 'Ovo')
ON CONFLICT DO NOTHING;

-- Sample bairros
INSERT INTO bairros (nome, taxa_entrega, atendido) VALUES
    ('Centro', 0.00, true),
    ('Jardim América', 5.00, true),
    ('Vila Nova', 7.00, true),
    ('Bairro Alto', 8.00, true),
    ('São Cristóvão', 6.00, false)
ON CONFLICT (nome) DO NOTHING;