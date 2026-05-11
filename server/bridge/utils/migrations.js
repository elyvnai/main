const { getDb } = require('./dbAdapter');

const MIGRATIONS = [
  {
    id: '001_core_tables',
    apply: async (db) => {
      // 1. clients
      await db.query(`
        CREATE TABLE IF NOT EXISTS clients (
          id TEXT PRIMARY KEY,
          business_name TEXT NOT NULL,
          phone_number TEXT UNIQUE,
          retell_agent_id TEXT UNIQUE,
          transfer_phone TEXT,
          telegram_chat_id TEXT UNIQUE,
          calcom_booking_link TEXT,
          calcom_api_key_encrypted TEXT,
          calcom_event_type_id TEXT,
          timezone TEXT DEFAULT 'UTC',
          ai_enabled INTEGER DEFAULT 1,
          business_hours TEXT DEFAULT 'Mon-Fri 9AM-6PM',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. calls
      await db.query(`
        CREATE TABLE IF NOT EXISTS calls (
          id TEXT PRIMARY KEY,
          call_id TEXT UNIQUE,
          twilio_call_sid TEXT,
          client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          caller_phone TEXT,
          direction TEXT DEFAULT 'inbound',
          status TEXT,
          duration INTEGER,
          transcript TEXT,
          summary TEXT,
          outcome TEXT,
          recording_url TEXT,
          recording_path TEXT,
          disconnection_reason TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 3. leads
      await db.query(`
        CREATE TABLE IF NOT EXISTS leads (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          name TEXT,
          phone TEXT NOT NULL,
          email TEXT,
          source TEXT DEFAULT 'call',
          stage TEXT DEFAULT 'new',
          last_contact TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(client_id, phone)
        )
      `);

      // 4. messages
      await db.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
          phone TEXT,
          direction TEXT,
          body TEXT,
          status TEXT DEFAULT 'sent',
          message_sid TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 5. appointments
      await db.query(`
        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          lead_id TEXT,
          phone TEXT,
          name TEXT,
          datetime TIMESTAMPTZ,
          status TEXT DEFAULT 'confirmed',
          calcom_booking_id TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 6. sms_opt_outs
      await db.query(`
        CREATE TABLE IF NOT EXISTS sms_opt_outs (
          phone TEXT NOT NULL,
          client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          opted_out_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(phone, client_id)
        )
      `);

      // Indexes
      await db.query(`CREATE INDEX IF NOT EXISTS idx_calls_client_id ON calls(client_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_calls_call_id ON calls(call_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_leads_client_phone ON leads(client_id, phone)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_client_phone ON messages(client_id, phone)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone)`);
    }
  },
  {
    id: '002_webhook_events',
    apply: async (db) => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS webhook_events (
          id TEXT PRIMARY KEY,
          idempotency_key TEXT UNIQUE,
          source TEXT,
          payload TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_webhook_events_idempotency ON webhook_events(idempotency_key)`);
    }
  },
  {
    id: '003_scaling_indexes',
    apply: async (db) => {
      await db.query(`CREATE INDEX IF NOT EXISTS idx_calls_client_id_created ON calls(client_id, created_at DESC)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_calls_status_missed ON calls(status) WHERE status = 'missed'`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_leads_phone_client ON leads(phone, client_id)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_client_phone_created ON messages(client_id, phone, created_at DESC)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_optouts_phone ON sms_opt_outs(phone)`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_clients_telegram ON clients(telegram_chat_id)`);
    }
  }
];

async function runMigrations() {
  const db = getDb();
  await db.query(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);

  for (const migration of MIGRATIONS) {
    const { rows } = await db.query('SELECT 1 FROM _migrations WHERE id = $1', [migration.id]);
    if (rows.length === 0) {
      console.log(`Applying migration: ${migration.id}`);
      await migration.apply(db);
      await db.query('INSERT INTO _migrations (id) VALUES ($1)', [migration.id]);
      console.log(`Migration ${migration.id} applied.`);
    }
  }
  console.log('All migrations up to date.');
}

module.exports = { runMigrations };
