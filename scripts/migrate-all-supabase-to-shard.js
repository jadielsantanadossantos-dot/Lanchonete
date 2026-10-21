const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// Configurações
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Lê a string de conexão da variável de ambiente SHARDCLOUD_DB_URL no .env
const SHARDCLOUD_DB_URL = process.env.SHARDCLOUD_DB_URL;

async function migrateAll() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('Erro: SUPABASE_URL e SUPABASE_KEY precisam estar definidos no .env');
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const pgClient = new Client({ connectionString: SHARDCLOUD_DB_URL });

    try {
        await pgClient.connect();
        console.log('Conectado ao banco de dados da ShardCloud com sucesso!');

        // Ordem correta para respeitar chaves estrangeiras (Foreign Keys)
        const tables = [
            'categorias',
            'produtos',
            'adicionais',
            'produto_adicionais',
            'clientes',
            'bairros',
            'mesas',
            'comandas',
            'usuarios',
            'configuracoes',
            'pedidos',
            'pedido_itens',
            'pedido_item_adicionais',
            'comanda_itens',
            'auditoria'
        ];

        for (const table of tables) {
            console.log(`Buscando dados da tabela ${table} no Supabase...`);
            const { data, error } = await supabase.from(table).select('*');
            
            if (error) {
                console.warn(`[AVISO] Não foi possível buscar ${table}:`, error.message);
                continue;
            }

            if (!data || data.length === 0) {
                console.log(`Tabela ${table} está vazia no Supabase. Pulando...`);
                continue;
            }

            console.log(`Migrando ${data.length} registros da tabela ${table}...`);

            for (const row of data) {
                const keys = Object.keys(row);
                const values = Object.values(row);
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
                
                const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
                
                try {
                    await pgClient.query(query, values);
                } catch (err) {
                    console.error(`Erro ao inserir registro na tabela ${table}:`, err.message);
                }
            }
            console.log(`Tabela ${table} migrada com sucesso!`);
        }

        console.log('Migração completa de todas as tabelas finalizada com sucesso!');
    } catch (err) {
        console.error('Erro durante a migração:', err);
    } finally {
        await pgClient.end();
    }
}

migrateAll();
