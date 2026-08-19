import { pgTable, serial, integer, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const mesaStatus = pgEnum('mesa_status', ['livre', 'ocupada', 'reservada']);

export const mesas = pgTable('mesas', {
  id: serial('id').primaryKey(),
  numero: integer('numero').notNull().unique(),
  nome: text('nome'),
  capacidade: integer('capacidade').default(4).notNull(),
  status: mesaStatus('status').default('livre').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type Mesa = typeof mesas.$inferSelect;
export type NewMesa = typeof mesas.$inferInsert;