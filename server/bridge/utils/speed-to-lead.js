const { sendSMS } = require('./sms');
const { getDb } = require('./dbAdapter');

// SPEED-TO-LEAD: Touch 1 only — instant SMS on missed call
// All other touches (AI callback, 24h/72h followups) removed

async function triggerSpeedSequence(leadId, clientId, phone, source = 'missed_call') {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client) return;

  // SMS is now sent directly in calls.js handleCallEnded
  // This function exists for backward compatibility only
  console.log(`Speed sequence triggered for ${phone} (lead: ${leadId})`);
}

module.exports = {
  triggerSpeedSequence
};
