-- Usuario administrador da demo (login demo/demo), apenas no ambiente demonstrativo
-- hash bcrypt para senha "demo"
INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha) VALUES
    ('Administrador Demo', 'demo', '$2a$10$JghWnajrvrIPrskG3diTweooG0K81cryK1cNc0sSB.TYHy9R.dMUW', 'admin', true, false)
ON CONFLICT (usuario) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, perfil = 'admin', ativo = true;
