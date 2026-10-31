import { query } from '../db.js';

// Audit trail: write one row per important change.
// `db` is a transaction client (so the log entry commits or rolls back with the change) or omitted.
export async function logActivity(db, actor, { entity, entityId = null, label = null, action, summary, details = null, subscriptionId = null, invoiceId = null }) {
  const run = db?.query ? db.query.bind(db) : query;
  await run(
    `INSERT INTO activity_log (user_id, entity, entity_id, entity_label, action, summary, details, subscription_id, invoice_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [actor?.id ?? actor ?? null, entity, entityId, label, action, summary, details ? JSON.stringify(details) : null, subscriptionId, invoiceId]
  );
}

// Fields that differ between two plain objects: { price: { from: 999, to: 1099 } }
export function diff(before, after, keys) {
  const out = {};
  for (const k of keys) {
    const a = before?.[k] ?? null;
    const b = after?.[k] ?? null;
    if (String(a) !== String(b)) out[k] = { from: a, to: b };
  }
  return out;
}

// Make sure the table exists on databases created before the audit trail was added
export async function ensureActivityTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id), entity VARCHAR(30) NOT NULL, entity_id INT,
      entity_label VARCHAR(80), action VARCHAR(40) NOT NULL, summary TEXT NOT NULL, details JSONB,
      subscription_id INT, invoice_id INT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS activity_created_idx ON activity_log (created_at DESC);
    CREATE INDEX IF NOT EXISTS activity_subscription_idx ON activity_log (subscription_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS activity_invoice_idx ON activity_log (invoice_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS activity_entity_idx ON activity_log (entity, entity_id);`);
}
