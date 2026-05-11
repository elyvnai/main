const { getDb } = require('../../utils/dbAdapter');
const TelegramService = require('../../services/TelegramService');

async function handleCallback(db, chatId, data, messageId) {
  const parts = data.split('_');
  if (parts.length < 2) return 'Unknown action.';
  
  const action = parts[0];
  const id = parts[1];

  switch (action) {
    case 'transcript':
      return handleTranscript(db, id);

    case 'recording':
      return handleRecording(db, id);

    case 'smsreply':
    case 'sms':
      // Handle both sms_reply_ID and smsreply_ID
      const actualId = parts.length > 2 ? parts[2] : id;
      return handleSMSReply(db, actualId);

    case 'markbooked':
    case 'mark':
      // Handle both mark_booked_PHONE and markbooked_PHONE
      const phone = parts.length > 2 ? parts[2] : id;
      db.prepare("UPDATE leads SET stage = 'booked' WHERE phone = ?").run(phone);
      return `✅ ${phone} marked as booked.`;

    case 'quick':
      return handleQuickAction(db, id, chatId);

    default:
      return 'Unknown action.';
  }
}

async function handleTranscript(db, callId) {
  const call = db.prepare('SELECT transcript, caller_phone FROM calls WHERE call_id = ?').get(callId);
  if (!call || !call.transcript) return '📝 Transcript not available.';
  return `📝 <b>Transcript — ${call.caller_phone || 'Unknown'}</b>\n\n${call.transcript}`;
}

async function handleRecording(db, callId) {
  const call = db.prepare('SELECT recording_url, caller_phone FROM calls WHERE call_id = ?').get(callId);
  if (!call || !call.recording_url) return '🎙️ Recording not available.';
  
  await TelegramService.sendAudio(call.recording_url, `🎙️ Recording — ${call.caller_phone || 'Unknown'}`);
  return null; // Already sent via sendAudio
}

async function handleSMSReply(db, callId) {
  const call = db.prepare('SELECT caller_phone, client_id FROM calls WHERE call_id = ?').get(callId);
  if (!call) return 'Call not found.';
  
  const client = call.client_id ? db.prepare('SELECT * FROM clients WHERE id = ?').get(call.client_id) : null;
  const phone = call.caller_phone || client?.phone_number;
  
  if (!phone) return 'No phone number found for this caller.';
  
  return `💬 <b>SMS Reply to ${phone}</b>\n\nReply to this message to send an SMS.`;
}

async function handleQuickAction(db, action, chatId) {
  const client = db.prepare('SELECT * FROM clients WHERE telegram_chat_id = ?').get(chatId);
  if (!client) return 'Not linked.';

  switch (action) {
    case 'calls':
      const { handleCommand } = require('./commands');
      return handleCommand(db, chatId, '/calls', null, null);

    case 'pause':
      TelegramService.paused = true;
      return '🔴 AI paused.';

    case 'resume':
      TelegramService.paused = false;
      return '🟢 AI resumed.';

    case 'status':
      const { handleCommand } = require('./commands');
      return handleCommand(db, chatId, '/status', null, null);

    default:
      return 'Unknown quick action.';
  }
}

module.exports = { handleCallback };
