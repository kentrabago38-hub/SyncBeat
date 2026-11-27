import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const isDbConfigured = Boolean(
  process.env.SQL_HOST && process.env.SQL_DB_NAME && process.env.SQL_USER
);

export const createPool = (): Pool | null => {
  if (!isDbConfigured) return null;
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 5000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

let db: ReturnType<typeof drizzle<typeof schema>>;
try {
  const pool = createPool();
  if (!pool) {
    throw new Error('SQL environment variables not configured');
  }
  db = drizzle(pool, { schema });
} catch {
  if (isDbConfigured) {
    console.warn('[AI Studio] Database connection failed — using in-memory fallback');
  } else {
    console.warn('[AI Studio] Database not configured — using in-memory fallback');
  }
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: { data?: unknown }) => d?.data ?? {},
    update: async (d: { data?: unknown }) => d?.data ?? {},
    delete: async () => ({}),
  };
  db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
    get: (_, prop) =>
      prop === 'query'
        ? new Proxy({}, { get: () => noOp })
        : () => ({
            from: () => ({ where: () => ({ limit: async () => [] }) }),
            values: () => ({
              onConflictDoUpdate: () => ({ returning: async () => [] }),
              returning: async () => [],
            }),
            where: async () => [],
          }),
  });
}

export { db };
