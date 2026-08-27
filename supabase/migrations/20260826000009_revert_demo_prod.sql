-- Reverte demo em produção para admin (observador fica só na demo separada bmbkrtotssoldlcymggn)
-- Mantém CHECK com observador liberado (não quebra demo), mas produção volta a admin/demo
-- Só reverte se loja_nome NÃO for Demo (produção = Anderson Lanches)

DO $$
DECLARE
  loja TEXT;
BEGIN
  SELECT valor INTO loja FROM configuracoes WHERE chave='loja_nome';
  -- Se for Demo, mantém observador (não faz nada); se for produção, reverte
  IF loja IS NULL OR loja NOT ILIKE '%demo%' THEN
    -- Volta demo para admin com senha "demo" (hash anterior)
    UPDATE usuarios SET
      nome = 'Administrador Demo',
      senha_hash = '$2a$10$JghWnajrvrIPrskG3diTweooG0K81cryK1cNc0sSB.TYHy9R.dMUW',
      perfil = 'admin',
      ativo = true,
      trocar_senha = false
    WHERE usuario = 'demo' AND perfil = 'observador';
    -- Se não existia demo observador, garante admin demo/demo
    INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha)
    VALUES ('Administrador Demo','demo','$2a$10$JghWnajrvrIPrskG3diTweooG0K81cryK1cNc0sSB.TYHy9R.dMUW','admin',true,false)
    ON CONFLICT (usuario) DO NOTHING;
  END IF;
END $$;
