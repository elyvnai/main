const { Pool } = require('pg');

let pool = null;

function getDb() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    
    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client', err);
    });

    console.log('[DB] Connection pool initialized');
  }
  return pool;
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

async function withClientContext(clientId, callback) {
  const pool = getDb();
  const client = await pool.connect();
  try {
    await client.query(`SET app.current_client_id = '${clientId}'`);
    return await callback(client);
  } finally {
    // Reset context before returning to pool
    await client.query("RESET app.current_client_id").catch(() => {});
    client.release();
  }
}

module.exports = { getDb, closeDb, withClientContext };
