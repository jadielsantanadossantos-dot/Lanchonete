-- Initial schema for Lanchonete migrated from SQLite to PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Categorias
CREATE TABLE categorias (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    ordem INTEGER DEFAULT 0,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Produtos
CREATE TABLE produtos (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    categoria_id BIGINT NOT NULL REFERENCES categorias(id),
    descricao TEXT,
    preco NUMERIC(10,2) NOT NULL,
    foto TEXT,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Adicionais
CREATE TABLE adicionais (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    preco NUMERIC(10,2) NOT NULL,
    categoria_id BIGINT REFERENCES categorias(id),
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Produto_Adicionais (many-to-many)
CREATE TABLE produto_adicionais (
    produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    adicional_id BIGINT NOT NULL REFERENCES adicionais(id) ON DELETE CASCADE,
    PRIMARY KEY (produto_id, adicional_id)
);

-- Clientes
CREATE TABLE clientes (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL UNIQUE,
    rua TEXT,
    numero TEXT,
    bairro TEXT,
    complemento TEXT,
    ponto_referencia TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Bairros
CREATE TABLE bairros (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    taxa_entrega NUMERIC(10,2) NOT NULL DEFAULT 0,
    atendido BOOLEAN DEFAULT true,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos
CREATE TABLE pedidos (
    id BIGSERIAL PRIMARY KEY,
    cliente_id BIGINT NOT NULL REFERENCES clientes(id),
    subtotal NUMERIC(10,2) NOT NULL,
    taxa_entrega NUMERIC(10,2) NOT NULL DEFAULT 0,
    total NUMERIC(10,2) NOT NULL,
    forma_pagamento TEXT NOT NULL,
    status TEXT DEFAULT 'recebido',
    pix_confirmado BOOLEAN DEFAULT false,
    observacoes TEXT,
    endereco_entrega TEXT,
    bairro_entrega TEXT,
    mesa_id BIGINT,
    comanda_id BIGINT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Pedido_Itens
CREATE TABLE pedido_itens (
    id BIGSERIAL PRIMARY KEY,
    pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    produto_id BIGINT NOT NULL REFERENCES produtos(id),
    produto_nome TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario NUMERIC(10,2) NOT NULL,
    observacao TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Pedido_Item_Adicionais
CREATE TABLE pedido_item_adicionais (
    id BIGSERIAL PRIMARY KEY,
    pedido_item_id BIGINT NOT NULL REFERENCES pedido_itens(id) ON DELETE CASCADE,
    adicional_nome TEXT NOT NULL,
    preco NUMERIC(10,2) NOT NULL,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Configuracoes
CREATE TABLE configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT,
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Mesas
CREATE TABLE mesas (
    id BIGSERIAL PRIMARY KEY,
    numero INTEGER NOT NULL UNIQUE,
    nome TEXT,
    capacidade INTEGER DEFAULT 4,
    status TEXT DEFAULT 'livre',
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Comandas
CREATE TABLE comandas (
    id BIGSERIAL PRIMARY KEY,
    mesa_id BIGINT NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
    cliente_nome TEXT,
    status TEXT DEFAULT 'aberta',
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    fechada_em TIMESTAMPTZ
);

-- Comanda_Itens
CREATE TABLE comanda_itens (
    id BIGSERIAL PRIMARY KEY,
    comanda_id BIGINT NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
    produto_id BIGINT NOT NULL REFERENCES produtos(id),
    produto_nome TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario NUMERIC(10,2) NOT NULL,
    observacao TEXT,
    adicionais_json JSONB,
    enviado_cozinha BOOLEAN DEFAULT false,
    pedido_item_id BIGINT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Usuarios (para auth customizado - pode ser substituído por Supabase Auth)
CREATE TABLE usuarios (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    usuario TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'garcom' CHECK (perfil IN ('admin', 'garcom')),
    ativo BOOLEAN DEFAULT true,
    trocar_senha BOOLEAN DEFAULT false,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Auditoria
CREATE TABLE auditoria (
    id BIGSERIAL PRIMARY KEY,
    usuario_id BIGINT REFERENCES usuarios(id),
    usuario_nome TEXT,
    acao TEXT NOT NULL,
    detalhes TEXT,
    ip TEXT,
    user_agent TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_produtos_categoria ON produtos(categoria_id);
CREATE INDEX idx_produtos_ativo ON produtos(ativo);
CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX idx_pedidos_status ON pedidos(status);
CREATE INDEX idx_pedidos_criado_em ON pedidos(criado_em);
CREATE INDEX idx_pedido_itens_pedido ON pedido_itens(pedido_id);
CREATE INDEX idx_comandas_mesa ON comandas(mesa_id);
CREATE INDEX idx_comandas_status ON comandas(status);
CREATE INDEX idx_comanda_itens_comanda ON comanda_itens(comanda_id);
CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_criado_em ON auditoria(criado_em);

-- Trigger for updated_at on pedidos
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pedidos_atualizado_em
    BEFORE UPDATE ON pedidos
    FOR EACH ROW
    EXECUTE FUNCTION update_atualizado_em();

-- Trigger for updated_at on configuracoes
CREATE TRIGGER trigger_configuracoes_atualizado_em
    BEFORE UPDATE ON configuracoes
    FOR EACH ROW
    EXECUTE FUNCTION update_atualizado_em();

-- Insert default categories
INSERT INTO categorias (nome, ordem) VALUES
    ('Lanches', 1),
    ('Bebidas', 2),
    ('Porções', 3),
    ('Sobremesas', 4)
ON CONFLICT (nome) DO NOTHING;

-- Insert default configs
INSERT INTO configuracoes (chave, valor) VALUES
    ('pix_chave', ''),
    ('pix_tipo', 'cpf'),
    ('pix_nome', 'Lanchonete'),
    ('loja_nome', 'Minha Lanchonete'),
    ('loja_telefone', '')
ON CONFLICT (chave) DO NOTHING;

-- Insert default mesas (1-20)
INSERT INTO mesas (numero, nome, capacidade, status)
SELECT i, 'Mesa ' || i, 4, 'livre'
FROM generate_series(1, 20) i
ON CONFLICT (numero) DO NOTHING;