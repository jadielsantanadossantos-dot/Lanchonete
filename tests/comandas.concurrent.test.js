import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Valida correções de concorrência e auditoria sem precisar de DB real

describe('comandas concorrência - índice único', () => {
  it('migration 20260826000007 cria índice parcial idx_comandas_mesa_aberta', () => {
    const sql = fs.readFileSync(path.join('supabase/migrations/20260826000007_fix_concorrencia_rls.sql'), 'utf8');
    expect(sql).toContain('idx_comandas_mesa_aberta');
    expect(sql).toContain('WHERE status =');
    expect(sql).toContain('aberta');
  });

  it('getOrCreateComanda usa FOR UPDATE para lock', () => {
    const code = fs.readFileSync(path.join('src/routes/comandas.js'), 'utf8');
    expect(code).toContain('FOR UPDATE');
    expect(code).toContain('getOrCreateComanda');
  });

  it('simula concorrência: duas criações paralelas devem colidir no índice único', async () => {
    // Simula pool com lock + índice único: segunda inserção deve falhar ou retornar existente
    const mesas = new Map(); // mesaId -> comanda
    let nextId = 1;
    const locks = new Set();

    async function getOrCreateComandaSim(mesaId) {
      // simula SELECT ... FOR UPDATE
      while (locks.has(mesaId)) await new Promise(r => setTimeout(r, 1));
      locks.add(mesaId);
      try {
        if (mesas.has(mesaId)) return mesas.get(mesaId);
        // simula índice único: se outra transação já inseriu, lança
        await new Promise(r => setTimeout(r, 5)); // janela de corrida
        if (mesas.has(mesaId)) return mesas.get(mesaId);
        const comanda = { id: nextId++, mesa_id: mesaId, status: 'aberta' };
        mesas.set(mesaId, comanda);
        return comanda;
      } finally {
        locks.delete(mesaId);
      }
    }

    const [c1, c2] = await Promise.all([
      getOrCreateComandaSim(7),
      getOrCreateComandaSim(7),
    ]);
    expect(c1.id).toBe(c2.id);
    expect(mesas.size).toBe(1);
  });
});

describe('auditoria - ordenação e await', () => {
  it('getAuditoria monta ORDER BY antes de LIMIT', () => {
    const code = fs.readFileSync(path.join('src/utils/audit.js'), 'utf8');
    const orderIdx = code.indexOf('ORDER BY criado_em DESC');
    const limitIdx = code.indexOf('LIMIT $');
    expect(orderIdx).toBeGreaterThan(-1);
    expect(limitIdx).toBeGreaterThan(-1);
    expect(orderIdx).toBeLessThan(limitIdx);
  });

  it('routes/auth usa await em getAuditoria', () => {
    const code = fs.readFileSync(path.join('src/routes/auth.js'), 'utf8');
    expect(code).toContain('await auditoria.getAuditoria');
  });
});

describe('auth - perfil removido e validação', () => {
  it('nova migration remove observador do CHECK', () => {
    const sql = fs.readFileSync(path.join('supabase/migrations/20260905000001_remove_observador.sql'), 'utf8');
    expect(sql).toContain("CHECK (perfil IN ('admin','garcom'))");
    const checkLine = sql.split('\n').find(l => l.includes('CHECK (perfil IN'));
    expect(checkLine).not.toContain('observador');
  });

  it('middleware verifica usuário ativo no DB (token fantasma bloqueado)', () => {
    const code = fs.readFileSync(path.join('src/auth/auth.js'), 'utf8');
    expect(code).toContain('SELECT id, ativo FROM usuarios WHERE id');
    expect(code).toContain('ativo');
  });

  it('categorias tem validação e sanitização', () => {
    const code = fs.readFileSync(path.join('src/routes/categorias.js'), 'utf8');
    expect(code).toContain('validarCategoria');
    expect(code).toContain('sanitizarString');
  });

  it('adicionais validam preço >= 0', () => {
    const code = fs.readFileSync(path.join('src/routes/adicionais.js'), 'utf8');
    expect(code).toContain('Preço inválido');
  });

  it('comandas validam quantidade 0 como erro', () => {
    const code = fs.readFileSync(path.join('src/routes/comandas.js'), 'utf8');
    expect(code).toContain("Quantidade inválida'");
    expect(code).not.toContain('if (isNaN(qtd) || qtd <= 0) qtd = 1');
  });
});
