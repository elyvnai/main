// server/bridge/routes/telegram/index.js
// Telegram bot webhook — commands, callbacks, reply-to-message (two-way SMS)

const express = require('express');
const { handleCommand } = require('./commands');
const { handleCallback } = require('./callbacks');
const { getDb } = require('../../utils/dbAdapter');
const { sendMessage: sendTelegram } = require('../../utils/telegram');
const { sendSMS } = require('../../utils/sms');

const router = express.Router();

router.post('/', async (req, res) => {
  const { message, callback_query } = req.body;

  try {
    // ─── Commands & Reply-to-message ─────────────────────
    if (message) {
      const db = getDb();
      const text = message.text || '';
      const chatId = message.chat.id;

      // Reply-to-message = two-way SMS back to customer
      if (message.reply_to_message && text) {
        const client = db.prepare('SELECT * FROM clients WHERE telegram_chat_id = ?').get(chatId);
        if (client) {
          const repliedText = message.reply_to_message.text || '';
          const phoneMatch = repliedText.match(/\+?\d{10,15}/);
          if (phoneMatch) {
            await sendSMS(phoneMatch[0], text, client.phone_number, db, client.id);
            await sendTelegram(chatId, `✉️ Sent to ${phoneMatch[0]}:\n"${text}"`);
          } else {
            await sendTelegram(chatId, 'Could not find a phone number in the replied message.');
          }
        }
        return res.status(200).send('OK');
      }

      // Bot commands
      const result = await handleCommand(db, chatId, text, message.from?.first_name, message.from?.username);

      if (typeof result === 'string') {
        await sendTelegram(chatId, result);
      } else if (result && result.text) {
        await sendTelegram(chatId, result.text, result.buttons ? {
          reply_markup: { inline_keyboard: result.buttons }
        } : {});
      }
    }

    // ─── Inline button callbacks ──────────────────────────
    if (callback_query) {
      const db = getDb();
      const chatId = callback_query.message?.chat?.id;
      const data = callback_query.data;

      const result = await handleCallback(db, chatId, data, callback_query.message?.message_id);
      if (result) {
        await sendTelegram(chatId, result);
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[Telegram] Webhook error:', err);
    res.status(200).send('OK'); // Always 200 to Telegram to prevent retries
  }
});

module.exports = router;
