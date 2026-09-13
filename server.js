// Entrada local de desenvolvimento/produção self-hosted.
// Na Vercel, a entrada é api/index.js
process.env.TZ = 'America/Sao_Paulo';
require('dotenv').config();

const db = require('./src/db/database');

async function startServer() {
  await db.initialize();

  const app = require('./src/app');
  const PORT = process.env.PORT || 4000;
  const HOST = process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`Painel admin em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/admin`);
    console.log(`Painel garçom em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/garcom`);
    console.log(`Acesso na rede local: http://<SEU_IP>:${PORT}`);
  });
}

startServer().catch(console.error);
