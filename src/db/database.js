const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// NUMERIC/BIGINT chegam como string por padrao no pg;
// converte para numero para manter compatibilidade com o codigo legado (SQLite)
types.setTypeParser(types.builtins.NUMERIC, v => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));

let pool = null;
let isInitialized = false;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL ou SUPABASE_DB_URL não configurado no .env');
    }
    const isSupabasePooler = /pooler\.supabase\.(com|co)/.test(connectionString);
    const needsSsl = isSupabasePooler || /supabase\.(com|co)/.test(connectionString) || process.env.PGSSL === 'require';

    let finalConnectionString = connectionString;
    if (isSupabasePooler) {
      try {
        const url = new URL(connectionString);
        const refFromUrl = process.env.SUPABASE_URL
          ? new URL(process.env.SUPABASE_URL).hostname.split('.')[0]
          : null;
        const user = decodeURIComponent(url.username);
        if (refFromUrl && (user === 'postgres' || !user.includes('.'))) {
          url.username = `postgres.${refFromUrl}`;
          finalConnectionString = url.toString();
        }
      } catch (e) {
        console.error('Não foi possível normalizar DATABASE_URL do pooler:', e.message);
      }
    }

    pool = new Pool({
      connectionString: finalConnectionString,
      max: process.env.VERCEL ? 3 : 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', (err) => {
      console.error('Erro inesperado no pool PostgreSQL:', err);
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
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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
    isInitialized = true;
    console.log('✅ Pool PostgreSQL inicializado');
  }
};

module.exports = dbWrapper;