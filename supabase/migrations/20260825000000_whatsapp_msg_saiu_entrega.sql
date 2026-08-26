INSERT INTO configuracoes (chave, valor) VALUES
    ('whatsapp_mensagem_saiu_entrega', 'Olá {nome}! Seu pedido #{id} saiu para entrega 🛵 - {loja}. Total R$ {total}')
ON CONFLICT (chave) DO NOTHING;
