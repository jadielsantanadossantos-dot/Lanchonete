import { createServerClient } from './_shared.js';
import { getAuthContext, requireAuth } from './_shared.js';
import { produtoSchema } from './_shared.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function getPathSegments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function getIdFromPath(pathname: string, prefix: string): string | null {
  const parts = pathname.split('/');
  const idx = parts.indexOf(prefix);
  if (idx >= 0 && idx + 1 < parts.length) {
    return parts[idx + 1];
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const segments = getPathSegments(url);
    const ativos = url.searchParams.get('ativos') === 'true';
    const supabase = createServerClient();
    
    // Público: lista produtos ativos para cardápio (GET /api/produtos?ativos=true)
    const isProdutosRoot = segments.length === 2 && segments[1] === 'produtos';
    if (ativos && isProdutosRoot) {
      let query = supabase
        .from('produtos')
        .select(`
          *,
          categoria:categorias(nome),
          produto_adicionais(adicional:adicionais(*))
        `)
        .eq('ativo', true)
        .order('nome', { ascending: true });
      
      const { data, error } = await query;
      if (error) throw error;
      
      const produtos = (data || []).map((p: any) => ({
        ...p,
        categoria_nome: p.categoria?.nome,
        adicionais: p.produto_adicionais?.map((pa: any) => pa.adicional).filter(Boolean) || [],
      }));
      
      return Response.json(produtos);
    }
    
    // Privado: requer autenticação
    const { user } = await getAuthContext(request);
    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    // /api/produtos/upload-url
    if (segments.includes('upload-url')) {
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
    }
    
    // /api/produtos/[id]
    const id = getIdFromPath(url.pathname, 'produtos');
    if (id && !segments.includes('upload-url')) {
      const { data, error } = await supabase
        .from('produtos')
        .select(`
          *,
          categoria:categorias(nome),
          produto_adicionais(adicional:adicionais(*))
        `)
        .eq('id', parseInt(id))
        .single();
      
      if (error) throw error;
      
      if (!data) {
        return Response.json({ error: 'Produto não encontrado' }, { status: 404 });
      }
      
      const produto = {
        ...data,
        categoria_nome: data.categoria?.nome,
        adicionais: data.produto_adicionais?.map((pa: any) => pa.adicional).filter(Boolean) || [],
      };
      
      return Response.json(produto);
    }
    
    // /api/produtos (list) - requer autenticação
    let query = supabase
      .from('produtos')
      .select(`
        *,
        categoria:categorias(nome),
        produto_adicionais(adicional:adicionais(*))
      `)
      .order('nome', { ascending: true });
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    const produtos = (data || []).map((p: any) => ({
      ...p,
      categoria_nome: p.categoria?.nome,
      adicionais: p.produto_adicionais?.map((pa: any) => pa.adicional).filter(Boolean) || [],
    }));
    
    return Response.json(produtos);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('GET /api/produtos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const segments = getPathSegments(url);
  
  try {
    const supabase = createServerClient();
    
    // /api/produtos/upload-url
    if (segments.includes('upload-url')) {
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
    }
    
    // /api/produtos (create)
    const context = await requireAuth(['admin'])(request);
    const { user, supabase: db } = context;
    
    const body = await request.json() as { 
      nome: string; 
      categoria_id: number; 
      descricao?: string; 
      preco: number; 
      ativo?: boolean; 
      adicionais_ids?: number[]; 
      foto?: string;
    };
    const { nome, categoria_id, descricao, preco, ativo, adicionais_ids, foto } = body;
    
    if (!nome || !categoria_id || preco === undefined) {
      return Response.json({ error: 'Nome, categoria e preço obrigatórios' }, { status: 400 });
    }
    
    const insertData: Record<string, any> = { nome, categoria_id, preco };
    if (descricao !== undefined) insertData.descricao = descricao || '';
    if (foto !== undefined) insertData.foto = foto || null;
    if (ativo !== undefined) insertData.ativo = ativo;
    else insertData.ativo = true;
    
    const { data: produto, error } = await db
      .from('produtos')
      .insert(insertData)
      .select()
      .single();
    
    if (error) throw error;
    
    if (adicionais_ids && adicionais_ids.length > 0) {
      const vinculos = adicionais_ids.map((adicional_id: number) => ({
        produto_id: produto.id,
        adicional_id,
      }));
      
      const { error: vinculoError } = await db
        .from('produto_adicionais')
        .insert(vinculos);
      
      if (vinculoError) throw vinculoError;
    }
    
    return Response.json({ id: produto.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('POST /api/produtos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const segments = getPathSegments(url);
  
  try {
    const supabase = createServerClient();
    
    // /api/produtos/[id]
    const id = getIdFromPath(url.pathname, 'produtos');
    if (id && !segments.includes('upload-url')) {
      const context = await requireAuth(['admin'])(request);
      const { user, supabase: db } = context;
      
      const body = await request.json() as { 
        nome?: string; 
        categoria_id?: number; 
        descricao?: string; 
        preco?: number; 
        ativo?: boolean; 
        adicionais_ids?: number[]; 
        foto?: string;
      };
      const { nome, categoria_id, descricao, preco, ativo, adicionais_ids, foto } = body;
      
      const updateData: Record<string, any> = {};
      if (nome !== undefined) updateData.nome = nome;
      if (categoria_id !== undefined) updateData.categoria_id = categoria_id;
      if (descricao !== undefined) updateData.descricao = descricao || '';
      if (preco !== undefined) updateData.preco = preco;
      if (foto !== undefined) updateData.foto = foto;
      if (ativo !== undefined) updateData.ativo = ativo;
      
      const { data, error } = await db
        .from('produtos')
        .update(updateData)
        .eq('id', parseInt(id))
        .select()
        .single();
      
      if (error) throw error;
      
      if (!data) {
        return Response.json({ error: 'Produto não encontrado' }, { status: 404 });
      }
      
      if (adicionais_ids !== undefined) {
        await db
          .from('produto_adicionais')
          .delete()
          .eq('produto_id', parseInt(id));
        
        if (adicionais_ids.length > 0) {
          const vinculos = adicionais_ids.map((adicional_id: number) => ({
            produto_id: parseInt(id),
            adicional_id,
          }));
          
          const { error: vinculoError } = await db
            .from('produto_adicionais')
            .insert(vinculos);
          
          if (vinculoError) throw vinculoError;
        }
      }
      
      return Response.json({ success: true, data });
    }
    
    return Response.json({ error: 'Rota não encontrada' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('PUT /api/produtos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const segments = getPathSegments(url);
  
  try {
    const supabase = createServerClient();
    
    // /api/produtos/[id]
    const id = getIdFromPath(url.pathname, 'produtos');
    if (id && !segments.includes('upload-url')) {
      const context = await requireAuth(['admin'])(request);
      const { user, supabase: db } = context;
      
      const { error } = await db
        .from('produtos')
        .delete()
        .eq('id', parseInt(id));
      
      if (error) throw error;
      
      return Response.json({ success: true });
    }
    
    return Response.json({ error: 'Rota não encontrada' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }
    console.error('DELETE /api/produtos error:', error);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
}

   
 