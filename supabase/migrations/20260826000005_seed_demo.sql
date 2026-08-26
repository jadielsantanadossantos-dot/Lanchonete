-- Seed para DEMO: categorias, produtos, adicionais, bairros, motoboys, configs, usuarios demo
-- Dados ficticios, sem dados reais de clientes/pedidos

-- Usuario demo (admin/demo) com senha bcrypt
INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha) VALUES
    ('Admin Demo', 'demo', '$2a$10$8c79174UH.Q6.jHcUMMV6.dH34k/fxNWqkJczWC6qixSq1ylcE0am', 'admin', true, false)
ON CONFLICT (usuario) DO UPDATE SET senha_hash=EXCLUDED.senha_hash, perfil='admin', ativo=true;

-- Configs demo
INSERT INTO configuracoes (chave, valor) VALUES
    ('loja_nome', 'Lanchonete Demo'),
    ('loja_telefone', ''),
    ('pix_chave', ''),
    ('pix_tipo', 'cpf'),
    ('pix_nome', 'Lanchonete Demo'),
    ('tempo_espera', '30-40 min'),
    ('whatsapp_mensagem_saiu_entrega', 'Olá {nome}! Seu pedido #{id} saiu para entrega 🛵 - {loja}. Total R$ {total}'),
    ('loja_aberta', 'true')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

-- Motoboys demo
INSERT INTO motoboys (nome, telefone, ativo) VALUES
    ('Motoboy Demo 1', NULL, true),
    ('Motoboy Demo 2', NULL, true)
ON CONFLICT DO NOTHING;
