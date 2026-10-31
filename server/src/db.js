import pg from 'pg';
import { config } from './config.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting)
pg.types.setTypeParser(1082, (value) => value);
// Return NUMERIC columns as JS numbers (money is NUMERIC(12,2) in the DB)
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));
// COUNT(*) returns bigint; convert to number
pg.types.setTypeParser(20, (value) => Number(value));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export const query = (text, params) => pool.query(text, params);

// Run several queries in one transaction: await withTransaction(async (client) => { ... })
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
