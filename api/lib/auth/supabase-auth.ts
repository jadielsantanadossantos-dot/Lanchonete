import { createAdminClient } from '../supabase/server';
import bcrypt from 'bcryptjs';

const supabaseAdmin = createAdminClient();

export interface LegacyUser {
  id: number;
  nome: string;
  usuario: string;
  senha_hash: string;
  perfil: 'admin' | 'garcom';
  ativo: number;
  trocar_senha: number;
}

interface CreateUserResponse {
  user: { id: string; email: string } | null;
}

export async function migrateUserToSupabaseAuth(legacyUser: LegacyUser, plainPassword: string) {
  const email = `${legacyUser.usuario}@lanchonete.local`;
  
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: plainPassword,
    email_confirm: true,
    user_metadata: {
      nome: legacyUser.nome,
      perfil: legacyUser.perfil,
      legacy_id: legacyUser.id,
    },
  });
  
  if (error) {
    if (error.message.includes('already registered')) {
      const userId = (data as CreateUserResponse)?.user?.id || '';
      const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { password: plainPassword, user_metadata: { nome: legacyUser.nome, perfil: legacyUser.perfil } }
      );
      if (updateError) throw updateError;
      return updateData.user;
    }
    throw error;
  }
  
  return (data as CreateUserResponse)?.user;
}

export async function handleLegacyLogin(usuario: string, senha: string) {
  const email = `${usuario}@lanchonete.local`;
  
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password: senha,
  });
  
  if (!error && data.user) {
    return { success: true, user: data.user, migrated: false };
  }
  
  return { success: false };
}

export async function createSupabaseUser(nome: string, usuario: string, senha: string, perfil: 'admin' | 'garcom') {
  const email = `${usuario}@lanchonete.local`;
  
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome, perfil },
  });
  
  if (error) throw error;
  
  return (data as CreateUserResponse)?.user;
}

export async function resetUserPassword(userId: string, newPassword: string) {
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  
  if (error) throw error;
  
  return data.user;
}

export async function deactivateUser(userId: string) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: '87600h',
  });
  
  if (error) throw error;
}