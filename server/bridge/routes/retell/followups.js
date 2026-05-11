const { getDb } = require('../../utils/dbAdapter');
const { sendMessage: sendTelegram } = require('../../utils/telegram');

async function handleMissedCall(client, callerPhone, duration) {
  // SMS is now sent in calls.js handleCallEnded
  // This function is kept for backward compatibility but does minimal work
  console.log(`Missed call handled for ${callerPhone} (${duration}s)`);
}

async function notifyOwnerOfCall(callRecord, client) {
  if (!client.telegram_chat_id) return;
  
  const emoji = callRecord.outcome === 'booked' ? '✅' : 
               callRecord.outcome === 'missed' ? '❌' : '📞';
  
  await sendTelegram(client.telegram_chat_id,
    `${emoji} Call ${callRecord.outcome} — ${callRecord.caller_phone}\nDuration: ${callRecord.duration}s`
  );
}

module.exports = {
  handleMissedCall,
  notifyOwnerOfCall
};
