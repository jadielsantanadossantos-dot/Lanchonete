import { describe, it, expect } from 'vitest';

function calcTotal(itens, taxa) {
  let subtotal = 0;
  itens.forEach(item => {
    let itemTotal = item.preco_unitario * item.quantidade;
    if (item.adicionais) item.adicionais.forEach(a => { itemTotal += a.preco * item.quantidade; });
    subtotal += itemTotal;
  });
  return subtotal + (parseFloat(taxa) || 0);
}

describe('pedidos cálculo', () => {
  it('calcula subtotal + taxa com adicionais', () => {
    const itens = [
      { preco_unitario: 10, quantidade: 2, adicionais: [{ preco: 2 }] },
      { preco_unitario: 5, quantidade: 1, adicionais: [] }
    ];
    expect(calcTotal(itens, 5)).toBe(10*2+2*2 + 5*1 + 5);
  });
  it('quantidade kg', () => {
    const itens = [{ preco_unitario: 20, quantidade: 0.5, adicionais: [] }];
    expect(calcTotal(itens, 0)).toBe(10);
  });
});
