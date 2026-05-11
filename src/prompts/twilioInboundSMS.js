const crypto = require('crypto');

/**
 * Twilio Inbound SMS Handler
 */
async function handleInboundSMS(db, req, telegram, isOptOut) {
  const from = req.body.From;
  const to = req.body.To;
  const body = req.body.Body.trim();
  
  // Find client by Twilio number
  const client = await db.get('SELECT * FROM clients WHERE phone_number = ?', [to]);
  if (!client) return;
  
  // Check opt-out
  if (isOptOut && isOptOut(body)) {
    await db.run('INSERT OR REPLACE INTO sms_opt_outs (phone, client_id) VALUES (?, ?)', [from, client.id]);
    if (telegram && telegram.sendMessage) {
        await telegram.sendMessage(client.telegram_chat_id, `\ud83d\udeab ${from} opted out of SMS.`);
    }
    return;
  }
  
  // Log inbound message
  await db.run(
    `INSERT INTO messages (id, client_id, phone, direction, body, status, created_at) 
     VALUES (?, ?, ?, 'inbound', ?, 'received', ?)`,
    [crypto.randomUUID(), client.id, from, body, new Date().toISOString()]
  );
  
  // Handle URGENT reply
  if (body.toUpperCase().includes('URGENT')) {
    if (telegram && telegram.sendMessage) {
        await telegram.sendMessage(client.telegram_chat_id,
          `\ud83d\udea8 **URGENT reply** from ${from}:\n"${body}"\n\nThey want an immediate callback.`
        );
    }
    return;
  }
  
  // Normal reply \u2014 notify owner
  if (telegram && telegram.sendMessage) {
      await telegram.sendMessage(client.telegram_chat_id,
        `\ud83d\udcac **Reply from ${from}:**\n"${body}"\n\nReply to this message to text them back.`,
        { 
          reply_markup: JSON.stringify({
            inline_keyboard: [[
              { text: '\ud83d\udcde Call them', callback_data: `call_back:${from}` },
              { text: '\u2705 Mark booked', callback_data: `mark_booked:${from}` }
            ]]
          })
        }
      );
  }
}

module.exports = { handleInboundSMS };
