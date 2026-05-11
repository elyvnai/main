const { getDb } = require('../../utils/dbAdapter');
const { sendMessage: sendTelegram, sendAudio } = require('../../utils/telegram');
const fs = require('fs');

async function handleCallback(db, chatId, data, messageId) {
  const parts = data.split(':');
  const action = parts[0];
  
  switch (action) {
    case 'transcript':
      return handleTranscript(db, parts[1], chatId);
    
    case 'recording':
      return handleRecording(db, parts[1], chatId);
    
    case 'reply_prompt':
      return `💬 Reply to this message to send an SMS to ${parts[1]}:`;
    
    case 'mark_booked':
      db.prepare("UPDATE leads SET stage = 'booked' WHERE phone = ?").run(parts[1]);
      return `✅ ${parts[1]} marked as booked.`;
    
    case 'cancel_speed':
      // No-op: speed sequence is now instant only
      return 'Speed sequence cancelled.';
    
    case 'quick':
      return handleQuickAction(db, parts[1], chatId);
    
    default:
      return 'Unknown action.';
  }
}

async function handleTranscript(db, callId, chatId) {
  const call = db.prepare('SELECT transcript, caller_phone FROM calls WHERE call_id = ?').get(callId);
  if (!call || !call.transcript) {
    return 'Transcript not available.';
  }
  return `📝 **Transcript — ${call.caller_phone || 'Unknown'}**\n\n${call.transcript}`;
}

async function handleRecording(db, callId, chatId) {
  const call = db.prepare('SELECT recording_path, caller_phone FROM calls WHERE call_id = ?').get(callId);
  if (!call || !call.recording_path || !fs.existsSync(call.recording_path)) {
    return 'Recording not available.';
  }
  
  // Send audio file
  await sendAudio(chatId, call.recording_path, {
    caption: `🔊 Recording — ${call.caller_phone || 'Unknown'}`
  });
  
  return null; // Already sent via sendAudio
}

async function handleQuickAction(db, action, chatId) {
  const client = db.prepare('SELECT * FROM clients WHERE telegram_chat_id = ?').get(chatId);
  if (!client) return 'Not linked.';
  
  switch (action) {
    case 'calls':
      // Reuse handleCalls logic
      const { handleCommand } = require('./commands');
      return handleCommand(db, chatId, '/calls', null, null);
    
    case 'pause':
      db.prepare('UPDATE clients SET ai_enabled = 0 WHERE id = ?').run(client.id);
      return '🔴 AI paused.';
    
    case 'resume':
      db.prepare('UPDATE clients SET ai_enabled = 1 WHERE id = ?').run(client.id);
      return '🟢 AI resumed.';
    
    case 'status':
      const { handleCommand } = require('./commands');
      return handleCommand(db, chatId, '/status', null, null);
    
    default:
      return 'Unknown quick action.';
  }
}

module.exports = { handleCallback };
