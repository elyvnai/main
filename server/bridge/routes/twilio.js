const express = require('express');
const { getDb } = require('../utils/dbAdapter');
const TwilioService = require('../services/TwilioService');
const TelegramService = require('../services/TelegramService');
const { randomUUID } = require('crypto');

const router = express.Router();

router.post('/', async (req, res) => {
  res.set('Content-Type', 'text/xml').send('');

  const { From, Body, MessageSid, To } = req.body;
  if (!From || !Body) return;

  const phone = TwilioService.normalizePhoneNumber(From);
  const body = Body.trim();
  const upperBody = body.toUpperCase();

  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE phone_number = ?').get(To);
  if (!client) return;

  // Opt-out handling
  if (['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT'].includes(upperBody)) {
    db.prepare('INSERT OR REPLACE INTO sms_opt_outs (phone, client_id, opted_out_at) VALUES (?, ?, datetime("now"))')
      .run(phone, client.id);
    await TelegramService.sendMessage(`\ud83d\udeab ${phone} opted out of SMS.`, { chat_id: client.telegram_chat_id });
    return;
  }

  // Opt-back-in
  if (['START', 'YES'].includes(upperBody)) {
    db.prepare('DELETE FROM sms_opt_outs WHERE phone = ? AND client_id = ?').run(phone, client.id);
  }

  // Log inbound message
  db.prepare(`
    INSERT INTO messages (id, client_id, phone, direction, body, status, message_sid, created_at)
    VALUES (?, ?, ?, 'inbound', ?, 'received', ?, ?)
  `).run(randomUUID(), client.id, phone, body, MessageSid, new Date().toISOString());

  // Handle keywords
  if (upperBody === 'URGENT') {
    db.prepare(`
      INSERT INTO leads (id, client_id, phone, source, stage, notes, created_at, updated_at)
      VALUES (?, ?, ?, 'inbound_sms', 'urgent', 'Client replied URGENT', ?, ?)
      ON CONFLICT(client_id, phone) DO UPDATE SET stage = 'urgent', notes = 'Client replied URGENT', updated_at = ?
    `).run(randomUUID(), client.id, phone, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

    await TelegramService.sendMessage(
      `\ud83d\udea8 <b>URGENT reply from ${phone}:</b>\n"${body}"\n\nThey want an immediate callback.`,
      { chat_id: client.telegram_chat_id }
    );
    await TwilioService.sendSMS(phone, `We have received your URGENT request. A team member will prioritize your call and contact you shortly.`);
    return;
  }

  if (upperBody === 'CALLBACK') {
    await TelegramService.sendMessage(`\ud83d\udcde <b>CALLBACK REQUESTED from ${phone}</b>`, { chat_id: client.telegram_chat_id });
    await TwilioService.sendCallbackConfirmation(phone);
    return;
  }

  // Normal reply \u2014 notify owner
  await TelegramService.sendSMSNotification(
    { phone, body, content: body },
    client
  );
});

module.exports = router;
