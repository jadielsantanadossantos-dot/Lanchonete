import { createServerClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

export async function middleware(request: Request) {
  if (request.method === 'OPTIONS') {
    const response = new Response(null, { status: 204 });
    setCorsHeaders(response);
    return response;
  }
  
  const response = new Response();
  setCorsHeaders(response);
  
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const { success, limit, remaining, reset } = await rateLimit(`api:${ip}`);
    
    response.headers.set('X-RateLimit-Limit', limit.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', reset.toString());
    
    if (!success) {
      return new Response(
        JSON.stringify({ error: 'Muitas requisições, tente novamente mais tarde' }),
        { status: 429, headers: { ...Object.fromEntries(response.headers), 'Content-Type': 'application/json' } }
      );
    }
  }
  
  return response;
}

function setCorsHeaders(response: Response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
}

export const config = {
  matcher: '/api/:path*',
};