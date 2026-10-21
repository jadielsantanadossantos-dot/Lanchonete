const { Client } = require('pg');
require('dotenv').config();

async function clonarBanco() {
    const sourceUrl = process.env.SUPABASE_DB_URL;
    const targetUrl = process.env.SHARDCLOUD_DB_URL;

    if (!sourceUrl || !targetUrl) {
        console.error('Erro: SUPABASE_DB_URL e SHARDCLOUD_DB_URL precisam estar definidos no .env');
        process.exit(1);
    }

    const sourceClient = new Client({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false } });
    const targetClient = new Client({ connectionString: targetUrl });

    try {
        console.log('Conectando aos bancos de dados...');
        await sourceClient.connect();
        await targetClient.connect();
        console.log('Conexões estabelecidas com sucesso!\n');

        // 1. Obter todas as tabelas públicas do Supabase
        const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `;
        const resTables = await sourceClient.query(tablesQuery);
        const tables = resTables.rows.map(r => r.table_name);

        console.log(`Encontradas ${tables.length} tabelas para clonar.`);

        // 2. Desabilitar restrições temporariamente no destino
        await targetClient.query('SET session_replication_role = \'replica\';');

        for (const table of tables) {
            console.log(`\nProcessando tabela: ${table}...`);

            // Buscar dados da tabela de origem
            const dataRes = await sourceClient.query(`SELECT * FROM "${table}"`);
            const rows = dataRes.rows;

            if (rows.length === 0) {
                console.log(`-> Tabela ${table} está vazia. Pulando.`);
                continue;
            }

            console.log(`-> Encontrados ${rows.length} registros. Inserindo na ShardCloud...`);

            for (const row of rows) {
                const keys = Object.keys(row);
                const values = Object.values(row);
                const columns = keys.map(k => `"${k}"`).join(', ');
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

                const insertQuery = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

                try {
                    await targetClient.query(insertQuery, values);
                } catch (err) {
                    console.error(`Erro ao inserir linha em ${table}:`, err.message);
                }
            }
            console.log(`-> Tabela ${table} migrada com sucesso!`);
        }

        // Restaurar restrições
        await targetClient.query('SET session_replication_role = \'origin\';');
        console.log('\n✨ Migração completa do banco de dados finalizada com sucesso!');

    } catch (err) {
        console.error('Erro fatal durante a clonagem:', err);
    } finally {
        await sourceClient.end();
        await targetClient.end();
    }
}

clonarBanco();
