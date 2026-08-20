// ===== INLINE SHARED CODE (from lib/) =====
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export function createServerClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// JWT config
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRY = '2h';

// Auth functions
export async function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch { return null; }
}

export async function verifySupabaseToken(token) {
  const supabase = createServerClient();
  const admin = createAdminClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await admin
    .from('usuarios')
    .select('id, nome, perfil, trocar_senha')
    .eq('usuario', user.email?.replace('@lanchonete.local', '') || '')
    .single();
  if (!profile) return null;
  return {
    id: profile.id,
    email: user.email,
    nome: profile.nome || user.user_metadata?.nome || '',
    perfil: profile.perfil || user.user_metadata?.perfil || 'garcom',
    trocar_senha: profile.trocar_senha || false,
  };
}

export async function getAuthContext(request) {
  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, supabase };
  }
  const token = authHeader.substring(7);
  let user = await verifySupabaseToken(token);
  if (!user) user = await verifyToken(token);
  return { user, supabase };
}

export function requireAuth(allowedRoles) {
  return async (request) => {
    const context = await getAuthContext(request);
    if (!context.user) throw new Error('UNAUTHORIZED');
    if (allowedRoles && !allowedRoles.includes(context.user.perfil)) throw new Error('FORBIDDEN');
    return context;
  };
}

export function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, nome: user.nome, perfil: user.perfil, trocar_senha: user.trocar_senha },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function createRefreshToken(user) {
  return jwt.sign({ id: user.id, tipo: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
}

// Legacy auth migration
const supabaseAdmin = createAdminClient();

export async function handleLegacyLogin(usuario, senha) {
  const email = `${usuario}@lanchonete.local`;
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password: senha });
  if (!error && data.user) return { success: true, user: data.user, migrated: false };
  return { success: false };
}

// Zod schemas
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
    adicionais: z.array(z.object({ nome: z.string(), preco: z.number().positive() })).optional(),
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

export function validate(schema) {
  return (data) => {
    const result = schema.safeParse(data);
    if (!result.success) {
      const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Dados inválidos: ${errors.join(', ')}`);
    }
    return result.data;
  };
}

// Utility functions
export function gerarSenhaAleatoria(tamanho = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let senha = '';
  for (let i = 0; i < tamanho; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return senha;
}

export function getPathSegments(url) {
  return url.pathname.split('/').filter(Boolean);
}

export function getIdFromPath(pathname, prefix) {
  const parts = pathname.split('/');
  const idx = parts.indexOf(prefix);
  if (idx >= 0 && idx + 1 < parts.length) return parts[idx + 1];
  return null;
}