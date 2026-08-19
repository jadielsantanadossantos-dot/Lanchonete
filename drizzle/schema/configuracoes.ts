import { pgTable, text } from 'drizzle-orm/pg-core';

export const configuracoes = pgTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: text('valor'),
});

export type Configuracao = typeof configuracoes.$inferSelect;
export type NewConfiguracao = typeof configuracoes.$inferInsert;