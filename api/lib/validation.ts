import { z } from 'zod';

export const loginSchema = z.object({
  usuario: z.string().min(3).max(50),
  senha: z.string().min(1).max(100),
  perfil_esperado: z.enum(['admin', 'garcom']).optional(),
});

export const alterarSenhaSchema = z.object({
  senha_atual: z.string().min(1).max(100),
  nova_senha: z.string().min(4).max(100),
});

export const criarUsuarioSchema = z.object({
  nome: z.string().min(2).max(100),
  usuario: z.string().min(3).max(50),
  senha: z.string().min(8).max(100).optional(),
  perfil: z.enum(['admin', 'garcom']),
});

export const atualizarUsuarioSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  usuario: z.string().min(3).max(50).optional(),
  perfil: z.enum(['admin', 'garcom']).optional(),
  ativo: z.boolean().optional(),
});

export const categoriaSchema = z.object({
  nome: z.string().min(1).max(100),
  ordem: z.number().int().default(0),
});

export const produtoSchema = z.object({
  nome: z.string().min(1).max(200),
  categoria_id: z.number().int(),
  descricao: z.string().optional(),
  preco: z.number().positive(),
  ativo: z.boolean().default(true),
  adicionais_ids: z.array(z.number().int()).optional(),
});

export const adicionalSchema = z.object({
  nome: z.string().min(1).max(100),
  preco: z.number().positive(),
  ativo: z.boolean().default(true),
});

export const clienteSchema = z.object({
  nome: z.string().min(1).max(200),
  telefone: z.string().min(10).max(15),
  rua: z.string().optional(),
  numero: z.string().optional(),
  bairro: z.string().optional(),
  complemento: z.string().optional(),
  ponto_referencia: z.string().optional(),
});

export const bairroSchema = z.object({
  nome: z.string().min(1).max(100),
  taxa_entrega: z.number().min(0).default(0),
  atendido: z.boolean().default(true),
});

export const pedidoSchema = z.object({
  cliente_id: z.number().int(),
  itens: z.array(z.object({
    produto_id: z.number().int(),
    produto_nome: z.string(),
    quantidade: z.number().int().positive(),
    preco_unitario: z.number().positive(),
    observacao: z.string().optional(),
    adicionais: z.array(z.object({
      nome: z.string(),
      preco: z.number().positive(),
    })).optional(),
  })).min(1),
  forma_pagamento: z.enum(['pix', 'dinheiro', 'cartao', 'mesa']),
  observacoes: z.string().optional(),
  endereco_entrega: z.string().optional(),
  bairro_entrega: z.string().optional(),
  taxa_entrega: z.number().min(0).default(0),
  mesa_id: z.number().int().optional(),
});

export const mesaSchema = z.object({
  numero: z.number().int().positive(),
  nome: z.string().optional(),
  capacidade: z.number().int().positive().default(4),
  status: z.enum(['livre', 'ocupada', 'reservada']).default('livre'),
});

export const configSchema = z.object({
  loja_nome: z.string().optional(),
  loja_telefone: z.string().optional(),
  pix_tipo: z.enum(['cpf', 'cnpj', 'email', 'telefone', 'aleatoria']).optional(),
  pix_chave: z.string().optional(),
  pix_nome: z.string().optional(),
});

export function validate(schema: z.ZodSchema) {
  return (data: unknown) => {
    const result = schema.safeParse(data);
    if (!result.success) {
      const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Dados inválidos: ${errors.join(', ')}`);
    }
    return result.data;
  };
}