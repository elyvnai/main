const { getDb } = require('../../utils/dbAdapter');
const TelegramService = require('../../services/TelegramService');

async function handleCallback(db, chatId, data, messageId) {
  const client = db.prepare('SELECT * FROM clients WHERE telegram_chat_id = ?').get(chatId);
  if (!client) return 'Not linked.';

  const parts = data.split('_');
  if (parts.length < 2) return 'Unknown action.';

  const action = parts[0];
  const id = parts[1];

  switch (action) {
    case 'transcript':
      return handleTranscript(db, id, client.id);

    case 'recording':
      return handleRecording(db, id, client.id);

    case 'smsreply':
    case 'sms':
      const actualId = parts.length > 2 ? parts[2] : id;
      return handleSMSReply(db, actualId, client.id);

    case 'markbooked':
    case 'mark':
      const phone = parts.length > 2 ? parts[2] : id;
      db.prepare("UPDATE leads SET stage = 'booked' WHERE phone = ? AND client_id = ?").run(phone, client.id);
      return `✅ ${phone} marked as booked.`;

    case 'quick':
      return handleQuickAction(db, id, client);

    default:
      return 'Unknown action.';
  }
}

async function handleTranscript(db, callId, clientId) {
  const call = db.prepare('SELECT transcript, caller_phone FROM calls WHERE call_id = ? AND client_id = ?').get(callId, clientId);
  if (!call || !call.transcript) return '📝 Transcript not available.';
  return `📝 <b>Transcript — ${call.caller_phone || 'Unknown'}</b>\n\n${call.transcript}`;
}

async function handleRecording(db, callId, clientId) {
  const call = db.prepare('SELECT recording_url, caller_phone FROM calls WHERE call_id = ? AND client_id = ?').get(callId, clientId);
  if (!call || !call.recording_url) return '🎙️ Recording not available.';
  await TelegramService.sendAudio(call.recording_url, `🎙️ Recording — ${call.caller_phone || 'Unknown'}`);
  return null;
}

async function handleSMSReply(db, callId, clientId) {
  const call = db.prepare('SELECT caller_phone FROM calls WHERE call_id = ? AND client_id = ?').get(callId, clientId);
  if (!call) return 'Call not found.';
  if (!call.caller_phone) return 'No phone number found.';
  return `💬 <b>SMS Reply to ${call.caller_phone}</b>\n\nReply to this message to send an SMS.`;
}

async function handleQuickAction(db, action, client) {
  switch (action) {
    case 'calls': {
      const { handleCommand } = require('./commands');
      return handleCommand(db, client.telegram_chat_id, '/calls', null, null);
    }
    case 'pause':
      db.prepare('UPDATE clients SET ai_enabled = 0 WHERE id = ?').run(client.id);
      return '🔴 AI paused.';
    case 'resume':
      db.prepare('UPDATE clients SET ai_enabled = 1 WHERE id = ?').run(client.id);
      return '🟢 AI resumed.';
    case 'status': {
      const { handleCommand } = require('./commands');
      return handleCommand(db, client.telegram_chat_id, '/status', null, null);
    }
    default:
      return 'Unknown quick action.';
  }
}

module.exports = { handleCallback };
