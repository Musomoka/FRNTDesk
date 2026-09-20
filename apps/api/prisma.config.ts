import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// The single .env lives at the repo root so the API, the web app and the
// compose stack all read one file. Prisma runs with apps/api as its cwd, so
// point it back up; the local override is listed second for per-app tweaks.
config({ path: ['../../.env', '.env'], quiet: true });

/**
 * Prisma 7 no longer accepts a `url` inside the datasource block. Migrate reads
 * the connection string from here; the runtime client is handed a pg driver
 * adapter instead (src/prisma/prisma.service.ts). Both read DATABASE_URL, so
 * there is still only one place to set it.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
