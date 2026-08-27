import { describe, it, expect } from 'vitest';

describe('produtos preco validacao', () => {
  function validaPreco(preco) {
    const n = parseFloat(preco);
    if (isNaN(n) || n < 0) return 'Preço inválido';
    return null;
  }
  it('rejeita negativo', () => expect(validaPreco(-1)).toMatch(/inválido/));
  it('aceita zero', () => expect(validaPreco(0)).toBe(null));
  it('rejeita NaN', () => expect(validaPreco('abc')).toMatch(/inválido/));
});
