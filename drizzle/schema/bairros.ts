import { pgTable, serial, text, numeric, boolean } from 'drizzle-orm/pg-core';

export const bairros = pgTable('bairros', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull().unique(),
  taxaEntrega: numeric('taxa_entrega', { precision: 10, scale: 2 }).default('0').notNull(),
  atendido: boolean('atendido').default(true).notNull(),
});

export type Bairro = typeof bairros.$inferSelect;
export type NewBairro = typeof bairros.$inferInsert;