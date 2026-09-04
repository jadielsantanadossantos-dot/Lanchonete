-- Corrige usuario Erilane: grafia e perfil (nao altera senha_hash)
-- id 23 existia como 'erilani' admin mas login correto e 'erilane'
UPDATE usuarios SET usuario = 'erilane', perfil = 'admin' WHERE id = 23;
-- fallback por nome caso id diferente em outro ambiente
UPDATE usuarios SET usuario = 'erilane', perfil = 'admin' WHERE nome = 'Erilane' AND usuario ILIKE 'erilani%';
