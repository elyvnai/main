-- Elyvn SQLite Schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT UNIQUE NOT NULL,
    client_id INTEGER,
    direction TEXT,
    status TEXT,
    duration INTEGER DEFAULT 0,
    recording_url TEXT,
    transcript TEXT,
    call_summary TEXT,
    disconnect_reason TEXT,
    sms_sent INTEGER DEFAULT 0,
    started_at DATETIME,
    ended_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    direction TEXT,
    content TEXT,
    status TEXT,
    twilio_sid TEXT,
    retell_call_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    status TEXT DEFAULT 'new',
    priority INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    title TEXT,
    scheduled_at DATETIME,
    duration_minutes INTEGER DEFAULT 30,
    status TEXT DEFAULT 'scheduled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS sms_opt_outs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    opted_out_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    source TEXT
);
