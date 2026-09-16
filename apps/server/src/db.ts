import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
}

export async function transaction<T>(
  pool: pg.Pool,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function migrateDatabase(pool: pg.Pool): Promise<void> {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
  });
}
