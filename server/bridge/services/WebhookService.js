const { getDb } = require('../utils/dbAdapter');
const TwilioService = require('./TwilioService');
const TelegramService = require('./TelegramService');
const { randomUUID } = require('crypto');

class WebhookService {
  async processTwilioWebhook(payload) {
    const { From, Body, MessageSid, To } = payload;
    if (!From || !Body) return;

    const db = getDb();
    const phone = TwilioService.normalizePhoneNumber(From);
    const body = Body.trim();
    const upperBody = body.toUpperCase();

    const { rows: clients } = await db.query('SELECT * FROM clients WHERE phone_number = $1', [To]);
    const client = clients[0];
    if (!client) return;

    // Opt-out
    if (['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT'].includes(upperBody)) {
      await db.query(`
        INSERT INTO sms_opt_outs (phone, client_id, opted_out_at) 
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (phone, client_id) DO UPDATE SET opted_out_at = CURRENT_TIMESTAMP
      `, [phone, client.id]);
      await TelegramService.sendMessage(`🚫 ${phone} opted out of SMS.`, { chat_id: client.telegram_chat_id });
      return;
    }

    // Opt-back-in
    if (['START', 'YES'].includes(upperBody)) {
      await db.query('DELETE FROM sms_opt_outs WHERE phone = $1 AND client_id = $2', [phone, client.id]);
    }

    // Log inbound
    await db.query(`
      INSERT INTO messages (id, client_id, phone, direction, body, status, message_sid, created_at)
      VALUES ($1, $2, $3, 'inbound', $4, 'received', $5, $6)
    `, [randomUUID(), client.id, phone, body, MessageSid, new Date().toISOString()]);

    // URGENT
    if (upperBody === 'URGENT') {
      const { rows: optOuts } = await db.query('SELECT 1 FROM sms_opt_outs WHERE phone = $1 AND client_id = $2', [phone, client.id]);
      if (optOuts.length === 0) {
        await TwilioService.sendSMS(phone, `We have received your URGENT request. A team member will prioritize your call and contact you shortly.`, client.id);
      }
      await db.query(`
        INSERT INTO leads (id, client_id, phone, source, stage, notes, created_at, updated_at)
        VALUES ($1, $2, $3, 'inbound_sms', 'urgent', 'Client replied URGENT', $4, $5)
        ON CONFLICT(client_id, phone) DO UPDATE SET stage = 'urgent', notes = 'Client replied URGENT', updated_at = $6
      `, [randomUUID(), client.id, phone, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]);

      await TelegramService.sendMessage(
        `🚨 <b>URGENT reply from ${phone}:</b>\n"${body}"\n\nThey want an immediate callback.`,
        { chat_id: client.telegram_chat_id }
      );
      return;
    }

    // CALLBACK
    if (upperBody === 'CALLBACK') {
      const { rows: optOuts } = await db.query('SELECT 1 FROM sms_opt_outs WHERE phone = $1 AND client_id = $2', [phone, client.id]);
      if (optOuts.length === 0) {
        await TwilioService.sendCallbackConfirmation(phone, client.id);
      }
      await TelegramService.sendMessage(`📞 <b>CALLBACK REQUESTED from ${phone}</b>`, { chat_id: client.telegram_chat_id });
      return;
    }

    // Normal reply
    await TelegramService.sendSMSNotification({ phone, body, content: body }, client);
  }

  async processTelegramWebhook(payload) {
    const { message, callback_query } = payload;
    const db = getDb();

    if (message) {
      const text = message.text || '';
      const chatId = message.chat.id.toString();
      const { handleCommand } = require('../routes/telegram/commands');

      // Reply-to-message = two-way SMS
      if (message.reply_to_message && text) {
        const { rows: clients } = await db.query('SELECT * FROM clients WHERE telegram_chat_id = $1', [chatId]);
        const client = clients[0];
        if (client) {
          const repliedText = message.reply_to_message.text || '';
          const phoneMatch = repliedText.match(/\+?\d{10,15}/);
          if (phoneMatch) {
            const phone = TwilioService.normalizePhoneNumber(phoneMatch[0]);
            await TwilioService.sendSMS(phone, text, client.id);
            await TelegramService.sendMessage(`✉️ Sent to ${phone}:\n"${text}"`, { chat_id: chatId });
          } else {
            await TelegramService.sendMessage('Could not find a phone number to reply to.', { chat_id: chatId });
          }
        }
        return;
      }

      // Commands
      const result = await handleCommand(db, chatId, text, message.from?.first_name, message.from?.username);

      if (typeof result === 'string') {
        await TelegramService.sendMessage(result, { chat_id: chatId });
      } else if (result && result.text) {
        await TelegramService.sendMessage(result.text, {
          chat_id: chatId,
          reply_markup: result.buttons ? { inline_keyboard: result.buttons } : undefined
        });
      }
    }

    if (callback_query) {
      const chatId = callback_query.message?.chat?.id?.toString();
      const data = callback_query.data;
      const { handleCallback } = require('../routes/telegram/callbacks');
      const fetch = require('node-fetch');

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callback_query.id })
      });

      const result = await handleCallback(db, chatId, data, callback_query.message?.message_id);
      if (result) {
        await TelegramService.sendMessage(result, { chat_id: chatId });
      }
    }
  }
}

module.exports = new WebhookService();
