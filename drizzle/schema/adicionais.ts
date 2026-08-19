import { pgTable, serial, text, numeric, boolean, integer, primaryKey } from 'drizzle-orm/pg-core';
import { produtos } from './produtos';

export const adicionais = pgTable('adicionais', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  preco: numeric('preco', { precision: 10, scale: 2 }).notNull(),
  ativo: boolean('ativo').default(true).notNull(),
});

export const produtoAdicionais = pgTable('produto_adicionais', {
  produtoId: integer('produto_id').notNull().references(() => produtos.id, { onDelete: 'cascade' }),
  adicionalId: integer('adicional_id').notNull().references(() => adicionais.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.produtoId, t.adicionalId] }),
}));

export type Adicional = typeof adicionais.$inferSelect;
export type NewAdicional = typeof adicionais.$inferInsert;
export type ProdutoAdicional = typeof produtoAdicionais.$inferSelect;