import { createServerClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json() as { filename: string; contentType: string };
    const { filename, contentType } = body;
    
    if (!filename || !contentType) {
      return Response.json({ error: 'filename e contentType obrigatórios' }, { status: 400 });
    }
    
    if (!ALLOWED_TYPES.includes(contentType)) {
      return Response.json({ error: 'Tipo não permitido. Use JPEG, PNG, WebP ou GIF' }, { status: 400 });
    }
    
    const sanitized = filename
      .replace(/[^a-zA-Z0_9._-]/g, '_')
      .replace(/\.{2,}/g, '_')
      .replace(/^\.+/, '')
      .substring(0, 100);
    
    const ext = sanitized.split('.').pop()?.toLowerCase() || '';
    const base = sanitized.substring(0, sanitized.lastIndexOf('.')) || sanitized;
    const filePath = `produtos/${Date.now()}-${base.substring(0, 50)}.${ext}`;
    
    const { data, error } = await db.storage
      .from('produtos')
      .createSignedUploadUrl(filePath);
    
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    
    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/produtos/${filePath}`;
    
    return Response.json({ 
      signedUrl: data.signedUrl,
      publicUrl,
      path: filePath 
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('POST /api/produtos/upload-url error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}