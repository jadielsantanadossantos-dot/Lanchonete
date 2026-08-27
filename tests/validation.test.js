import { describe, it, expect } from 'vitest';
import { sanitizarString, validarTipo, validarPositivo } from '../src/utils/validation.js';

describe('validation utils', () => {
  it('sanitizarString remove <>', () => {
    expect(sanitizarString('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });
  it('validarPositivo rejeita negativo', () => {
    expect(validarPositivo(-1, 'preco')).toMatch(/positivo/);
    expect(validarPositivo(0, 'preco')).toBe(null);
  });
  it('validarTipo string', () => {
    expect(validarTipo('ola', 'string', 'nome')).toBe(null);
    expect(validarTipo(123, 'string', 'nome')).toMatch(/string/);
  });
});
