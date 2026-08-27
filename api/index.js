process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const db = require('../src/db/database');
db.initialize().catch((e) => console.warn('DB init falhou (cold start):', e.message));
const app = require('../src/app');

module.exports = app;
