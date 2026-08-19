import { createClient } from '@supabase/supabase-js';
// @ts-ignore - better-sqlite3 types not available
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const sqliteDb = new Database('lanchonete.db');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface LegacyUser {
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

async function migrateAuth() {
  console.log('Iniciando migração de autenticação...');
  
  const users = sqliteDb.prepare('SELECT * FROM usuarios WHERE ativo = 1').all() as LegacyUser[];
  
  console.log(`Encontrados ${users.length} usuários ativos`);
  
  for (const user of users) {
    const email = `${user.usuario}@lanchonete.local`;
    
    console.log(`Migrando: ${user.usuario} (${user.perfil})`);
    
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: 'temp_password_will_be_updated_on_login',
        email_confirm: true,
        user_metadata: {
          nome: user.nome,
          perfil: user.perfil,
          legacy_id: user.id,
        },
      });
      
      if (error) {
        if (error.message.includes('already registered')) {
          console.log(`  Usuário já existe no Supabase Auth`);
          
          const userId = (data as CreateUserResponse)?.user?.id || '';
          const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
            userId,
            { user_metadata: { nome: user.nome, perfil: user.perfil, legacy_id: user.id } }
          );
          
          if (updateError) {
            console.error(`  Erro ao atualizar metadata:`, updateError);
          }
        } else {
          console.error(`  Erro ao criar usuário:`, error);
        }
      } else {
        console.log(`  Criado no Supabase Auth: ${(data as CreateUserResponse)?.user?.id}`);
      }
    } catch (e) {
      console.error(`  Erro inesperado:`, e);
    }
  }
  
  console.log('Migração de autenticação concluída!');
  console.log('NOTA: Senhas reais serão migradas no primeiro login (lazy migration)');
  
  sqliteDb.close();
}

migrateAuth().catch(console.error);