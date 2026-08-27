-- Corrige login demo PDV: volta demo/demo admin (observador causava volta ao login)
-- CHECK já permite observador, mas demo deve ser admin para PDV funcionar

UPDATE usuarios SET
  nome = 'Administrador Demo',
  senha_hash = '$2a$10$JghWnajrvrIPrskG3diTweooG0K81cryK1cNc0sSB.TYHy9R.dMUW',
  perfil = 'admin',
  ativo = true,
  trocar_senha = false
WHERE usuario = 'demo';

INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha)
VALUES ('Administrador Demo','demo','$2a$10$JghWnajrvrIPrskG3diTweooG0K81cryK1cNc0sSB.TYHy9R.dMUW','admin',true,false)
ON CONFLICT (usuario) DO UPDATE SET senha_hash=EXCLUDED.senha_hash, perfil='admin', ativo=true;
