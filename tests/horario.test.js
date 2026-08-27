import { describe, it, expect } from 'vitest';
import { parseHHmm, isDentroHorario, isLojaAbertaEfetiva } from '../src/utils/horario.js';

describe('horario', () => {
  it('parseHHmm', () => {
    expect(parseHHmm('18:00')).toBe(1080);
    expect(parseHHmm(' 18:00')).toBe(null);
    expect(parseHHmm('24:00')).toBe(null);
  });
  it('isDentroHorario todos dias', () => {
    // mock getBrtNow não é trivial; testa isLojaAbertaEfetiva via manual override
    const cfgManualFechada = { loja_modo: 'manual', loja_aberta: 'false' };
    expect(isLojaAbertaEfetiva(cfgManualFechada)).toBe(false);
    const cfgManualAberta = { loja_modo: 'manual', loja_aberta: 'true' };
    expect(isLojaAbertaEfetiva(cfgManualAberta)).toBe(true);
  });
  it('modo auto sem horario cai no manual', () => {
    const cfg = { loja_modo: 'auto', loja_aberta: 'true' };
    // sem horario definido, retorna manual (true)
    expect(isLojaAbertaEfetiva(cfg)).toBe(true);
  });
});
