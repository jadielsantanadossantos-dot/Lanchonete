const { Pool, types } = require('pg');

// NUMERIC/BIGINT chegam como string por padrao no pg;
// converte para numero para manter compatibilidade com o codigo legado (SQLite)
types.setTypeParser(types.builtins.NUMERIC, v => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));

let pool = null;
let isInitialized = false;
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

function getPool() {
  if (!pool) {
    // Agora usando primariamente DATABASE_URL para o Shard Cloud
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL não configurado no .env');
    }

    // Configuração limpa para o Shard Cloud PostgreSQL
    // Caso o Shard Cloud exija SSL, mantemos a opção (pode ajustar via SHARD_SSL=true/false no .env se necessário)
    const needsSsl = process.env.SHARD_SSL === 'true' || process.env.PGSSL === 'require';

    pool = new Pool({
      connectionString: connectionString,
      max: process.env.VERCEL ? 5 : 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 20000,
      keepAlive: true,
      statement_timeout: 15000,
      query_timeout: 15000,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });

    pool.on('connect', (client) => {
      client.query("SET TIME ZONE 'America/Sao_Paulo'").catch(() => {});
    });

    pool.on('error', (err) => {
      console.error('Erro inesperado no pool PostgreSQL (Shard Cloud):', err);
    });
  }
  return pool;
}

class PgStatement {
  constructor(sql, params = []) {
    this.sql = sql;
    this.params = params;
  }

  // Um unico argumento em array = parametro array (para ANY($1));
  // caso contrario, achata listas de argumentos variadicos
  static normalizeParams(args) {
    if (args.length === 1 && Array.isArray(args[0])) {
      const inner = args[0];
      return inner.length === 1 && Array.isArray(inner[0]) ? inner : [inner];
    }
    return args.flat();
  }

  bind(...params) {
    this.params = PgStatement.normalizeParams(params);
    return this;
  }

  _mergeParams(params) {
    if (params && params.length > 0) {
      this.params = PgStatement.normalizeParams(params);
    }
    return this.params;
  }

  async get(...params) {
    const p = getPool();
    const result = await p.query(this.sql, this._mergeParams(params));
    return result.rows[0] || undefined;
  }

  async all(...params) {
    const p = getPool();
    const result = await p.query(this.sql, this._mergeParams(params));
    return result.rows;
  }

  async run(...params) {
    const p = getPool();
    const result = await p.query(this.sql, this._mergeParams(params));
    let lastInsertRowid = null;
    if (result.rows.length > 0 && result.rows[0].id !== undefined) {
      lastInsertRowid = result.rows[0].id;
    }
    return { changes: result.rowCount, lastInsertRowid };
  }

  free() {
  }
}

const dbWrapper = {
  prepare(sql) {
    return new PgStatement(sql);
  },

  async exec(sql) {
    const p = getPool();
    await p.query(sql);
  },

  async run(sql, ...params) {
    const stmt = new PgStatement(sql);
    stmt.bind(...params);
    return stmt.run();
  },

  async get(sql, ...params) {
    const stmt = new PgStatement(sql);
    stmt.bind(...params);
    return stmt.get();
  },

  async all(sql, ...params) {
    const stmt = new PgStatement(sql);
    stmt.bind(...params);
    return stmt.all();
  },

  async transaction(callback) {
    const p = getPool();
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL TIME ZONE 'America/Sao_Paulo'");
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally {
      client.release();
    }
  },

  // Helpers para uso dentro de transaction com client direto
  async queryWithClient(client, sql, ...params) {
    const flat = PgStatement.normalizeParams(params);
    const result = await client.query(sql, flat);
    return result;
  },

  async close() {
    if (pool) {
      await pool.end();
      pool = null;
      isInitialized = false;
    }
  },

  async initialize() {
    if (isInitialized) return;
    getPool();
    // Forçar timezone Brasil no Postgres
    try {
      await getPool().query("SET TIME ZONE 'America/Sao_Paulo'");
    } catch (e) {
      console.warn('Aviso: falha ao definir TIME ZONE:', e.message);
    }
    isInitialized = true;
    console.log('✅ Pool PostgreSQL inicializado (TZ America/Sao_Paulo)');
  }
};

module.exports = dbWrapper;