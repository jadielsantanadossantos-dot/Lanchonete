import { pgTable, serial, text, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const usuarioPerfil = pgEnum('usuario_perfil', ['admin', 'garcom']);

export const usuarios = pgTable('usuarios', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  usuario: text('usuario').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  perfil: usuarioPerfil('perfil').default('garcom').notNull(),
  ativo: boolean('ativo').default(true).notNull(),
  trocarSenha: boolean('trocar_senha').default(true).notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow().notNull(),
});

export type Usuario = typeof usuarios.$inferSelect;
export type NewUsuario = typeof usuarios.$inferInsert;