import { defineConfig } from 'drizzle-kit';

// @ts-expect-error - drizzle-kit types mismatch
export default defineConfig({
  schema: './drizzle/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres',
  },
  verbose: true,
  strict: true,
});