// Used on the hosted demo: create the tables and demo data the first time only.
// Later restarts keep everything the judges or the team created.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const { rows } = await pool.query("SELECT to_regclass('public.users') AS t");
await pool.end();

if (rows[0].t) {
  console.log('Database already set up, keeping existing data.');
} else {
  console.log('Empty database: creating tables and demo data...');
  execFileSync(process.execPath, [path.join(dir, 'setup.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(dir, 'demo.js')], { stdio: 'inherit' });
}
