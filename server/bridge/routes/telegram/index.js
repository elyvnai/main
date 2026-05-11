const express = require('express');
const { handleCommand } = require('./commands');
const { handleCallback } = require('./callbacks');
const { getDb } = require('../../utils/dbAdapter');
const TelegramService = require('../../services/TelegramService');
const TwilioService = require('../../services/TwilioService');
const { randomUUID } = require('crypto');
const fetch = require('node-fetch');

const router = express.Router();

router.post('/', async (req, res) => {
  const { update_id, message, callback_query } = req.body;
  const db = getDb();

  if (update_id) {
    const exists = db.prepare('SELECT 1 FROM webhook_events WHERE idempotency_key = ?').get(update_id.toString());
    if (exists) return res.status(200).send('OK');

    db.prepare('INSERT INTO webhook_events (id, idempotency_key, source, payload) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), update_id.toString(), 'telegram', JSON.stringify(req.body));
  }

  try {
    if (message) {
      const text = message.text || '';
      const chatId = message.chat.id.toString();

      // Reply-to-message = two-way SMS
      if (message.reply_to_message && text) {
        const client = db.prepare('SELECT * FROM clients WHERE telegram_chat_id = ?').get(chatId);
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
        return res.status(200).send('OK');
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

    res.status(200).send('OK');
  } catch (err) {
    console.error('[Telegram] Webhook error:', err);
    res.status(200).send('OK');
  }
});

module.exports = router;