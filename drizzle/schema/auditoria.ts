import { pgTable, serial, integer, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { usuarios } from './usuarios';

export const auditoria = pgTable('auditoria', {
  id: serial('id').primaryKey(),
  usuarioId: integer('usuario_id').references(() => usuarios.id),
  usuarioNome: text('usuario_nome'),
  acao: text('acao').notNull(),
  detalhes: jsonb('detalhes'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type Auditoria = typeof auditoria.$inferSelect;
export type NewAuditoria = typeof auditoria.$inferInsert;