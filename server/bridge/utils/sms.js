// server/bridge/utils/sms.js
// Twilio SMS outbound. Replace with real SDK when credentials are ready.

const { randomUUID } = require('crypto');

async function sendSMS(to, body, from, db, clientId) {
  console.log(`[SMS] ${from} \u2192 ${to}: ${body.slice(0, 80)}${body.length > 80 ? '...' : ''}`);

  // TODO: Wire Twilio SDK
  // const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  // await twilio.messages.create({ body, from, to });

  // Log attempt
  if (db && clientId) {
    db.prepare(`
      INSERT INTO messages (id, client_id, phone, direction, body, status, created_at)
      VALUES (?, ?, ?, 'outbound', ?, 'sent', ?)
    `).run(randomUUID(), clientId, to, body, new Date().toISOString());
  }

  return { sid: null, status: 'sent' };
}

module.exports = { sendSMS };
