import { createPool, migrateDatabase } from './db.js';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required to run database migrations.');
}

const pool = createPool(databaseUrl);
try {
  await migrateDatabase(pool);
} finally {
  await pool.end();
}
