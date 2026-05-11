const express = require('express');
const { getDb } = require('../utils/dbAdapter');
const TwilioService = require('../services/TwilioService');
const TelegramService = require('../services/TelegramService');
const { randomUUID } = require('crypto');

const router = express.Router();

function isOptedOut(db, phone, clientId) {
  const row = db.prepare('SELECT 1 FROM sms_opt_outs WHERE phone = ? AND client_id = ?').get(phone, clientId);
  return !!row;
}

router.post('/', async (req, res) => {
  res.set('Content-Type', 'text/xml').send('');

  // Process async
  (async () => {
    try {
      const { From, Body, MessageSid, To } = req.body;
      if (!From || !Body) return;

      const idempotencyKey = req.headers['x-twilio-signature'] || MessageSid;
      const db = getDb();

      const exists = db.prepare('SELECT 1 FROM webhook_events WHERE idempotency_key = ?').get(idempotencyKey);
      if (exists) return;

      db.prepare('INSERT INTO webhook_events (id, idempotency_key, source, payload) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), idempotencyKey, 'twilio', JSON.stringify(req.body));

      const phone = TwilioService.normalizePhoneNumber(From);
      const body = Body.trim();
      const upperBody = body.toUpperCase();

      const client = db.prepare('SELECT * FROM clients WHERE phone_number = ?').get(To);
      if (!client) return;

      // Opt-out
      if (['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT'].includes(upperBody)) {
        db.prepare('INSERT OR REPLACE INTO sms_opt_outs (phone, client_id, opted_out_at) VALUES (?, ?, datetime("now"))')
          .run(phone, client.id);
        await TelegramService.sendMessage(`🚫 ${phone} opted out of SMS.`, { chat_id: client.telegram_chat_id });
        return;
      }

      // Opt-back-in
      if (['START', 'YES'].includes(upperBody)) {
        db.prepare('DELETE FROM sms_opt_outs WHERE phone = ? AND client_id = ?').run(phone, client.id);
      }

      // Log inbound
      db.prepare(`
        INSERT INTO messages (id, client_id, phone, direction, body, status, message_sid, created_at)
        VALUES (?, ?, ?, 'inbound', ?, 'received', ?, ?)
      `).run(randomUUID(), client.id, phone, body, MessageSid, new Date().toISOString());

      // URGENT
      if (upperBody === 'URGENT') {
        if (!isOptedOut(db, phone, client.id)) {
          await TwilioService.sendSMS(phone, `We have received your URGENT request. A team member will prioritize your call and contact you shortly.`, client.id);
        }
        db.prepare(`
          INSERT INTO leads (id, client_id, phone, source, stage, notes, created_at, updated_at)
          VALUES (?, ?, ?, 'inbound_sms', 'urgent', 'Client replied URGENT', ?, ?)
          ON CONFLICT(client_id, phone) DO UPDATE SET stage = 'urgent', notes = 'Client replied URGENT', updated_at = ?
        `).run(randomUUID(), client.id, phone, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

        await TelegramService.sendMessage(
          `🚨 <b>URGENT reply from ${phone}:</b>\n"${body}"\n\nThey want an immediate callback.`,
          { chat_id: client.telegram_chat_id }
        );
        return;
      }

      // CALLBACK
      if (upperBody === 'CALLBACK') {
        if (!isOptedOut(db, phone, client.id)) {
          await TwilioService.sendCallbackConfirmation(phone, client.id);
        }
        await TelegramService.sendMessage(`📞 <b>CALLBACK REQUESTED from ${phone}</b>`, { chat_id: client.telegram_chat_id });
        return;
      }

      // Normal reply
      await TelegramService.sendSMSNotification({ phone, body, content: body }, client);
    } catch (err) {
      console.error('[Twilio Webhook] Async error:', err);
    }
  })();
});

module.exports = router;