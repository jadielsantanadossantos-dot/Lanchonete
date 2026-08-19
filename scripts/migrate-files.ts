import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');

async function migrateFiles() {
  console.log('Iniciando migração de arquivos...');
  
  if (!fs.existsSync(uploadsDir)) {
    console.log('Diretório uploads não encontrado');
    return;
  }
  
  const files = fs.readdirSync(uploadsDir).filter(f => !f.startsWith('.'));
  console.log(`Encontrados ${files.length} arquivos`);
  
  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    const fileBuffer = fs.readFileSync(filePath);
    const contentType = getContentType(file);
    
    const storagePath = `produtos/${file}`;
    
    try {
      const { error } = await supabase.storage
        .from('produtos')
        .upload(storagePath, fileBuffer, { contentType, upsert: false });
      
      if (error) {
        console.error(`Erro ao migrar ${file}:`, error.message);
      } else {
        console.log(`Migrado: ${file} → ${storagePath}`);
      }
    } catch (e) {
      console.error(`Erro inesperado ao migrar ${file}:`, e);
    }
  }
  
  console.log('Migração de arquivos concluída!');
}

function getContentType(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif'
  };
  return types[ext] || 'application/octet-stream';
}

migrateFiles().catch(console.error);