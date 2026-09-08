const express = require('express');
const router = express.Router();
const db = require('../db/database');

function isDemoEnvironment() {
  const url = process.env.SUPABASE_URL || '';
  const lojaDemo = url.includes('bmbkrtotssoldlcymggn');
  return lojaDemo;
}

async function resetDemo() {
  // Limpa apenas dados transacionais, preserva cardápio/config
  // Ordem respeita FKs
  await db.exec(`
    TRUNCATE TABLE
      pedido_item_adicionais,
      pedido_itens,
      pedidos,
      comanda_itens,
      comandas,
      auditoria,
      refresh_tokens_revogados,
      clientes
    RESTART IDENTITY CASCADE
  `);
  // Reseta mesas para livre
  await db.exec(`UPDATE mesas SET status='livre'`);
  // Garante loja aberta e demo
  await db.exec(`
    INSERT INTO configuracoes (chave, valor) VALUES
      ('loja_aberta','true'),
      ('loja_nome','Lanchonete Demo'),
      ('tempo_espera','30-40 min')
    ON CONFLICT (chave) DO UPDATE SET valor=EXCLUDED.valor
  `);
  // Recria usuários demo - demo/demo admin + garcom/demo (login demo/demo volta a funcionar no PDV)
  await db.exec(`
    INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha)
    VALUES ('Administrador Demo','demo','$2a$10$JghWnajrvrIPrskG3diTweooG0K81cryK1cNc0sSB.TYHy9R.dMUW','admin',true,false)
    ON CONFLICT (usuario) DO UPDATE SET senha_hash=EXCLUDED.senha_hash, perfil='admin', ativo=true, trocar_senha=false
  `);
  await db.exec(`
    INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, trocar_senha)
    VALUES ('Garçom Demo','garcom','$2a$10$JghWnajrvrIPrskG3diTweooG0K81cryK1cNc0sSB.TYHy9R.dMUW','garcom',true,false)
    ON CONFLICT (usuario) DO UPDATE SET senha_hash=EXCLUDED.senha_hash, perfil='garcom', ativo=true
  `);
}

function exigirCronAuth(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const vercelCron = req.headers['x-vercel-cron'];
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (cronSecret) {
    if (vercelCron) return true;
    if (bearer === cronSecret) return true;
    res.status(401).json({ error: 'Não autorizado' });
    return false;
  }
  if (!isDemoEnvironment() && process.env.NODE_ENV === 'production' && !vercelCron) {
    res.status(401).json({ error: 'CRON_SECRET não configurado — configure no ambiente de produção' });
    return false;
  }
  return true;
}

router.all('/reset-demo', async (req, res) => {
  try {
    if (!exigirCronAuth(req, res)) return;
    // Proteção: só roda na demo
    if (!isDemoEnvironment()) {
      // Fallback: checa loja_nome via DB
      try {
        const cfg = await db.get("SELECT valor FROM configuracoes WHERE chave='loja_nome'");
        if (!cfg || !cfg.valor.toLowerCase().includes('demo')) {
          return res.status(403).json({ error: 'Reset permitido apenas na demo' });
        }
      } catch (e) {
        return res.status(403).json({ error: 'Ambiente não-demo' });
      }
    }

    const start = Date.now();
    await resetDemo();
    const elapsed = Date.now() - start;

    // Log auditoria opcional
    try { await db.run("INSERT INTO auditoria (usuario_nome, acao, detalhes) VALUES ('sistema','reset_demo',$1)", `Reset automático ${new Date().toISOString()} ${elapsed}ms`); } catch(e){}

    res.json({ ok: true, message: 'Demo resetada', elapsed_ms: elapsed, timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('reset-demo error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.all('/cleanup', async (req, res) => {
  try {
    if (!exigirCronAuth(req, res)) return;
    const r1 = await db.run("DELETE FROM refresh_tokens_revogados WHERE expira_em IS NOT NULL AND expira_em < NOW() - INTERVAL '1 day'");
    const r2 = await db.run("DELETE FROM refresh_tokens_revogados WHERE expira_em IS NULL AND revogado_em < NOW() - INTERVAL '30 days'");
    let r3 = { changes: 0 };
    try { r3 = await db.run("DELETE FROM idempotency_keys WHERE criado_em < NOW() - INTERVAL '7 days'"); } catch (e) {}
    res.json({ ok: true, revogados_expirados: r1.changes || 0, revogados_antigos: r2.changes || 0, idempotency_limpos: r3.changes || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/status', async (req, res) => {
  try {
    const counts = {};
    for (const tbl of ['pedidos','pedido_itens','clientes','comandas','comanda_itens','auditoria']) {
      try { const r = await db.get(`SELECT count(*)::int as n FROM ${tbl}`); counts[tbl] = r.n; } catch(e){ counts[tbl]= 'err'; }
    }
    const cfg = await db.get("SELECT valor FROM configuracoes WHERE chave='loja_nome'");
    res.json({ demo: isDemoEnvironment(), loja_nome: cfg?.valor, counts, next_reset: '0 9 * * * (6h BRT) UTC 9h' });
  } catch(e){ res.status(500).json({error:e.message}); }
});

module.exports = router;
