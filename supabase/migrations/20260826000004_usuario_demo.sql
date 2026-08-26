-- Usuário administrador da demo (login demo/demo), apenas no ambiente demonstrativo
INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha) VALUES
    ('Administrador Demo', 'demo', '$2a$10$8c79174UH.Q6.jHcUMMV6.dH34k/fxNWqkJczWC6qixSq1ylcE0am', 'admin', true, false)
ON CONFLICT (usuario) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, perfil = 'admin', ativo = true;
