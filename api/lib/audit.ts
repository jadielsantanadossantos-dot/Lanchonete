import { createServerClient } from '@/lib/supabase/server';

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  CONFIG_CHANGED: 'CONFIG_CHANGED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];

export interface AuditLogInput {
  usuarioId?: number;
  usuarioNome?: string;
  acao: AuditAction;
  detalhes?: Record<string, unknown>;
  request?: Request;
}

export async function registrarAuditoria(input: AuditLogInput) {
  try {
    const supabase = createServerClient();
    
    const ip = input.request?.headers.get('x-forwarded-for') 
      || input.request?.headers.get('x-real-ip') 
      || 'unknown';
    const userAgent = input.request?.headers.get('user-agent') || 'unknown';
    
    await supabase.from('auditoria').insert({
      usuario_id: input.usuarioId || null,
      usuario_nome: input.usuarioNome || null,
      acao: input.acao,
      detalhes: input.detalhes || null,
      ip,
      user_agent: userAgent,
    });
  } catch (e) {
    console.error('Erro ao registrar auditoria:', e);
  }
}

export interface AuditFilters {
  usuarioId?: number;
  acao?: AuditAction;
  dataInicio?: string;
  dataFim?: string;
  limite?: number;
}

export async function getAuditoria(filters: AuditFilters = {}) {
  const supabase = createServerClient();
  
  let query = supabase.from('auditoria').select('*');
  
  if (filters.usuarioId) {
    query = query.eq('usuario_id', filters.usuarioId);
  }
  if (filters.acao) {
    query = query.eq('acao', filters.acao);
  }
  if (filters.dataInicio) {
    query = query.gte('criado_em', filters.dataInicio);
  }
  if (filters.dataFim) {
    query = query.lte('criado_em', filters.dataFim + ' 23:59:59');
  }
  if (filters.limite) {
    query = query.limit(filters.limite);
  }
  
  query = query.order('criado_em', { ascending: false });
  
  const { data, error } = await query;
  
  if (error) throw error;
  
  return data || [];
}