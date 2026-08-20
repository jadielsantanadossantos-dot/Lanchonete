import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let ratelimit: Ratelimit | null = null;

if (redisUrl && redisToken) {
  const redis = new Redis({ url: redisUrl, token: redisToken });
  // @ts-ignore - Upstash types mismatch
  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '60 s'),
    analytics: true,
  });
}

export async function rateLimit(identifier: string): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  if (!ratelimit) {
    return { success: true, limit: 100, remaining: 100, reset: Date.now() + 60000 };
  }
  
  return ratelimit.limit(identifier);
}

export function createRateLimiter(max: number, window: string) {
  if (!ratelimit) return () => ({ success: true, limit: max, remaining: max, reset: Date.now() + 60000 });
  
  // @ts-ignore - Upstash types mismatch
  return new Ratelimit({
    // @ts-ignore - Upstash types mismatch
    redis: ratelimit.redis,
    // @ts-ignore - Upstash types mismatch
    limiter: Ratelimit.slidingWindow(max, window),
  });
}

export const loginRateLimiter = createRateLimiter(5, '15 m');
export const apiRateLimiter = createRateLimiter(100, '1 m');