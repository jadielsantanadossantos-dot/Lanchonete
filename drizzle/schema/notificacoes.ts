import { pgTable, serial, integer, text, timestamp, boolean, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios';

export const notificacaoTipo = pgEnum('notificacao_tipo', [
  'novo_pedido', 'pedido_atualizado', 'pix_confirmado',
  'comanda_atualizada', 'mesa_atualizada', 'sistema'
]);

export const notificacoes = pgTable('notificacoes', {
  id: serial('id').primaryKey(),
  tipo: notificacaoTipo('tipo').notNull(),
  payload: jsonb('payload').notNull(),
  lida: boolean('lida').default(false).notNull(),
  usuarioId: integer('usuario_id').references(() => usuarios.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type Notificacao = typeof notificacoes.$inferSelect;
export type NewNotificacao = typeof notificacoes.$inferInsert;