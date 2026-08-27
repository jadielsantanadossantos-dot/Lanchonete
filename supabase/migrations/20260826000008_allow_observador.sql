-- Permite perfil observador (demo somente leitura) - corrige CHECK herdado do SQLite
-- e garante usuario demo observador demo1234 alinhado ao panfleto

-- Remove CHECK antigo (admin,garcom) se existir e recria com observador
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='usuarios'::regclass AND conname='usuarios_perfil_check') THEN
    ALTER TABLE usuarios DROP CONSTRAINT usuarios_perfil_check;
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check CHECK (perfil IN ('admin','garcom','observador'));

-- Garante usuario demo observador para panfleto (demo/demo1234) somente leitura
-- hash bcrypt para "demo1234"
INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha) VALUES
  ('Demo Observador', 'demo', '$2a$10$B2yrT5823I2XYMktdzkNqOc9fav5O8Vlk8s0FLTTfOFb6czgz5/Z6', 'observador', true, false)
ON CONFLICT (usuario) DO UPDATE SET
  nome = EXCLUDED.nome,
  senha_hash = EXCLUDED.senha_hash,
  perfil = EXCLUDED.perfil,
  ativo = true,
  trocar_senha = false;

-- Mantém garcom demo para compatibilidade local (garcom/demo)
INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha) VALUES
  ('Garçom Demo', 'garcom', '$2a$10$JghWnajrvrIPrskG3diTweooG0K81cryK1cNc0sSB.TYHy9R.dMUW', 'garcom', true, false)
ON CONFLICT (usuario) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, perfil='garcom', ativo=true;
