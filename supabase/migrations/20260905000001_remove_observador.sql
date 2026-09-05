DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='usuarios'::regclass AND conname='usuarios_perfil_check') THEN
    ALTER TABLE usuarios DROP CONSTRAINT usuarios_perfil_check;
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check CHECK (perfil IN ('admin','garcom'));

UPDATE usuarios SET perfil = 'admin' WHERE perfil = 'observador';

DELETE FROM usuarios WHERE perfil = 'observador';
