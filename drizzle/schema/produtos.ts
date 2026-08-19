import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { categorias } from './categorias';

export const produtos = pgTable('produtos', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  categoriaId: integer('categoria_id').notNull().references(() => categorias.id),
  descricao: text('descricao'),
  preco: numeric('preco', { precision: 10, scale: 2 }).notNull(),
  foto: text('foto'),
  ativo: boolean('ativo').default(true).notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type Produto = typeof produtos.$inferSelect;
export type NewProduto = typeof produtos.$inferInsert;