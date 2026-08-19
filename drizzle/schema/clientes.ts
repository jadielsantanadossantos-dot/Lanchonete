import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const clientes = pgTable('clientes', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  telefone: text('telefone').notNull().unique(),
  rua: text('rua'),
  numero: text('numero'),
  bairro: text('bairro'),
  complemento: text('complemento'),
  pontoReferencia: text('ponto_referencia'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type NewCliente = typeof clientes.$inferInsert;