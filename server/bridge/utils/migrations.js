const { getDb } = require('./dbAdapter');

const MIGRATIONS = [
  {
    id: '001_core_tables',
    apply: (db) => {
      // 1. clients
      db.exec(`
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
          created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
        )
      `);

      // 2. calls
      db.exec(`
        CREATE TABLE IF NOT EXISTS calls (
          id TEXT PRIMARY KEY,
          call_id TEXT UNIQUE,
          twilio_call_sid TEXT,
          client_id TEXT NOT NULL,
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
          created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        )
      `);

      // 3. leads
      db.exec(`
        CREATE TABLE IF NOT EXISTS leads (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          name TEXT,
          phone TEXT NOT NULL,
          email TEXT,
          source TEXT DEFAULT 'call',
          stage TEXT DEFAULT 'new',
          last_contact TEXT,
          created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
          UNIQUE(client_id, phone),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        )
      `);

      // 4. messages
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          lead_id TEXT,
          phone TEXT,
          direction TEXT,
          body TEXT,
          status TEXT DEFAULT 'sent',
          message_sid TEXT,
          created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
        )
      `);

      // 5. appointments
      db.exec(`
        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          lead_id TEXT,
          phone TEXT,
          name TEXT,
          datetime TEXT,
          status TEXT DEFAULT 'confirmed',
          calcom_booking_id TEXT,
          created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        )
      `);

      // 6. sms_opt_outs
      db.exec(`
        CREATE TABLE IF NOT EXISTS sms_opt_outs (
          phone TEXT NOT NULL,
          client_id TEXT NOT NULL,
          opted_out_at TEXT DEFAULT (CURRENT_TIMESTAMP),
          UNIQUE(phone, client_id),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        )
      `);

      // Indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_calls_client_id ON calls(client_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_calls_call_id ON calls(call_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_client_phone ON leads(client_id, phone)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_client_phone ON messages(client_id, phone)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone)`);
    }
  },
  {
    id: '002_webhook_events',
    apply: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS webhook_events (
          id TEXT PRIMARY KEY,
          idempotency_key TEXT UNIQUE,
          source TEXT,
          payload TEXT,
          created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_events_idempotency ON webhook_events(idempotency_key)`);
    }
  },
  {
    id: '003_scaling_indexes',
    apply: (db) => {
      // Call lookups by client (dashboard, Telegram bot)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_calls_client_id_created ON calls(client_id, created_at DESC)`);
      
      // Partial index for missed calls (SQLite 3.8.0+)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_calls_status_missed ON calls(status) WHERE status = 'missed'`);

      // Lead lookups by phone (speed-to-lead matching)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_phone_client ON leads(phone, client_id)`);

      // Message threading (two-way SMS)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_client_phone_created ON messages(client_id, phone, created_at DESC)`);

      // Opt-out checks
      db.exec(`CREATE INDEX IF NOT EXISTS idx_optouts_phone ON sms_opt_outs(phone)`);

      // Telegram chat linking
      db.exec(`CREATE INDEX IF NOT EXISTS idx_clients_telegram ON clients(telegram_chat_id)`);
    }
  }
];

async function runMigrations() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT DEFAULT (CURRENT_TIMESTAMP))`);

  for (const migration of MIGRATIONS) {
    const exists = db.prepare('SELECT 1 FROM _migrations WHERE id = ?').get(migration.id);
    if (!exists) {
      console.log(`Applying migration: ${migration.id}`);
      migration.apply(db);
      db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(migration.id);
      console.log(`Migration ${migration.id} applied.`);
    }
  }
  console.log('All migrations up to date.');
}

module.exports = { runMigrations };
