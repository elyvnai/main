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

module.exports = { getDb, closeDb };
