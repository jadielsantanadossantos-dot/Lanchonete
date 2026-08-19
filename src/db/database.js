const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'lanchonete.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    ordem INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria_id INTEGER NOT NULL,
    descricao TEXT,
    preco REAL NOT NULL,
    foto TEXT,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
  );

  CREATE TABLE IF NOT EXISTS adicionais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    preco REAL NOT NULL,
    ativo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS produto_adicionais (
    produto_id INTEGER NOT NULL,
    adicional_id INTEGER NOT NULL,
    PRIMARY KEY (produto_id, adicional_id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
    FOREIGN KEY (adicional_id) REFERENCES adicionais(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL UNIQUE,
    rua TEXT,
    numero TEXT,
    bairro TEXT,
    complemento TEXT,
    ponto_referencia TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bairros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    taxa_entrega REAL NOT NULL DEFAULT 0,
    atendido INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    subtotal REAL NOT NULL,
    taxa_entrega REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    forma_pagamento TEXT NOT NULL,
    status TEXT DEFAULT 'recebido',
    pix_confirmado INTEGER DEFAULT 0,
    observacoes TEXT,
    endereco_entrega TEXT,
    bairro_entrega TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  );

  CREATE TABLE IF NOT EXISTS pedido_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    produto_nome TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario REAL NOT NULL,
    observacao TEXT,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );

  CREATE TABLE IF NOT EXISTS pedido_item_adicionais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_item_id INTEGER NOT NULL,
    adicional_nome TEXT NOT NULL,
    preco REAL NOT NULL,
    FOREIGN KEY (pedido_item_id) REFERENCES pedido_itens(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS mesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL UNIQUE,
    nome TEXT,
    capacidade INTEGER DEFAULT 4,
    status TEXT DEFAULT 'livre',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS comandas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesa_id INTEGER NOT NULL,
    cliente_nome TEXT,
    status TEXT DEFAULT 'aberta',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    fechada_em DATETIME,
    FOREIGN KEY (mesa_id) REFERENCES mesas(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comanda_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comanda_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    produto_nome TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario REAL NOT NULL,
    observacao TEXT,
    adicionais_json TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (comanda_id) REFERENCES comandas(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    usuario TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'garcom',
    ativo INTEGER DEFAULT 1,
    trocar_senha INTEGER DEFAULT 0,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    usuario_nome TEXT,
    acao TEXT NOT NULL,
    detalhes TEXT,
    ip TEXT,
    user_agent TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  INSERT OR IGNORE INTO categorias (nome, ordem) VALUES
    ('Lanches', 1),
    ('Bebidas', 2),
    ('Porcoes', 3),
    ('Sobremesas', 4);

  INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES
    ('pix_chave', ''),
    ('pix_tipo', 'cpf'),
    ('pix_nome', 'Lanchonete'),
    ('loja_nome', 'Minha Lanchonete'),
    ('loja_telefone', '');
`);

// Garantir auth_secret em configuracoes
let authSecret = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get('auth_secret');
if (!authSecret) {
  const novoSecret = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)').run('auth_secret', novoSecret);
}

function getAuthSecret() {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get('auth_secret');
  return row ? row.valor : crypto.randomBytes(32).toString('hex');
}

// Seed admin padrao (se nao existir nenhum admin) - REQUER SETUP MANUAL
const adminCount = db.prepare("SELECT COUNT(*) as total FROM usuarios WHERE perfil = 'admin'").get();
if (adminCount.total === 0) {
  console.warn('⚠️  NENHUM ADMIN ENCONTRADO! Crie um admin via: INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha) VALUES (?, ?, ?, ?, 1, 1)');
  console.warn('   Use bcrypt.hashSync("senha_forte", 10) para gerar o hash. O primeiro login exigirá troca de senha.');
}

// Criar mesas iniciais (1 a 20) se nao existirem
const mesaCount = db.prepare('SELECT COUNT(*) as total FROM mesas').get();
if (mesaCount.total === 0) {
  const insertMesa = db.prepare('INSERT OR IGNORE INTO mesas (numero, nome, capacidade, status) VALUES (?, ?, ?, ?)');
  const txMesas = db.transaction(() => {
    for (let i = 1; i <= 20; i++) {
      insertMesa.run(i, 'Mesa ' + i, 4, 'livre');
    }
  });
  txMesas();
}

// Adicionar mesa_id na tabela pedidos se nao existir
try {
  db.prepare('ALTER TABLE pedidos ADD COLUMN mesa_id INTEGER').run();
} catch (e) {
}

// Adicionar cliente_nome na tabela comandas se nao existir
try {
  db.prepare('ALTER TABLE comandas ADD COLUMN cliente_nome TEXT').run();
} catch (e) {
}

// Adicionar enviado_cozinha e pedido_item_id na tabela comanda_itens se nao existir
try {
  db.prepare('ALTER TABLE comanda_itens ADD COLUMN enviado_cozinha INTEGER DEFAULT 0').run();
} catch (e) {}
try {
  db.prepare('ALTER TABLE comanda_itens ADD COLUMN pedido_item_id INTEGER').run();
} catch (e) {}

// Adicionar comanda_id na tabela pedidos para vincular pedidos a comanda da mesa
try {
  db.prepare('ALTER TABLE pedidos ADD COLUMN comanda_id INTEGER').run();
} catch (e) {}

module.exports = db;