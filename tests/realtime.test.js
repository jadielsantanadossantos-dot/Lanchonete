import { describe, it, expect } from 'vitest';
import notifier from '../src/realtime/notifier.js';

describe('notifier Socket.io', () => {
  it('emite para as salas corretas', async () => {
    const emitted = [];
    notifier.init({
      to: (room) => ({
        emit: (event, payload) => emitted.push({ room, event, payload })
      })
    });

    await notifier.emitToAdmin('novo-pedido', { id: 1 });
    await notifier.emitToGarcom('mesa-atualizada', { mesaId: 2 });
    await notifier.emitToMesa(2, 'comanda-atualizada', { mesaId: 2 });
    await notifier.emitToPedido(10, 'pedido-atualizado', { id: 10 });

    expect(emitted).toEqual([
      { room: 'admin', event: 'novo-pedido', payload: { id: 1 } },
      { room: 'garcom', event: 'mesa-atualizada', payload: { mesaId: 2 } },
      { room: 'mesa-2', event: 'comanda-atualizada', payload: { mesaId: 2 } },
      { room: 'pedido-10', event: 'pedido-atualizado', payload: { id: 10 } }
    ]);
  });
});
