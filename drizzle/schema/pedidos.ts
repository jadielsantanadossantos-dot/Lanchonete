import { pgTable, serial, integer, numeric, text, timestamp, boolean, pgEnum, primaryKey } from 'drizzle-orm/pg-core';
import { clientes } from './clientes';
import { mesas } from './mesas';
import { comandas } from './comandas';

export const pedidoStatus = pgEnum('pedido_status', ['recebido', 'em_preparo', 'saiu_entrega', 'entregue', 'cancelado']);
export const formaPagamento = pgEnum('forma_pagamento', ['pix', 'dinheiro', 'cartao', 'mesa']);

export const pedidos = pgTable('pedidos', {
  id: serial('id').primaryKey(),
  clienteId: integer('cliente_id').notNull().references(() => clientes.id),
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
  taxaEntrega: numeric('taxa_entrega', { precision: 10, scale: 2 }).default('0').notNull(),
  total: numeric('total', { precision: 10, scale: 2 }).notNull(),
  formaPagamento: formaPagamento('forma_pagamento').notNull(),
  status: pedidoStatus('status').default('recebido').notNull(),
  pixConfirmado: boolean('pix_confirmado').default(false).notNull(),
  observacoes: text('observacoes'),
  enderecoEntrega: text('endereco_entrega'),
  bairroEntrega: text('bairro_entrega'),
  mesaId: integer('mesa_id').references(() => mesas.id),
  comandaId: integer('comanda_id').references(() => comandas.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow().notNull(),
});

export const pedidoItens = pgTable('pedido_itens', {
  id: serial('id').primaryKey(),
  pedidoId: integer('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
  produtoId: integer('produto_id').notNull(),
  produtoNome: text('produto_nome').notNull(),
  quantidade: integer('quantidade').default(1).notNull(),
  precoUnitario: numeric('preco_unitario', { precision: 10, scale: 2 }).notNull(),
  observacao: text('observacao'),
});

export const pedidoItemAdicionais = pgTable('pedido_item_adicionais', {
  id: serial('id').primaryKey(),
  pedidoItemId: integer('pedido_item_id').notNull().references(() => pedidoItens.id, { onDelete: 'cascade' }),
  adicionalNome: text('adicional_nome').notNull(),
  preco: numeric('preco', { precision: 10, scale: 2 }).notNull(),
});

export type Pedido = typeof pedidos.$inferSelect;
export type NewPedido = typeof pedidos.$inferInsert;
export type PedidoItem = typeof pedidoItens.$inferSelect;
export type PedidoItemAdicional = typeof pedidoItemAdicionais.$inferSelect;