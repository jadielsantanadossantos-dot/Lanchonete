import { pgTable, serial, integer, text, timestamp, boolean, pgEnum, jsonb, numeric } from 'drizzle-orm/pg-core';
import { mesas } from './mesas';
import { produtos } from './produtos';
import { pedidoItens } from './pedidos';

export const comandaStatus = pgEnum('comanda_status', ['aberta', 'fechada']);

export const comandas = pgTable('comandas', {
  id: serial('id').primaryKey(),
  mesaId: integer('mesa_id').notNull().references(() => mesas.id, { onDelete: 'cascade' }),
  clienteNome: text('cliente_nome'),
  status: comandaStatus('status').default('aberta').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  fechadaEm: timestamp('fechada_em', { withTimezone: true }),
});

export const comandaItens = pgTable('comanda_itens', {
  id: serial('id').primaryKey(),
  comandaId: integer('comanda_id').notNull().references(() => comandas.id, { onDelete: 'cascade' }),
  produtoId: integer('produto_id').notNull().references(() => produtos.id),
  produtoNome: text('produto_nome').notNull(),
  quantidade: integer('quantidade').default(1).notNull(),
  precoUnitario: numeric('preco_unitario', { precision: 10, scale: 2 }).notNull(),
  observacao: text('observacao'),
  adicionaisJson: jsonb('adicionais_json'),
  enviadoCozinha: boolean('enviado_cozinha').default(false).notNull(),
  pedidoItemId: integer('pedido_item_id').references(() => pedidoItens.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type Comanda = typeof comandas.$inferSelect;
export type NewComanda = typeof comandas.$inferInsert;
export type ComandaItem = typeof comandaItens.$inferSelect;