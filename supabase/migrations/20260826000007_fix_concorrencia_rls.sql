-- Fix concorrência comandas + RLS + grants futuros
-- Índice parcial evita 2 comandas abertas na mesma mesa (race condition)
CREATE UNIQUE INDEX IF NOT EXISTS idx_comandas_mesa_aberta ON comandas(mesa_id) WHERE status = 'aberta';

-- RLS faltante para refresh_tokens_revogados (criada em 26000001)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_tokens_revogados') THEN
    EXECUTE 'ALTER TABLE refresh_tokens_revogados ENABLE ROW LEVEL SECURITY';
    -- service_role bypassa RLS, anon bloqueado por falta de policy
  END IF;
END $$;

-- Garantir que tabelas futuras herdem GRANT para service_role
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
-- Reafirmar grants atuais
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
