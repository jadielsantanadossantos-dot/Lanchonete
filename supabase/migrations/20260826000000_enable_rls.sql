-- Habilita RLS em todas as tabelas sensiveis
-- anon (SUPABASE_ANON_KEY) fica sem acesso direto via REST; apenas service_role (backend) passa
-- service_role bypassa RLS por padrão no Supabase, então basta habilitar sem policies para bloquear anon

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'usuarios','clientes','pedidos','pedido_itens','pedido_item_adicionais',
    'categorias','produtos','adicionais','produto_adicionais','adicional_produtos',
    'bairros','mesas','comandas','motoboys','configuracoes','auditoria'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXCEPTION WHEN undefined_table THEN
      -- tabela pode não existir (ex: adicional_produtos legado)
      NULL;
    END;
  END LOOP;
END $$;

-- Opcional: policy explícita de negação para anon (documenta intenção)
-- Não necessária pois sem policy anon já é bloqueado, mas deixa claro
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['usuarios','clientes','pedidos']) LOOP
    BEGIN
      EXECUTE format('CREATE POLICY "deny_anon_all" ON %I FOR ALL TO anon USING (false)', t);
    EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
    END;
  END LOOP;
END $$;
