const express = require('express');
const { getDb } = require('../utils/dbAdapter');
const { sendMessage: sendTelegram } = require('../utils/telegram');
const { isOptOut } = require('../utils/optOut');
const { randomUUID } = require('crypto');

const router = express.Router();

router.post('/', async (req, res) => {
  res.set('Content-Type', 'text/xml').send('');
  
  const from = req.body.From;
  const to = req.body.To;
  const body = req.body.Body?.trim() || '';
  
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE phone_number = ?').get(to);
  if (!client) return;
  
  // Check opt-out
  if (isOptOut(body)) {
    db.prepare('INSERT OR REPLACE INTO sms_opt_outs (phone, client_id) VALUES (?, ?)')
      .run(from, client.id);
    await sendTelegram(client.telegram_chat_id, `\ud83d\udeab ${from} opted out of SMS.`);
    return;
  }
  
  // Log inbound message
  db.prepare(`
    INSERT INTO messages (id, client_id, phone, direction, body, status, created_at)
    VALUES (?, ?, ?, 'inbound', ?, 'received', ?)
  `).run(randomUUID(), client.id, from, body, new Date().toISOString());
  
  // Handle URGENT reply
  if (body.toUpperCase().includes('URGENT')) {
    await sendTelegram(client.telegram_chat_id,
      `\ud83d\udea8 **URGENT reply** from ${from}:\n"${body}"\n\nThey want an immediate callback.`
    );
    return;
  }
  
  // Normal reply \u2014 notify owner
  await sendTelegram(client.telegram_chat_id,
    `\ud83d\udcac **Reply from ${from}:**\n"${body}"\n\nReply to this message to text them back.`,
    { reply_markup: { inline_keyboard: [[
      { text: '\ud83d\udcde Call them', callback_data: `call_back:${from}` },
      { text: '\u2705 Mark booked', callback_data: `mark_booked:${from}` }
    ]]}}
  );
});

module.exports = router;
