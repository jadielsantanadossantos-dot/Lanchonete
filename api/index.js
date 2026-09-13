process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const db = require('../src/db/database');
db.initialize().catch((e) => console.warn('DB init falhou (cold start):', e.message));
const buildApp = require('../src/app');
const app = buildApp();
module.exports = app;
