import { createServerClient } from '../supabase/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRY = '2h';

export interface AuthUser {
  id: number;
  email: string;
  nome: string;
  perfil: 'admin' | 'garcom';
  trocar_senha: boolean;
}

export interface AuthContext {
  user: AuthUser | null;
  supabase: ReturnType<typeof createServerClient>;
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    return decoded;
  } catch {
    return null;
  }
}

export async function verifySupabaseToken(token: string): Promise<AuthUser | null> {
  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) return null;
  
  const { data: profile } = await supabase
    .from('usuarios')
    .select('nome, perfil, trocar_senha')
    .eq('id', user.id)
    .single();
  
  return {
    id: parseInt(user.id),
    email: user.email!,
    nome: profile?.nome || user.user_metadata?.nome || '',
    perfil: (profile?.perfil as 'admin' | 'garcom') || user.user_metadata?.perfil || 'garcom',
    trocar_senha: profile?.trocar_senha || false,
  };
}

export async function getAuthContext(request: Request): Promise<AuthContext> {
  const supabase = createServerClient();
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, supabase };
  }
  
  const token = authHeader.substring(7);
  
  let user = await verifySupabaseToken(token);
  
  if (!user) {
    user = await verifyToken(token);
  }
  
  return { user, supabase };
}

export function requireAuth(allowedRoles?: ('admin' | 'garcom')[]) {
  return async (request: Request): Promise<AuthContext> => {
    const context = await getAuthContext(request);
    
    if (!context.user) {
      throw new Error('UNAUTHORIZED');
    }
    
    if (allowedRoles && !allowedRoles.includes(context.user.perfil)) {
      throw new Error('FORBIDDEN');
    }
    
    return context;
  };
}

export function createToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, nome: user.nome, perfil: user.perfil, trocar_senha: user.trocar_senha },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function createRefreshToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, tipo: 'refresh' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}