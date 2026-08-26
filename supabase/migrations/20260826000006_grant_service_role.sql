-- Forca acesso do service_role (usado pelo backend) sobre todas as tabelas do demo
-- (necessario se migrations anteriores revogaram privileges acidentalmente)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;
