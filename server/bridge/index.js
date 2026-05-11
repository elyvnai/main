// server/bridge/index.js — Elyvn Core Entry Point
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

// ─── Config ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

// ─── Express Setup ────────────────────────────────────────
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Database ─────────────────────────────────────────────
const Database = require('better-sqlite3');
const db = new Database(process.env.DATABASE_PATH || './data/elyvn.db');
db.pragma('journal_mode = WAL');

// ─── Utils ────────────────────────────────────────────────
const telegram = require('./utils/telegram');

// ─── Webhook Routes ───────────────────────────────────────

// Health check (Railway needs this)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', env: NODE_ENV, time: new Date().toISOString() });
});

// Retell AI webhooks
app.post('/webhooks/retell', (req, res) => {
  const { event, call } = req.body;
  
  if (event === 'call_ended') {
    const duration = call?.duration || 0;
    const isMissed = duration < 10 || call?.voicemail || call?.status === 'busy';
    
    if (isMissed) {
      // Speed-to-lead: insert missed call, upsert lead, send SMS, notify owner
      const stmt = db.prepare(`
        INSERT INTO calls (call_id, caller_phone, duration, status, outcome, created_at)
        VALUES (?, ?, ?, 'missed', ?, datetime('now'))
      `);
      stmt.run(call.call_id, call.from_number, duration, call.outcome || 'missed');

      const leadStmt = db.prepare(`
        INSERT INTO leads (phone, source, status, created_at)
        VALUES (?, 'missed_call', 'new', datetime('now'))
        ON CONFLICT(phone) DO UPDATE SET source='missed_call', updated_at=datetime('now')
      `);
      leadStmt.run(call.from_number);

      // TODO: wire in your SMS speed-to-lead logic here
      // TODO: download recording (10-min window)
      // TODO: Telegram notify owner
    } else {
      // Normal completed call
      const stmt = db.prepare(`
        INSERT INTO calls (call_id, caller_phone, duration, status, transcript, summary, outcome, created_at)
        VALUES (?, ?, ?, 'completed', ?, ?, ?, datetime('now'))
        ON CONFLICT(call_id) DO UPDATE SET
          transcript=excluded.transcript,
          summary=excluded.summary,
          outcome=excluded.outcome,
          updated_at=datetime('now')
      `);
      stmt.run(call.call_id, call.from_number, duration, call.transcript, call.summary, call.outcome || 'completed');

      // TODO: download recording
      // TODO: Telegram summary + transcript + recording to owner
    }
  }

  res.status(200).send('OK');
});

// Twilio SMS webhooks
app.post('/webhooks/twilio', (req, res) => {
  const { From, Body, MessageSid } = req.body;
  const phone = From?.replace(/^\+/, '') || From;

  // Opt-out check
  const optOutWords = ['stop', 'unsubscribe', 'cancel', 'quit'];
  if (optOutWords.some(w => Body.toLowerCase().includes(w))) {
    const stmt = db.prepare(`INSERT INTO sms_optouts (phone, created_at) VALUES (?, datetime('now')) ON CONFLICT(phone) DO NOTHING`);
    stmt.run(phone);
    return res.status(200).send('<Response><Message>You have been unsubscribed.</Message></Response>');
  }

  // Log inbound SMS
  const stmt = db.prepare(`
    INSERT INTO messages (message_sid, from_phone, to_phone, body, direction, status, created_at)
    VALUES (?, ?, ?, ?, 'inbound', 'received', datetime('now'))
  `);
  stmt.run(MessageSid, phone, req.body.To, Body);

  // TODO: Telegram notify owner "Reply from X: [text]"
  // TODO: two-way SMS reply handler

  res.status(200).send('<Response/>');
});

// Telegram bot webhooks
app.post('/webhooks/telegram', (req, res) => {
  const { message, callback_query } = req.body;

  if (message?.text?.startsWith('/start')) {
    const token = message.text.split(' ')[1];
    // TODO: link chat to client via token
    telegram.sendMessage(message.chat.id, '✅ Chat linked! Use /status, /calls, /pause, /resume.');
  }

  if (message?.text === '/status') {
    const today = db.prepare(`SELECT COUNT(*) as count FROM calls WHERE date(created_at) = date('now')`).get();
    telegram.sendMessage(message.chat.id, `📊 Today: ${today.count} calls`);
  }

  if (message?.text === '/calls') {
    const calls = db.prepare(`SELECT * FROM calls ORDER BY created_at DESC LIMIT 5`).all();
    let text = '📞 Recent calls:\n\n';
    calls.forEach(c => {
      text += `• ${c.caller_phone} — ${c.status} (${c.duration}s)\n`;
    });
    telegram.sendMessage(message.chat.id, text);
  }

  if (message?.text === '/pause') {
    // TODO: disable AI for this client
    telegram.sendMessage(message.chat.id, '⏸ AI paused.');
  }

  if (message?.text === '/resume') {
    // TODO: enable AI for this client
    telegram.sendMessage(message.chat.id, '▶️ AI resumed.');
  }

  // Reply-to-message = two-way SMS
  if (message?.reply_to_message && message?.text) {
    // TODO: extract customer phone from replied message context, send SMS
    telegram.sendMessage(message.chat.id, '✉️ SMS sent.');
  }

  res.status(200).send('OK');
});

// ─── Start Server ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Elyvn Core] Server running on port ${PORT} in ${NODE_ENV} mode`);
  console.log(`[Elyvn Core] Database: ${db.name}`);
});
