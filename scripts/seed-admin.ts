import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedAdmin() {
  console.log('Criando admin inicial...');
  
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@lanchonete.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminName = process.env.ADMIN_NAME || 'Administrador';
  
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        nome: adminName,
        perfil: 'admin',
      },
    });
    
    if (error) {
      if (error.message.includes('already registered')) {
        console.log('Admin já existe');
        
        const { data: users } = await supabase.auth.admin.listUsers();
        const existingAdmin = users.users.find(u => u.email === adminEmail);
        
        if (existingAdmin) {
          await supabase.auth.admin.updateUserById(existingAdmin.id, {
            password: adminPassword,
            user_metadata: { nome: adminName, perfil: 'admin' },
          });
          console.log('Senha do admin atualizada');
        }
      } else {
        throw error;
      }
    } else {
      console.log(`Admin criado: ${data.user.id} (${adminEmail})`);
    }
    
    console.log('\nCredenciais:');
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Senha: ${adminPassword}`);
    console.log('\nIMPORTANTE: Altere a senha no primeiro login!');
    
  } catch (error) {
    console.error('Erro ao criar admin:', error);
    process.exit(1);
  }
}

seedAdmin().catch(console.error);