import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core';

export const categorias = pgTable('categorias', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull().unique(),
  ordem: integer('ordem').default(0).notNull(),
});

export type Categoria = typeof categorias.$inferSelect;
export type NewCategoria = typeof categorias.$inferInsert;